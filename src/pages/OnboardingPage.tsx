import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight, Home, SprayCan, KeyRound, BedDouble } from 'lucide-react';
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
  bed_config: Record<number, string>;
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

const CLEAN_TYPES: { value: CleanType; label: string; icon: typeof Home }[] = [
  { value: 'standard', label: 'Standard Clean', icon: Home },
  { value: 'deep_clean', label: 'Deep Clean', icon: SprayCan },
  { value: 'end_of_lease', label: 'End of Lease', icon: KeyRound },
  { value: 'airbnb', label: 'Airbnb / Short Stay', icon: BedDouble },
];

const ACCESS_METHODS = ['Key safe', 'Leave unlocked', 'Meet at property', 'Other'];
const REFERRAL_OPTIONS = ['Google', 'Facebook', 'Instagram', 'Referral', 'Signage', 'Other'];

const EXTRAS_BY_TYPE: Record<string, string[]> = {
  standard: ['Oven', 'Fridge', 'Windows', 'Balcony', 'Garage'],
  deep_clean: ['Oven', 'Fridge', 'Windows', 'Balcony', 'Garage', 'Walls', 'Blinds'],
  end_of_lease: ['Oven', 'Fridge', 'Windows', 'Balcony', 'Garage', 'Carpet Steam'],
  airbnb: ['Oven', 'Fridge', 'Windows', 'Balcony'],
};

function getSteps(cleanType: CleanType | ''): string[] {
  if (cleanType === 'airbnb') {
    return ['clean_type', 'property', 'airbnb_extras', 'access', 'contact', 'summary'];
  }
  return ['clean_type', 'property', 'extras', 'access', 'contact', 'summary'];
}

