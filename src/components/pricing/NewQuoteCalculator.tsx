import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useAuth } from '@/contexts/AuthContext';
import { calculate, type BedType, type CalcInput } from '@/lib/pricingCalculator';
import PriceLivePanel from './PriceLivePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, Copy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CLEAN_TYPES = ['Turnover Clean', 'Deep Clean', 'Post-Build', 'End of Lease', 'Residential One-Off'] as const;
const BED_OPTIONS: BedType[] = ['King', 'Queen', 'King Single', 'Single'];

type FormState = {
  cleanType: string;
  clientName: string;
  clientPhone: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  bedrooms: number;
  bathrooms: number;
  livingAreas: number;
  kitchens: number;
  balconies: number;
  sofaBeds: number;
  outdoorAreas: boolean;
  hours: number;
  bedTypes: BedType[];
  deepCleanMultiplier: number;
  // Post-build
  projectName: string;
  builderName: string;
  sqm: number;
  levels: number;
  wetAreas: number;
  propertyTypeBuild: string;
  specialistChemicals: number;
  specialRequirements: string;
  // End of lease
  bondCertificate: boolean;
  // Pricing
  gpOverride: string;
  discountGp: string;
  notes: string;
  // Residential One-Off
  residentialAddons: { name: string; price: number; enabled: boolean }[];
  includeGst: boolean;
};

const INITIAL: FormState = {
  cleanType: 'Turnover Clean',
  clientName: '',
  clientPhone: '',
  propertyId: '',
  propertyName: '',
  propertyAddress: '',
  bedrooms: 1,
  bathrooms: 1,
  livingAreas: 1,
  kitchens: 1,
  balconies: 0,
  sofaBeds: 0,
  outdoorAreas: false,
  hours: 3,
  bedTypes: ['Queen'],
  deepCleanMultiplier: 1.5,
  projectName: '',
  builderName: '',
  sqm: 0,
  levels: 1,
  wetAreas: 0,
  propertyTypeBuild: 'Residential',
  specialistChemicals: 0,
  specialRequirements: '',
  bondCertificate: false,
  gpOverride: '',
  discountGp: '',
  notes: '',
  residentialAddons: [
    { name: 'Oven clean', price: 45, enabled: false },
    { name: 'Fridge clean', price: 25, enabled: false },
    { name: 'Window cleaning', price: 35, enabled: false },
    { name: 'Garage sweep', price: 20, enabled: false },
    { name: 'Wall spot cleaning', price: 20, enabled: false },
  ],
  includeGst: true,
};

