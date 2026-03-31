import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useAuth } from '@/contexts/AuthContext';
import { calculate, getHourlyRateIncGst, type BedType, type CalcInput, type ConsumableSelection } from '@/lib/pricingCalculator';
import { QUOTE_SERVICE_TYPES, SERVICE_TYPES, DEFAULT_HOURS, CONSUMABLE_KITS, normaliseLegacyServiceType } from '@/lib/serviceTypes';
import PriceLivePanel from './PriceLivePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Save, Copy, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  projectName: string;
  builderName: string;
  sqm: number;
  levels: number;
  wetAreas: number;
  propertyTypeBuild: string;
  specialistChemicals: number;
  specialRequirements: string;
  bondCertificate: boolean;
  gpOverride: string;
  discountGp: string;
  notes: string;
  residentialAddons: { name: string; price: number; enabled: boolean }[];
  consumables: ConsumableSelection;
  includePhotoReport: boolean;
  manualPriceOverride: boolean;
  manualPriceIncGst: string;
};

const INITIAL: FormState = {
  cleanType: SERVICE_TYPES.AIRBNB_TURNOVER,
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
  hours: DEFAULT_HOURS[SERVICE_TYPES.AIRBNB_TURNOVER],
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
  consumables: { amenities_kit: false, wash_kit: false, tea_coffee_kit: false } as ConsumableSelection,
  includePhotoReport: false,
  manualPriceOverride: false,
  manualPriceIncGst: '',
};