const GREEN = '#2E5D4E';
const GREEN_HOVER = '#26503F';

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

  /* ────── Submit (UNCHANGED LOGIC) ────── */
  const submitMutation = useMutation({
    mutationFn: async () => {
      const fullName = `${form.first_name} ${form.last_name}`.trim();
      const cleanTypeLabel = CLEAN_TYPES.find(c => c.value === form.clean_type)?.label || form.clean_type;
      const propType = form.clean_type === 'airbnb' ? 'airbnb' : 'residential';
      const propName = form.clean_type === 'airbnb' && form.property_name
        ? form.property_name
        : `${form.first_name}'s ${form.address || 'Property'}`;

      const { error: qrErr } = await supabase.from('quote_requests').insert({
        first_name: form.first_name, last_name: form.last_name, phone: form.phone, email: form.email,
        address: form.address, clean_type: cleanTypeLabel, bedrooms: form.bedrooms, bathrooms: form.bathrooms,
        preferred_date: form.preferred_date || null, preferred_time: form.preferred_time || null,
        extra_notes: form.notes || null, referral_source: form.referral_source || null,
        property_type: propType, status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        form_data: {
          clean_type: form.clean_type, suburb: form.suburb, state: form.state,
          access_method: form.access_method, access_instructions: form.access_instructions, extras: form.extras,
          ...(form.clean_type === 'airbnb' ? { bed_config: form.bed_config, bed_types: Object.values(form.bed_config), linen_provided: form.linen_provided, consumables_needed: form.consumables_needed } : {}),
          ...(form.clean_type === 'deep_clean' ? { last_cleaned: form.last_cleaned, is_occupied: form.is_occupied } : {}),
          ...(form.clean_type === 'end_of_lease' ? { lease_end_date: form.lease_end_date, carpets_required: form.carpets_required, oven_required: form.oven_required, bond_clean_required: form.bond_clean_required, agent_name: form.agent_name } : {}),
        } as any,
      });
      if (qrErr) throw qrErr;

      const { data: existingProp } = await supabase.from('properties').select('id').eq('address', form.address).maybeSingle();
      let propertyId: string;
      if (existingProp) {
        propertyId = existingProp.id;
      } else {
        const { data: newProp, error: propErr } = await supabase.from('properties').insert({
          property_name: propName, address: form.address, suburb: form.suburb, state: form.state,
          client_name: fullName, client_phone: form.phone, billing_email: form.email,
          bedrooms: form.bedrooms, bathrooms: form.bathrooms, property_type: propType, status: 'active',
          access_method: form.access_method, access_notes: form.access_instructions,
          ...(form.clean_type === 'airbnb' ? { checkout_time: form.guest_checkout_time, checkin_time: form.guest_checkin_time, turnaround_window: form.turnaround_window, linen_supply: form.linen_provided === 'Yes' ? 'brightly' : 'client' } : {}),
        }).select('id').single();
        if (propErr) throw propErr;
        propertyId = newProp.id;
      }

      let profileId: string | null = null;
      if (form.phone) { const { data: byPhone } = await supabase.from('profiles').select('id').eq('phone', form.phone).maybeSingle(); if (byPhone) profileId = byPhone.id; }
      if (!profileId && form.email) { const { data: byEmail } = await supabase.from('profiles').select('id').eq('email', form.email).maybeSingle(); if (byEmail) profileId = byEmail.id; }
      if (profileId) {
        await supabase.from('profiles').update({ full_name: fullName, phone: form.phone, email: form.email }).eq('id', profileId);
      } else {
        const newId = crypto.randomUUID();
        const { error: profErr } = await supabase.from('profiles').insert({ id: newId, full_name: fullName, phone: form.phone, email: form.email });
        if (profErr) throw profErr;
        profileId = newId;
      }
      await supabase.from('user_roles').upsert({ user_id: profileId, role: 'client' }, { onConflict: 'user_id' }).then(() => {});
      const { data: existingLink } = await supabase.from('client_properties').select('id').eq('client_id', profileId).eq('property_id', propertyId).maybeSingle();
      if (!existingLink) { await supabase.from('client_properties').insert({ client_id: profileId, property_id: propertyId }); }
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        await (await import('@/lib/alerts')).createAlert({ event_type: 'new_lead', title: `New enquiry — ${fullName}`, body: `${cleanTypeLabel} — ${form.address || 'No address'}`, link: '/clients' });
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
          <CheckCircle2 className="w-16 h-16 mb-4 text-[#2E5D4E]" />
          <h2 className="text-2xl font-bold text-white mb-2">
            {isAdminMode ? 'Client Added' : 'Thank You!'}
          </h2>
          <p className="text-base text-white/50 mb-6">
            {isAdminMode
              ? `${form.first_name} ${form.last_name} has been added as a client with their property.`
              : "We'll be in touch within 24 hours with your quote."}
          </p>
          {isAdminMode && (
            <div className="flex gap-3">
              <button onClick={() => navigate('/clients')} className="h-14 px-8 rounded-xl bg-[#2E5D4E] hover:bg-[#26503F] text-base font-semibold text-white transition-all">View Clients</button>
              <button onClick={() => navigate('/quoting')} className="h-14 px-8 rounded-xl bg-transparent border border-white/20 text-base font-medium text-white/70 hover:bg-white/5 transition-all">Open Quote Calculator</button>
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
            className={`rounded-full transition-all duration-300 ${i === stepIdx ? 'w-8 h-2 bg-[#2E5D4E]' : i < stepIdx ? 'w-2 h-2 bg-[#2E5D4E]' : 'w-2 h-2 bg-white/20'}`}
          />
        ))}
      </div>
      <p className="text-center text-sm text-white/50 mb-8">
        Step {stepIdx + 1} of {steps.length}
      </p>

      {/* ═══════ STEP: Clean Type ═══════ */}
      {currentStep === 'clean_type' && (
        <StepBlock heading="What type of clean do you need?" sub="Choose the service that best fits your space.">
          <div className="grid grid-cols-2 gap-4 mb-8">
            {CLEAN_TYPES.map(ct => {
              const selected = form.clean_type === ct.value;
              const Icon = ct.icon;
              return (
                <button
                  key={ct.value}
                  onClick={() => { u('clean_type', ct.value); setTimeout(goNext, 150); }}
                  className={`flex flex-col items-center justify-center rounded-2xl p-8 min-h-[160px] cursor-pointer transition-all duration-200 ${
                    selected
                      ? 'border-2 border-[#2E5D4E] bg-[#2E5D4E]/15 shadow-lg shadow-[#2E5D4E]/10'
                      : 'border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <Icon className={`w-10 h-10 mb-3 ${selected ? 'text-[#2E5D4E]' : 'text-white/70'}`} />
                  <span className="text-base font-semibold text-white text-center leading-tight">{ct.label}</span>
                </button>
              );
            })}
          </div>
        </StepBlock>
      )}

      {/* ═══════ STEP: Property ═══════ */}
      {currentStep === 'property' && (
        <StepBlock heading="Tell us about the property" sub="We'll use this to prepare your quote.">
          <div className="space-y-6">
            <DarkInput label="Property address *" value={form.address} onChange={v => u('address', v)} placeholder="123 Example Street, Suburb" />
            {form.clean_type === 'airbnb' && (
              <DarkInput label="Property nickname (optional)" value={form.property_name} onChange={v => u('property_name', v)} placeholder="e.g. Beach House" />
            )}
            <div>
              <p className="text-sm font-medium text-[#2E5D4E] mb-2 block">Bedrooms *</p>
              <div className="flex gap-3 flex-wrap">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => u('bedrooms', n)}
                    className={`h-14 min-w-[56px] px-5 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center ${
                      form.bedrooms === n
                        ? 'bg-[#2E5D4E] border border-[#2E5D4E] text-white'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                    }`}>
                    {n}{n === 5 ? '+' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[#2E5D4E] mb-2 block">Bathrooms *</p>
              <div className="flex gap-3 flex-wrap">
                {[1, 2, 3, 4].map(n => (
                  <button key={n} onClick={() => u('bathrooms', n)}
                    className={`h-14 min-w-[56px] px-5 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center ${
                      form.bathrooms === n
                        ? 'bg-[#2E5D4E] border border-[#2E5D4E] text-white'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                    }`}>
                    {n}{n === 4 ? '+' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack={stepIdx > 0} />
        </StepBlock>
      )}

      {/* ═══════ STEP: Airbnb extras ═══════ */}
      {currentStep === 'airbnb_extras' && (
        <StepBlock heading="Airbnb details" sub="Tell us about beds, linen and consumables.">
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-4">BED TYPE PER BEDROOM</p>
              <div className="space-y-4">
                {Array.from({ length: form.bedrooms }, (_, i) => i + 1).map(roomNum => (
                  <div key={roomNum}>
                    <p className="text-sm font-medium text-white/60 mb-2">Bedroom {roomNum}</p>
                    <div className="flex gap-2 flex-wrap mb-4">
                      {['King', 'Queen', 'Double', 'Single', 'Bunk'].map(bt => (
                        <button key={bt} onClick={() => u('bed_config', { ...form.bed_config, [roomNum]: bt })}
                          className={`h-12 px-4 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 flex items-center justify-center ${
                            form.bed_config[roomNum] === bt
                              ? 'bg-[#2E5D4E] border border-[#2E5D4E] text-white'
                              : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                          }`}>
                          {bt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-3">LINEN PROVIDED BY BRIGHTLY?</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {(['Yes', 'No'] as const).map(v => (
                  <button key={v} onClick={() => u('linen_provided', v === 'Yes' ? 'Yes' : 'No')}
                    className={`flex items-center justify-center h-16 rounded-xl text-base font-medium cursor-pointer transition-all duration-200 ${
                      form.linen_provided === (v === 'Yes' ? 'Yes' : 'No')
                        ? 'bg-[#2E5D4E]/15 border-2 border-[#2E5D4E] text-white'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}>
                    {v === 'Yes' ? '✓ Yes please' : '✗ No thanks'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-1">CONSUMABLES RESTOCKING?</p>
              <p className="text-sm text-white/40 mb-3">Coffee, soaps, shampoos, toilet paper etc.</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {(['Yes', 'No'] as const).map(v => (
                  <button key={v} onClick={() => u('consumables_needed', v === 'Yes' ? 'Yes' : 'No')}
                    className={`flex items-center justify-center h-16 rounded-xl text-base font-medium cursor-pointer transition-all duration-200 ${
                      form.consumables_needed === (v === 'Yes' ? 'Yes' : 'No')
                        ? 'bg-[#2E5D4E]/15 border-2 border-[#2E5D4E] text-white'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}>
                    {v === 'Yes' ? '✓ Yes please' : '✗ No thanks'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepBlock>
      )}

      {/* ═══════ STEP: Extras ═══════ */}
      {currentStep === 'extras' && (
        <StepBlock heading="Any extras?" sub="Select anything that applies — all optional.">
          <div className="grid grid-cols-2 gap-4">
            {(EXTRAS_BY_TYPE[form.clean_type || 'standard'] || []).map(ex => (
              <button key={ex}
                onClick={() => { const next = form.extras.includes(ex) ? form.extras.filter(e => e !== ex) : [...form.extras, ex]; u('extras', next); }}
                className={`flex items-center justify-center h-16 rounded-xl text-base font-medium cursor-pointer transition-all duration-200 ${
                  form.extras.includes(ex)
                    ? 'bg-[#2E5D4E]/15 border-2 border-[#2E5D4E] text-white'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                }`}>
                {ex}
              </button>
            ))}
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext showBack label="Next" />
        </StepBlock>
      )}

      {/* ═══════ STEP: Access ═══════ */}
      {currentStep === 'access' && (
        <StepBlock heading="How do we get in?" sub="Select the access method for your property.">
          <div className="grid grid-cols-2 gap-4 mb-6">
            {ACCESS_METHODS.map(m => (
              <button key={m} onClick={() => u('access_method', m)}
                className={`flex items-center justify-center h-16 rounded-xl text-base font-medium cursor-pointer transition-all duration-200 ${
                  form.access_method === m
                    ? 'bg-[#2E5D4E]/15 border-2 border-[#2E5D4E] text-white'
                    : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
                }`}>
                {m}
              </button>
            ))}
          </div>
          {form.access_method === 'Key safe' && (
            <div className="mt-4">
              <DarkInput label="Key safe code" value={form.access_instructions} onChange={v => u('access_instructions', v)} placeholder="e.g. 1234" />
            </div>
          )}
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
        </StepBlock>
      )}

      {/* ═══════ STEP: Contact ═══════ */}
      {currentStep === 'contact' && (
        <StepBlock heading="Your details" sub="We'll use these to send your quote.">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <DarkInput label="First Name" value={form.first_name} onChange={v => u('first_name', v)} placeholder="Jane" />
              <DarkInput label="Last Name" value={form.last_name} onChange={v => u('last_name', v)} placeholder="Smith" />
            </div>
            <DarkInput label="Mobile" value={form.phone} onChange={v => u('phone', v)} placeholder="0412 345 678" />
            <DarkInput label="Email" value={form.email} onChange={v => u('email', v)} placeholder="you@example.com" type="email" />
            <div>
              <p className="text-sm font-medium text-[#2E5D4E] mb-2 block">How did you hear about us?</p>
              <div className="flex gap-3 flex-wrap">
                {REFERRAL_OPTIONS.map(r => (
                  <button key={r} onClick={() => u('referral_source', r)}
                    className={`h-12 px-4 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 flex items-center justify-center ${
                      form.referral_source === r
                        ? 'bg-[#2E5D4E] border border-[#2E5D4E] text-white'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack label="Review →" />
        </StepBlock>
      )}

      {/* ═══════ STEP: Summary ═══════ */}
      {currentStep === 'summary' && (
        <div>
          <h2 className="text-2xl font-bold text-white mb-6">Review your request</h2>

          <SummaryCard title="Clean Type" onEdit={() => setStepIdx(0)}>
            <span className="inline-block px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#2E5D4E]/20 text-[#2E5D4E]">
              {CLEAN_TYPES.find(c => c.value === form.clean_type)?.label}
            </span>
          </SummaryCard>

          <SummaryCard title="Property" onEdit={() => setStepIdx(1)}>
            <Row label="Address" value={form.address} />
            {form.property_name && <Row label="Name" value={form.property_name} />}
            <Row label="Bedrooms" value={String(form.bedrooms)} />
            <Row label="Bathrooms" value={String(form.bathrooms)} />
            {form.clean_type === 'airbnb' && Object.keys(form.bed_config).length > 0 && (
              <Row label="Bed Types" value={Object.values(form.bed_config).join(', ')} />
            )}
            {form.clean_type === 'airbnb' && form.linen_provided && <Row label="Linen by Brightly" value={form.linen_provided} />}
          </SummaryCard>

          {form.extras.length > 0 && (
            <SummaryCard title="Extras" onEdit={() => setStepIdx(2)}>
              <div className="flex flex-wrap gap-2">
                {form.extras.map(e => (
                  <span key={e} className="inline-block px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#2E5D4E]/20 text-[#2E5D4E]">{e}</span>
                ))}
              </div>
            </SummaryCard>
          )}

          <SummaryCard title="Access" onEdit={() => setStepIdx(3)}>
            <Row label="Method" value={form.access_method} />
            {form.access_instructions && <Row label="Details" value={form.access_instructions} />}
          </SummaryCard>

          <SummaryCard title="Contact" onEdit={() => setStepIdx(4)}>
            <Row label="Name" value={`${form.first_name} ${form.last_name}`} />
            <Row label="Phone" value={form.phone} />
            <Row label="Email" value={form.email} />
            {form.referral_source && <Row label="Referral" value={form.referral_source} />}
          </SummaryCard>

          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full h-14 rounded-xl bg-[#2E5D4E] hover:bg-[#26503F] text-lg font-semibold text-white transition-all duration-200 shadow-lg shadow-[#2E5D4E]/25 mt-8 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitMutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
            Submit Request
          </button>
          <button
            onClick={goBack}
            className="w-full h-14 rounded-xl bg-transparent border border-white/20 text-base font-medium text-white/70 hover:bg-white/5 hover:border-white/30 transition-all duration-200 mt-3 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back & Edit
          </button>
        </div>
      )}

      <p className="text-center text-xs text-white/20 pt-6 pb-4">Brightly Cleaning 🌿</p>
    </Shell>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════════════ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="flex items-center justify-between mb-8 max-w-2xl mx-auto px-6 pt-6">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h1>
        <span className="text-[#2E5D4E] text-sm font-medium">New Enquiry</span>
      </header>
      <main className="max-w-2xl mx-auto px-6 pb-20">
        {children}
      </main>
    </div>
  );
}

function StepBlock({ heading, sub, children }: { heading: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">{heading}</h2>
        <p className="text-base text-white/50 mb-8">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function NavButtons({ onBack, onNext, canNext, showBack, label }: {
  onBack: () => void; onNext: () => void; canNext: boolean; showBack?: boolean; label?: string;
}) {
  return (
    <div className="flex gap-4 mt-10">
      {showBack && (
        <button onClick={onBack}
          className="h-14 px-8 rounded-xl bg-transparent border border-white/20 text-base font-medium text-white/70 hover:bg-white/5 hover:border-white/30 transition-all duration-200 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}
      <button onClick={onNext} disabled={!canNext}
        className="flex-1 h-14 rounded-xl bg-[#2E5D4E] hover:bg-[#26503F] text-base font-semibold text-white transition-all duration-200 shadow-lg shadow-[#2E5D4E]/20 flex items-center justify-center gap-2 disabled:opacity-40">
        {label || 'Next'} {!label && <ArrowRight className="w-4 h-4" />}
      </button>
    </div>
  );
}

function DarkInput({ label, value, onChange, placeholder, type }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-[#2E5D4E] mb-2 block">{label}</p>
      <input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-14 rounded-xl bg-white/5 border border-white/10 px-4 text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[#2E5D4E] focus:ring-1 focus:ring-[#2E5D4E]/50 transition-colors"
      />
    </div>
  );
}

function SummaryCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">{title}</h3>
        {onEdit && (
          <button onClick={onEdit} className="text-sm font-medium text-[#2E5D4E] cursor-pointer hover:text-[#3A7560]">Edit</button>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-base text-white font-semibold text-right">{value}</span>
    </div>
  );
}
