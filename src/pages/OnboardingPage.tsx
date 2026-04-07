import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

/* ────────────── Types ────────────── */
type CleanType = 'standard' | 'airbnb' | 'deep_clean' | 'end_of_lease';

interface FormData {
  // Step 1
  clean_type: CleanType | '';
  // Step 2 — property
  property_name: string;
  address: string;
  suburb: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  preferred_date: string;
  preferred_time: string;
  notes: string;
  access_method: string;
  access_instructions: string;
  // Airbnb extras
  bed_types: string[];
  total_beds: number;
  linen_provided: string;
  guest_checkout_time: string;
  guest_checkin_time: string;
  turnaround_window: string;
  // Deep clean extras
  last_cleaned: string;
  is_occupied: string;
  // End of lease extras
  lease_end_date: string;
  carpets_required: string;
  oven_required: string;
  bond_clean_required: string;
  agent_name: string;
  // Step 3 — client
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
  preferred_date: '', preferred_time: 'Either',
  notes: '', access_method: '', access_instructions: '',
  bed_types: [], total_beds: 1, linen_provided: 'No',
  guest_checkout_time: '10:00', guest_checkin_time: '14:00', turnaround_window: '4',
  last_cleaned: '', is_occupied: 'Yes',
  lease_end_date: '', carpets_required: 'No', oven_required: 'No',
  bond_clean_required: 'No', agent_name: '',
  first_name: '', last_name: '', phone: '', email: '', referral_source: '',
};

const CLEAN_TYPES: { value: CleanType; label: string; icon: string }[] = [
  { value: 'standard', label: 'Standard House Clean', icon: '🏠' },
  { value: 'airbnb', label: 'Airbnb / Short Stay Turnover', icon: '🏨' },
  { value: 'deep_clean', label: 'Deep Clean', icon: '🧹' },
  { value: 'end_of_lease', label: 'End of Lease Clean', icon: '🔑' },
];