export default function NewQuoteCalculator({ editQuote, onSaved }: { editQuote?: any; onSaved?: () => void; }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: pricing } = usePricingSettings();
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const [showConfirm, setShowConfirm] = useState(false);
  const rates = pricing?.map || {};

  const [form, setForm] = useState<FormState>(() => ({ ...INITIAL, consumables: { amenities_kit: false, wash_kit: false, tea_coffee_kit: false }, includePhotoReport: false }));

  useEffect(() => {
    if (editQuote) {
      const bt = Array.isArray(editQuote.bed_types) ? editQuote.bed_types : [];
      const ct = normaliseLegacyServiceType(editQuote.clean_type || editQuote.service_type || SERVICE_TYPES.AIRBNB_TURNOVER);
      setForm({
        cleanType: ct,
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
        hours: editQuote.hours || DEFAULT_HOURS[ct] || 3,
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
        residentialAddons: Array.isArray(editQuote.extras) && editQuote.extras.length > 0 ? editQuote.extras : INITIAL.residentialAddons,
        consumables: { amenities_kit: false, wash_kit: false, tea_coffee_kit: false },
        includePhotoReport: false,
        manualPriceOverride: false,
        manualPriceIncGst: '',
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

  useEffect(() => {
    const defaultHrs = DEFAULT_HOURS[form.cleanType];
    if (defaultHrs) {
      setForm((p) => ({ ...p, hours: defaultHrs }));
    }
  }, [form.cleanType]);

  useEffect(() => {
    setForm((p) => {
      const cur = [...p.bedTypes];
      while (cur.length < p.bedrooms) cur.push('Queen');
      return { ...p, bedTypes: cur.slice(0, p.bedrooms) };
    });
  }, [form.bedrooms]);

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

  // Build calc input — addons for Standard Clean are added to manual price or hours
  const addonsTotalIncGst = form.residentialAddons.filter(a => a.enabled).reduce((s, a) => s + a.price, 0);

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
    consumables: form.consumables,
    includePhotoReport: form.includePhotoReport,
    manualPriceOverride: form.manualPriceOverride,
    manualPriceIncGst: form.manualPriceOverride ? (parseFloat(form.manualPriceIncGst) || 0) : undefined,
  };

  const result = useMemo(() => {
    const r = calculate(calcInput, rates);
    // For Standard Clean, add add-ons to the total (add-ons are inc GST prices)
    if (form.cleanType === SERVICE_TYPES.STANDARD_CLEAN && addonsTotalIncGst > 0 && !form.manualPriceOverride) {
      const addonsExGst = addonsTotalIncGst / 1.1;
      const addonsGst = addonsTotalIncGst - addonsExGst;
      return {
        ...r,
        sellPriceIncGst: r.sellPriceIncGst + addonsTotalIncGst,
        sellPriceExGst: r.sellPriceExGst + addonsExGst,
        gst: r.gst + addonsGst,
      };
    }
    return r;
  }, [calcInput, rates, addonsTotalIncGst, form.cleanType, form.manualPriceOverride]);

  const hourlyRate = getHourlyRateIncGst(form.cleanType, rates);
  const hourlyRateLabel = `Rate: $${hourlyRate.toFixed(2)}/hr inc GST`;

  const isPostRenovation = form.cleanType === SERVICE_TYPES.POST_RENOVATION;
  const isBondClean = form.cleanType === SERVICE_TYPES.BOND_END_OF_LEASE;
  const isDeepClean = form.cleanType === SERVICE_TYPES.DEEP_CLEAN;
  const isStandard = form.cleanType === SERVICE_TYPES.STANDARD_CLEAN;
  const isOffice = form.cleanType === SERVICE_TYPES.OFFICE_COMMERCIAL;
  const isAirbnb = form.cleanType === SERVICE_TYPES.AIRBNB_TURNOVER;
  const hasLinen = !isPostRenovation && !isBondClean && !isStandard && !isOffice;
  const showConsumables = isAirbnb;

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
        deep_clean_multiplier: isDeepClean ? form.deepCleanMultiplier : null,
        labour_cost: result.labourCost,
        linen_cost: result.linenCost,
        consumables_cost: result.consumablesCost,
        total_cost: result.totalCost,
        gp_percent: result.effectiveGp,
        sell_price_ex_gst: result.sellPriceExGst,
        gst: result.gst,
        sell_price_inc_gst: result.sellPriceIncGst,
        actual_gp_dollars: result.gpDollars,
        actual_gp_percent: result.gpPercent,
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
        extras: isStandard ? form.residentialAddons.filter(a => a.enabled).map(a => ({ name: a.name, price: a.price })) : [],
        ...(status === 'quote_sent' ? { quote_sent_at: new Date().toISOString() } : {}),
      };

      if (editQuote?.id) {
        const { error } = await supabase.from('quotes').update(payload).eq('id', editQuote.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('quotes').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, status) => {
      if (status !== 'quote_sent') toast.success('Quote saved!');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onSaved?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const buildSmsMessage = () => {
    const firstName = (form.clientName || 'there').split(' ')[0];
    const leadIdFromUrl = new URLSearchParams(window.location.search).get('lead') || leadId;
    const bookingUrl = leadIdFromUrl
      ? `${window.location.origin}/book?lead=${leadIdFromUrl}&name=${encodeURIComponent(form.clientName || '')}&service=${encodeURIComponent(form.cleanType || '')}`
      : '';
    const bookLine = bookingUrl ? `\n\n📅 Book your preferred date here:\n${bookingUrl}` : '\n\nReply YES to accept or NO to decline.';
    return `Hi ${firstName}, here's your Brightly Cleaning quote 🌿\n\n📍 ${form.propertyAddress || form.propertyName || 'Property'}\n🧹 ${form.cleanType}\n🛏 ${form.bedrooms} bed · ${form.bathrooms} bath\n💰 Total: $${result.sellPriceIncGst.toFixed(2)}${bookLine}`;
  };

  const copyForWhatsApp = () => {
    navigator.clipboard.writeText(buildSmsMessage());
    toast.success('Copied for WhatsApp!');
  };

  const [quoteSent, setQuoteSent] = useState(false);

  const markEnquiryAsQuoteSent = async (enquiryId: string) => {
    const quoteSentAt = new Date().toISOString();

    const { data: updatedQuoteRequest, error: qrError } = await supabase
      .from('quote_requests')
      .update({ status: 'quote_sent', quote_sent_at: quoteSentAt })
      .eq('id', enquiryId)
      .select('id')
      .maybeSingle();

    if (updatedQuoteRequest) return;

    const { data: updatedLead, error: leadError } = await supabase
      .from('leads')
      .update({ status: 'quote_sent' })
      .eq('id', enquiryId)
      .select('id')
      .maybeSingle();

    if (leadError) throw leadError;
    if (updatedLead) return;
    if (qrError) throw qrError;

    throw new Error('Unable to update enquiry status after sending quote');
  };

  const formatAUPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('61')) return '+' + digits;
    if (digits.startsWith('0')) return '+61' + digits.slice(1);
    return '+61' + digits;
  };

  const sendQuoteMutation = useMutation({
    mutationFn: async () => {
      // Validate required fields
      const phone = form.clientPhone?.trim();
      if (!phone) throw new Error('Client phone number is required');
      if (result.sellPriceIncGst <= 0) throw new Error('Quote must have a price');

      // STEP 1 — Save quote first and await completion
      await saveMutation.mutateAsync('quote_sent');

      // STEP 2 — Send SMS (direct mode — no job_id needed)
      const formattedPhone = formatAUPhone(phone);
      const smsMessage = buildSmsMessage();

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const smsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/send-job-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: formattedPhone, message: smsMessage }),
      });

      if (!smsRes.ok) {
        const err = await smsRes.json().catch(() => ({}));
        throw new Error(err.error || 'SMS sending failed');
      }

      // STEP 3 — If opened from /quoting?lead=<id>, move lead out of Quotes Needed
      if (leadId) {
        await markEnquiryAsQuoteSent(leadId);
      }

      // STEP 4 — Create admin notification
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            title: `Quote sent — awaiting response · ${form.clientName || 'Client'}`,
            message: `${form.propertyAddress || form.propertyName || 'Property'} · ${form.cleanType}`,
            type: 'quote_sent',
            link: '/actions?filter=awaiting_response',
          }))
        );
      }
    },
    onSuccess: async () => {
      setQuoteSent(true);
      toast.success(`Quote sent to ${form.clientName || 'client'} via SMS`);

      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['actions-awaiting-response'] });
      queryClient.invalidateQueries({ queryKey: ['actions-quotes-needed-qr'] });
      queryClient.invalidateQueries({ queryKey: ['actions-quotes-needed-leads'] });
    },
    onError: (e: any) => toast.error(`Failed to send: ${e.message}`),
  });

  const canSendQuote = !!form.clientPhone.trim() && result.sellPriceIncGst > 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-5">
        {/* Clean Type Pills */}
        <div className="flex flex-wrap gap-2">
          {QUOTE_SERVICE_TYPES.map((ct) => (
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

        {/* Property */}
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

          {isPostRenovation ? (
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

        {/* Details */}
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
          <h3 className="font-extrabold text-foreground">Details</h3>

          {isPostRenovation ? (
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
                {!isBondClean && (
                  <>
                    <NumField label="Balconies" value={form.balconies} onChange={(v) => upd('balconies', v)} />
                    <NumField label="Sofa Beds" value={form.sofaBeds} onChange={(v) => upd('sofaBeds', v)} />
                  </>
                )}
              </div>
              {!isBondClean && (
                <div className="flex items-center gap-3">
                  <Switch checked={form.outdoorAreas} onCheckedChange={(v) => upd('outdoorAreas', v)} />
                  <Label className="text-sm font-semibold">Outdoor areas to clean</Label>
                </div>
              )}
              {isBondClean && (
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

        {/* Consumable Kits — Airbnb only */}
        {showConsumables && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h3 className="font-extrabold text-foreground">Consumable Kits</h3>
            <p className="text-xs text-muted-foreground">Fixed prices inc GST — no markup applied.</p>
            <div className="space-y-3">
              {CONSUMABLE_KITS.map((kit) => (
                <div key={kit.key} className="flex items-start gap-3">
                  <Switch
                    checked={form.consumables[kit.key as keyof ConsumableSelection]}
                    onCheckedChange={(v) => upd('consumables', { ...form.consumables, [kit.key]: v })}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{kit.name} — ${kit.price.toFixed(2)} inc GST</p>
                    <p className="text-xs text-muted-foreground">{kit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo Reporting Fee */}
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Switch checked={form.includePhotoReport} onCheckedChange={(v) => upd('includePhotoReport', v)} />
            <div>
              <p className="text-sm font-semibold">Photo Reporting Fee — $20.00 + GST</p>
              <p className="text-xs text-muted-foreground">Optional per-clean photo documentation</p>
            </div>
          </div>
        </div>

        {/* Standard Clean Add-ons */}
        {isStandard && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h3 className="font-extrabold text-foreground">Add-ons</h3>
            <p className="text-xs text-muted-foreground">Prices are inc GST</p>
            <div className="space-y-2">
              {form.residentialAddons.map((addon, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Switch checked={addon.enabled} onCheckedChange={(v) => {
                    const arr = [...form.residentialAddons];
                    arr[i] = { ...arr[i], enabled: v };
                    upd('residentialAddons', arr);
                  }} />
                  <span className="text-sm font-semibold flex-1">{addon.name}</span>
                  <Input
                    type="number"
                    value={addon.price}
                    onChange={(e) => {
                      const arr = [...form.residentialAddons];
                      arr[i] = { ...arr[i], price: parseFloat(e.target.value) || 0 };
                      upd('residentialAddons', arr);
                    }}
                    className="w-20 h-10 rounded-xl text-right font-semibold"
                    step={5}
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={() => {
                upd('residentialAddons', [...form.residentialAddons, { name: 'Custom', price: 0, enabled: true }]);
              }}>+ Custom add-on</Button>
            </div>
          </div>
        )}

        {/* Manual Price Override */}
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={form.manualPriceOverride} onCheckedChange={(v) => upd('manualPriceOverride', v)} />
            <div>
              <p className="text-sm font-semibold">Manual Price Override</p>
              <p className="text-xs text-muted-foreground">
                {form.manualPriceOverride ? 'Enter manual price' : 'Use calculated price'}
              </p>
            </div>
          </div>
          {form.manualPriceOverride && (
            <Field label="Total price inc GST ($)">
              <Input
                type="number"
                value={form.manualPriceIncGst}
                onChange={(e) => upd('manualPriceIncGst', e.target.value)}
                placeholder="e.g. 280.00"
                className="h-12 rounded-xl font-semibold text-lg"
                step={5}
              />
            </Field>
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
            hideConsumables={!isAirbnb}
            hourlyRateLabel={hourlyRateLabel}
          />
          <ActionButtons saveMutation={saveMutation} copyForWhatsApp={copyForWhatsApp} editQuote={editQuote} sendQuoteMutation={sendQuoteMutation} canSendQuote={canSendQuote} quoteSent={quoteSent} onSendClick={() => setShowConfirm(true)} />
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
            hideConsumables={!isAirbnb}
            hourlyRateLabel={hourlyRateLabel}
          />
          <ActionButtons saveMutation={saveMutation} copyForWhatsApp={copyForWhatsApp} editQuote={editQuote} sendQuoteMutation={sendQuoteMutation} canSendQuote={canSendQuote} quoteSent={quoteSent} onSendClick={() => setShowConfirm(true)} />
        </div>
      </div>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-extrabold text-primary">Confirm & Send Quote</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">You're about to send this quote via SMS:</p>
                <div className="bg-muted rounded-xl p-4 space-y-2 text-foreground">
                  <p><span className="font-semibold">Client:</span> {form.clientName || '—'}</p>
                  <p><span className="font-semibold">Phone:</span> {form.clientPhone || '—'}</p>
                  <p><span className="font-semibold">Quote #:</span> {editQuote?.reference || 'New'}</p>
                  <p><span className="font-semibold">Service:</span> {form.cleanType}</p>
                  <p><span className="font-semibold">Total:</span> <span className="font-extrabold text-primary">${result.sellPriceIncGst.toFixed(2)} inc GST</span></p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sendQuoteMutation.mutate()}
              className="bg-primary hover:bg-primary/90 font-bold gap-2"
            >
              <Send className="h-4 w-4" /> Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionButtons({ saveMutation, copyForWhatsApp, editQuote, sendQuoteMutation, canSendQuote, quoteSent, onSendClick }: {
  saveMutation: any; copyForWhatsApp: () => void; editQuote?: any;
  sendQuoteMutation: any; canSendQuote: boolean; quoteSent: boolean; onSendClick: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button className="w-full gap-2" size="lg" onClick={() => saveMutation.mutate('draft')} disabled={saveMutation.isPending}>
        <Save className="h-4 w-4" /> {editQuote ? 'Update Quote' : 'Save Quote'}
      </Button>

      {quoteSent ? (
        <Button className="w-full gap-2 bg-muted text-muted-foreground cursor-default" size="lg" disabled>
          <CheckCircle2 className="h-4 w-4" /> Quote Sent ✓
        </Button>
      ) : (
        <Button
          className="w-full gap-2 bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground font-bold"
          size="lg"
          onClick={onSendClick}
          disabled={!canSendQuote || sendQuoteMutation.isPending}
        >
          {sendQuoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Quote to Client
        </Button>
      )}

      <Button variant="outline" className="w-full gap-2" onClick={copyForWhatsApp}>
        <Copy className="h-4 w-4" /> Copy Quote for WhatsApp
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
