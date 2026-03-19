import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Building2, Home, Landmark, HelpCircle, Lock, KeyRound, Smartphone, UserCheck, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STEPS = ['Property Details', 'Access', 'Client Details', 'Host Preferences', 'Assign & Confirm'];

const STATES = ['QLD', 'NSW', 'VIC', 'WA', 'SA', 'Other'];

const PROPERTY_TYPES = [
  { value: 'Apartment', icon: Building2 },
  { value: 'House', icon: Home },
  { value: 'Townhouse', icon: Landmark },
  { value: 'Other', icon: HelpCircle },
];

const ACCESS_METHODS = [
  { value: 'Key Box', icon: Lock },
  { value: 'Smart Lock', icon: Smartphone },
  { value: 'Agent Key', icon: KeyRound },
  { value: 'Other', icon: HelpCircle },
];

const EMPTY_FORM = {
  property_name: '',
  address: '',
  suburb: '',
  state: '',
  postcode: '',
  property_type: '',
  bedrooms: 1,
  bathrooms: 1,
  access_method: '',
  access_code: '',
  access_notes: '',
  client_name: '',
  billing_email: '',
  payment_terms: '7 days from invoice date',
  clean_frequency: '',
  turnaround_window: '',
  host_preferences: '',
  product_restrictions: '',
  has_product_restrictions: false,
  linen_fold_style: '',
  amenities_notes: '',
  default_cleaner_id: '',
  status: 'active',
  lat: '',
  lng: '',
};

export default function PropertyFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: cleaners = [] } = useCleanersList();
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        property_name: existing.property_name || '',
        address: existing.address || '',
        suburb: existing.suburb || '',
        state: existing.state || '',
        postcode: existing.postcode || '',
        property_type: existing.property_type || '',
        bedrooms: existing.bedrooms || 1,
        bathrooms: existing.bathrooms || 1,
        access_method: existing.access_method || '',
        access_code: existing.access_code || '',
        access_notes: existing.access_notes || '',
        client_name: existing.client_name || '',
        billing_email: existing.billing_email || '',
        payment_terms: existing.payment_terms || '7 days from invoice date',
        clean_frequency: existing.clean_frequency || '',
        turnaround_window: existing.turnaround_window || '',
        host_preferences: existing.host_preferences || '',
        product_restrictions: existing.product_restrictions || '',
        has_product_restrictions: !!existing.product_restrictions,
        linen_fold_style: existing.linen_fold_style || '',
        amenities_notes: existing.amenities_notes || '',
        default_cleaner_id: existing.default_cleaner_id || '',
        status: existing.status || 'active',
        lat: existing.lat != null ? String(existing.lat) : '',
        lng: existing.lng != null ? String(existing.lng) : '',
      });
    }
  }, [existing]);

  const updateField = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleSave = async () => {
    if (!form.property_name.trim()) {
      toast.error('Property name is required.');
      setStep(0);
      return;
    }
    setSaving(true);
    const { lat, lng, has_product_restrictions, ...rest } = form;
    const payload = {
      ...rest,
      default_cleaner_id: form.default_cleaner_id || null,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
    };

    if (isEdit) {
      const { error } = await supabase.from('properties').update(payload).eq('id', id!);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Property updated!');
        queryClient.invalidateQueries({ queryKey: ['properties'] });
        queryClient.invalidateQueries({ queryKey: ['property', id] });
        navigate(`/properties/${id}`);
      }
    } else {
      const { data, error } = await supabase.from('properties').insert(payload).select().single();
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Property created!');
        queryClient.invalidateQueries({ queryKey: ['properties'] });

        // Notify head cleaners about new property
        const { data: headCleanerRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'head_cleaner');

        if (headCleanerRoles) {
          const notifications = headCleanerRoles.map((r) => ({
            user_id: r.user_id,
            message: `New property "${form.property_name}" has been added. A first clean is required.`,
            type: 'new_property',
          }));
          if (notifications.length > 0) {
            await supabase.from('notifications').insert(notifications);
          }
        }

        navigate(`/properties/${data.id}`);
      }
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(isEdit ? `/properties/${id}` : '/properties')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">
        {isEdit ? 'Edit Property' : 'New Property Onboarding'}
      </h1>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={s} className={cn(i <= step ? 'text-primary' : '')}>{i + 1}</span>
          ))}
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-sm font-bold text-primary">{STEPS[step]}</p>
      </div>

      {/* Steps */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-5">
        {step === 0 && <Step1 form={form} updateField={updateField} />}
        {step === 1 && <Step2 form={form} updateField={updateField} />}
        {step === 2 && <Step3 form={form} updateField={updateField} />}
        {step === 3 && <Step4 form={form} updateField={updateField} />}
        {step === 4 && <Step5 form={form} updateField={updateField} cleaners={cleaners} />}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" size="lg" onClick={() => setStep(step - 1)} className="flex-1 gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button variant="default" size="lg" onClick={() => setStep(step + 1)} className="flex-1 gap-2">
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white font-extrabold"
          >
            <Check className="h-5 w-5" />
            {saving ? 'Saving…' : isEdit ? 'Update Property' : 'Add Property'}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ───── Shared helpers ───── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function IconSelector({ options, value, onChange }: { options: { value: string; icon: any }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {options.map(({ value: v, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all font-bold text-sm',
            value === v
              ? 'border-primary bg-secondary text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40'
          )}
        >
          <Icon className="h-7 w-7" />
          {v}
        </button>
      ))}
    </div>
  );
}

