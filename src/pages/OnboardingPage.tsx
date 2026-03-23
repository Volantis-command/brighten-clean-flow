import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle2, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';

interface PropertyForm {
  property_name: string;
  address: string;
  suburb: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  toilets: number;
  has_laundry: boolean;
  outdoor_areas: boolean;
  outdoor_notes: string;
  pool_spa: boolean;
  access_method: string;
  access_notes: string;
  parking_instructions: string;
  alarm_code: string;
  extra_attention: string;
  areas_to_avoid: string;
  preferred_products: string;
  pet: boolean;
  pet_type: string;
  hazard_notes: string;
  own_linen: boolean;
  linen_sets: number;
  consumables_needed: boolean;
}

const emptyProperty: PropertyForm = {
  property_name: '', address: '', suburb: '', state: 'QLD',
  bedrooms: 1, bathrooms: 1, toilets: 1,
  has_laundry: false, outdoor_areas: false, outdoor_notes: '',
  pool_spa: false, access_method: '', access_notes: '',
  parking_instructions: '', alarm_code: '',
  extra_attention: '', areas_to_avoid: '', preferred_products: '',
  pet: false, pet_type: '', hazard_notes: '',
  own_linen: true, linen_sets: 1, consumables_needed: false,
};

export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState(1);
  const [property, setProperty] = useState<PropertyForm>({ ...emptyProperty });

  // Clean request fields
  const [requestDate, setRequestDate] = useState('');
  const [cleanType, setCleanType] = useState('House Clean');
  const [preferredTime, setPreferredTime] = useState('Flexible');
  const [cleanNotes, setCleanNotes] = useState('');

  const [submitted, setSubmitted] = useState(false);

  // Check if already submitted first
  const { data: alreadyUsed } = useQuery({
    queryKey: ['onboard-token-used', token],
    queryFn: async () => {
      const { data } = await supabase
        .from('client_properties')
        .select('id, portal_token')
        .eq('onboard_token', token!)
        .eq('onboard_used', true)
        .maybeSingle();
      return data as any;
    },
    enabled: !!token,
  });

  const { data: tokenData, isLoading } = useQuery({
    queryKey: ['onboard-token', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties')
        .select('*, properties(property_name, address, suburb, state, bedrooms, bathrooms)')
        .eq('onboard_token', token!)
        .eq('onboard_used', false)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!token && !alreadyUsed,
  });

  // Pre-fill property from linked data
  const prefilled = tokenData?.properties;
  if (prefilled && !property.property_name && prefilled.property_name) {
    setProperty(prev => ({
      ...prev,
      property_name: prefilled.property_name || '',
      address: prefilled.address || '',
      suburb: prefilled.suburb || '',
      state: prefilled.state || 'QLD',
      bedrooms: prefilled.bedrooms || 1,
      bathrooms: prefilled.bathrooms || 1,
    }));
  }

  const updateField = (field: keyof PropertyForm, value: any) => {
    setProperty(prev => ({ ...prev, [field]: value }));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!tokenData) throw new Error('Invalid token');
      const propertyId = tokenData.property_id;
      const clientId = tokenData.client_id;

      // Update property with all form data
      await supabase.from('properties').update({
        property_name: property.property_name,
        address: property.address,
        suburb: property.suburb,
        state: property.state,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        access_method: property.access_method,
        access_notes: property.access_notes,
        access_code: property.alarm_code,
        host_preferences: [
          property.extra_attention && `Extra attention: ${property.extra_attention}`,
          property.areas_to_avoid && `Avoid: ${property.areas_to_avoid}`,
          property.preferred_products && `Products: ${property.preferred_products}`,
          property.pet && `Pet: ${property.pet_type || 'Yes'}`,
          property.hazard_notes && `Hazards: ${property.hazard_notes}`,
          property.has_laundry && 'Has laundry',
          property.outdoor_areas && `Outdoor: ${property.outdoor_notes || 'Yes'}`,
          property.pool_spa && 'Pool/Spa on property',
          `Toilets: ${property.toilets}`,
          property.own_linen ? 'Client supplies linen' : `Linen sets needed: ${property.linen_sets}`,
          property.consumables_needed && 'Consumables needed',
          property.parking_instructions && `Parking: ${property.parking_instructions}`,
        ].filter(Boolean).join('\n'),
      }).eq('id', propertyId);

      // Create job with status 'awaiting_quote' if date provided — but only if no job exists yet
      let jobId: string | null = null;
      if (requestDate) {
        // Check for existing job from this property to prevent duplicates
        const { data: existingJob } = await supabase
          .from('jobs')
          .select('id')
          .eq('property_id', propertyId)
          .eq('source', 'client_portal')
          .maybeSingle();

        if (!existingJob) {
          const { data: jobData } = await supabase.from('jobs').insert({
            property_id: propertyId,
            scheduled_date: requestDate,
            scheduled_time: preferredTime === 'Morning (8am-12pm)' ? '08:00' : preferredTime === 'Afternoon (12pm-4pm)' ? '12:00' : null,
            status: 'awaiting_quote',
            notes: [cleanType, cleanNotes].filter(Boolean).join(' — ') || null,
            source: 'client_portal',
          } as any).select('id').single();
          jobId = jobData?.id || null;
        } else {
          jobId = existingJob.id;
        }
      }

      // Mark onboard token as used
      await supabase.from('client_properties').update({ onboard_used: true } as any).eq('id', tokenData.id);

      // Notify admins
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
        const name = profile?.full_name || 'A client';
        const notifLink = jobId ? `/jobs/${jobId}` : `/clients/${clientId}`;
        await supabase.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            title: 'Onboarding Submitted — Awaiting Quote',
            message: `${name} submitted onboarding for ${property.property_name}${requestDate ? ` — ${cleanType} on ${requestDate}. Set price to schedule.` : ''}`,
            type: 'onboarding',
            link: notifLink,
          }))
        );
      }
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFDFC]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  // Already submitted — show friendly message
  if (alreadyUsed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFDFC] px-4 text-center">
        <CheckCircle2 className="w-16 h-16 text-primary mb-4" />
        <h2 className="text-2xl font-extrabold text-primary mb-2">Already Submitted</h2>
        <p className="text-muted-foreground max-w-sm mb-4">
          You've already submitted your details. We'll be in touch shortly with your quote.
        </p>
        {alreadyUsed.portal_token && (
          <a href={`${getAppBaseUrl()}/client/${alreadyUsed.portal_token}`} className="text-primary font-bold underline">
            View your portal →
          </a>
        )}
