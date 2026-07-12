import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getValidToken(supabase: any) {
  const { data: config } = await supabase
    .from('google_calendar_config')
    .select('*')
    .limit(1)
    .single();
  if (!config?.access_token) throw new Error('Google Calendar not connected');

  const expiresAt = new Date(config.token_expiry).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) throw new Error('Token refresh failed');
    const newTokens = await res.json();
    await supabase.from('google_calendar_config').update({
      access_token: newTokens.access_token,
      token_expiry: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', config.id);
    return { access_token: newTokens.access_token, config };
  }
  return { access_token: config.access_token, config };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { job_id } = body;
    if (!job_id) throw new Error('job_id required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { access_token, config } = await getValidToken(supabase);

    if (!config.auto_create_event) {
      return new Response(JSON.stringify({ skipped: 'auto_create_event disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get job details
    const { data: job } = await supabase
      .from('jobs')
      .select('*, properties(property_name, address, client_name, billing_email)')
      .eq('id', job_id)
      .single();

    if (!job) throw new Error('Job not found');

    // Build attendees
    const attendees: { email: string }[] = [];

    if (config.add_cleaner && job.cleaner_1_id) {
      const { data: cleaner } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', job.cleaner_1_id)
        .maybeSingle();
      if (cleaner?.email) attendees.push({ email: cleaner.email });
    }

    if (config.invite_client && job.properties?.billing_email) {
      attendees.push({ email: job.properties.billing_email });
    }

    // Build event
    const startDate = job.scheduled_date;
    const TIME_WINDOW_MAP: Record<string, string> = {
      morning: '09:00', midday: '12:00', afternoon: '14:00', evening: '17:00',
    };
    let rawTime = String(job.scheduled_time || '09:00').trim().toLowerCase();
    let startTime: string;
    if (/^\d{1,2}:\d{2}/.test(rawTime)) {
      startTime = rawTime.slice(0, 5);
    } else if (TIME_WINDOW_MAP[rawTime]) {
      startTime = TIME_WINDOW_MAP[rawTime];
    } else {
      startTime = '09:00';
    }
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw new Error(`Invalid scheduled_date: ${startDate}`);
    }
    const durationMin = job.estimated_duration || 120;
    const startDt = new Date(`${startDate}T${startTime}:00+10:00`);
    if (isNaN(startDt.getTime())) {
      throw new Error(`Invalid date/time: ${startDate} ${startTime}`);
    }
    const endDt = new Date(startDt.getTime() + durationMin * 60000);

    const address = job.properties?.address || '';
    const propertyName = job.properties?.property_name || 'Property';

    const event = {
      summary: `Brightly Clean – ${propertyName}`,
      location: address,
      description: `Cleaning job for ${job.properties?.client_name || 'client'}\nProperty: ${propertyName}\n${address}`,
      start: { dateTime: startDt.toISOString(), timeZone: 'Australia/Brisbane' },
      end: { dateTime: endDt.toISOString(), timeZone: 'Australia/Brisbane' },
      attendees: attendees.length > 0 ? attendees : undefined,
    };

    const calendarId = config.calendar_id || 'primary';
    const eventRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    const eventData = await eventRes.json();
    if (!eventRes.ok) {
      throw new Error(`Calendar API error [${eventRes.status}]: ${JSON.stringify(eventData)}`);
    }

    // Store event ID on job
    await supabase.from('jobs').update({
      google_event_id: eventData.id,
    }).eq('id', job_id);

    return new Response(JSON.stringify({ success: true, event_id: eventData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Create calendar event error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
