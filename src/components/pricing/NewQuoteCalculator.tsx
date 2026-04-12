import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useAuth } from '@/contexts/AuthContext';
import { calculate, getHourlyRateIncGst, type BedType, type CalcInput, type ConsumableSelection } from '@/lib/pricingCalculator';
import { QUOTE_SERVICE_TYPES, SERVICE_TYPES, DEFAULT_HOURS, CONSUMABLE_KITS, PHOTO_REPORTING_FEE, normaliseLegacyServiceType } from '@/lib/serviceTypes';
import PriceLivePanel from './PriceLivePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import ScheduleAfterAcceptModal from './ScheduleAfterAcceptModal';
import { Save, Copy, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ClientSubmittedInfoCard from './ClientSubmittedInfoCard';

const BED_OPTIONS: BedType[] = ['King', 'Queen', 'King Single', 'Single'];

const splitClientName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};

const normaliseStoredBedTypes = (bedTypes: unknown, bedroomCount: number): BedType[] => {
  const rawValues = Array.isArray(bedTypes)
    ? bedTypes
    : bedTypes && typeof bedTypes === 'object'
      ? Array.from({ length: bedroomCount }, (_, index) => {
          const record = bedTypes as Record<string, unknown>;
          return record[String(index)] ?? record[index];
        })
      : [];

  return Array.from({ length: bedroomCount }, (_, index) => {
    const raw = rawValues[index];
    const mapped = raw === 'Bunk Beds' ? 'Single' : raw === 'Double' ? 'Queen' : raw;
    return BED_OPTIONS.includes(mapped as BedType) ? (mapped as BedType) : 'Queen';
  });
};

type FormState = {
  cleanType: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
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
  linenRequired: boolean;
  checkoutTime: string;
  checkinTime: string;
  accessMethod: string;
  accessInstructions: string;
  parking: string;
  hostingPlatform: string;
  frequency: string;
  pets: boolean;
  preferredDays: string[];
  preferredTime: string;
};

const INITIAL: FormState = {
  cleanType: SERVICE_TYPES.STANDARD_CLEAN,
  clientName: '',
  clientPhone: '',
  clientEmail: '',
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
  hours: DEFAULT_HOURS[SERVICE_TYPES.STANDARD_CLEAN],
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
    { name: 'Oven clean', price: 40, enabled: false },
    { name: 'Fridge clean', price: 35, enabled: false },
    { name: 'Window cleaning', price: 25, enabled: false },
    { name: 'Garage sweep', price: 60, enabled: false },
    { name: 'Balcony / Outdoor', price: 40, enabled: false },
  ],
  consumables: { amenities_kit: false, wash_kit: false, tea_coffee_kit: false } as ConsumableSelection,
  includePhotoReport: false,
  manualPriceOverride: false,
  manualPriceIncGst: '',
  linenRequired: false,
  checkoutTime: '',
  checkinTime: '',
  accessMethod: '',
  accessInstructions: '',
  parking: '',
  hostingPlatform: '',
  frequency: 'one-off',
  pets: false,
  preferredDays: [],
  preferredTime: '',
};