export default function NewQuoteCalculator({ editQuote, onSaved }: { editQuote?: any; onSaved?: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: pricing } = usePricingSettings();
  const rates = pricing?.map || {};

  const [form, setForm] = useState<FormState>(INITIAL);

  // Load edit data
  useEffect(() => {
    if (editQuote) {
      const bt = Array.isArray(editQuote.bed_types) ? editQuote.bed_types : [];
      setForm({
        cleanType: editQuote.clean_type || editQuote.service_type || 'Turnover Clean',
        clientName: editQuote.client_name || '',
        clientPhone: editQuote.client_phone || '',
        propertyId: editQuote.property_id || '',
        propertyName: editQuote.property_name || '',
        propertyAddress: editQuote.property_address || '',
        bedrooms: editQuote.bedrooms || 1,
        bathrooms: editQuote.bathrooms || 1,
        livingAreas: editQuote.living_areas || 1,
        kitchens: editQuote.kitchens || 1,
        balconies: editQuote.balconies || 0,
        sofaBeds: editQuote.sofa_beds || 0,
        outdoorAreas: editQuote.outdoor_areas || false,
        hours: editQuote.hours || 3,
        bedTypes: bt.length > 0 ? bt : ['Queen'],
        deepCleanMultiplier: editQuote.deep_clean_multiplier || 1.5,
        projectName: editQuote.project_name || '',
        builderName: editQuote.builder_name || '',
        sqm: editQuote.sqm || 0,
        levels: editQuote.levels || 1,
        wetAreas: editQuote.wet_areas || 0,
        propertyTypeBuild: editQuote.property_type_build || 'Residential',
        specialistChemicals: editQuote.specialist_chemicals || 0,
        specialRequirements: editQuote.special_requirements || '',
        bondCertificate: editQuote.bond_certificate || false,
        gpOverride: editQuote.gp_percent != null ? String(Math.round(editQuote.gp_percent * 100)) : '',
        discountGp: editQuote.discount_gp_percent != null ? String(editQuote.discount_gp_percent) : '',
        notes: editQuote.notes || '',
      });
    }
  }, [editQuote]);

  const { data: properties = [] } = useQuery({
    queryKey: ['properties-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, property_name, address, suburb, bedrooms, bathrooms')
        .order('property_name');
      if (error) throw error;
      return data;
    },
  });

  const upd = (f: keyof FormState, v: any) => setForm((p) => ({ ...p, [f]: v }));

  // Sync bed types array length with bedrooms
  useEffect(() => {
    setForm((p) => {
      const cur = [...p.bedTypes];
      while (cur.length < p.bedrooms) cur.push('Queen');
      return { ...p, bedTypes: cur.slice(0, p.bedrooms) };
    });
  }, [form.bedrooms]);

  // Property autofill
  const handlePropertySelect = (pid: string) => {
    upd('propertyId', pid);
    if (pid) {
      const p = properties.find((x) => x.id === pid);
      if (p) {
        setForm((prev) => ({
          ...prev,
          propertyId: pid,
          propertyName: p.property_name,
          propertyAddress: [p.address, p.suburb].filter(Boolean).join(', '),
          bedrooms: p.bedrooms || prev.bedrooms,
          bathrooms: p.bathrooms || prev.bathrooms,
        }));
      }
    }
  };

  const calcInput: CalcInput = {
    cleanType: form.cleanType,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    livingAreas: form.livingAreas,
    kitchens: form.kitchens,
    balconies: form.balconies,
    sofaBeds: form.sofaBeds,
    outdoorAreas: form.outdoorAreas,
    hours: form.hours,
    bedTypes: form.bedTypes,
    deepCleanMultiplier: form.deepCleanMultiplier,
    specialistChemicals: form.specialistChemicals,
    gpOverride: form.gpOverride ? parseFloat(form.gpOverride) : null,
    discountGp: form.discountGp ? parseFloat(form.discountGp) : null,
  };

  const result = useMemo(() => calculate(calcInput, rates), [calcInput, rates]);

  const saveMutation = useMutation({
    mutationFn: async (status: string) => {
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${year}-01-01`);
      const seq = ((count || 0) + 1).toString().padStart(3, '0');
      const reference = editQuote?.reference || `BQ-${year}-${seq}`;

      const payload: any = {
        client_name: form.clientName || null,
        client_phone: form.clientPhone || null,
        property_id: form.propertyId || null,
        property_name: form.propertyName || null,
        property_address: form.propertyAddress || null,
        clean_type: form.cleanType,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        living_areas: form.livingAreas,
        kitchens: form.kitchens,
        balconies: form.balconies,
        sofa_beds: form.sofaBeds,
        outdoor_areas: form.outdoorAreas,
        hours: form.hours,
        bed_types: form.bedTypes,
        deep_clean_multiplier: form.cleanType === 'Deep Clean' ? form.deepCleanMultiplier : null,
        labour_cost: result.labourCost,
        linen_cost: result.linenCost,
        consumables_cost: result.consumablesCost,
        total_cost: result.totalCost,
        gp_percent: result.effectiveGp,
        sell_price_ex_gst: result.sellPriceExGst,
        gst: result.gst,
        sell_price_inc_gst: result.sellPriceIncGst,
        actual_gp_dollars: result.actualGpDollars,
        actual_gp_percent: result.actualGpPercent,
        discount_gp_percent: form.discountGp ? parseFloat(form.discountGp) : null,
        discounted_price: result.discountedPrice,
        notes: form.notes || null,
        status,
        reference,
        created_by: user?.id || null,
        specialist_chemicals: form.specialistChemicals || 0,
        bond_certificate: form.bondCertificate,
        project_name: form.projectName || null,
        builder_name: form.builderName || null,
        sqm: form.sqm || null,
        levels: form.levels || null,
        wet_areas: form.wetAreas || null,
        property_type_build: form.propertyTypeBuild || null,
        special_requirements: form.specialRequirements || null,
        price: result.sellPriceIncGst,
        service_type: form.cleanType,
      };

      if (editQuote) {
        const { error } = await supabase.from('quotes').update(payload).eq('id', editQuote.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('quotes').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, status) => {
      toast.success(status === 'sent' ? 'Quote saved & marked as Sent!' : 'Quote saved!');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onSaved?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyForWhatsApp = () => {
    const hasLinen = form.cleanType === 'Turnover Clean' || form.cleanType === 'Deep Clean';
    const ref = editQuote?.reference || 'BQ-NEW';
    const discLine = result.discountedPrice
      ? `\nDiscounted price available: $${result.discountedPrice.toFixed(2)} — ask us for details`
      : '';
    const text = `Hi ${form.clientName || 'there'}, here's your Brightly quote:\n\n📍 ${form.propertyName || form.propertyAddress || 'Property'}\n🧹 ${form.cleanType}${hasLinen ? '\n🛏️ Linen included' : ''}\n🧴 Consumables included\n\n💰 Total: $${result.sellPriceIncGst.toFixed(2)} AUD (incl. GST)${discLine}\n\nQuote ref: ${ref}\nValid for 30 days. Reply to confirm or ask any questions. 😊\n\n— Brightly Cleaning`;
    navigator.clipboard.writeText(text);
    toast.success('Copied for WhatsApp!');
  };

  const isPostBuild = form.cleanType === 'Post-Build';
  const isEndOfLease = form.cleanType === 'End of Lease';
  const isDeepClean = form.cleanType === 'Deep Clean';
  const hasLinen = !isPostBuild && !isEndOfLease;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* LEFT: Form fields */}
      <div className="flex-1 space-y-5">
        {/* Clean Type Pills */}
        <div className="flex flex-wrap gap-2">
          {CLEAN_TYPES.map((ct) => (
            <button
              key={ct}
              onClick={() => upd('cleanType', ct)}
              className={cn(
                'px-4 py-2.5 rounded-full text-sm font-bold transition-all',
                form.cleanType === ct
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}
            >
              {ct}
            </button>
          ))}
        </div>

        {/* Property autofill */}
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
          <h3 className="font-extrabold text-foreground">Property</h3>
          <div>
            <Label className="text-xs font-semibold">Select existing property</Label>
            <Select value={form.propertyId || '__manual__'} onValueChange={(v) => handlePropertySelect(v === '__manual__' ? '' : v)}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Manual entry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">Manual entry</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPostBuild ? (
            <>
              <Field label="Project Name">
                <Input value={form.projectName} onChange={(e) => upd('projectName', e.target.value)} className="h-12 rounded-xl" />
              </Field>
              <Field label="Builder / Client Name">
                <Input value={form.builderName} onChange={(e) => upd('builderName', e.target.value)} className="h-12 rounded-xl" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Client Name">
                <Input value={form.clientName} onChange={(e) => upd('clientName', e.target.value)} className="h-12 rounded-xl" />
              </Field>
              <Field label="Client Phone">
                <Input value={form.clientPhone} onChange={(e) => upd('clientPhone', e.target.value)} className="h-12 rounded-xl" />
              </Field>
            </>
          )}

          <Field label="Property Name">
            <Input value={form.propertyName} onChange={(e) => upd('propertyName', e.target.value)} className="h-12 rounded-xl" />
          </Field>
          <Field label="Address">
            <Input value={form.propertyAddress} onChange={(e) => upd('propertyAddress', e.target.value)} className="h-12 rounded-xl" />
          </Field>
        </div>

        {/* Property Details */}
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
          <h3 className="font-extrabold text-foreground">Details</h3>

          {isPostBuild ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Approx m²" value={form.sqm} onChange={(v) => upd('sqm', v)} />
                <NumField label="Levels" value={form.levels} onChange={(v) => upd('levels', v)} />
                <NumField label="Bathrooms" value={form.bathrooms} onChange={(v) => upd('bathrooms', v)} />
                <NumField label="Wet Areas" value={form.wetAreas} onChange={(v) => upd('wetAreas', v)} />
              </div>
              <Field label="Property Type">
                <Select value={form.propertyTypeBuild} onValueChange={(v) => upd('propertyTypeBuild', v)}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Residential">Residential</SelectItem>
                    <SelectItem value="Commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <NumField label="Specialist Chemicals / Equipment ($)" value={form.specialistChemicals} onChange={(v) => upd('specialistChemicals', v)} step={1} />
              <Field label="Special Requirements">
                <Textarea value={form.specialRequirements} onChange={(e) => upd('specialRequirements', e.target.value)} className="rounded-xl min-h-[60px]" />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Bedrooms" value={form.bedrooms} onChange={(v) => upd('bedrooms', v)} min={0} max={8} />
                <NumField label="Bathrooms" value={form.bathrooms} onChange={(v) => upd('bathrooms', v)} />
                <NumField label="Living Areas" value={form.livingAreas} onChange={(v) => upd('livingAreas', v)} />
                <NumField label="Kitchens" value={form.kitchens} onChange={(v) => upd('kitchens', v)} />
                {!isEndOfLease && (
                  <>
                    <NumField label="Balconies" value={form.balconies} onChange={(v) => upd('balconies', v)} />
                    <NumField label="Sofa Beds" value={form.sofaBeds} onChange={(v) => upd('sofaBeds', v)} />
                  </>
                )}
              </div>
              {!isEndOfLease && (
                <div className="flex items-center gap-3">
                  <Switch checked={form.outdoorAreas} onCheckedChange={(v) => upd('outdoorAreas', v)} />
                  <Label className="text-sm font-semibold">Outdoor areas to clean</Label>
                </div>
              )}
              {isEndOfLease && (
                <div className="flex items-center gap-3">
                  <Switch checked={form.bondCertificate} onCheckedChange={(v) => upd('bondCertificate', v)} />
                  <Label className="text-sm font-semibold">Bond Clean Certificate Required</Label>
                </div>
              )}
            </>
          )}

          <NumField label="Estimated Clean Hours" value={form.hours} onChange={(v) => upd('hours', v)} step={0.5} min={0.5} />

          {isDeepClean && (
            <NumField label="Deep Clean Multiplier" value={form.deepCleanMultiplier} onChange={(v) => upd('deepCleanMultiplier', v)} step={0.1} min={1} />
          )}
        </div>

        {/* Bed Types */}
        {hasLinen && form.bedrooms > 0 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
            <h3 className="font-extrabold text-foreground">Bed Types</h3>
            <div className="space-y-2">
              {form.bedTypes.map((bt, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-muted-foreground w-24">Bedroom {i + 1}</span>
                  <Select value={bt} onValueChange={(v) => {
                    const arr = [...form.bedTypes];
                    arr[i] = v as BedType;
                    upd('bedTypes', arr);
                  }}>
                    <SelectTrigger className="h-10 rounded-xl flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BED_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => upd('notes', e.target.value)} className="rounded-xl min-h-[60px]" placeholder="Additional notes for this quote" />
          </Field>
        </div>

        {/* Actions (mobile) */}
        <div className="lg:hidden space-y-3">
          <PriceLivePanel
            result={result}
            gpOverride={form.gpOverride}
            discountGp={form.discountGp}
            onGpOverrideChange={(v) => upd('gpOverride', v)}
            onDiscountGpChange={(v) => upd('discountGp', v)}
          />
          <ActionButtons saveMutation={saveMutation} copyForWhatsApp={copyForWhatsApp} editQuote={editQuote} />
        </div>
      </div>

      {/* RIGHT: Live Price Panel (desktop) */}
      <div className="hidden lg:block w-80 shrink-0">
        <div className="sticky top-4 space-y-4">
          <PriceLivePanel
            result={result}
            gpOverride={form.gpOverride}
            discountGp={form.discountGp}
            onGpOverrideChange={(v) => upd('gpOverride', v)}
            onDiscountGpChange={(v) => upd('discountGp', v)}
          />
          <ActionButtons saveMutation={saveMutation} copyForWhatsApp={copyForWhatsApp} editQuote={editQuote} />
        </div>
      </div>
    </div>
  );
}

function ActionButtons({ saveMutation, copyForWhatsApp, editQuote }: { saveMutation: any; copyForWhatsApp: () => void; editQuote?: any }) {
  return (
    <div className="space-y-2">
      <Button className="w-full gap-2" size="lg" onClick={() => saveMutation.mutate('draft')} disabled={saveMutation.isPending}>
        <Save className="h-4 w-4" /> {editQuote ? 'Update Quote' : 'Save Quote'}
      </Button>
      <Button variant="outline" className="w-full gap-2" onClick={copyForWhatsApp}>
        <Copy className="h-4 w-4" /> Copy for WhatsApp
      </Button>
      <Button variant="outline" className="w-full gap-2" onClick={() => saveMutation.mutate('sent')} disabled={saveMutation.isPending}>
        <Send className="h-4 w-4" /> Save & Mark Sent
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, min = 0, max }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={min}
        max={max}
        className="h-12 rounded-xl font-semibold"
      />
    </Field>
  );
}
