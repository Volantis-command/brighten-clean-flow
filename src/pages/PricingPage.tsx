import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Check, Copy, Loader2, Minus, Plus, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  BED_LABELS, BLANK_INPUT, SETTING_DEFS, currentPriceInc, inputFromProperty, quote, settingsFrom,
  type Beds, type ModelSettings, type PropertyRow, type QuoteInput,
} from '@/lib/turnoverPricing';

const money = (v: number) =>
  v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (v: number) => `${Number(v.toFixed(2))}h`;
const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null);

const PROPERTY_COLS =
  'id, property_name, client_name, property_type, bedrooms, bathrooms, toilets, living_areas, kitchens, balconies, sofa_beds, max_guests, has_pool, has_outdoor_area, bed_config, bed_types, estimated_hours, default_price, price_turnover, price_includes_gst, amenities_kit, tea_coffee_kit, wash_kit, active, client_type';

/** Clients we supply linen to. Kingscliff gives us theirs from the shed. */
const LINEN_CLIENTS_DEFAULT = ['Coastal Holiday Homes'];
const FOCUS_CLIENTS = ['Kingscliff Holiday Homes', 'Coastal Holiday Homes'];

export default function PricingPage() {
  const queryClient = useQueryClient();
  const { data: settingsData, isLoading: settingsLoading } = usePricingSettings();
  const rates = useMemo(() => settingsData?.map ?? {}, [settingsData]);

  const [model, setModel] = useState<ModelSettings>(() => settingsFrom(undefined));
  const [modelDirty, setModelDirty] = useState(false);
  useEffect(() => {
    if (settingsData && !modelDirty) setModel(settingsFrom(settingsData.map));
  }, [settingsData, modelDirty]);

  const [name, setName] = useState('');
  const [input, setInput] = useState<QuoteInput>(BLANK_INPUT);
  const [currentPrice, setCurrentPrice] = useState('');
  const [hoursOverride, setHoursOverride] = useState('');
  const [priceOverride, setPriceOverride] = useState('');
  const [linenClients, setLinenClients] = useState<string[]>(LINEN_CLIENTS_DEFAULT);
  const [showAllClients, setShowAllClients] = useState(false);

  const { data: properties = [] } = useQuery({
    queryKey: ['pricing-page-properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select(PROPERTY_COLS)
        .eq('active', true)
        .order('client_name')
        .order('property_name');
      if (error) throw error;
      return (data || []) as unknown as (PropertyRow & { client_type: string | null })[];
    },
  });

  const fullInput: QuoteInput = { ...input, hoursOverride: num(hoursOverride), priceOverride: num(priceOverride) };
  const r = quote(fullInput, model, rates);
  const theirs = num(currentPrice);

  const set = <K extends keyof QuoteInput>(k: K, v: QuoteInput[K]) => setInput((p) => ({ ...p, [k]: v }));
  const setBed = (k: keyof Beds, v: number) => setInput((p) => ({ ...p, beds: { ...p.beds, [k]: Math.max(0, v) } }));

  const loadProperty = (p: PropertyRow) => {
    setName(`${p.property_name ?? ''}${p.client_name ? ` (${p.client_name})` : ''}`);
    setInput(inputFromProperty(p, linenClients.includes(p.client_name || '')));
    const cur = currentPriceInc(p);
    setCurrentPrice(cur != null ? String(cur) : '');
    setHoursOverride('');
    setPriceOverride('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success(`Loaded ${p.property_name}. Check the beds and extras, the record is not always complete.`);
  };

  const reset = () => {
    setName(''); setInput(BLANK_INPUT); setCurrentPrice(''); setHoursOverride(''); setPriceOverride('');
  };

  const copySummary = async () => {
    const lines = [
      name || 'Turnover quote',
      `${input.bedrooms} bed / ${input.bathrooms} bath ${input.propertyType}, ${r.bedCount} beds`,
      `${hrs(r.hours)} at ${money(model.rateInc)}/h inc GST`,
      `Price: ${money(r.totalInc)} inc GST (${money(r.totalEx)} ex GST)`,
      `With our linen: ${money(r.withLinenInc)} · Client's own linen: ${money(r.withoutLinenInc)}`,
    ];
    if (theirs) lines.push(`Their current price: ${money(theirs)} (${r.totalInc - theirs >= 0 ? '+' : ''}${money(r.totalInc - theirs)})`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const [saving, setSaving] = useState(false);
  const saveModel = async () => {
    setSaving(true);
    const rows = SETTING_DEFS.map((d) => ({ key: d.key, value: model[d.field], label: d.label, category: 'turnover_model' }));
    const { error } = await supabase.from('pricing_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setModelDirty(false);
    await queryClient.invalidateQueries({ queryKey: ['pricing_settings'] });
    toast.success('Pricing model saved');
  };

  // Calibration: what the model says for every property we already price.
  const calibration = useMemo(() => {
    return properties
      .filter((p) => (showAllClients ? true : FOCUS_CLIENTS.includes(p.client_name || '')))
      .map((p) => {
        const linen = linenClients.includes(p.client_name || '');
        // Kits are client extras, not part of the agreed turnover price.
        const inp = { ...inputFromProperty(p, linen), amenitiesKit: false, teaCoffeeKit: false, washKit: false };
        const q = quote(inp, model, rates);
        const cur = currentPriceInc(p);
        return { p, linen, q, cur, diff: cur != null ? q.totalInc - cur : null };
      })
      .filter((row) => row.cur != null);
  }, [properties, showAllClients, linenClients, model, rates]);

  const clientsInTable = [...new Set(calibration.map((c) => c.p.client_name || 'No client'))];
  const within = calibration.filter((c) => c.diff != null && Math.abs(c.diff) <= 5).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="rounded-3xl bg-gradient-to-br from-primary to-[hsl(183_55%_30%)] text-primary-foreground p-6 sm:p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">Brightly · internal</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 flex items-center gap-2">
              <Calculator className="h-7 w-7" /> Turnover pricing
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Hours x {money(model.rateInc)} inc GST, plus linen at item cost + {model.linenMarkupPct}% when we supply it.
              Worked out from what Kingscliff and Coastal pay today. Every number below can be changed.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              className="h-10 flex-1 min-w-0 rounded-xl bg-white/15 border border-white/25 text-sm px-3 text-primary-foreground sm:w-[220px] sm:flex-none"
              value=""
              onChange={(e) => {
                const p = properties.find((x) => x.id === e.target.value);
                if (p) loadProperty(p);
              }}
            >
              <option value="" className="text-foreground">Load a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id} className="text-foreground">
                  {p.property_name}{p.client_name ? ` · ${p.client_name}` : ''}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" className="h-10 rounded-xl" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
        {/* Inputs */}
        <div className="space-y-4">
          <Section title="The property">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Palm Beach Japonica (BnB Booking)" className="rounded-xl" />
            <div className="flex gap-1.5 bg-muted rounded-xl p-1 w-fit">
              {(['apartment', 'house'] as const).map((t) => (
                <button key={t} type="button" onClick={() => set('propertyType', t)}
                  className={cn('px-4 py-1.5 rounded-lg text-sm font-bold capitalize transition-colors',
                    input.propertyType === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}>
                  {t}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stepper label="Bedrooms" value={input.bedrooms} onChange={(v) => set('bedrooms', v)} />
              <Stepper label="Bathrooms" value={input.bathrooms} onChange={(v) => set('bathrooms', v)} />
              <Stepper label="Separate toilets" value={input.separateToilets} onChange={(v) => set('separateToilets', v)} />
              <Stepper label="Living areas" value={input.livingAreas} onChange={(v) => set('livingAreas', v)} min={1} />
              <Stepper label="Levels" value={input.levels} onChange={(v) => set('levels', v)} min={1} />
              <Stepper label="Kitchens" value={input.kitchens} onChange={(v) => set('kitchens', v)} />
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <Toggle label="Balcony, terrace or yard" checked={input.outdoor} onChange={(v) => set('outdoor', v)} />
              <Toggle label="Pool or spa" checked={input.pool} onChange={(v) => set('pool', v)} />
              <Toggle label="Granny flat or studio" checked={input.grannyFlat} onChange={(v) => set('grannyFlat', v)} />
            </div>
          </Section>

          <Section title={`Beds (${r.bedCount} to make)`}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {BED_LABELS.map((b) => (
                <Stepper key={b.field} label={b.label} value={input.beds[b.field]} onChange={(v) => setBed(b.field, v)} />
              ))}
            </div>
          </Section>

          <Section title="Linen and supplies">
            <div className="grid sm:grid-cols-2 gap-2">
              <Toggle label="We supply the linen" checked={input.weSupplyLinen} onChange={(v) => set('weSupplyLinen', v)} strong />
              <Toggle label={`Photo report (${money(Number(rates.photo_reporting_fee ?? 20))})`} checked={input.photoReport} onChange={(v) => set('photoReport', v)} />
              <Toggle label={`Amenities kit (${money(Number(rates.consumable_amenities_kit ?? 6.5))})`} checked={input.amenitiesKit} onChange={(v) => set('amenitiesKit', v)} />
              <Toggle label={`Tea and coffee kit (${money(Number(rates.consumable_tea_coffee_kit ?? 6.5))})`} checked={input.teaCoffeeKit} onChange={(v) => set('teaCoffeeKit', v)} />
              <Toggle label={`Wash kit (${money(Number(rates.consumable_wash_kit ?? 7.5))})`} checked={input.washKit} onChange={(v) => set('washKit', v)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Linen is costed per bed (3 sheets, 4 pillowcases, 2 towels, 2 face washers), plus a hand towel and mat per bathroom
              and tea towels per kitchen. Item prices live in Settings, Pricing.
            </p>
          </Section>

          <Section title="Adjust and compare">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Money label="Travel fee" value={String(input.travelFee || '')} onChange={(v) => set('travelFee', num(v) ?? 0)} />
              <Money label="Other adjustment" value={String(input.adjustment || '')} onChange={(v) => set('adjustment', num(v) ?? 0)} hint="Negative for a discount" />
              <Money label="Their current price" value={currentPrice} onChange={setCurrentPrice} hint="What they pay now, inc GST" />
              <Money label="Override hours" value={hoursOverride} onChange={setHoursOverride} unit="h" hint={`Formula says ${hrs(r.formulaHours)}`} />
              <Money label="Override price" value={priceOverride} onChange={setPriceOverride} hint={`Formula says ${money(r.formulaTotal)}`} />
            </div>
          </Section>
        </div>

        {/* Result */}
        <div className="lg:sticky lg:top-4 space-y-4">
          <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Price per turnover</p>
              <p className="text-4xl font-extrabold tracking-tight text-foreground mt-1 tabular-nums">{money(r.totalInc)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {money(r.totalEx)} ex GST · GST {money(r.gst)}
              </p>
              <div className="h-1 w-24 rounded-full bg-gradient-to-r from-primary to-[#FEDB00] mt-3" />
              {num(priceOverride) != null && (
                <p className="text-xs font-bold text-amber-600 mt-2">Overridden. Formula price {money(r.formulaTotal)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <Tile label="With our linen" value={money(r.withLinenInc)} active={input.weSupplyLinen} />
              <Tile label="Their own linen" value={money(r.withoutLinenInc)} active={!input.weSupplyLinen} />
            </div>

            {theirs != null && theirs > 0 && (
              <div className={cn('px-5 py-3 border-b border-border text-sm font-bold',
                r.totalInc >= theirs ? 'text-primary' : 'text-destructive')}>
                {r.totalInc >= theirs ? 'Up' : 'Down'} {money(Math.abs(r.totalInc - theirs))} on their {money(theirs)}
                <span className="font-normal text-muted-foreground"> ({(((r.totalInc - theirs) / theirs) * 100).toFixed(1)}%)</span>
              </div>
            )}

            <div className="p-5 space-y-1.5 text-sm">
              <Row label={`Labour ${hrs(r.hours)} x ${money(model.rateInc)}`} value={r.labour} />
              {r.linen > 0 && <Row label={`Linen (${money(r.linenItemCost)} cost + ${model.linenMarkupPct}%)`} value={r.linen} />}
              {r.consumables > 0 && <Row label="Consumable kits" value={r.consumables} />}
              {r.photo > 0 && <Row label="Photo report" value={r.photo} />}
              {r.travel !== 0 && <Row label="Travel" value={r.travel} />}
              {r.adjustment !== 0 && <Row label="Adjustment" value={r.adjustment} />}
              <div className="border-t border-border pt-2 mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Effective rate</span><span className="tabular-nums">{money(r.perHourInc)}/h inc</span></div>
                <div className="flex justify-between"><span>Cleaner cost ({hrs(r.hours)} x {money(model.cleanerPayRate)})</span><span className="tabular-nums">{money(r.cleanerCost)}</span></div>
                <div className={cn('flex justify-between font-bold', r.grossMarginPct < 30 ? 'text-destructive' : 'text-foreground')}>
                  <span>Gross profit ex GST</span><span className="tabular-nums">{money(r.grossProfitEx)} · {r.grossMarginPct}%</span>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5">
              <Button className="w-full rounded-xl" variant="outline" onClick={copySummary}>
                <Copy className="h-4 w-4 mr-1.5" /> Copy summary
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              How the {hrs(r.formulaHours)} is built
            </p>
            <ul className="space-y-1 text-sm">
              {r.hourLines.map((l) => (
                <li key={l.label} className="flex justify-between"><span>{l.label}</span><span className="tabular-nums text-muted-foreground">{hrs(l.hours)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Model settings */}
      <Section
        title="The pricing model"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              const d = {} as ModelSettings;
              SETTING_DEFS.forEach((s) => { d[s.field] = s.fallback; });
              setModel(d); setModelDirty(true);
            }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reverse engineered defaults
            </Button>
            <Button size="sm" disabled={!modelDirty || saving} onClick={saveModel}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
            </Button>
          </div>
        }
      >
        <p className="text-xs text-muted-foreground -mt-1">
          Changes apply to the calculator straight away. Save makes them the default for everyone.
          <span className="inline-flex items-center gap-1 ml-2 font-bold text-primary"><Check className="h-3 w-3" /> from the data</span>
          <span className="ml-2 font-bold text-amber-600">estimate</span>
        </p>
        {settingsLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SETTING_DEFS.map((d) => (
              <label key={d.key} className="rounded-xl border border-border p-3 space-y-1.5 bg-background">
                <span className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                  {d.label}
                  {d.fromData
                    ? <Check className="h-3.5 w-3.5 text-primary shrink-0" aria-label="from the data" />
                    : <span className="text-[10px] font-bold uppercase text-amber-600">est</span>}
                </span>
                <div className="flex items-center gap-1.5">
                  {(d.unit === 'inc' || d.unit === '$/h') && <span className="text-sm text-muted-foreground">$</span>}
                  <input
                    type="number" step="0.05" inputMode="decimal"
                    value={model[d.field]}
                    onChange={(e) => { setModel((m) => ({ ...m, [d.field]: Number(e.target.value) })); setModelDirty(true); }}
                    className="w-full h-9 rounded-lg border border-input bg-card px-2 text-sm font-bold tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {d.unit === 'inc' ? '/h inc' : d.unit === 'h' ? 'h' : d.unit === '%' ? '%' : '/h'}
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </Section>

      {/* Calibration */}
      <Section
        title="Check against what we charge now"
        action={
          <Button size="sm" variant="ghost" onClick={() => setShowAllClients((v) => !v)}>
            {showAllClients ? 'Kingscliff and Coastal only' : 'All clients'}
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground -mt-1">
          {within} of {calibration.length} properties land within $5 of their current price.
          Big gaps mean the price was set by a walkthrough, or the property record is missing things (outdoor areas, levels, living rooms).
          Click a row to load it.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {clientsInTable.map((c) => {
            const on = linenClients.includes(c);
            return (
              <button key={c} type="button"
                onClick={() => setLinenClients((l) => (on ? l.filter((x) => x !== c) : [...l, c]))}
                className={cn('text-xs font-bold px-2.5 py-1 rounded-full border',
                  on ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground')}>
                {c}: {on ? 'we supply linen' : 'their linen'}
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 px-1 font-semibold">Property</th>
                <th className="py-2 px-1 font-semibold">Bed/Bath</th>
                <th className="py-2 px-1 font-semibold text-right">Booked</th>
                <th className="py-2 px-1 font-semibold text-right">Formula</th>
                <th className="py-2 px-1 font-semibold text-right">Charged</th>
                <th className="py-2 px-1 font-semibold text-right">Formula price</th>
                <th className="py-2 px-1 font-semibold text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              {calibration.map(({ p, q, cur, diff }) => (
                <tr key={p.id} onClick={() => loadProperty(p)} className="border-b border-border/60 hover:bg-accent/50 cursor-pointer">
                  <td className="py-2 px-1">
                    <span className="font-semibold text-foreground">{p.property_name}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.client_name}</span>
                  </td>
                  <td className="py-2 px-1 tabular-nums">{p.bedrooms ?? '?'}/{p.bathrooms ?? '?'}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{p.estimated_hours != null ? hrs(Number(p.estimated_hours)) : '?'}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{hrs(q.hours)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{cur != null ? money(cur) : '?'}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{money(q.totalInc)}</td>
                  <td className={cn('py-2 px-1 text-right tabular-nums font-bold',
                    diff == null ? '' : Math.abs(diff) <= 5 ? 'text-primary' : diff < 0 ? 'text-destructive' : 'text-amber-600')}>
                    {diff == null ? '' : Math.abs(diff) <= 5 ? 'match' : `${diff > 0 ? '+' : ''}${money(diff)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-extrabold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stepper({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center rounded-xl border border-input bg-background">
        <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(min, value - 1))}
          className="h-9 w-9 grid place-items-center text-muted-foreground hover:text-foreground"><Minus className="h-4 w-4" /></button>
        <input type="number" inputMode="numeric" value={value}
          onChange={(e) => onChange(Math.max(min, Math.round(Number(e.target.value) || 0)))}
          className="w-full min-w-0 h-9 bg-transparent text-center text-sm font-bold tabular-nums outline-none" />
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(value + 1)}
          className="h-9 w-9 grid place-items-center text-muted-foreground hover:text-foreground"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, strong }: { label: string; checked: boolean; onChange: (v: boolean) => void; strong?: boolean }) {
  return (
    <label className={cn('flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 cursor-pointer',
      checked ? 'border-primary/50 bg-primary/5' : 'border-border bg-background')}>
      <span className={cn('text-sm', strong ? 'font-bold' : 'font-medium')}>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Money({ label, value, onChange, hint, unit }: { label: string; value: string; onChange: (v: string) => void; hint?: string; unit?: string }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-xl border border-input bg-background px-3">
        {!unit && <span className="text-sm text-muted-foreground">$</span>}
        <input type="number" inputMode="decimal" step="0.01" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 bg-transparent text-sm font-bold tabular-nums outline-none" />
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Tile({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={cn('p-4', active ? 'bg-primary/5' : '')}>
      <p className={cn('text-[11px] font-bold uppercase tracking-wide', active ? 'text-primary' : 'text-muted-foreground')}>{label}</p>
      <p className="text-lg font-extrabold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{money(value)}</span>
    </div>
  );
}