const STATES = ['QLD', 'NSW', 'VIC', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const ACCESS_METHODS = ['Key safe', 'Leave unlocked', 'Meet at property', 'Other'];
const TIME_OPTIONS = ['Morning', 'Afternoon', 'Either'];
const BED_TYPE_OPTIONS = ['King', 'Queen', 'Double', 'Single', 'Bunk'];
const LAST_CLEANED_OPTIONS = ['Less than 3 months', '3-6 months', '6-12 months', '1+ year', 'Never'];
const REFERRAL_OPTIONS = ['Google', 'Facebook', 'Instagram', 'Referral', 'Signage', 'Other'];

/* ────────────── Component ────────────── */
export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdminMode = !token;
  const presetType = searchParams.get('type') as CleanType | null;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>({ ...EMPTY });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (presetType && CLEAN_TYPES.some(ct => ct.value === presetType)) {
      setForm(f => ({ ...f, clean_type: presetType }));
      setStep(2);
    }
  }, [presetType]);

  const u = (field: keyof FormData, value: any) => setForm(f => ({ ...f, [field]: value }));

  const goNext = () => { setStep(s => s + 1); window.scrollTo(0, 0); };
  const goBack = () => { setStep(s => s - 1); window.scrollTo(0, 0); };

  /* ────── Submit — auto-create everything ────── */
  const submitMutation = useMutation({
    mutationFn: async () => {
      const fullName = `${form.first_name} ${form.last_name}`.trim();
      const cleanTypeLabel = CLEAN_TYPES.find(c => c.value === form.clean_type)?.label || form.clean_type;
      const propType = form.clean_type === 'airbnb' ? 'airbnb' : 'residential';
      const propName = form.clean_type === 'airbnb' && form.property_name
        ? form.property_name
        : `${form.first_name}'s ${form.address || 'Property'}`;

      // 1. Insert into quote_requests
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
          ...(form.clean_type === 'airbnb' ? {
            bed_types: form.bed_types,
            total_beds: form.total_beds,
            linen_provided: form.linen_provided,
            guest_checkout_time: form.guest_checkout_time,
            guest_checkin_time: form.guest_checkin_time,
            turnaround_window: form.turnaround_window,
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

      // 2. Insert into properties (ON CONFLICT DO NOTHING via upsert-like check)
      const { data: existingProp } = await supabase
        .from('properties')
        .select('id')
        .eq('address', form.address)
        .maybeSingle();

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

      // 3. Upsert into profiles — match on phone first, then email
      let profileId: string | null = null;
      if (form.phone) {
        const { data: byPhone } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', form.phone)
          .maybeSingle();
        if (byPhone) profileId = byPhone.id;
      }
      if (!profileId && form.email) {
        const { data: byEmail } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', form.email)
          .maybeSingle();
        if (byEmail) profileId = byEmail.id;
      }

      if (profileId) {
        // Update existing
        await supabase.from('profiles').update({
          full_name: fullName,
          phone: form.phone,
          email: form.email,
        }).eq('id', profileId);
      } else {
        // Create new profile
        const newId = crypto.randomUUID();
        const { error: profErr } = await supabase.from('profiles').insert({
          id: newId,
          full_name: fullName,
          phone: form.phone,
          email: form.email,
        });
        if (profErr) throw profErr;
        profileId = newId;
      }

      // 4. Upsert into user_roles
      await supabase.from('user_roles').upsert(
        { user_id: profileId, role: 'client' },
        { onConflict: 'user_id' }
      ).then(() => {});

      // 5. Insert into client_properties (link table)
      const { data: existingLink } = await supabase
        .from('client_properties')
        .select('id')
        .eq('client_id', profileId)
        .eq('property_id', propertyId)
        .maybeSingle();
      if (!existingLink) {
        await supabase.from('client_properties').insert({
          client_id: profileId,
          property_id: propertyId,
        });
      }

      // 6. Create admin notification
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map(a => ({
            user_id: a.user_id,
            title: `New enquiry — ${fullName}`,
            message: `${cleanTypeLabel} — ${form.address || 'No address'}`,
            type: 'new_enquiry',
            link: '/clients',
          }))
        );
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
              <Button
                onClick={() => navigate('/clients')}
                className="bg-[#FEDB00] text-[#0C463D] hover:bg-[#FEDB00]/90 font-bold rounded-xl"
              >
                View Clients
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/quoting')}
                className="rounded-xl font-bold"
              >
                Open Quote Calculator
              </Button>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  const totalSteps = 4;

  return (
    <Shell>
      {/* Progress indicator */}
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ background: i < step ? '#FEDB00' : 'rgba(255,255,255,0.1)' }}
          />
        ))}
      </div>
      <p className="text-xs font-semibold mb-6" style={{ color: '#86EFAC' }}>
        Step {step} of {totalSteps}
      </p>

      {/* Step 1 — Clean Type */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-extrabold" style={{ color: '#F0FDF4' }}>What type of clean?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CLEAN_TYPES.map(ct => (
              <button
                key={ct.value}
                onClick={() => { u('clean_type', ct.value); goNext(); }}
                className="text-left rounded-2xl p-5 border-2 transition-all active:scale-[0.98]"
                style={{
                  background: form.clean_type === ct.value ? 'rgba(254,219,0,0.12)' : 'rgba(255,255,255,0.04)',
                  borderColor: form.clean_type === ct.value ? '#FEDB00' : 'rgba(255,255,255,0.1)',
                }}
              >
                <span className="text-2xl">{ct.icon}</span>
                <p className="font-bold mt-2" style={{ color: '#F0FDF4' }}>{ct.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Property Details */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-xl font-extrabold" style={{ color: '#F0FDF4' }}>Property Details</h2>

          {/* Airbnb nickname */}
          {form.clean_type === 'airbnb' && (
            <Field label="Property Name / Nickname *">
              <Input value={form.property_name} onChange={e => u('property_name', e.target.value)} placeholder="Beach House" className="input-dark" />
            </Field>
          )}

          <Field label="Address *">
            <Input value={form.address} onChange={e => u('address', e.target.value)} placeholder="123 Example Street" className="input-dark" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Suburb">
              <Input value={form.suburb} onChange={e => u('suburb', e.target.value)} className="input-dark" />
            </Field>
            <Field label="State">
              <Select value={form.state} onValueChange={v => u('state', v)}>
                <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bedrooms">
              <Select value={String(form.bedrooms)} onValueChange={v => u('bedrooms', +v)}>
                <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}{n===5?'+':''}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Bathrooms">
              <Select value={String(form.bathrooms)} onValueChange={v => u('bathrooms', +v)}>
                <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}{n===4?'+':''}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          {/* Standard / Deep / EOL — date & time */}
          {form.clean_type !== 'airbnb' && (
            <>
              <Field label="Preferred Date">
                <Input type="date" value={form.preferred_date} onChange={e => u('preferred_date', e.target.value)} min={new Date().toISOString().split('T')[0]} className="input-dark" />
              </Field>
              <Field label="Preferred Time">
                <div className="flex gap-2">
                  {TIME_OPTIONS.map(t => (
                    <button key={t} onClick={() => u('preferred_time', t)}
                      className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background: form.preferred_time === t ? 'rgba(254,219,0,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${form.preferred_time === t ? '#FEDB00' : 'rgba(255,255,255,0.1)'}`,
                        color: form.preferred_time === t ? '#FEDB00' : '#86EFAC',
                      }}
                    >{t}</button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* Airbnb extras */}
          {form.clean_type === 'airbnb' && (
            <>
              <Field label="Bed Types">
                <div className="flex flex-wrap gap-2">
                  {BED_TYPE_OPTIONS.map(bt => (
                    <button key={bt} onClick={() => {
                      const next = form.bed_types.includes(bt) ? form.bed_types.filter(b => b !== bt) : [...form.bed_types, bt];
                      u('bed_types', next);
                    }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: form.bed_types.includes(bt) ? 'rgba(254,219,0,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${form.bed_types.includes(bt) ? '#FEDB00' : 'rgba(255,255,255,0.1)'}`,
                        color: form.bed_types.includes(bt) ? '#FEDB00' : '#86EFAC',
                      }}
                    >{bt}</button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total Beds">
                  <Input type="number" min={1} value={form.total_beds} onChange={e => u('total_beds', +e.target.value)} className="input-dark" />
                </Field>
                <Field label="Linen Provided by Brightly?">
                  <Select value={form.linen_provided} onValueChange={v => u('linen_provided', v)}>
                    <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Guest Check-out">
                  <Input type="time" value={form.guest_checkout_time} onChange={e => u('guest_checkout_time', e.target.value)} className="input-dark" />
                </Field>
                <Field label="Guest Check-in">
                  <Input type="time" value={form.guest_checkin_time} onChange={e => u('guest_checkin_time', e.target.value)} className="input-dark" />
                </Field>
                <Field label="Turnaround (hrs)">
                  <Input type="number" min={1} value={form.turnaround_window} onChange={e => u('turnaround_window', e.target.value)} className="input-dark" />
                </Field>
              </div>
            </>
          )}

          {/* Deep clean extras */}
          {form.clean_type === 'deep_clean' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Last Professionally Cleaned">
                <Select value={form.last_cleaned} onValueChange={v => u('last_cleaned', v)}>
                  <SelectTrigger className="input-dark"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{LAST_CLEANED_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Currently Occupied?">
                <Select value={form.is_occupied} onValueChange={v => u('is_occupied', v)}>
                  <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {/* End of lease extras */}
          {form.clean_type === 'end_of_lease' && (
            <>
              <Field label="Lease End Date">
                <Input type="date" value={form.lease_end_date} onChange={e => u('lease_end_date', e.target.value)} className="input-dark" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Carpets Required?">
                  <Select value={form.carpets_required} onValueChange={v => u('carpets_required', v)}>
                    <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Oven Required?">
                  <Select value={form.oven_required} onValueChange={v => u('oven_required', v)}>
                    <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bond Clean Required?">
                  <Select value={form.bond_clean_required} onValueChange={v => u('bond_clean_required', v)}>
                    <SelectTrigger className="input-dark"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Agent Name">
                  <Input value={form.agent_name} onChange={e => u('agent_name', e.target.value)} placeholder="Optional" className="input-dark" />
                </Field>
              </div>
            </>
          )}

          {/* Common: notes + access */}
          <Field label="Special Notes">
            <Textarea value={form.notes} onChange={e => u('notes', e.target.value)} placeholder="Anything we should know..." className="input-dark" rows={3} />
          </Field>
          <Field label="Access Method">
            <Select value={form.access_method} onValueChange={v => u('access_method', v)}>
              <SelectTrigger className="input-dark"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{ACCESS_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Access Instructions">
            <Input value={form.access_instructions} onChange={e => u('access_instructions', e.target.value)} placeholder="Lockbox code, where to find key..." className="input-dark" />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-xl font-bold gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={goNext} disabled={!form.address}
              className="flex-1 bg-[#FEDB00] text-[#0C463D] hover:bg-[#FEDB00]/90 font-bold rounded-xl gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Client Details */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-xl font-extrabold" style={{ color: '#F0FDF4' }}>Your Details</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name *">
              <Input value={form.first_name} onChange={e => u('first_name', e.target.value)} className="input-dark" />
            </Field>
            <Field label="Last Name *">
              <Input value={form.last_name} onChange={e => u('last_name', e.target.value)} className="input-dark" />
            </Field>
          </div>
          <Field label="Mobile Phone *">
            <Input value={form.phone} onChange={e => u('phone', e.target.value)} placeholder="0412 345 678" className="input-dark" />
          </Field>
          <Field label="Email Address *">
            <Input type="email" value={form.email} onChange={e => u('email', e.target.value)} placeholder="you@example.com" className="input-dark" />
          </Field>
          <Field label="How did you hear about us?">
            <Select value={form.referral_source} onValueChange={v => u('referral_source', v)}>
              <SelectTrigger className="input-dark"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{REFERRAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-xl font-bold gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={goNext} disabled={!form.first_name || !form.last_name || !form.phone || !form.email}
              className="flex-1 bg-[#FEDB00] text-[#0C463D] hover:bg-[#FEDB00]/90 font-bold rounded-xl gap-2">
              Review <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — Summary & Submit */}
      {step === 4 && (
        <div className="space-y-5">
          <h2 className="text-xl font-extrabold" style={{ color: '#F0FDF4' }}>Review & Submit</h2>

          <SummaryCard title="Clean Type">
            <p>{CLEAN_TYPES.find(c => c.value === form.clean_type)?.icon} {CLEAN_TYPES.find(c => c.value === form.clean_type)?.label}</p>
          </SummaryCard>

          <SummaryCard title="Property">
            {form.clean_type === 'airbnb' && form.property_name && <Row label="Name" value={form.property_name} />}
            <Row label="Address" value={form.address} />
            {form.suburb && <Row label="Suburb" value={`${form.suburb}, ${form.state}`} />}
            <Row label="Bedrooms" value={String(form.bedrooms)} />
            <Row label="Bathrooms" value={String(form.bathrooms)} />
            {form.preferred_date && <Row label="Preferred Date" value={form.preferred_date} />}
            {form.preferred_time && <Row label="Preferred Time" value={form.preferred_time} />}
            {form.access_method && <Row label="Access" value={form.access_method} />}
            {form.notes && <Row label="Notes" value={form.notes} />}
            {form.clean_type === 'airbnb' && (
              <>
                {form.bed_types.length > 0 && <Row label="Bed Types" value={form.bed_types.join(', ')} />}
                <Row label="Linen by Brightly" value={form.linen_provided} />
                <Row label="Checkout / Checkin" value={`${form.guest_checkout_time} / ${form.guest_checkin_time}`} />
              </>
            )}
            {form.clean_type === 'deep_clean' && form.last_cleaned && <Row label="Last Cleaned" value={form.last_cleaned} />}
            {form.clean_type === 'end_of_lease' && form.lease_end_date && <Row label="Lease End" value={form.lease_end_date} />}
          </SummaryCard>

          <SummaryCard title="Contact">
            <Row label="Name" value={`${form.first_name} ${form.last_name}`} />
            <Row label="Phone" value={form.phone} />
            <Row label="Email" value={form.email} />
            {form.referral_source && <Row label="Referral" value={form.referral_source} />}
          </SummaryCard>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-xl font-bold gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="flex-1 bg-[#FEDB00] text-[#0C463D] hover:bg-[#FEDB00]/90 font-bold rounded-xl gap-2"
            >
              {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit & Book
            </Button>
          </div>
        </div>
      )}

      <p className="text-center text-xs pt-6" style={{ color: 'rgba(255,255,255,0.25)' }}>Powered by Brightly</p>
    </Shell>
  );
}

/* ────── Layout shell ────── */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#0A0F0E' }}>
      <header className="sticky top-0 z-40 border-b" style={{ background: '#0A0F0E', borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'Nunito, sans-serif', color: '#F0FDF4' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(254,219,0,0.12)', color: '#FEDB00' }}>
            New Enquiry
          </span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 pb-20">
        {children}
      </main>
    </div>
  );
}

/* ────── Helpers ────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-bold mb-1.5 block" style={{ color: '#86EFAC' }}>{label}</Label>
      {children}
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: '#FEDB00' }}>{title}</h3>
      <div className="space-y-1 text-sm" style={{ color: '#F0FDF4' }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: '#86EFAC' }}>{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}