...
        {tokenData.portal_token && (
          <a href={`${getAppBaseUrl()}/client/${tokenData.portal_token}`} className="text-primary font-bold underline">
            View your portal →
          </a>
        )}
        <p className="text-sm text-muted-foreground mt-6">Powered by Brightly</p>
      </div>
    );
  }

  const totalSteps = 2;

  return (
    <div className="min-h-screen bg-[#FDFDFC]">
      <header className="bg-white border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>Brightly<span className="text-accent">.</span></h1>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Setup</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-20">
        {/* Progress */}
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-extrabold text-primary">Property Requirements</h2>

            {/* Property Details */}
            <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 space-y-4">
              <h3 className="font-bold text-primary text-sm uppercase tracking-wide">Property Details</h3>
              <div><Label>Property Name / Address *</Label><Input value={property.property_name} onChange={e => updateField('property_name', e.target.value)} placeholder="Palm Beach Apartment" className="rounded-xl" /></div>
              <div><Label>Street Address</Label><Input value={property.address} onChange={e => updateField('address', e.target.value)} className="rounded-xl" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Suburb</Label><Input value={property.suburb} onChange={e => updateField('suburb', e.target.value)} className="rounded-xl" /></div>
                <div>
                  <Label>State</Label>
                  <Select value={property.state} onValueChange={v => updateField('state', v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Bedrooms</Label><Input type="number" min={0} value={property.bedrooms} onChange={e => updateField('bedrooms', +e.target.value)} className="rounded-xl" /></div>
                <div><Label>Bathrooms</Label><Input type="number" min={0} value={property.bathrooms} onChange={e => updateField('bathrooms', +e.target.value)} className="rounded-xl" /></div>
                <div><Label>Toilets</Label><Input type="number" min={0} value={property.toilets} onChange={e => updateField('toilets', +e.target.value)} className="rounded-xl" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <Label className="mb-0">Laundry?</Label>
                  <Switch checked={property.has_laundry} onCheckedChange={v => updateField('has_laundry', v)} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <Label className="mb-0">Outdoor?</Label>
                  <Switch checked={property.outdoor_areas} onCheckedChange={v => updateField('outdoor_areas', v)} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <Label className="mb-0">Pool/Spa?</Label>
                  <Switch checked={property.pool_spa} onCheckedChange={v => updateField('pool_spa', v)} />
                </div>
              </div>
              {property.outdoor_areas && (
                <div><Label>Outdoor area details</Label><Input value={property.outdoor_notes} onChange={e => updateField('outdoor_notes', e.target.value)} placeholder="Balcony, patio, courtyard..." className="rounded-xl" /></div>
              )}
            </div>

            {/* Access & Entry */}
            <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 space-y-4">
              <h3 className="font-bold text-primary text-sm uppercase tracking-wide">Access & Entry</h3>
              <div>
                <Label>Access Method</Label>
                <Select value={property.access_method} onValueChange={v => updateField('access_method', v)}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    {['Key in lockbox', 'Keypad/code', 'Smart lock', 'Key with neighbour', 'Agent access', 'Other'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Access Instructions</Label><Textarea value={property.access_notes} onChange={e => updateField('access_notes', e.target.value)} placeholder="Lockbox code, where to find the key..." className="rounded-xl" /></div>
              <div><Label>Parking Instructions</Label><Input value={property.parking_instructions} onChange={e => updateField('parking_instructions', e.target.value)} placeholder="Visitor bay #3, street parking..." className="rounded-xl" /></div>
              <div><Label>Alarm Code (kept confidential)</Label><Input type="password" value={property.alarm_code} onChange={e => updateField('alarm_code', e.target.value)} placeholder="••••" className="rounded-xl" /></div>
            </div>

            {/* Cleaning Preferences */}
            <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 space-y-4">
              <h3 className="font-bold text-primary text-sm uppercase tracking-wide">Cleaning Preferences</h3>
              <div><Label>Areas needing extra attention</Label><Textarea value={property.extra_attention} onChange={e => updateField('extra_attention', e.target.value)} placeholder="Kitchen bench tops, shower glass..." className="rounded-xl" /></div>
              <div><Label>Areas to avoid</Label><Textarea value={property.areas_to_avoid} onChange={e => updateField('areas_to_avoid', e.target.value)} placeholder="Owner's cupboard, garage..." className="rounded-xl" /></div>
              <div><Label>Preferred products</Label><Textarea value={property.preferred_products} onChange={e => updateField('preferred_products', e.target.value)} placeholder="Fragrance-free, specific brands..." className="rounded-xl" /></div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <Label className="mb-0">Pets on property?</Label>
                <Switch checked={property.pet} onCheckedChange={v => updateField('pet', v)} />
              </div>
              {property.pet && (
                <div><Label>Pet type & details</Label><Input value={property.pet_type} onChange={e => updateField('pet_type', e.target.value)} placeholder="Indoor cat, dog in backyard..." className="rounded-xl" /></div>
              )}
              <div><Label>Hazards or notes for cleaners</Label><Textarea value={property.hazard_notes} onChange={e => updateField('hazard_notes', e.target.value)} placeholder="Steep stairs, low doorway..." className="rounded-xl" /></div>
            </div>

            {/* Linen & Consumables */}
            <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 space-y-4">
              <h3 className="font-bold text-primary text-sm uppercase tracking-wide">Linen & Consumables</h3>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <Label className="mb-0">Do you supply your own linen?</Label>
                <Switch checked={property.own_linen} onCheckedChange={v => updateField('own_linen', v)} />
              </div>
              {!property.own_linen && (
                <div><Label>Number of linen sets needed</Label><Input type="number" min={1} value={property.linen_sets} onChange={e => updateField('linen_sets', +e.target.value)} className="rounded-xl" /></div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <Label className="mb-0">Consumables needed? (soap, toilet paper etc.)</Label>
                <Switch checked={property.consumables_needed} onCheckedChange={v => updateField('consumables_needed', v)} />
              </div>
            </div>

            <Button onClick={() => setStep(2)} disabled={!property.property_name} className="w-full font-bold">
              Next — Request Your First Clean
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-extrabold text-primary">Request Your First Clean</h2>
            <p className="text-sm text-muted-foreground">Optional — you can skip this and request a clean later from your portal.</p>

            <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 space-y-4">
              <div>
                <Label>Preferred Clean Date</Label>
                <Input
                  type="date"
                  value={requestDate}
                  onChange={e => setRequestDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label>Clean Type</Label>
                <Select value={cleanType} onValueChange={setCleanType}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['House Clean', 'Deep Clean', 'End of Lease Clean', 'Other'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Preferred Time</Label>
                <Select value={preferredTime} onValueChange={setPreferredTime}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Morning (8am-12pm)', 'Afternoon (12pm-4pm)', 'Flexible'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes for this clean</Label><Textarea value={cleanNotes} onChange={e => setCleanNotes(e.target.value)} placeholder="Guest checked out late, focus on bathrooms..." className="rounded-xl" /></div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="flex-1 bg-primary text-primary-foreground font-bold gap-2"
              >
                {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {requestDate ? 'Submit & Request Clean' : 'Save Property Details'}
              </Button>
            </div>

            {!requestDate && (
              <p className="text-center text-xs text-muted-foreground">No date selected — property details will be saved without a clean request.</p>
            )}
          </div>
        )}

        <p className="text-center text-muted-foreground text-xs pt-4">Powered by Brightly</p>
      </main>
    </div>
  );
}
