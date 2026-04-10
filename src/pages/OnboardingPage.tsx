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

/* ────── Step definitions ────── */
function getSteps(cleanType: CleanType | ''): string[] {
  if (cleanType === 'airbnb') {
    return ['clean_type', 'property', 'airbnb_extras', 'access', 'contact', 'summary'];
  }
  return ['clean_type', 'property', 'extras', 'access', 'contact', 'summary'];
}

/* ────── Shared style constants ────── */
const BG = '#1C1C1E';
const CARD_BG = 'rgba(255,255,255,0.05)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const GREEN = '#2E5D4E';
const TEXT = '#F2F2F7';
const TEXT_DIM = 'rgba(242,242,247,0.5)';
const TEXT_FAINT = 'rgba(242,242,247,0.4)';
const ACCENT = '#86EFAC';

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
          <CheckCircle2 className="w-16 h-16 mb-4" style={{ color: GREEN }} />
          <h2 className="text-2xl font-extrabold mb-2" style={{ color: TEXT }}>
            {isAdminMode ? 'Client Added' : 'Thank You!'}
          </h2>
          <p className="text-sm mb-6" style={{ color: ACCENT }}>
            {isAdminMode
              ? `${form.first_name} ${form.last_name} has been added as a client with their property.`
              : "We'll be in touch within 24 hours with your quote."}
          </p>
          {isAdminMode && (
            <div className="flex gap-3">
              <button onClick={() => navigate('/clients')} className="px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.97]" style={{ background: GREEN, color: '#FFFFFF' }}>
                View Clients
              </button>
              <button onClick={() => navigate('/quoting')} className="px-6 py-3 rounded-xl font-bold text-sm transition-all" style={{ background: 'transparent', color: TEXT, border: `1px solid ${CARD_BORDER}` }}>
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
              width: i === stepIdx ? 28 : 8,
              height: 8,
              background: i <= stepIdx ? GREEN : 'rgba(255,255,255,0.10)',
            }}
          />
        ))}
      </div>
      <p className="text-center text-xs font-semibold mb-8" style={{ color: GREEN }}>
        Step {stepIdx + 1} of {steps.length}
      </p>

      {/* ═══════ STEP: Clean Type ═══════ */}
      {currentStep === 'clean_type' && (
        <StepContainer heading="What type of clean do you need?" sub="Choose the service that best fits your space.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CLEAN_TYPES.map(ct => {
              const selected = form.clean_type === ct.value;
              const Icon = ct.icon;
              return (
                <button
                  key={ct.value}
                  onClick={() => { u('clean_type', ct.value); setTimeout(goNext, 150); }}
                  className="flex flex-col items-center justify-center text-center rounded-2xl p-6 min-h-[176px] transition-all duration-300 active:scale-[0.97] backdrop-blur-sm"
                  style={{
                    background: selected ? 'rgba(46,93,78,0.20)' : CARD_BG,
                    border: selected ? `2px solid ${GREEN}` : `1px solid ${CARD_BORDER}`,
                    boxShadow: selected ? '0 0 20px rgba(46,93,78,0.15)' : 'none',
                  }}
                >
                  <div className="rounded-2xl p-4 mb-3" style={{ background: selected ? 'rgba(46,93,78,0.3)' : 'rgba(46,93,78,0.12)' }}>
                    <Icon className="w-8 h-8" style={{ color: selected ? '#86EFAC' : 'rgba(134,239,172,0.7)' }} />
                  </div>
                  <span className="text-base font-semibold leading-tight" style={{ color: TEXT }}>{ct.label}</span>
                </button>
              );
            })}
          </div>
        </StepContainer>
      )}

      {/* ═══════ STEP: Property ═══════ */}
      {currentStep === 'property' && (
        <StepContainer heading="Tell us about the property" sub="We'll use this to prepare your quote.">
          <div className="space-y-5">
            <DarkInput label="Property address *" value={form.address} onChange={v => u('address', v)} placeholder="123 Example Street, Suburb" />
            {form.clean_type === 'airbnb' && (
              <DarkInput label="Property nickname (optional)" value={form.property_name} onChange={v => u('property_name', v)} placeholder="e.g. Beach House" />
            )}
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: TEXT_FAINT }}>Bedrooms *</p>
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map(n => (
                  <Pill key={n} selected={form.bedrooms === n} onClick={() => u('bedrooms', n)} small>
                    <span className="text-base font-extrabold">{n}{n === 5 ? '+' : ''}</span>
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold mb-3" style={{ color: TEXT_FAINT }}>Bathrooms *</p>
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

      {/* ═══════ STEP: Airbnb extras ═══════ */}
      {currentStep === 'airbnb_extras' && (
        <StepContainer heading="Airbnb details" sub="Tell us about beds, linen and consumables.">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: TEXT_DIM }}>BED TYPE PER BEDROOM</p>
              <div className="space-y-3">
                {Array.from({ length: form.bedrooms }, (_, i) => i + 1).map(roomNum => (
                  <div key={roomNum}>
                    <p className="text-xs font-bold mb-2" style={{ color: TEXT_FAINT }}>Bedroom {roomNum}</p>
                    <div className="flex gap-2 flex-wrap">
                      {['King', 'Queen', 'Double', 'Single', 'Bunk'].map(bt => (
                        <Pill key={bt} selected={form.bed_config[roomNum] === bt} onClick={() => u('bed_config', { ...form.bed_config, [roomNum]: bt })} small>
                          <span className="text-xs font-bold">{bt}</span>
                        </Pill>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-3" style={{ color: TEXT_DIM }}>LINEN PROVIDED BY BRIGHTLY?</p>
              <div className="grid grid-cols-2 gap-3">
                <Pill selected={form.linen_provided === 'Yes'} onClick={() => u('linen_provided', 'Yes')}>
                  <span className="text-sm font-bold">✓ Yes please</span>
                </Pill>
                <Pill selected={form.linen_provided === 'No'} onClick={() => u('linen_provided', 'No')}>
                  <span className="text-sm font-bold">✗ No thanks</span>
                </Pill>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold mb-1" style={{ color: TEXT_DIM }}>CONSUMABLES RESTOCKING?</p>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Coffee, soaps, shampoos, toilet paper etc.</p>
              <div className="grid grid-cols-2 gap-3">
                <Pill selected={form.consumables_needed === 'Yes'} onClick={() => u('consumables_needed', 'Yes')}>
                  <span className="text-sm font-bold">✓ Yes please</span>
                </Pill>
                <Pill selected={form.consumables_needed === 'No'} onClick={() => u('consumables_needed', 'No')}>
                  <span className="text-sm font-bold">✗ No thanks</span>
                </Pill>
              </div>
            </div>
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
                <span className="text-sm font-bold">{ex}</span>
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
                <span className="text-sm font-bold">{m}</span>
              </Pill>
            ))}
          </div>
          {form.access_method === 'Key safe' && (
            <div className="mt-4">
              <DarkInput label="Key safe code" value={form.access_instructions} onChange={v => u('access_instructions', v)} placeholder="e.g. 1234" />
            </div>
          )}
          <NavButtons onBack={goBack} onNext={goNext} canNext={canNext} showBack />
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
              <p className="text-xs font-bold mb-3" style={{ color: ACCENT }}>How did you hear about us?</p>
              <div className="grid grid-cols-3 gap-2">
                {REFERRAL_OPTIONS.map(r => (
                  <Pill key={r} selected={form.referral_source === r} onClick={() => u('referral_source', r)} small>
                    <span className="text-xs font-bold">{r}</span>
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
          <SummaryCard title="Clean Type" onEdit={() => setStepIdx(0)}>
            <SummaryPill>
              {CLEAN_TYPES.find(c => c.value === form.clean_type)?.label}
            </SummaryPill>
          </SummaryCard>

          <SummaryCard title="Property" onEdit={() => setStepIdx(1)}>
            <Row label="Address" value={form.address} />
            {form.property_name && <Row label="Name" value={form.property_name} />}
            <Row label="Bedrooms" value={String(form.bedrooms)} />
            <Row label="Bathrooms" value={String(form.bathrooms)} />
            {form.clean_type === 'airbnb' && form.bed_types.length > 0 && (
              <Row label="Bed Types" value={form.bed_types.join(', ')} />
            )}
            {form.clean_type === 'airbnb' && <Row label="Linen by Brightly" value={form.linen_provided} />}
          </SummaryCard>

          {form.extras.length > 0 && (
            <SummaryCard title="Extras" onEdit={() => setStepIdx(2)}>
              <div className="flex flex-wrap gap-2">
                {form.extras.map(e => <SummaryPill key={e}>{e}</SummaryPill>)}
              </div>
            </SummaryCard>
          )}

          <SummaryCard title="Access" onEdit={() => setStepIdx(3)}>
            <Row label="Method" value={form.access_method} />
            {form.access_instructions && <Row label="Details" value={form.access_instructions} />}
          </SummaryCard>

          {form.notes && (
            <SummaryCard title="Notes">
              <p className="text-sm" style={{ color: TEXT }}>{form.notes}</p>
            </SummaryCard>
          )}

          <SummaryCard title="Contact" onEdit={() => setStepIdx(4)}>
            <Row label="Name" value={`${form.first_name} ${form.last_name}`} />
            <Row label="Phone" value={form.phone} />
            <Row label="Email" value={form.email} />
            {form.referral_source && <Row label="Referral" value={form.referral_source} />}
          </SummaryCard>

          <div className="space-y-3 pt-6 pb-10">
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="w-full h-14 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: GREEN, color: '#FFFFFF', boxShadow: '0 8px 24px rgba(46,93,78,0.3)' }}
            >
              {submitMutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              Submit Request
            </button>
            <button
              onClick={goBack}
              className="w-full h-14 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'transparent', color: TEXT, border: `1px solid rgba(255,255,255,0.15)` }}
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
    <div className="min-h-screen" style={{ background: BG }}>
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(28,28,30,0.9)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-[520px] mx-auto px-5 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'Nunito, sans-serif', color: TEXT }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </h1>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(46,93,78,0.2)', color: ACCENT }}>
            New Enquiry
          </span>
        </div>
      </header>
      <main className="max-w-[520px] mx-auto px-5 py-6 pb-20">
        {children}
      </main>
    </div>
  );
}

function StepContainer({ heading, sub, children }: { heading: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold leading-tight" style={{ color: TEXT }}>{heading}</h2>
        <p className="text-sm mt-1.5" style={{ color: TEXT_DIM }}>{sub}</p>
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
      className={`flex flex-col items-center justify-center rounded-xl transition-all duration-200 active:scale-[0.97] backdrop-blur-sm ${small ? 'py-3 px-3' : 'py-4 px-4'}`}
      style={{
        background: selected ? 'rgba(46,93,78,0.20)' : CARD_BG,
        color: selected ? '#FFFFFF' : TEXT,
        border: selected ? `2px solid ${GREEN}` : `1px solid ${CARD_BORDER}`,
        boxShadow: selected ? '0 0 12px rgba(46,93,78,0.15)' : 'none',
        minHeight: small ? '44px' : '52px',
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
    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-6">
      {showBack && (
        <button onClick={onBack}
          className="h-14 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
          style={{ background: 'transparent', color: TEXT, border: `1px solid rgba(255,255,255,0.15)` }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}
      <button onClick={onNext} disabled={!canNext}
        className="flex-1 h-14 rounded-xl font-extrabold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: GREEN, color: '#FFFFFF', boxShadow: '0 8px 20px rgba(46,93,78,0.20)' }}>
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
      <p className="text-xs font-bold mb-2" style={{ color: ACCENT }}>{label}</p>
      <Input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl text-base px-4 focus:ring-1 focus:ring-[#2E5D4E]/50 focus:border-[#2E5D4E] focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, color: TEXT }}
      />
    </div>
  );
}

function SummaryCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="rounded-xl p-4 space-y-2 mt-3" style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: ACCENT }}>{title}</h3>
        {onEdit && (
          <button onClick={onEdit} className="text-xs font-semibold transition-colors hover:underline" style={{ color: ACCENT }}>
            Edit
          </button>
        )}
      </div>
      <div className="space-y-1.5 text-sm" style={{ color: TEXT }}>{children}</div>
    </div>
  );
}

function SummaryPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(46,93,78,0.2)', color: ACCENT }}>
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs" style={{ color: ACCENT }}>{label}</span>
      <span className="font-semibold text-right text-sm">{value}</span>
    </div>
  );
}
