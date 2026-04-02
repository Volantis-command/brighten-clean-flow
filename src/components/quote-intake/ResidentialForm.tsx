import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  FormCard, SectionHeader, QuestionLabel, OptionGrid, YesNo, DayChips,
  FormShell, FormNavButtons,
} from './FormUI';

interface Props { isDeepClean?: boolean; onComplete: () => void; onBack: () => void; }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ResidentialForm({ isDeepClean, onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const uploadIdRef = useRef(crypto.randomUUID());

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('House');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [toilets, setToilets] = useState('0');
  const [livingAreas, setLivingAreas] = useState('1');

  const [ovenClean, setOvenClean] = useState<boolean | null>(null);
  const [insideFridge, setInsideFridge] = useState<boolean | null>(null);
  const [insideCupboards, setInsideCupboards] = useState<boolean | null>(null);
  const [interiorWindows, setInteriorWindows] = useState<boolean | null>(null);
  const [outdoorAreas, setOutdoorAreas] = useState<boolean | null>(null);
  const [garage, setGarage] = useState<boolean | null>(null);
  const [lastCleaned, setLastCleaned] = useState('Not sure');
  const [propertyCondition, setPropertyCondition] = useState('Good');

  const [pets, setPets] = useState<boolean | null>(null);
  const [frequency, setFrequency] = useState('One-off');
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [preferredTime, setPreferredTime] = useState('Flexible');

  const [accessMethod, setAccessMethod] = useState('Someone home');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [parking, setParking] = useState('Driveway');

  const [firstClean, setFirstClean] = useState<boolean | null>(null);
  const [referral, setReferral] = useState('');
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [focusAreas, setFocusAreas] = useState('');
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const steps = isDeepClean
    ? ['Contact', 'Property', 'Deep Clean Details', 'Preferences', 'Access', 'Final Details']
    : ['Contact', 'Property', 'Preferences', 'Access', 'Final Details'];
  const totalSteps = steps.length;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 3) { toast.error('Max 3 photos'); return; }
    setUploading(true);
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${uploadIdRef.current}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('quote-photos').upload(path, file, { contentType: file.type });
      if (error) { toast.error('Upload failed'); continue; }
      const { data } = supabase.storage.from('quote-photos').getPublicUrl(path);
      setPhotos(prev => [...prev, { url: data.publicUrl }]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const canNext = () => {
    const s = steps[step];
    if (s === 'Contact') return fullName.trim() && mobile.trim() && email.trim();
    if (s === 'Property') return address.trim();
    return true;
  };

  const handleSubmit = async () => {
    if (!tcsAccepted) { toast.error('Please agree to the Terms & Conditions'); return; }
    if (!fullName.trim() || !mobile.trim()) { toast.error('Name and mobile are required'); return; }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      const cleanType = isDeepClean ? 'Deep Clean' : 'Standard House Clean';
      const formData = {
        living_areas: livingAreas, pets, frequency, preferred_days: preferredDays,
        preferred_time: preferredTime, access_method: accessMethod,
        access_instructions: accessInstructions, parking, first_clean: firstClean, focus_areas: focusAreas,
        ...(isDeepClean ? { oven_clean: ovenClean, inside_fridge: insideFridge, inside_cupboards: insideCupboards, interior_windows: interiorWindows, outdoor_areas: outdoorAreas, garage, last_cleaned: lastCleaned, property_condition: propertyCondition } : {}),
      };
      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName, last_name: lastName, phone: mobile, email, address,
        property_type: propertyType, clean_type: cleanType,
        bedrooms: parseInt(bedrooms) || 0, bathrooms: parseInt(bathrooms) || 0,
        toilets: parseInt(toilets) || 0, has_garage: garage === true,
        referral_source: referral || null, extra_notes: focusAreas || null,
        photos: photos.map(p => ({ url: p.url, label: '' })),
        status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(), form_data: formData,
      } as any);
      if (error) throw error;
      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: mobile, client_name: firstName, clean_type: cleanType, address },
      });
      onComplete();
    } catch (err: any) { toast.error(err.message || 'Something went wrong'); }
    finally { setSubmitting(false); }
  };

  const renderStep = () => {
    const s = steps[step];

    if (s === 'Contact') return (
      <>
        <SectionHeader icon="👤" label="About You" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Full Name *</QuestionLabel><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><QuestionLabel>Mobile Number *</QuestionLabel><Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0412 345 678" type="tel" className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><QuestionLabel>Email Address *</QuestionLabel><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" className="h-12 rounded-xl" /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Property') return (
      <>
        <SectionHeader icon="🏠" label="About Your Property" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Property Address *</QuestionLabel><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St, Richmond VIC 3121" className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><QuestionLabel>Property Type</QuestionLabel><OptionGrid options={['House', 'Apartment', 'Townhouse', 'Unit']} value={propertyType} onChange={setPropertyType} cols={4} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel sub="Including master bedroom">Bedrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4', '5+']} value={bedrooms} onChange={setBedrooms} /></div>
            <div className="space-y-2"><QuestionLabel>Bathrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4+']} value={bathrooms} onChange={setBathrooms} cols={4} /></div>
            <div className="space-y-2"><QuestionLabel sub="Not inside a bathroom">Separate Toilets</QuestionLabel><OptionGrid options={['0', '1', '2+']} value={toilets} onChange={setToilets} cols={3} /></div>
            <div className="space-y-2"><QuestionLabel>Living / Dining Areas</QuestionLabel><OptionGrid options={['1', '2', '3+']} value={livingAreas} onChange={setLivingAreas} cols={3} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Deep Clean Details') return (
      <>
        <SectionHeader icon="✨" label="Deep Clean Extras" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Oven clean required?</QuestionLabel><YesNo value={ovenClean} onChange={setOvenClean} /></div>
            <div className="space-y-2"><QuestionLabel>Inside fridge?</QuestionLabel><YesNo value={insideFridge} onChange={setInsideFridge} /></div>
            <div className="space-y-2"><QuestionLabel>Inside cupboards / drawers?</QuestionLabel><YesNo value={insideCupboards} onChange={setInsideCupboards} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Interior windows?</QuestionLabel><YesNo value={interiorWindows} onChange={setInteriorWindows} /></div>
            <div className="space-y-2"><QuestionLabel>Outdoor areas — balcony or patio?</QuestionLabel><YesNo value={outdoorAreas} onChange={setOutdoorAreas} /></div>
            <div className="space-y-2"><QuestionLabel>Garage?</QuestionLabel><YesNo value={garage} onChange={setGarage} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>When was the property last professionally cleaned?</QuestionLabel><OptionGrid options={['Recently', '6+ months ago', 'Never', 'Not sure']} value={lastCleaned} onChange={setLastCleaned} cols={2} /></div>
            <div className="space-y-2"><QuestionLabel>Property condition</QuestionLabel><OptionGrid options={['Good', 'Needs significant work']} value={propertyCondition} onChange={setPropertyCondition} cols={2} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Preferences') return (
      <>
        <SectionHeader icon="📅" label="Scheduling" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Do you have pets at the property?</QuestionLabel><YesNo value={pets} onChange={setPets} /></div>
            <div className="space-y-2"><QuestionLabel>One-off or recurring?</QuestionLabel><OptionGrid options={['One-off', 'Weekly', 'Fortnightly', 'Monthly']} value={frequency} onChange={setFrequency} cols={2} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel sub="Select all that work">Preferred day(s) of week</QuestionLabel><DayChips days={DAYS} selected={preferredDays} onChange={setPreferredDays} /></div>
            <div className="space-y-2"><QuestionLabel>Preferred time of day</QuestionLabel><OptionGrid options={['Morning', 'Midday', 'Afternoon', 'Flexible']} value={preferredTime} onChange={setPreferredTime} cols={2} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Access') return (
      <>
        <SectionHeader icon="🔑" label="Access" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Access method</QuestionLabel><OptionGrid options={['Someone home', 'Key provided', 'Lockbox', 'Other']} value={accessMethod} onChange={setAccessMethod} cols={2} /></div>
            <div className="space-y-2"><QuestionLabel sub="e.g. lockbox code, buzzer, gate code">Access instructions</QuestionLabel><Input value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)} placeholder="e.g. Lockbox code 1234, side gate" className="h-12 rounded-xl" /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-2"><QuestionLabel>Parking available?</QuestionLabel><OptionGrid options={['Driveway', 'Street parking', 'No parking nearby', 'Other']} value={parking} onChange={setParking} cols={2} /></div>
        </FormCard>
      </>
    );

    if (s === 'Final Details') return (
      <>
        <SectionHeader icon="🎉" label="Final Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Is this your first clean with Brightly?</QuestionLabel><YesNo value={firstClean} onChange={setFirstClean} /></div>
            <div className="space-y-2"><QuestionLabel>How did you hear about us?</QuestionLabel><OptionGrid options={['Google', 'Referral', 'Social media', 'Letterbox', 'Other']} value={referral} onChange={setReferral} cols={3} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2">
              <QuestionLabel sub="Up to 3 images">Upload photos of your property (optional)</QuestionLabel>
              {photos.length > 0 && (
                <div className="flex gap-2 flex-wrap">{photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                    <img src={p.url} className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                  </div>))}</div>
              )}
              {photos.length < 3 && (<>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                <Button type="button" variant="outline" className="w-full h-12 rounded-xl gap-2 border-dashed" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : `Upload Photos (${photos.length}/3)`}
                </Button></>)}
            </div>
            <div className="space-y-2"><QuestionLabel>Anything specific you'd like us to focus on? (optional)</QuestionLabel><Textarea value={focusAreas} onChange={e => setFocusAreas(e.target.value)} placeholder="e.g. Extra attention on kitchen grease, mould in bathroom..." className="rounded-xl" /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="flex items-start gap-3">
            <Checkbox checked={tcsAccepted} onCheckedChange={(v) => setTcsAccepted(v === true)} id="tcs" className="mt-0.5" />
            <label htmlFor="tcs" className="text-sm text-foreground">
              I agree to Brightly's{' '}
              <button type="button" onClick={() => setTermsOpen(true)} className="text-primary underline font-medium">Terms & Conditions</button>
            </label>
          </div>
        </FormCard>
      </>
    );
  };

  return (
    <FormShell step={step} totalSteps={totalSteps} stepLabel={steps[step]} termsOpen={termsOpen} onTermsClose={() => setTermsOpen(false)}>
      {renderStep()}
      <FormNavButtons
        step={step} totalSteps={totalSteps} canNext={canNext()} submitting={submitting} tcsAccepted={tcsAccepted}
        onBack={() => step === 0 ? onBack() : setStep(s => s - 1)}
        onNext={() => setStep(s => s + 1)} onSubmit={handleSubmit}
      />
    </FormShell>
  );
}
