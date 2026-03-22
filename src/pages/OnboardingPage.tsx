import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface PropertyForm {
  property_name: string;
  address: string;
  suburb: string;
  state: string;
  bedrooms: number;
  bathrooms: number;
  living_areas: number;
  kitchens: number;
  balconies: number;
  access_method: string;
  access_notes: string;
  host_preferences: string;
  preferred_day: string;
  preferred_time: string;
  linen_provider: string;
  consumables_provider: string;
  pet: boolean;
  alarm: boolean;
  alarm_notes: string;
}

const emptyProperty: PropertyForm = {
  property_name: '', address: '', suburb: '', state: 'QLD',
  bedrooms: 1, bathrooms: 1, living_areas: 1, kitchens: 1, balconies: 0,
  access_method: '', access_notes: '', host_preferences: '',
  preferred_day: 'Flexible', preferred_time: 'Flexible',
  linen_provider: 'Host', consumables_provider: 'Host',
  pet: false, alarm: false, alarm_notes: '',
};

export default function OnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Client details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactMethod, setContactMethod] = useState('both');

  // Properties
  const [properties, setProperties] = useState<PropertyForm[]>([{ ...emptyProperty }]);

  // Preferences
  const [referralSource, setReferralSource] = useState('');
  const [otherNotes, setOtherNotes] = useState('');

  const [submitted, setSubmitted] = useState(false);

  // Validate onboard token
  const { data: tokenData, isLoading } = useQuery({
    queryKey: ['onboard-token', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('*')
        .eq('onboard_token', token!)
        .eq('onboard_used', false)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!token,
  });

  const updateProperty = (index: number, field: keyof PropertyForm, value: any) => {
    setProperties(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const addProperty = () => setProperties(prev => [...prev, { ...emptyProperty }]);
  const removeProperty = (index: number) => setProperties(prev => prev.filter((_, i) => i !== index));

  const submitMutation = useMutation({
    mutationFn: async () => {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: crypto.randomUUID().slice(0, 12) + 'Aa1!',
        options: { data: { full_name: `${firstName} ${lastName}` } },
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('Failed to create account');

      // 2. Update profile with phone
      await supabase.from('profiles').update({ phone, full_name: `${firstName} ${lastName}` }).eq('id', userId);

      // 3. Assign client role
      await supabase.from('user_roles').insert({ user_id: userId, role: 'client' as any });

      // 4. Create properties and link them
      for (const prop of properties) {
        const { data: propData, error: propErr } = await supabase.from('properties').insert({
          property_name: prop.property_name,
          address: prop.address,
          suburb: prop.suburb,
          state: prop.state,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          access_method: prop.access_method,
          access_notes: prop.access_notes,
          host_preferences: prop.host_preferences,
        }).select('id').single();
        if (propErr) throw propErr;

        await supabase.from('client_properties' as any).insert({
          client_id: userId,
          property_id: propData.id,
          portal_active: true,
          guest_ready_sms: true,
        } as any);
      }

      // 5. Mark onboard token as used
      if (tokenData?.id) {
        await supabase.from('client_properties' as any).update({ onboard_used: true } as any).eq('id', tokenData.id);
      }

      // 6. Notify admins
      const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map((a: any) => ({
            user_id: a.user_id,
            message: `New client onboarded: ${firstName} ${lastName} — ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} added`,
            type: 'client_onboard',
          }))
        );
      }
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFDFC]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!tokenData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFDFC] px-4">
        <p className="text-4xl mb-3">🔗</p>
        <p className="font-bold text-lg">Invalid or expired onboarding link</p>
        <p className="text-sm text-muted-foreground">Contact Brightly for a new link.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFDFC] px-4 text-center">
        <CheckCircle2 className="w-16 h-16 text-primary mb-4" />
        <h2 className="text-2xl font-extrabold text-primary mb-2">Welcome to Brightly!</h2>
        <p className="text-muted-foreground max-w-sm mb-4">Your portal is ready. You'll receive a welcome email shortly with your magic link.</p>
        <p className="text-sm text-muted-foreground">Powered by Brightly</p>
      </div>
    );
  }

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
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-extrabold text-primary">Your Details</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" className="rounded-xl" /></div>
              <div><Label>Last Name *</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" className="rounded-xl" /></div>
            </div>
            <div><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="rounded-xl" /></div>
            <div><Label>Mobile *</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0400 000 000" className="rounded-xl" /></div>
            <div>
              <Label>Preferred contact</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {['sms', 'email', 'both'].map(m => (
                  <button key={m} onClick={() => setContactMethod(m)} className={`p-3 rounded-xl border text-sm font-semibold capitalize ${contactMethod === m ? 'border-primary bg-primary/5' : 'border-border'}`}>{m}</button>
                ))}
              </div>
            </div>
            <Button onClick={() => setStep(2)} disabled={!firstName || !lastName || !email || !phone} className="w-full">Next</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-extrabold text-primary">Your Properties</h2>
            {properties.map((prop, idx) => (
              <div key={idx} className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-primary">Property {idx + 1}</h3>
                  {properties.length > 1 && <Button variant="ghost" size="sm" onClick={() => removeProperty(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </div>
                <div><Label>Property Name *</Label><Input value={prop.property_name} onChange={e => updateProperty(idx, 'property_name', e.target.value)} placeholder="Palm Beach Apartment" className="rounded-xl" /></div>
                <div><Label>Street Address</Label><Input value={prop.address} onChange={e => updateProperty(idx, 'address', e.target.value)} className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Suburb</Label><Input value={prop.suburb} onChange={e => updateProperty(idx, 'suburb', e.target.value)} className="rounded-xl" /></div>
                  <div>
                    <Label>State</Label>
                    <Select value={prop.state} onValueChange={v => updateProperty(idx, 'state', v)}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div><Label>Beds</Label><Input type="number" min={0} value={prop.bedrooms} onChange={e => updateProperty(idx, 'bedrooms', +e.target.value)} className="rounded-xl" /></div>
                  <div><Label>Baths</Label><Input type="number" min={0} value={prop.bathrooms} onChange={e => updateProperty(idx, 'bathrooms', +e.target.value)} className="rounded-xl" /></div>
                  <div><Label>Living</Label><Input type="number" min={0} value={prop.living_areas} onChange={e => updateProperty(idx, 'living_areas', +e.target.value)} className="rounded-xl" /></div>
                  <div><Label>Kitchen</Label><Input type="number" min={0} value={prop.kitchens} onChange={e => updateProperty(idx, 'kitchens', +e.target.value)} className="rounded-xl" /></div>
                </div>
                <div>
                  <Label>Property Access</Label>
                  <Select value={prop.access_method} onValueChange={v => updateProperty(idx, 'access_method', v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {['Key in lockbox', 'Key with neighbour', 'Smart lock', 'Agent access', 'Other'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Access Notes</Label><Textarea value={prop.access_notes} onChange={e => updateProperty(idx, 'access_notes', e.target.value)} placeholder="Lockbox code, parking..." className="rounded-xl" /></div>
                <div><Label>Special Instructions</Label><Textarea value={prop.host_preferences} onChange={e => updateProperty(idx, 'host_preferences', e.target.value)} placeholder="Instructions for cleaners..." className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Preferred Day</Label>
                    <Select value={prop.preferred_day} onValueChange={v => updateProperty(idx, 'preferred_day', v)}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Flexible'].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Preferred Time</Label>
                    <Select value={prop.preferred_time} onValueChange={v => updateProperty(idx, 'preferred_time', v)}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Morning', 'Afternoon', 'Flexible'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addProperty} className="w-full gap-2"><Plus className="w-4 h-4" /> Add Another Property</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button onClick={() => setStep(3)} disabled={!properties.every(p => p.property_name)} className="flex-1">Next</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-extrabold text-primary">Preferences</h2>
            <div>
              <Label>How did you hear about Brightly?</Label>
              <Select value={referralSource} onValueChange={setReferralSource}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {['Referral', 'Google', 'Instagram', 'Airbnb', 'Other'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Anything else we should know?</Label>
              <Textarea value={otherNotes} onChange={e => setOtherNotes(e.target.value)} placeholder="Any other preferences..." className="rounded-xl" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="flex-1 bg-primary text-primary-foreground font-bold gap-2">
                {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create My Portal
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-muted-foreground text-xs pt-4">Powered by Brightly</p>
      </main>
    </div>
  );
}
