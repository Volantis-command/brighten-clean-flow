import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculate, calculateDefaultHours, SERVICE_TYPES, type BedType } from '../_shared/pricing.ts';

const ALLOWED_ORIGINS = [
  'https://brightly.cleaning',
  'https://www.brightly.cleaning',
  'https://app.brightly.cleaning',
  'http://localhost:5173',
  'http://localhost:8080',
];

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const num = (v: unknown, d = 0) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json();

    // --- Contact / booking validation ---
    const fullName = String(body.fullName ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const email = String(body.email ?? '').trim();
    const address = String(body.address ?? '').trim();
    const preferredDate = String(body.preferredDate ?? '').trim();
    const preferredTime = String(body.preferredTime ?? '').trim();
    const frequency = ['one-off', 'weekly', 'fortnightly', 'monthly'].includes(String(body.frequency))
      ? String(body.frequency) : 'one-off';

    if (!fullName || !phone || !address) {
      return new Response(JSON.stringify({ error: 'Name, phone and address are required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // --- Property config (re-priced server-side; never trust a client price) ---
    const cleanType = SERVICE_TYPES.AIRBNB_TURNOVER;
    const bedrooms = Math.min(Math.max(num(body.bedrooms, 1), 0), 10);
    const bathrooms = Math.min(Math.max(num(body.bathrooms, 1), 0), 10);
    const kitchens = Math.min(Math.max(num(body.kitchens, 1), 0), 5);
    const livingAreas = Math.min(Math.max(num(body.livingAreas, 1), 0), 5);
    const balconies = Math.min(Math.max(num(body.balconies, 0), 0), 5);
    const sofaBeds = Math.min(Math.max(num(body.sofaBeds, 0), 0), 5);
    const extraToilets = Math.min(Math.max(num(body.extraToilets, 0), 0), 5);
    const propertyType = String(body.propertyType ?? 'Apartment');
    const bedTypes = (Array.isArray(body.bedTypes) ? body.bedTypes : [])
      .filter((b: unknown): b is BedType => ['King', 'Queen', 'King Single', 'Single'].includes(String(b)))
      .slice(0, 10);
    const linenRequired = body.linenRequired !== false;
    const consumables = {
      amenities_kit: body?.consumables?.amenities_kit === true,
      wash_kit: body?.consumables?.wash_kit === true,
      tea_coffee_kit: body?.consumables?.tea_coffee_kit === true,
    };
    const includePhotoReport = body.includePhotoReport === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: settings, error: rErr } = await supabase.from('pricing_settings').select('key, value');
    if (rErr) throw rErr;
    const rates: Record<string, number> = {};
    for (const row of settings ?? []) rates[row.key] = Number(row.value);

    const estimatedHours = calculateDefaultHours(cleanType, bedrooms, bathrooms);
    const priced = calculate({
      cleanType, bedrooms, bathrooms, kitchens, sofaBeds, hours: estimatedHours,
      bedTypes: bedTypes as BedType[], deepCleanMultiplier: 0, specialistChemicals: 0,
      gpOverride: null, discountGp: null, consumables, includePhotoReport, linenRequired,
      distanceKm: 0, activePropertyCount: 1, extraToilets,
    }, rates);

    const recurringPct = frequency === 'one-off' ? 0 : (rates.recurring_discount_pct || 0) / 100;
    const totalIncGst = Math.round(priced.sellPriceIncGst * (1 - recurringPct) * 100) / 100;
    const totalExGst = Math.round((totalIncGst / 1.1) * 100) / 100;

    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    const bedConfig = bedTypes.map((t, i) => `Bedroom ${i + 1}: ${t}`).join(', ');

    const { data: inserted, error: insErr } = await supabase
      .from('quote_requests')
      .insert({
        first_name: firstName,
        last_name: lastName,
        phone,
        email: email || null,
        address,
        property_type: propertyType,
        clean_type: cleanType,
        bedrooms,
        bathrooms,
        estimated_hours: estimatedHours,
        hourly_rate: priced.hourlyRateIncGst,
        total_ex_gst: totalExGst,
        total_inc_gst: totalIncGst,
        preferred_date: preferredDate || null,
        preferred_time: preferredTime || null,
        preferred_frequency: frequency,
        status: 'booking_requested',
        form_submitted_at: new Date().toISOString(),
        tcs_accepted: body.tcsAccepted === true,
        tcs_accepted_at: body.tcsAccepted === true ? new Date().toISOString() : null,
        addons: { linen_required: linenRequired, consumables, photo_report: includePhotoReport },
        form_data: {
          source: 'instant_quote',
          bed_config: bedConfig,
          bed_types: bedTypes,
          kitchens, living_areas: livingAreas, balconies, sofa_beds: sofaBeds,
          extra_toilets: extraToilets,
          quoted_inc_gst: totalIncGst,
          frequency,
        },
      })
      .select('token, id')
      .single();

    if (insErr) throw insErr;

    // Notify admin (mirrors the existing intake flow). Non-blocking.
    try {
      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: phone, client_name: firstName, clean_type: cleanType, address },
      });
    } catch (nErr) {
      console.error('submit-instant-booking: notification failed (non-blocking):', nErr);
    }

    return new Response(JSON.stringify({
      success: true,
      token: inserted?.token,
      totalIncGst,
      frequency,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('submit-instant-booking error:', err);
    return new Response(JSON.stringify({ error: 'Unable to submit booking' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