function NumberSelector({ value, onChange, max = 5 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            'h-14 w-14 rounded-2xl border-2 font-extrabold text-lg transition-all',
            value === n
              ? 'border-primary bg-secondary text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40'
          )}
        >
          {n}{n === max ? '+' : ''}
        </button>
      ))}
    </div>
  );
}

/* ───── Steps ───── */

function Step1({ form, updateField }: { form: any; updateField: (f: string, v: any) => void }) {
  return (
    <>
      <Field label="Property Name / Nickname *">
        <Input value={form.property_name} onChange={(e) => updateField('property_name', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. Coastal Retreat Apt 12" />
      </Field>
      <Field label="Full Address">
        <Input value={form.address} onChange={(e) => updateField('address', e.target.value)} className="h-14 rounded-2xl" placeholder="Street address" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Suburb">
          <Input value={form.suburb} onChange={(e) => updateField('suburb', e.target.value)} className="h-14 rounded-2xl" />
        </Field>
        <Field label="State">
          <Select value={form.state} onValueChange={(v) => updateField('state', v)}>
            <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Postcode">
          <Input value={form.postcode} onChange={(e) => updateField('postcode', e.target.value)} className="h-14 rounded-2xl" />
        </Field>
      </div>
      <Field label="Property Type">
        <IconSelector options={PROPERTY_TYPES} value={form.property_type} onChange={(v) => updateField('property_type', v)} />
      </Field>
      <Field label="Bedrooms">
        <NumberSelector value={form.bedrooms} onChange={(n) => updateField('bedrooms', n)} />
      </Field>
      <Field label="Bathrooms">
        <NumberSelector value={form.bathrooms} onChange={(n) => updateField('bathrooms', n)} />
      </Field>
    </>
  );
}

function Step2({ form, updateField }: { form: any; updateField: (f: string, v: any) => void }) {
  return (
    <>
      <Field label="Access Method">
        <IconSelector options={ACCESS_METHODS} value={form.access_method} onChange={(v) => updateField('access_method', v)} />
      </Field>
      <Field label="Access Code or Instructions 🔒">
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={form.access_code} onChange={(e) => updateField('access_code', e.target.value)} className="h-14 rounded-2xl pl-10" placeholder="Code or instructions (admin only)" />
        </div>
      </Field>
      <Field label="Additional Access Notes">
        <Textarea value={form.access_notes} onChange={(e) => updateField('access_notes', e.target.value)} className="rounded-2xl min-h-[100px]" placeholder="Parking, gate codes, special entry instructions…" />
      </Field>
    </>
  );
}

function Step3({ form, updateField }: { form: any; updateField: (f: string, v: any) => void }) {
  return (
    <>
      <Field label="Client / Operator Name">
        <Input value={form.client_name} onChange={(e) => updateField('client_name', e.target.value)} className="h-14 rounded-2xl" />
      </Field>
      <Field label="Billing Contact Email">
        <Input value={form.billing_email} onChange={(e) => updateField('billing_email', e.target.value)} className="h-14 rounded-2xl" type="email" />
      </Field>
      <Field label="Payment Terms">
        <Input value={form.payment_terms} onChange={(e) => updateField('payment_terms', e.target.value)} className="h-14 rounded-2xl" />
      </Field>
      <Field label="Preferred Clean Frequency">
        <Select value={form.clean_frequency} onValueChange={(v) => updateField('clean_frequency', v)}>
          <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select frequency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="After Every Guest">After Every Guest</SelectItem>
            <SelectItem value="Weekly">Weekly</SelectItem>
            <SelectItem value="Fortnightly">Fortnightly</SelectItem>
            <SelectItem value="On Request">On Request</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Typical Turnaround Window">
        <Input value={form.turnaround_window} onChange={(e) => updateField('turnaround_window', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. 2 hours" />
      </Field>
    </>
  );
}

function Step4({ form, updateField }: { form: any; updateField: (f: string, v: any) => void }) {
  return (
    <>
      <Field label="Any product restrictions?">
        <div className="flex gap-3">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => {
                updateField('has_product_restrictions', v);
                if (!v) updateField('product_restrictions', '');
              }}
              className={cn(
                'flex-1 h-14 rounded-2xl border-2 font-bold transition-all',
                form.has_product_restrictions === v
                  ? 'border-primary bg-secondary text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40'
              )}
            >
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
        {form.has_product_restrictions && (
          <Input
            value={form.product_restrictions}
            onChange={(e) => updateField('product_restrictions', e.target.value)}
            className="h-14 rounded-2xl mt-2"
            placeholder="e.g. No bleach on timber floors"
          />
        )}
      </Field>
      <Field label="Preferred Linen Fold Style">
        <Input value={form.linen_fold_style} onChange={(e) => updateField('linen_fold_style', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. Hotel fold with ribbon" />
      </Field>
      <Field label="Guest Amenities to be Restocked">
        <Textarea value={form.amenities_notes} onChange={(e) => updateField('amenities_notes', e.target.value)} className="rounded-2xl min-h-[100px]" placeholder="List amenities that should be restocked each clean" />
      </Field>
      <Field label="Any Other Special Instructions">
        <Textarea value={form.host_preferences} onChange={(e) => updateField('host_preferences', e.target.value)} className="rounded-2xl min-h-[120px]" placeholder="Special instructions from the host or property manager…" />
      </Field>
    </>
  );
}

function Step5({ form, updateField, cleaners }: { form: any; updateField: (f: string, v: any) => void; cleaners: any[] }) {
  const summaryRows = [
    ['Property', form.property_name],
    ['Address', [form.address, form.suburb, form.state, form.postcode].filter(Boolean).join(', ')],
    ['Type', form.property_type],
    ['Rooms', `${form.bedrooms} bed · ${form.bathrooms} bath`],
    ['Access', form.access_method],
    ['Client', form.client_name],
    ['Billing Email', form.billing_email],
    ['Payment Terms', form.payment_terms],
    ['Clean Frequency', form.clean_frequency],
    ['Turnaround', form.turnaround_window],
    ['Product Restrictions', form.product_restrictions || 'None'],
    ['Linen Fold', form.linen_fold_style || '—'],
  ].filter(([, v]) => v);

  const selectedCleaner = cleaners.find((c: any) => c.id === form.default_cleaner_id);

  return (
    <>
      <Field label="Default Cleaner">
        <Select value={form.default_cleaner_id || '__none__'} onValueChange={(v) => updateField('default_cleaner_id', v === '__none__' ? '' : v)}>
          <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {cleaners.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-1 pt-2">
        <h3 className="text-base font-bold text-primary">Review Summary</h3>
        <div className="bg-secondary/50 rounded-2xl p-4 space-y-2">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground font-semibold">{label}</span>
              <span className="font-bold text-foreground text-right max-w-[60%] truncate">{value}</span>
            </div>
          ))}
          {selectedCleaner && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-semibold">Default Cleaner</span>
              <span className="font-bold text-foreground">{selectedCleaner.full_name || selectedCleaner.email}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
