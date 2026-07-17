import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculate, calculateDefaultHours, SERVICE_TYPES, type BedType } from '../_shared/pricing.ts';

// Restrict to Brightly origins (audit flagged wildcard CORS across functions).
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

const FREQUENCIES = ['one-off', 'weekly', 'fortnightly', 'monthly'] as const;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const body = await req.json();

    // Only Airbnb turnover is publicly self-quotable for v1.
    const cleanType = SERVICE_TYPES.AIRBNB_TURNOVER;
    const bedrooms = Math.min(Math.max(num(body.bedrooms, 1), 0), 10);
    const bathrooms = Math.min(Math.max(num(body.bathrooms, 1), 0), 10);
    const kitchens = Math.min(Math.max(num(body.kitchens, 1), 0), 5);
    const sofaBeds = Math.min(Math.max(num(body.sofaBeds, 0), 0), 5);
    const extraToilets = Math.min(Math.max(num(body.extraToilets, 0), 0), 5);
    const activePropertyCount = Math.min(Math.max(num(body.activePropertyCount, 1), 1), 50);
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

    const { data: settings, error } = await supabase
      .from('pricing_settings')
      .select('key, value');
    if (error) throw error;

    const rates: Record<string, number> = {};
    for (const row of settings ?? []) rates[row.key] = Number(row.value);

    const estimatedHours = calculateDefaultHours(cleanType, bedrooms, bathrooms);

    const input = {
      cleanType, bedrooms, bathrooms, kitchens, sofaBeds,
      hours: estimatedHours,
      bedTypes: bedTypes as BedType[],
      deepCleanMultiplier: 0,
      specialistChemicals: 0,
      gpOverride: null,
      discountGp: null,
      consumables,
      includePhotoReport,
      linenRequired,
      distanceKm: 0, // v1: base zone. Travel surcharge applied by admin at approval.
      activePropertyCount,
      extraToilets,
    };

    const base = calculate(input, rates);

    // Recurring lever: optional recurring_discount_pct (default 0 → same price).
    const recurringPct = (rates.recurring_discount_pct || 0) / 100;
    const round = (n: number) => Math.round(n * 100) / 100;
    const frequencies: Record<string, number> = {};
    for (const f of FREQUENCIES) {
      frequencies[f] = f === 'one-off'
        ? round(base.sellPriceIncGst)
        : round(base.sellPriceIncGst * (1 - recurringPct));
    }

    return new Response(JSON.stringify({
      perCleanIncGst: round(base.sellPriceIncGst),
      estimatedHours,
      recurringDiscountPct: recurringPct * 100,
      frequencies,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('get-instant-quote error:', err);
    return new Response(JSON.stringify({ error: 'Unable to calculate quote' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