export default function NewQuoteCalculator({ editQuote, onSaved }: { editQuote?: any; onSaved?: () => void; }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: pricing } = usePricingSettings();
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('lead');
  const urlCleanType = searchParams.get('clean_type');
  const [showConfirm, setShowConfirm] = useState(false);
  const rates = pricing?.map || {};
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  const [leadSource, setLeadSource] = useState<'quote_request' | 'lead' | null>(null);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [leadFormData, setLeadFormData] = useState<Record<string, any>>({});

  const [form, setForm] = useState<FormState>(() => {
    const base = { ...INITIAL, consumables: { amenities_kit: false, wash_kit: false, tea_coffee_kit: false }, includePhotoReport: false };
    const urlCt = new URLSearchParams(window.location.search).get('clean_type');
    if (urlCt) {
      const ct = normaliseLegacyServiceType(urlCt);
      base.cleanType = ct;
      base.hours = DEFAULT_HOURS[ct] || 2;
    }
    return base;
  });

  useEffect(() => {
    if (editQuote) {
      const bt = Array.isArray(editQuote.bed_types) ? editQuote.bed_types : [];
      const ct = normaliseLegacyServiceType(editQuote.clean_type || editQuote.service_type || SERVICE_TYPES.STANDARD_CLEAN);
      setForm({
        cleanType: ct,
        clientName: editQuote.client_name || '',
        clientPhone: editQuote.client_phone || '',
        clientEmail: editQuote.client_email || '',
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
        residentialAddons: (() => {
          const saved = Array.isArray(editQuote.extras) ? editQuote.extras : [];
          if (saved.length === 0) return INITIAL.residentialAddons;
          const savedNames = new Set(saved.map((e: any) => e.name));
          return INITIAL.residentialAddons.map(a => ({ ...a, enabled: savedNames.has(a.name) }));
        })(),
        consumables: (() => {
          const cs = editQuote.consumables_selection;
          if (cs && typeof cs === 'object') {
            return {
              amenities_kit: cs.amenities_kit === true,
              wash_kit: cs.wash_kit === true,
              tea_coffee_kit: cs.tea_coffee_kit === true,
            };
          }
          return { amenities_kit: false, wash_kit: false, tea_coffee_kit: false };
        })(),
        includePhotoReport: editQuote.consumables_selection?.include_photo_report === true,
        manualPriceOverride: editQuote.consumables_selection?.manual_price_override === true,
        manualPriceIncGst: editQuote.consumables_selection?.manual_price_inc_gst != null ? String(editQuote.consumables_selection.manual_price_inc_gst) : '',
        linenRequired: editQuote.linen_required || false,
        checkoutTime: editQuote.checkout_time || '',
        checkinTime: editQuote.checkin_time || '',
        accessMethod: editQuote.access_method || '',
        accessInstructions: editQuote.access_instructions || '',
        parking: editQuote.parking || '',
        hostingPlatform: editQuote.hosting_platform || '',
        frequency: editQuote.frequency || 'one-off',
        pets: editQuote.pets || false,
        preferredDays: editQuote.preferred_days || [],
        preferredTime: editQuote.preferred_time || '',
      });
    }
  }, [editQuote]);

  // Auto-populate from quote_requests when opened via ?lead=<id>
  useEffect(() => {
    if (!leadId || editQuote) return;
    const loadLead = async () => {
      setLeadSource(null);
      setLeadStatus(null);
      setLeadFormData({});
      setSavedQuoteId(null);

      // Try quote_requests first
      const { data: qr } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('id', leadId)
        .maybeSingle();

      if (qr) {
        const fd = (qr.form_data || {}) as Record<string, any>;
        
        setLeadSource('quote_request');
        setLeadStatus(qr.status || null);
        setLeadFormData(fd);

        // ── CHECK if a saved quote already exists for this lead ──
        const existingQuoteId = typeof fd.quote_id === 'string' ? fd.quote_id : null;
        if (existingQuoteId) {
          const { data: savedQuote } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', existingQuoteId)
            .maybeSingle();

          if (savedQuote) {
            // Load from SAVED quote (preserves all admin selections)
            setSavedQuoteId(savedQuote.id);
            const bt = Array.isArray(savedQuote.bed_types) ? savedQuote.bed_types : [];
            const ct = normaliseLegacyServiceType(savedQuote.clean_type || savedQuote.service_type || SERVICE_TYPES.STANDARD_CLEAN);
            setForm({
              cleanType: ct,
              clientName: savedQuote.client_name || '',
              clientPhone: savedQuote.client_phone || '',
              clientEmail: savedQuote.client_email || '',
              propertyId: savedQuote.property_id || '',
              propertyName: savedQuote.property_name || '',
              propertyAddress: savedQuote.property_address || '',
              bedrooms: savedQuote.bedrooms || 1,
              bathrooms: savedQuote.bathrooms || 1,
              livingAreas: savedQuote.living_areas || 1,
              kitchens: savedQuote.kitchens || 1,
              balconies: savedQuote.balconies || 0,
              sofaBeds: savedQuote.sofa_beds || 0,
              outdoorAreas: savedQuote.outdoor_areas || false,
              hours: savedQuote.hours || DEFAULT_HOURS[ct] || 3,
              bedTypes: bt.length > 0 ? bt as BedType[] : ['Queen'],
              deepCleanMultiplier: savedQuote.deep_clean_multiplier || 1.5,
              projectName: savedQuote.project_name || '',
              builderName: savedQuote.builder_name || '',
              sqm: savedQuote.sqm || 0,
              levels: savedQuote.levels || 1,
              wetAreas: savedQuote.wet_areas || 0,
              propertyTypeBuild: savedQuote.property_type_build || 'Residential',
              specialistChemicals: savedQuote.specialist_chemicals || 0,
              specialRequirements: savedQuote.special_requirements || '',
              bondCertificate: savedQuote.bond_certificate || false,
              gpOverride: savedQuote.gp_percent != null ? String(Math.round(savedQuote.gp_percent * 100)) : '',
              discountGp: savedQuote.discount_gp_percent != null ? String(savedQuote.discount_gp_percent) : '',
              notes: savedQuote.notes || '',
              residentialAddons: (() => {
                const saved = Array.isArray(savedQuote.extras) ? savedQuote.extras : [];
                if (saved.length === 0) return INITIAL.residentialAddons;
                const savedNames = new Set(saved.map((e: any) => e.name));
                return INITIAL.residentialAddons.map(a => ({ ...a, enabled: savedNames.has(a.name) }));
              })(),
              consumables: (() => {
                const cs = savedQuote.consumables_selection as any;
                if (cs && typeof cs === 'object') {
                  return {
                    amenities_kit: cs.amenities_kit === true,
                    wash_kit: cs.wash_kit === true,
                    tea_coffee_kit: cs.tea_coffee_kit === true,
                  };
                }
                return { amenities_kit: false, wash_kit: false, tea_coffee_kit: false };
              })(),
              includePhotoReport: (savedQuote.consumables_selection as any)?.include_photo_report === true,
              manualPriceOverride: (savedQuote.consumables_selection as any)?.manual_price_override === true,
              manualPriceIncGst: (savedQuote.consumables_selection as any)?.manual_price_inc_gst != null ? String((savedQuote.consumables_selection as any).manual_price_inc_gst) : '',
              linenRequired: savedQuote.linen_required || false,
              checkoutTime: savedQuote.checkout_time || '',
              checkinTime: savedQuote.checkin_time || '',
              accessMethod: savedQuote.access_method || '',
              accessInstructions: savedQuote.access_instructions || '',
              parking: savedQuote.parking || '',
              hostingPlatform: savedQuote.hosting_platform || '',
              frequency: savedQuote.frequency || 'one-off',
              pets: savedQuote.pets || false,
              preferredDays: savedQuote.preferred_days || [],
              preferredTime: savedQuote.preferred_time || '',
            });
            return;
          }
        }

        // ── No saved quote exists — load from raw quote_request form_data ──
        const storedConsumables = fd.consumables && typeof fd.consumables === 'object' ? fd.consumables as Record<string, boolean> : {};
        const ct = normaliseLegacyServiceType(qr.clean_type || SERVICE_TYPES.STANDARD_CLEAN);
        const clientName = [qr.first_name, qr.last_name].filter(Boolean).join(' ');
        const bedroomCount = qr.bedrooms || 1;
        const parsedBedTypes = normaliseStoredBedTypes(fd.bed_types, bedroomCount);

        setForm(prev => ({
          ...prev,
          cleanType: ct,
          clientName,
          clientPhone: qr.phone || '',
          clientEmail: qr.email || '',
          propertyId: fd.property_id || '',
          propertyName: fd.property_name || qr.address || '',
          propertyAddress: fd.property_address || qr.address || '',
          bedrooms: qr.bedrooms || 1,
          bathrooms: qr.bathrooms || 1,
          livingAreas: fd.living_areas != null ? Number(fd.living_areas) : 1,
          kitchens: fd.kitchens != null ? Number(fd.kitchens) : 1,
          balconies: fd.balconies != null ? Number(fd.balconies) : 0,
          sofaBeds: fd.sofa_beds != null ? Number(fd.sofa_beds) : 0,
          outdoorAreas: fd.outdoor_areas === true,
          bedTypes: parsedBedTypes.length > 0 ? parsedBedTypes : ['Queen'],
          hours: fd.hours != null ? Number(fd.hours) : DEFAULT_HOURS[ct] || 3,
          notes: fd.quote_notes ?? [qr.extra_notes, fd.hosting_notes].filter(Boolean).join('\n'),
          consumables: {
            amenities_kit: storedConsumables.amenities_kit === true || fd.amenities_kit === true,
            wash_kit: storedConsumables.wash_kit === true || fd.wash_kit === true,
            tea_coffee_kit: storedConsumables.tea_coffee_kit === true || fd.tea_coffee_kit === true,
          },
          includePhotoReport: fd.include_photo_report === true,
          manualPriceOverride: fd.manual_price_override === true,
          manualPriceIncGst: fd.manual_price_inc_gst != null ? String(fd.manual_price_inc_gst) : '',
          gpOverride: fd.gp_override != null ? String(fd.gp_override) : '',
          discountGp: fd.discount_gp != null ? String(fd.discount_gp) : '',
          linenRequired: fd.linen_change === true,
          checkoutTime: fd.checkout_time || '',
          checkinTime: fd.checkin_time || '',
          accessMethod: fd.access_method || '',
          accessInstructions: fd.access_instructions || '',
          parking: fd.parking || '',
          hostingPlatform: fd.platform || '',
          frequency: fd.frequency || 'one-off',
          pets: fd.pets === true,
          preferredDays: Array.isArray(fd.preferred_days) ? fd.preferred_days : [],
          preferredTime: fd.preferred_time || '',
          residentialAddons: (() => {
            const addons = [...INITIAL.residentialAddons];
            if (fd.oven_clean === true) { const idx = addons.findIndex(a => a.name === 'Oven clean'); if (idx >= 0) addons[idx] = { ...addons[idx], enabled: true }; }
            if (fd.inside_fridge === true) { const idx = addons.findIndex(a => a.name === 'Fridge clean'); if (idx >= 0) addons[idx] = { ...addons[idx], enabled: true }; }
            if (fd.interior_windows === true) { const idx = addons.findIndex(a => a.name === 'Window cleaning'); if (idx >= 0) addons[idx] = { ...addons[idx], enabled: true }; }
            if (fd.garage === true) { const idx = addons.findIndex(a => a.name === 'Garage sweep'); if (idx >= 0) addons[idx] = { ...addons[idx], enabled: true }; }
            if (fd.outdoor_areas === true) { const idx = addons.findIndex(a => a.name === 'Balcony / Outdoor'); if (idx >= 0) addons[idx] = { ...addons[idx], enabled: true }; }
            if (fd.inside_cupboards === true) {
              addons.push({ name: 'Inside Cupboards', price: 30, enabled: true });
            }
            return addons;
          })(),
        }));
        return;
      }

      // Fallback: try leads table
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .maybeSingle();

      if (lead) {
        const ct = normaliseLegacyServiceType(lead.service_type || SERVICE_TYPES.STANDARD_CLEAN);
        setLeadSource('lead');
        setLeadStatus(lead.status || null);
        setForm(prev => ({
          ...prev,
          cleanType: ct,
          clientName: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
          clientPhone: lead.phone || '',
          clientEmail: lead.email || '',
          propertyName: lead.address || '',
          propertyAddress: [lead.address, lead.suburb].filter(Boolean).join(', '),
          bedrooms: parseInt(lead.bedrooms || '1') || 1,
          bathrooms: parseInt(lead.bathrooms || '1') || 1,
          hours: DEFAULT_HOURS[ct] || 3,
          notes: lead.notes || '',
        }));
      }
    };
    loadLead();
  }, [leadId, editQuote]);

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
    linenRequired: form.linenRequired,
    distanceKm: 0,
    activePropertyCount: 1,
    extraToilets: 0,
  };

  const result = useMemo(() => {
    const r = calculate(calcInput, rates);
    // For Standard/Deep Clean, add add-ons to the total (add-ons are inc GST prices)
    if ((form.cleanType === SERVICE_TYPES.STANDARD_CLEAN || form.cleanType === SERVICE_TYPES.DEEP_CLEAN) && addonsTotalIncGst > 0 && !form.manualPriceOverride) {
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
        client_email: form.clientEmail || null,
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
        quote_token: crypto.randomUUID(),
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
        extras: (isStandard || isDeepClean) ? form.residentialAddons.filter(a => a.enabled).map(a => ({ name: a.name, price: a.price })) : [],
        ...(status === 'quote_sent' ? { quote_sent_at: new Date().toISOString() } : {}),
        consumables_selection: {
          amenities_kit: form.consumables.amenities_kit,
          wash_kit: form.consumables.wash_kit,
          tea_coffee_kit: form.consumables.tea_coffee_kit,
          include_photo_report: form.includePhotoReport,
          manual_price_override: form.manualPriceOverride,
          manual_price_inc_gst: form.manualPriceOverride ? (parseFloat(form.manualPriceIncGst) || null) : null,
        },
        linen_required: form.linenRequired,
        checkout_time: form.checkoutTime || null,
        checkin_time: form.checkinTime || null,
        access_method: form.accessMethod || null,
        access_instructions: form.accessInstructions || null,
        parking: form.parking || null,
        hosting_platform: form.hostingPlatform || null,
        frequency: form.frequency || 'one-off',
        pets: form.pets,
        preferred_days: form.preferredDays.length > 0 ? form.preferredDays : null,
        preferred_time: form.preferredTime || null,
      };

      const existingId = editQuote?.id || savedQuoteId || (typeof leadFormData.quote_id === 'string' ? leadFormData.quote_id : null);
      let nextSavedQuoteId = existingId;

      if (existingId) {
        const { error } = await supabase.from('quotes').update(payload).eq('id', existingId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('quotes').insert(payload).select('id').single();
        if (error) throw error;
        if (inserted?.id) {
          nextSavedQuoteId = inserted.id;
          setSavedQuoteId(inserted.id);
        }
      }

      if (leadId && leadSource === 'quote_request') {
        const { firstName, lastName } = splitClientName(form.clientName);
        const nextLeadStatus = status === 'quote_sent' ? 'quote_sent' : leadStatus || 'form_submitted';
        const nextLeadFormData = {
          ...leadFormData,
          property_id: form.propertyId || null,
          property_name: form.propertyName || null,
          property_address: form.propertyAddress || null,
          client_name: form.clientName || null,
          client_phone: form.clientPhone || null,
          living_areas: form.livingAreas,
          kitchens: form.kitchens,
          balconies: form.balconies,
          sofa_beds: form.sofaBeds,
          outdoor_areas: form.outdoorAreas,
          bed_types: form.bedTypes,
          consumables: form.consumables,
          amenities_kit: form.consumables.amenities_kit,
          wash_kit: form.consumables.wash_kit,
          tea_coffee_kit: form.consumables.tea_coffee_kit,
          hours: form.hours,
          quote_notes: form.notes || null,
          manual_price_override: form.manualPriceOverride,
          manual_price_inc_gst: form.manualPriceOverride ? (parseFloat(form.manualPriceIncGst) || result.sellPriceIncGst) : null,
          gp_override: form.gpOverride || null,
          discount_gp: form.discountGp || null,
          include_photo_report: form.includePhotoReport,
          quote_id: nextSavedQuoteId,
          quote_reference: reference,
          quote_status: nextLeadStatus,
        };

        const { data: updatedLead, error: leadError } = await supabase
          .from('quote_requests')
          .update({
            first_name: firstName || null,
            last_name: lastName || null,
            phone: form.clientPhone || null,
            address: form.propertyAddress || null,
            clean_type: form.cleanType,
            bedrooms: form.bedrooms,
            bathrooms: form.bathrooms,
            estimated_hours: form.hours,
            hourly_rate: hourlyRate,
            total_ex_gst: result.sellPriceExGst,
            total_inc_gst: result.sellPriceIncGst,
            addons: isStandard ? form.residentialAddons.filter(a => a.enabled).map(a => ({ name: a.name, price: a.price })) : [],
            form_data: nextLeadFormData,
            status: nextLeadStatus,
            ...(status === 'quote_sent' ? { quote_sent_at: new Date().toISOString() } : {}),
          })
          .eq('id', leadId)
          .select('id, status')
          .single();

        if (leadError) throw leadError;
        setLeadFormData(nextLeadFormData);
        setLeadStatus(updatedLead.status);
      }

      return nextSavedQuoteId;
    },
    onSuccess: (nextSavedQuoteId, status) => {
      if (nextSavedQuoteId) setSavedQuoteId(nextSavedQuoteId);
      if (status !== 'quote_sent') toast.success('Quote saved!');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['actions-quotes-needed-qr'] });
      queryClient.invalidateQueries({ queryKey: ['quote-requests-leads'] });
      onSaved?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const buildSmsMessage = () => {
    const firstName = (form.clientName || 'there').split(' ')[0];
    const bookLine = '\n\nReply YES to accept or NO to decline.';
    
    let msg = `Hi ${firstName}, here's your Brightly Cleaning quote 🌿\n\n📍 ${form.propertyAddress || form.propertyName || 'Property'}\n🧹 ${form.cleanType}\n🛏 ${form.bedrooms} bed · ${form.bathrooms} bath`;
    
    if (form.sofaBeds > 0) msg += ` · ${form.sofaBeds} sofa bed${form.sofaBeds > 1 ? 's' : ''}`;
    if (form.balconies > 0) msg += ` · ${form.balconies} balcon${form.balconies > 1 ? 'ies' : 'y'}`;
    if (form.outdoorAreas) msg += ` · Outdoor areas`;
    
    // Bed types
    if (form.bedTypes.length > 0) {
      const bedTypeLines = form.bedTypes.map((bt, i) => `  Bed ${i + 1}: ${bt}`).join('\n');
      msg += `\n\n🛌 Bed config:\n${bedTypeLines}`;
    }
    
    // Consumable kits
    const selectedKits = CONSUMABLE_KITS.filter(k => form.consumables[k.key as keyof ConsumableSelection]);
    if (selectedKits.length > 0) {
      msg += '\n\n📦 Kits included:';
      selectedKits.forEach(k => { msg += `\n  ✓ ${k.name} — $${k.price.toFixed(2)}`; });
    }
    
    // Photo reporting
    if (form.includePhotoReport) {
      msg += `\n📸 Photo Reporting — $${PHOTO_REPORTING_FEE}.00 + GST`;
    }
    
    msg += `\n\n💰 Total: $${result.sellPriceIncGst.toFixed(2)} inc GST`;
    msg += bookLine;
    return msg;
  };

  const copyForWhatsApp = () => {
    navigator.clipboard.writeText(buildSmsMessage());
    toast.success('Copied for WhatsApp!');
  };

  const [quoteSent, setQuoteSent] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);

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

      // STEP 2 — Send visual quote link SMS
      const formattedPhone = formatAUPhone(phone);
      const firstName = (form.clientName || 'there').split(' ')[0];

      // Get the quote token from the saved quote
      const { data: savedQuote } = await supabase
        .from('quotes')
        .select('quote_token, id')
        .eq('client_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const quoteToken = savedQuote?.quote_token;
      const quoteUrl = quoteToken
        ? `${window.location.origin}/quote/${quoteToken}`
        : null;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      if (quoteUrl) {
        // Send the stunning visual quote link
        const smsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/send-quote-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: JSON.stringify({
            type: 'send_quote_link_sms',
            to: formattedPhone,
            first_name: firstName,
            property_address: form.propertyAddress || form.propertyName || '',
            clean_type: form.cleanType || 'Clean',
            quote_url: quoteUrl,
          }),
        });
        if (!smsRes.ok) {
          const err = await smsRes.json().catch(() => ({}));
          throw new Error(err.error || 'SMS sending failed');
        }
      } else {
        // Fallback: plain SMS if no token
        const smsMessage = buildSmsMessage();
        const smsRes = await fetch(`https://${projectId}.supabase.co/functions/v1/send-job-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: formattedPhone, message: smsMessage }),
        });
        if (!smsRes.ok) {
          const err = await smsRes.json().catch(() => ({}));
          throw new Error(err.error || 'SMS sending failed');
        }
      }

      // STEP 3 — Update lead/quote_request status to quote_sent
      // Try by leadId first, then fall back to phone match
      const { data: qrById } = leadId ? await supabase
        .from('quote_requests')
        .update({ status: 'quote_sent', quote_sent_at: new Date().toISOString() })
        .eq('id', leadId)
        .select('id') : { data: null };

      if (!qrById?.length) {
        // Fallback: match by phone number
        const phone = form.clientPhone?.trim();
        if (phone) {
          await supabase
            .from('quote_requests')
            .update({ status: 'quote_sent', quote_sent_at: new Date().toISOString() })
            .eq('phone', phone)
            .in('status', ['new_enquiry', 'form_submitted', 'awaiting_quote', 'pending_form']);
        }
      }

      if (leadId) {
        await supabase.from('leads').update({ status: 'quote_sent' }).eq('id', leadId);
      }

      // STEP 4 — Create admin notification
      await (await import('@/lib/alerts')).createAlert({
        event_type: 'quote_sent',
        title: `Quote sent — awaiting response · ${form.clientName || 'Client'}`,
        body: `${form.propertyAddress || form.propertyName || 'Property'} · ${form.cleanType}`,
        link: '/actions?filter=awaiting_response',
      });
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
        {/* Client Submitted Info Card */}
        {leadFormData && Object.keys(leadFormData).length > 0 && (
          <ClientSubmittedInfoCard formData={leadFormData} cleanType={form.cleanType} />
        )}

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
              <Field label="Client Email">
                <Input value={form.clientEmail} onChange={(e) => upd('clientEmail', e.target.value)} type="email" placeholder="client@example.com" className="h-12 rounded-xl" />
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

        {/* Linen + Bed Types */}
        {hasLinen && form.bedrooms > 0 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
            <h3 className="font-extrabold text-foreground">Linen & Bed Types</h3>
            <div className="flex items-center gap-3 pb-2 border-b border-border">
              <Switch checked={form.linenRequired} onCheckedChange={(v) => upd('linenRequired', v)} />
              <Label className="text-sm font-semibold">Linen Required</Label>
            </div>
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

        {/* Deep Clean / Standard Add-ons */}
        {(isStandard || isDeepClean) && (
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
          <ActionButtons saveMutation={saveMutation} copyForWhatsApp={copyForWhatsApp} editQuote={editQuote} sendQuoteMutation={sendQuoteMutation} canSendQuote={canSendQuote} quoteSent={quoteSent} onSendClick={() => setShowConfirm(true)} savedQuoteId={savedQuoteId} onAcceptClick={() => setShowAcceptModal(true)} />
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
          <ActionButtons saveMutation={saveMutation} copyForWhatsApp={copyForWhatsApp} editQuote={editQuote} sendQuoteMutation={sendQuoteMutation} canSendQuote={canSendQuote} quoteSent={quoteSent} onSendClick={() => setShowConfirm(true)} savedQuoteId={savedQuoteId} onAcceptClick={() => setShowAcceptModal(true)} />
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
                  {form.clientEmail && <p><span className="font-semibold">Email:</span> {form.clientEmail}</p>}
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
              className="bg-[#FEDB00] hover:bg-[#FEDB00]/90 text-[#0C463D] font-bold gap-2"
            >
              <Send className="h-4 w-4" /> Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Accepted + Schedule Modal */}
      <ScheduleAfterAcceptModal
        open={showAcceptModal}
        onOpenChange={setShowAcceptModal}
        quoteId={editQuote?.id || savedQuoteId || ''}
        clientName={form.clientName}
        clientPhone={form.clientPhone}
        clientEmail={form.clientEmail}
        propertyAddress={form.propertyAddress || form.propertyName}
        cleanType={form.cleanType}
        priceIncGst={result.sellPriceIncGst}
        priceExGst={result.sellPriceExGst}
        propertyId={form.propertyId || null}
        estimatedHours={form.hours}
        leadId={leadId}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          queryClient.invalidateQueries({ queryKey: ['quote-requests-leads'] });
          onSaved?.();
        }}
      />
    </div>
  );
}

function ActionButtons({ saveMutation, copyForWhatsApp, editQuote, sendQuoteMutation, canSendQuote, quoteSent, onSendClick, savedQuoteId, onAcceptClick }: {
  saveMutation: any; copyForWhatsApp: () => void; editQuote?: any;
  sendQuoteMutation: any; canSendQuote: boolean; quoteSent: boolean; onSendClick: () => void;
  savedQuoteId?: string | null; onAcceptClick: () => void;
}) {
  const quoteId = editQuote?.id || savedQuoteId;
  const quoteStatus = editQuote?.status;
  const showAcceptBtn = !!quoteId && quoteStatus !== 'accepted' && quoteStatus !== 'scheduled';

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

      {showAcceptBtn && (
        <Button
          variant="outline"
          className="w-full gap-2 border-[rgba(254,219,0,0.4)] bg-transparent text-[#FEDB00] hover:bg-[#FEDB00]/10 rounded-xl"
          size="lg"
          onClick={onAcceptClick}
        >
          <CheckCircle2 className="h-4 w-4" /> Mark Accepted ✓
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
        onFocus={(e) => e.target.select()}
        step={step}
        min={min}
        max={max}
        inputMode="decimal"
        className="h-12 rounded-xl font-semibold"
      />
    </Field>
  );
}
