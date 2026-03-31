import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, preferredDate, preferredTime } = await req.json();

    if (!leadId || !preferredDate || !preferredTime) {
      return new Response(JSON.stringify({ error: 'leadId, preferredDate, and preferredTime are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase
      .from('leads')
      .update({
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        status: 'booking_requested',
      })
      .eq('id', leadId);

    if (error) {
      console.error('public-book-lead update error:', error);
      return new Response(JSON.stringify({ error: 'Unable to save booking request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('public-book-lead error:', error);
    return new Response(JSON.stringify({ error: 'Invalid booking request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
