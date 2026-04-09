import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

/* ────────────── Types ────────────── */
type CleanType = 'standard' | 'airbnb' | 'deep_clean' | 'end_of_lease';

interface FormData {
  clean_type: CleanType | '';
  property_name: string;
  address: string;
  suburb: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  preferred_date: string;
  preferred_time: string;
  date_mode: 'asap' | 'pick' | '';
  notes: string;
  access_method: string;
  access_instructions: string;
  extras: string[];
  bed_types: string[];
  bed_config: Record<number, string>; // per-bedroom bed type: { 1: 'King', 2: 'Queen' }
  total_beds: number;
  linen_provided: string;
  consumables_needed: string;
  guest_checkout_time: string;
  guest_checkin_time: string;
  turnaround_window: string;
  last_cleaned: string;
  is_occupied: string;
  lease_end_date: string;
  carpets_required: string;
  oven_required: string;
  bond_clean_required: string;
  agent_name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  referral_source: string;
}

const EMPTY: FormData = {
  clean_type: '',
  property_name: '', address: '', suburb: '', state: 'QLD',
  bedrooms: 2, bathrooms: 1,
  preferred_date: '', preferred_time: '', date_mode: '',
  notes: '', access_method: '', access_instructions: '',
  extras: [],
  bed_types: [], bed_config: {}, total_beds: 1, linen_provided: '', consumables_needed: '',
  guest_checkout_time: '10:00', guest_checkin_time: '14:00', turnaround_window: '4',
  last_cleaned: '', is_occupied: '',
  lease_end_date: '', carpets_required: 'No', oven_required: 'No',
  bond_clean_required: 'No', agent_name: '',
  first_name: '', last_name: '', phone: '', email: '', referral_source: '',
};

const CLEAN_TYPES: { value: CleanType; label: string; icon: string }[] = [
  { value: 'standard', label: 'Standard House Clean', icon: '🏠' },
  { value: 'deep_clean', label: 'Deep Clean', icon: '🧹' },
  { value: 'end_of_lease', label: 'End of Lease', icon: '🔑' },
  { value: 'airbnb', label: 'Airbnb / Short Stay', icon: '🏨' },
];

const ACCESS_METHODS = ['Key safe', 'Leave unlocked', 'Meet at property', 'Other'];
const BED_TYPE_OPTIONS = ['King', 'Queen', 'Double', 'Single', 'Bunk'];
const REFERRAL_OPTIONS = ['Google', 'Facebook', 'Instagram', 'Referral', 'Signage', 'Other'];

const EXTRAS_BY_TYPE: Record<string, string[]> = {
  standard: ['Oven', 'Fridge', 'Windows', 'Balcony', 'Garage'],
  deep_clean: ['Oven', 'Fridge', 'Windows', 'Balcony', 'Garage', 'Walls', 'Blinds'],
  end_of_lease: ['Oven', 'Fridge', 'Windows', 'Balcony', 'Garage', 'Carpet Steam'],
  airbnb: ['Oven', 'Fridge', 'Windows', 'Balcony'],
};

/* ────── Step definitions ────── */
function getSteps(cleanType: CleanType | ''): string[] {
  if (cleanType === 'airbnb') {
    return ['clean_type', 'property', 'airbnb_extras', 'access', 'contact'];
  }
  return ['clean_type', 'property', 'extras', 'access', 'contact'];
}

