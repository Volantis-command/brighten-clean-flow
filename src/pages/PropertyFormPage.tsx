import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

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
  const { data: cleaners = [] } = useCleanersList();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Load existing property for edit
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

  const handleSave = async () => {
    if (!form.property_name.trim()) {
      toast.error('Property name is required.');
      return;
    }
    setSaving(true);
    const { lat, lng, ...rest } = form;
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
        navigate(`/properties/${data.id}`);
      }
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(isEdit ? `/properties/${id}` : '/properties')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">
        {isEdit ? 'Edit Property' : 'Add Property'}
      </h1>

      <div className="space-y-8">
        {/* Property Info */}
        <Section title="Property Information">
          <FormField label="Property Name *">
            <Input value={form.property_name} onChange={(e) => updateField('property_name', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. Coastal Retreat Apt 12" />
          </FormField>
          <FormField label="Address">
            <Input value={form.address} onChange={(e) => updateField('address', e.target.value)} className="h-14 rounded-2xl" placeholder="Street address" />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Suburb">
              <Input value={form.suburb} onChange={(e) => updateField('suburb', e.target.value)} className="h-14 rounded-2xl" />
            </FormField>
            <FormField label="State">
              <Input value={form.state} onChange={(e) => updateField('state', e.target.value)} className="h-14 rounded-2xl" />
            </FormField>
            <FormField label="Postcode">
              <Input value={form.postcode} onChange={(e) => updateField('postcode', e.target.value)} className="h-14 rounded-2xl" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Latitude (for geo-fencing)">
              <Input value={form.lat} onChange={(e) => updateField('lat', e.target.value)} className="h-14 rounded-2xl" placeholder="-33.8688" type="number" step="any" />
            </FormField>
            <FormField label="Longitude (for geo-fencing)">
              <Input value={form.lng} onChange={(e) => updateField('lng', e.target.value)} className="h-14 rounded-2xl" placeholder="151.2093" type="number" step="any" />
            </FormField>
          </div>
          <FormField label="Property Type">
            <Select value={form.property_type} onValueChange={(v) => updateField('property_type', v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Apartment">Apartment</SelectItem>
                <SelectItem value="House">House</SelectItem>
                <SelectItem value="Townhouse">Townhouse</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Bedrooms">
              <Select value={String(form.bedrooms)} onValueChange={(v) => updateField('bedrooms', parseInt(v))}>
                <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}{n === 5 ? '+' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Bathrooms">
              <Select value={String(form.bathrooms)} onValueChange={(v) => updateField('bathrooms', parseInt(v))}>
                <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}{n === 5 ? '+' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </Section>

        {/* Access */}
        <Section title="Access">
          <FormField label="Access Method">
            <Select value={form.access_method} onValueChange={(v) => updateField('access_method', v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Key Box">Key Box</SelectItem>
                <SelectItem value="Smart Lock">Smart Lock</SelectItem>
                <SelectItem value="Agent Key">Agent Key</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Access Code / Instructions">
            <Input value={form.access_code} onChange={(e) => updateField('access_code', e.target.value)} className="h-14 rounded-2xl" placeholder="Code or instructions" />
          </FormField>
          <FormField label="Access Notes">
            <Textarea value={form.access_notes} onChange={(e) => updateField('access_notes', e.target.value)} className="rounded-2xl min-h-[80px]" placeholder="Additional access notes" />
          </FormField>
        </Section>

        {/* Client */}
        <Section title="Client Info">
          <FormField label="Client / Operator Name">
            <Input value={form.client_name} onChange={(e) => updateField('client_name', e.target.value)} className="h-14 rounded-2xl" />
          </FormField>
          <FormField label="Billing Email">
            <Input value={form.billing_email} onChange={(e) => updateField('billing_email', e.target.value)} className="h-14 rounded-2xl" type="email" />
          </FormField>
          <FormField label="Payment Terms">
            <Input value={form.payment_terms} onChange={(e) => updateField('payment_terms', e.target.value)} className="h-14 rounded-2xl" />
          </FormField>
        </Section>

        {/* Operations */}
        <Section title="Operations">
          <FormField label="Preferred Clean Frequency">
            <Select value={form.clean_frequency} onValueChange={(v) => updateField('clean_frequency', v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="After Every Guest">After Every Guest</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Fortnightly">Fortnightly</SelectItem>
                <SelectItem value="On Request">On Request</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Typical Turnaround Window">
            <Input value={form.turnaround_window} onChange={(e) => updateField('turnaround_window', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. 2 hours" />
          </FormField>
          <FormField label="Default Cleaner">
            <Select value={form.default_cleaner_id || '__none__'} onValueChange={(v) => updateField('default_cleaner_id', v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {cleaners.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </Section>

        {/* Host Preferences */}
        <Section title="Host Preferences">
          <FormField label="Host Preferences / Special Instructions">
            <Textarea value={form.host_preferences} onChange={(e) => updateField('host_preferences', e.target.value)} className="rounded-2xl min-h-[100px]" placeholder="Any special instructions from the host" />
          </FormField>
          <FormField label="Product Restrictions">
            <Input value={form.product_restrictions} onChange={(e) => updateField('product_restrictions', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. No bleach on timber floors" />
          </FormField>
          <FormField label="Linen Fold Style">
            <Input value={form.linen_fold_style} onChange={(e) => updateField('linen_fold_style', e.target.value)} className="h-14 rounded-2xl" placeholder="e.g. Hotel fold with ribbon" />
          </FormField>
          <FormField label="Guest Amenities Notes">
            <Textarea value={form.amenities_notes} onChange={(e) => updateField('amenities_notes', e.target.value)} className="rounded-2xl min-h-[80px]" placeholder="Notes about guest amenities" />
          </FormField>
        </Section>

        {/* Status */}
        <div className="bg-card rounded-2xl shadow-md p-5 flex items-center justify-between">
          <div>
            <p className="font-bold text-foreground">Property Status</p>
            <p className="text-sm text-muted-foreground">{form.status === 'active' ? 'Active — will appear in scheduling' : 'Inactive — hidden from scheduling'}</p>
          </div>
          <Switch
            checked={form.status === 'active'}
            onCheckedChange={(checked) => updateField('status', checked ? 'active' : 'inactive')}
          />
        </div>

        {/* Save */}
        <Button variant="accent" size="lg" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving…' : isEdit ? 'Update Property' : 'Create Property'}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      {children}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}