/* ────────────── Component ────────────── */
export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdminMode = !token;
  const presetType = searchParams.get('type') as CleanType | null;

  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState<FormData>({ ...EMPTY });
  const [submitted, setSubmitted] = useState(false);

  const steps = getSteps(form.clean_type);
  const currentStep = steps[stepIdx] || 'clean_type';

  useEffect(() => {
    if (presetType && CLEAN_TYPES.some(ct => ct.value === presetType)) {
      setForm(f => ({ ...f, clean_type: presetType }));
      setStepIdx(1);
    }
  }, [presetType]);

  const u = (field: keyof FormData, value: any) => setForm(f => ({ ...f, [field]: value }));
  const goNext = () => { setStepIdx(s => Math.min(s + 1, steps.length - 1)); window.scrollTo(0, 0); };
  const goBack = () => { setStepIdx(s => Math.max(s - 1, 0)); window.scrollTo(0, 0); };

  /* ────── Submit — auto-create everything (UNCHANGED LOGIC) ────── */
  const submitMutation = useMutation({
    mutationFn: async () => {
      const fullName = `${form.first_name} ${form.last_name}`.trim();
      const cleanTypeLabel = CLEAN_TYPES.find(c => c.value === form.clean_type)?.label || form.clean_type;
      const propType = form.clean_type === 'airbnb' ? 'airbnb' : 'residential';
      const propName = form.clean_type === 'airbnb' && form.property_name
        ? form.property_name
        : `${form.first_name}'s ${form.address || 'Property'}`;

      const { error: qrErr } = await supabase.from('quote_requests').insert({
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        clean_type: cleanTypeLabel,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        preferred_date: form.preferred_date || null,
        preferred_time: form.preferred_time || null,
        extra_notes: form.notes || null,
        referral_source: form.referral_source || null,
        property_type: propType,
        status: 'form_submitted',
        form_submitted_at: new Date().toISOString(),
        form_data: {
          clean_type: form.clean_type,
          suburb: form.suburb,
          state: form.state,
          access_method: form.access_method,
          access_instructions: form.access_instructions,
          extras: form.extras,
          ...(form.clean_type === 'airbnb' ? {
            bed_config: form.bed_config,
            bed_types: Object.values(form.bed_config),
            linen_provided: form.linen_provided,
            consumables_needed: form.consumables_needed,
          } : {}),
          ...(form.clean_type === 'deep_clean' ? {
            last_cleaned: form.last_cleaned,
            is_occupied: form.is_occupied,
          } : {}),
          ...(form.clean_type === 'end_of_lease' ? {
            lease_end_date: form.lease_end_date,
            carpets_required: form.carpets_required,
            oven_required: form.oven_required,
            bond_clean_required: form.bond_clean_required,
            agent_name: form.agent_name,
          } : {}),
        } as any,
      });
      if (qrErr) throw qrErr;

      const { data: existingProp } = await supabase
        .from('properties').select('id').eq('address', form.address).maybeSingle();

      let propertyId: string;
      if (existingProp) {
        propertyId = existingProp.id;
      } else {
        const { data: newProp, error: propErr } = await supabase.from('properties').insert({
          property_name: propName,
          address: form.address,
          suburb: form.suburb,
          state: form.state,
          client_name: fullName,
          client_phone: form.phone,
          billing_email: form.email,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          property_type: propType,
          status: 'active',
          access_method: form.access_method,
          access_notes: form.access_instructions,
          ...(form.clean_type === 'airbnb' ? {
            checkout_time: form.guest_checkout_time,
            checkin_time: form.guest_checkin_time,
            turnaround_window: form.turnaround_window,
            linen_supply: form.linen_provided === 'Yes' ? 'brightly' : 'client',
          } : {}),
        }).select('id').single();
        if (propErr) throw propErr;
        propertyId = newProp.id;
      }

      let profileId: string | null = null;
      if (form.phone) {
        const { data: byPhone } = await supabase.from('profiles').select('id').eq('phone', form.phone).maybeSingle();
        if (byPhone) profileId = byPhone.id;
      }
      if (!profileId && form.email) {
        const { data: byEmail } = await supabase.from('profiles').select('id').eq('email', form.email).maybeSingle();
        if (byEmail) profileId = byEmail.id;
      }

      if (profileId) {
        await supabase.from('profiles').update({
          full_name: fullName, phone: form.phone, email: form.email,
        }).eq('id', profileId);
      } else {
        const newId = crypto.randomUUID();
        const { error: profErr } = await supabase.from('profiles').insert({
          id: newId, full_name: fullName, phone: form.phone, email: form.email,
        });
        if (profErr) throw profErr;
        profileId = newId;
      }

      await supabase.from('user_roles').upsert(
        { user_id: profileId, role: 'client' },
        { onConflict: 'user_id' }
      ).then(() => {});

      const { data: existingLink } = await supabase
        .from('client_properties').select('id')
        .eq('client_id', profileId).eq('property_id', propertyId).maybeSingle();
      if (!existingLink) {
        await supabase.from('client_properties').insert({ client_id: profileId, property_id: propertyId });
      }

      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        await (await import('@/lib/alerts')).createAlert({
          event_type: 'new_lead',
          title: `New enquiry — ${fullName}`,
          body: `${cleanTypeLabel} — ${form.address || 'No address'}`,
          link: '/clients',
        });
      }
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => toast.error(e.message),
  });

  /* ────── Submitted state ────── */
  if (submitted) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="w-16 h-16 text-[#22C55E] mb-4" />
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: '#F0FDF4' }}>
            {isAdminMode ? 'Client Added' : 'Thank You!'}
          </h2>
          <p className="text-sm mb-6" style={{ color: '#86EFAC' }}>
            {isAdminMode
              ? `${form.first_name} ${form.last_name} has been added as a client with their property.`
              : "We'll be in touch within 24 hours with your quote."}
          </p>
          {isAdminMode && (
            <div className="flex gap-3">
              <button onClick={() => navigate('/clients')} className="px-6 py-3 rounded-2xl font-bold text-sm" style={{ background: '#FEDB00', color: '#0C463D' }}>
                View Clients
              </button>
              <button onClick={() => navigate('/quoting')} className="px-6 py-3 rounded-2xl font-bold text-sm" style={{ background: 'transparent', color: '#F0FDF4', border: '1px solid rgba(255,255,255,0.2)' }}>
                Open Quote Calculator
              </button>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  /* ────── canNext per step ────── */
  const canNext = (() => {
    switch (currentStep) {
      case 'clean_type': return !!form.clean_type;
      case 'property': return !!form.address.trim() && form.bedrooms > 0 && form.bathrooms > 0;
      case 'airbnb_extras': return !!form.linen_provided && !!form.consumables_needed;
      case 'extras': return true;
      case 'access': return !!form.access_method;
      case 'contact': return !!form.first_name && !!form.last_name && !!form.phone && !!form.email;
      default: return true;
    }
  })();

  return (
    <Shell>
      {/* ── Progress dots ── */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {steps.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === stepIdx ? 24 : 8,
              height: 8,
              background: i <= stepIdx ? '#FEDB00' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
      <p className="text-center text-[11px] font-semibold mb-8" style={{ color: 'rgba(254,219,0,0.6)' }}>
        Step {stepIdx + 1} of {steps.length}
      </p>

      {/* ═══════ STEP: Clean Type ═══════ */}
      {currentStep === 'clean_type' && (
        <StepContainer heading="What type of clean do you need?" sub="Choose the service that best fits your space.">
          <div className="grid grid-cols-2 gap-3">
            {CLEAN_TYPES.map(ct => (
              <Pill key={ct.value} selected={form.clean_type === ct.value}
                onClick={() => { u('clean_type', ct.value); setTimeout(goNext, 150); }}>
                <span className="text-2xl mb-1">{ct.icon}</span>
                <span className="text-[13px] font-bold leading-tight">{ct.label}</span>
              </Pill>
            ))}
          </div>
        </StepContainer>
      )}


      {/* ═══════ STEP: Property (combined address + beds + baths) ═══════ */}
      {currentStep === 'property' && (
        <StepContainer heading="Tell us about the property" sub="We'll use this to prepare your quote.">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Property address *</p>
              <Input
                value={form.address}
                onChange={e => u('address', e.target.value)}
                placeholder="123 Example Street, Suburb"
                className="h-14 rounded-2xl text-base px-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
              />
            </div>
            {form.clean_type === 'airbnb' && (
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Property nickname (optional)</p>
                <Input
                  value={form.property_name}
                  onChange={e => u('property_name', e.target.value)}
                  placeholder="e.g. Beach House"
                  className="h-14 rounded-2xl text-base px-5"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
                />
              </div>
            )}
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Bedrooms *</p>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map(n => (
                  <Pill key={n} selected={form.bedrooms === n} onClick={() => u('bedrooms', n)} small>
                    <span className="text-base font-extrabold">{n}{n === 5 ? '+' : ''}</span>
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Bathrooms *</p>
              <div className="flex gap-3">
                {[1, 2, 3, 4].map(n => (
                  <Pill key={n} selected={form.bathrooms === n} onClick={() => u('bathrooms', n)} small>
                    <span className="text-base font-extrabold">{n}{n === 4 ? '+' : ''}</span>
                  </Pill>
                ))}
              </div>
            </div>
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack={stepIdx > 0} />
        </StepContainer>
      )}

      {/* ═══════ STEP: Address (legacy - not used) ═══════ */}
      {currentStep === 'address' && (
        <StepContainer heading="What's the property address?" sub="We'll use this to prepare your quote.">
          <Input
            value={form.address}
            onChange={e => u('address', e.target.value)}
            placeholder="123 Example Street, Suburb"
            className="h-14 rounded-2xl text-base px-5"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
          />
          {form.clean_type === 'airbnb' && (
            <div className="mt-4">
              <p className="text-xs font-bold mb-2" style={{ color: '#86EFAC' }}>Property nickname (optional)</p>
              <Input
                value={form.property_name}
                onChange={e => u('property_name', e.target.value)}
                placeholder="e.g. Beach House"
                className="h-14 rounded-2xl text-base px-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
              />
            </div>
          )}
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack={stepIdx > 0} />
        </StepContainer>
      )}

      {/* ═══════ STEP: Bedrooms ═══════ */}
      {currentStep === 'bedrooms' && (
        <StepContainer heading="How many bedrooms?" sub="Include all bedrooms in the property.">
          <div className="grid grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map(n => (
              <Pill key={n} selected={form.bedrooms === n} onClick={() => u('bedrooms', n)}>
                <span className="text-lg font-extrabold">{n}{n === 5 ? '+' : ''}</span>
              </Pill>
            ))}
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepContainer>
      )}

      {/* ═══════ STEP: Bathrooms ═══════ */}
      {currentStep === 'bathrooms' && (
        <StepContainer heading="How many bathrooms?" sub="Include ensuites and powder rooms.">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(n => (
              <Pill key={n} selected={form.bathrooms === n} onClick={() => u('bathrooms', n)}>
                <span className="text-lg font-extrabold">{n}{n === 4 ? '+' : ''}</span>
              </Pill>
            ))}
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepContainer>
      )}

      {/* ═══════ STEP: Airbnb extras ═══════ */}
      {currentStep === 'airbnb_extras' && (
        <StepContainer heading="Airbnb details" sub="Tell us about beds, linen and consumables.">
          <div className="space-y-6">
            {/* Bed type per bedroom */}
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>BED TYPE PER BEDROOM</p>
              <div className="space-y-3">
                {Array.from({ length: form.bedrooms }, (_, i) => i + 1).map(roomNum => (
                  <div key={roomNum}>
                    <p className="text-xs font-bold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Bedroom {roomNum}</p>
                    <div className="flex gap-2 flex-wrap">
                      {['King', 'Queen', 'Double', 'Single', 'Bunk'].map(bt => (
                        <button
                          key={bt}
                          type="button"
                          onClick={() => {
                            const next = { ...form.bed_config, [roomNum]: bt };
                            u('bed_config', next);
                          }}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '12px',
                            border: form.bed_config[roomNum] === bt ? '2px solid #FEDB00' : '1px solid rgba(255,255,255,0.15)',
                            background: form.bed_config[roomNum] === bt ? '#FEDB00' : 'rgba(255,255,255,0.04)',
                            color: form.bed_config[roomNum] === bt ? '#0C463D' : '#F0FDF4',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {bt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Linen */}
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>LINEN PROVIDED BY BRIGHTLY?</p>
              <div className="grid grid-cols-2 gap-3">
                <Pill selected={form.linen_provided === 'Yes'} onClick={() => u('linen_provided', 'Yes')}>
                  <span className="text-[13px] font-bold">✓ Yes please</span>
                </Pill>
                <Pill selected={form.linen_provided === 'No'} onClick={() => u('linen_provided', 'No')}>
                  <span className="text-[13px] font-bold">✗ No thanks</span>
                </Pill>
              </div>
            </div>

            {/* Consumables */}
            <div>
              <p className="text-sm font-bold mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>CONSUMABLES RESTOCKING?</p>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Coffee, soaps, shampoos, toilet paper etc.</p>
              <div className="grid grid-cols-2 gap-3">
                <Pill selected={form.consumables_needed === 'Yes'} onClick={() => u('consumables_needed', 'Yes')}>
                  <span className="text-[13px] font-bold">✓ Yes please</span>
                </Pill>
                <Pill selected={form.consumables_needed === 'No'} onClick={() => u('consumables_needed', 'No')}>
                  <span className="text-[13px] font-bold">✗ No thanks</span>
                </Pill>
              </div>
            </div>
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepContainer>
      )}

      {/* ═══════ STEP: When ═══════ */}
      {currentStep === 'when' && (
        <StepContainer heading="When do you need it?" sub="We'll do our best to match your preferred date.">
          <div className="grid grid-cols-1 gap-3">
            <Pill selected={form.date_mode === 'asap'} onClick={() => { u('date_mode', 'asap'); u('preferred_date', ''); }}>
              <span className="text-base font-bold">⚡ As Soon As Possible</span>
            </Pill>
            <Pill selected={form.date_mode === 'pick'} onClick={() => u('date_mode', 'pick')}>
              <span className="text-base font-bold">📅 Pick a Date</span>
            </Pill>
          </div>
          {form.date_mode === 'pick' && (
            <div className="mt-4">
              <Input
                type="date"
                value={form.preferred_date}
                onChange={e => u('preferred_date', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-14 rounded-2xl text-base px-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
              />
            </div>
          )}
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepContainer>
      )}

      {/* ═══════ STEP: Time ═══════ */}
      {currentStep === 'time' && (
        <StepContainer heading="What time works best?" sub="We'll schedule within your preferred window.">
          <div className="grid grid-cols-1 gap-3">
            {[
              { v: 'Morning', label: '🌅 Morning', sub: '7am – 12pm' },
              { v: 'Afternoon', label: '☀️ Afternoon', sub: '12pm – 5pm' },
              { v: 'Either', label: '🕐 Either', sub: 'Whatever works!' },
            ].map(t => (
              <Pill key={t.v} selected={form.preferred_time === t.v} onClick={() => u('preferred_time', t.v)}>
                <span className="text-base font-bold">{t.label}</span>
                <span className="text-xs mt-0.5" style={{ color: form.preferred_time === t.v ? '#0C463D' : 'rgba(240,253,244,0.5)' }}>{t.sub}</span>
              </Pill>
            ))}
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepContainer>
      )}

      {/* ═══════ STEP: Extras ═══════ */}
      {currentStep === 'extras' && (
        <StepContainer heading="Any extras?" sub="Select anything that applies — all optional.">
          <div className="grid grid-cols-2 gap-3">
            {(EXTRAS_BY_TYPE[form.clean_type || 'standard'] || []).map(ex => (
              <Pill key={ex} selected={form.extras.includes(ex)}
                onClick={() => {
                  const next = form.extras.includes(ex) ? form.extras.filter(e => e !== ex) : [...form.extras, ex];
                  u('extras', next);
                }}>
                <span className="text-[13px] font-bold">{ex}</span>
              </Pill>
            ))}
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext showBack label="Next" />
        </StepContainer>
      )}

      {/* ═══════ STEP: Access ═══════ */}
      {currentStep === 'access' && (
        <StepContainer heading="How do we get in?" sub="Select the access method for your property.">
          <div className="grid grid-cols-2 gap-3">
            {ACCESS_METHODS.map(m => (
              <Pill key={m} selected={form.access_method === m} onClick={() => u('access_method', m)}>
                <span className="text-[13px] font-bold">{m}</span>
              </Pill>
            ))}
          </div>
          {form.access_method === 'Key safe' && (
            <div className="mt-4">
              <p className="text-xs font-bold mb-2" style={{ color: '#86EFAC' }}>Key safe code</p>
              <Input
                value={form.access_instructions}
                onChange={e => u('access_instructions', e.target.value)}
                placeholder="e.g. 1234"
                className="h-14 rounded-2xl text-base px-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
              />
            </div>
          )}
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepContainer>
      )}

      {/* ═══════ STEP: Notes ═══════ */}
      {currentStep === 'notes' && (
        <StepContainer heading="Anything we should know?" sub="Pets, fragile items, special instructions — totally optional.">
          <Textarea
            value={form.notes}
            onChange={e => u('notes', e.target.value)}
            placeholder="Pets, fragile items, specific instructions..."
            rows={5}
            className="rounded-2xl text-base p-5"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
          />
          <NavButtons onBack={goBack} onNext={goNext} canNext showBack label="Next" />
        </StepContainer>
      )}

      {/* ═══════ STEP: Contact ═══════ */}
      {currentStep === 'contact' && (
        <StepContainer heading="Your details" sub="We'll use these to send your quote.">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <DarkInput label="First Name" value={form.first_name} onChange={v => u('first_name', v)} placeholder="Jane" />
              <DarkInput label="Last Name" value={form.last_name} onChange={v => u('last_name', v)} placeholder="Smith" />
            </div>
            <DarkInput label="Mobile" value={form.phone} onChange={v => u('phone', v)} placeholder="0412 345 678" />
            <DarkInput label="Email" value={form.email} onChange={v => u('email', v)} placeholder="you@example.com" type="email" />
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: '#86EFAC' }}>How did you hear about us?</p>
              <div className="grid grid-cols-3 gap-2">
                {REFERRAL_OPTIONS.map(r => (
                  <Pill key={r} selected={form.referral_source === r} onClick={() => u('referral_source', r)} small>
                    <span className="text-[11px] font-bold">{r}</span>
                  </Pill>
                ))}
              </div>
            </div>
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack label="Review →" />
        </StepContainer>
      )}

      {/* ═══════ STEP: Summary ═══════ */}
      {currentStep === 'summary' && (
        <StepContainer heading="Review your request" sub="Check everything looks right before submitting.">
          <SummaryCard title="Clean Type">
            <SummaryPill>{CLEAN_TYPES.find(c => c.value === form.clean_type)?.icon} {CLEAN_TYPES.find(c => c.value === form.clean_type)?.label}</SummaryPill>
          </SummaryCard>

          <SummaryCard title="Property">
            <Row label="Address" value={form.address} />
            {form.property_name && <Row label="Name" value={form.property_name} />}
            <Row label="Bedrooms" value={String(form.bedrooms)} />
            <Row label="Bathrooms" value={String(form.bathrooms)} />
            {form.clean_type === 'airbnb' && form.bed_types.length > 0 && (
              <Row label="Bed Types" value={form.bed_types.join(', ')} />
            )}
            {form.clean_type === 'airbnb' && <Row label="Linen by Brightly" value={form.linen_provided} />}
          </SummaryCard>

          <SummaryCard title="Schedule">
            <Row label="When" value={form.date_mode === 'asap' ? 'ASAP' : form.preferred_date || '—'} />
            <Row label="Time" value={form.preferred_time || '—'} />
          </SummaryCard>

          {form.extras.length > 0 && (
            <SummaryCard title="Extras">
              <div className="flex flex-wrap gap-2">
                {form.extras.map(e => <SummaryPill key={e}>{e}</SummaryPill>)}
              </div>
            </SummaryCard>
          )}

          <SummaryCard title="Access">
            <Row label="Method" value={form.access_method} />
            {form.access_instructions && <Row label="Details" value={form.access_instructions} />}
          </SummaryCard>

          {form.notes && (
            <SummaryCard title="Notes">
              <p className="text-sm" style={{ color: '#F0FDF4' }}>{form.notes}</p>
            </SummaryCard>
          )}

          <SummaryCard title="Contact">
            <Row label="Name" value={`${form.first_name} ${form.last_name}`} />
            <Row label="Phone" value={form.phone} />
            <Row label="Email" value={form.email} />
            {form.referral_source && <Row label="Referral" value={form.referral_source} />}
          </SummaryCard>

          <div className="space-y-3 pt-4 pb-10">
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="w-full h-14 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: '#FEDB00', color: '#0C463D' }}
            >
              {submitMutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              Submit & Book
            </button>
            <button
              onClick={goBack}
              className="w-full h-14 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'transparent', color: '#F0FDF4', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <ArrowLeft className="w-4 h-4" /> Go Back & Edit
            </button>
          </div>
        </StepContainer>
      )}

      <p className="text-center text-xs pt-6 pb-4" style={{ color: 'rgba(255,255,255,0.2)' }}>Brightly Cleaning 🌿</p>
    </Shell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#0A0F0E' }}>
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(10,15,14,0.9)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-[480px] mx-auto px-5 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'Nunito, sans-serif', color: '#F0FDF4' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </h1>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(254,219,0,0.12)', color: '#FEDB00' }}>
            New Enquiry
          </span>
        </div>
      </header>
      <main className="max-w-[480px] mx-auto px-5 py-6 pb-20">
        {children}
      </main>
    </div>
  );
}

function StepContainer({ heading, sub, children }: { heading: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold leading-tight" style={{ color: '#F0FDF4' }}>{heading}</h2>
        <p className="text-sm mt-1.5" style={{ color: 'rgba(240,253,244,0.5)' }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

function Pill({ children, selected, onClick, small }: { children: React.ReactNode; selected: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-2xl transition-all duration-150 active:scale-[0.97] ${small ? 'py-2.5 px-2' : 'py-4 px-3'}`}
      style={{
        background: selected ? '#FEDB00' : 'rgba(255,255,255,0.04)',
        color: selected ? '#0C463D' : '#F0FDF4',
        border: selected ? '2px solid #FEDB00' : '2px solid rgba(255,255,255,0.1)',
      }}
    >
      {children}
    </button>
  );
}

function NavButtons({ onBack, onNext, canNext, showBack, label }: {
  onBack: () => void; onNext: () => void; canNext: boolean; showBack?: boolean; label?: string;
}) {
  return (
    <div className="flex gap-3 pt-4">
      {showBack && (
        <button onClick={onBack}
          className="h-14 px-5 rounded-2xl font-bold text-sm flex items-center gap-2 transition-all"
          style={{ background: 'transparent', color: '#F0FDF4', border: '1px solid rgba(255,255,255,0.15)' }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}
      <button onClick={onNext} disabled={!canNext}
        className="flex-1 h-14 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: '#FEDB00', color: '#0C463D' }}>
        {label || 'Next'} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function DarkInput({ label, value, onChange, placeholder, type }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold mb-2" style={{ color: '#86EFAC' }}>{label}</p>
      <Input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-14 rounded-2xl text-base px-5"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0FDF4' }}
      />
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 space-y-2 mt-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: '#FEDB00' }}>{title}</h3>
      <div className="space-y-1.5 text-sm" style={{ color: '#F0FDF4' }}>{children}</div>
    </div>
  );
}

function SummaryPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: 'rgba(254,219,0,0.12)', color: '#FEDB00' }}>
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs" style={{ color: '#86EFAC' }}>{label}</span>
      <span className="font-semibold text-right text-sm">{value}</span>
    </div>
  );
}
