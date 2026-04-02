import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowLeft, ArrowRight, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { TermsModal } from '@/components/quote/TermsModal';

interface Props {
  isDeepClean?: boolean;
  onComplete: () => void;
  onBack: () => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function OptionGrid({ options, value, onChange, cols = 3 }: { options: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  return (
    <div className={`grid gap-2 ${cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${value === opt ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[true, false].map(v => (
        <button key={String(v)} type="button" onClick={() => onChange(v)}
          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${value === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50'}`}>
          {v ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

export default function ResidentialForm({ isDeepClean, onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const uploadIdRef = useRef(crypto.randomUUID());

  // Contact
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  // Property
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('House');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [toilets, setToilets] = useState('0');
  const [livingAreas, setLivingAreas] = useState('1');

  // Deep clean extras
  const [ovenClean, setOvenClean] = useState<boolean | null>(null);
  const [insideFridge, setInsideFridge] = useState<boolean | null>(null);
  const [insideCupboards, setInsideCupboards] = useState<boolean | null>(null);
  const [interiorWindows, setInteriorWindows] = useState<boolean | null>(null);
  const [outdoorAreas, setOutdoorAreas] = useState<boolean | null>(null);
  const [garage, setGarage] = useState<boolean | null>(null);
  const [lastCleaned, setLastCleaned] = useState('Not sure');
  const [propertyCondition, setPropertyCondition] = useState('Good');

  // Preferences
  const [pets, setPets] = useState<boolean | null>(null);
  const [frequency, setFrequency] = useState('One-off');
  const [preferredDays, setPreferredDays] = useState<string[]>([]);
  const [preferredTime, setPreferredTime] = useState('Flexible');

  // Access
  const [accessMethod, setAccessMethod] = useState('Someone home');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [parking, setParking] = useState('Driveway');

  // Final
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
  const progress = ((step + 1) / totalSteps) * 100;

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
    const currentStepName = steps[step];
    if (currentStepName === 'Contact') return fullName.trim() && mobile.trim() && email.trim();
    if (currentStepName === 'Property') return address.trim();
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
        living_areas: livingAreas,
        pets: pets,
        frequency,
        preferred_days: preferredDays,
        preferred_time: preferredTime,
        access_method: accessMethod,
        access_instructions: accessInstructions,
        parking,
        first_clean: firstClean,
        focus_areas: focusAreas,
        ...(isDeepClean ? {
          oven_clean: ovenClean,
          inside_fridge: insideFridge,
          inside_cupboards: insideCupboards,
          interior_windows: interiorWindows,
          outdoor_areas: outdoorAreas,
          garage: garage,
          last_cleaned: lastCleaned,
          property_condition: propertyCondition,
        } : {}),
      };

      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName,
        last_name: lastName,
        phone: mobile,
        email,
        address,
        property_type: propertyType,
        clean_type: cleanType,
        bedrooms: parseInt(bedrooms) || 0,
        bathrooms: parseInt(bathrooms) || 0,
        toilets: parseInt(toilets) || 0,
        has_garage: garage === true,
        referral_source: referral || null,
        extra_notes: focusAreas || null,
        photos: photos.map(p => ({ url: p.url, label: '' })),
        status: 'form_submitted',
        form_submitted_at: new Date().toISOString(),
        tcs_accepted: true,
        tcs_accepted_at: new Date().toISOString(),
        form_data: formData,
      } as any);

      if (error) throw error;

      // Send notifications
      await supabase.functions.invoke('send-quote-notification', {
        body: {
          type: 'intake_submitted',
          client_phone: mobile,
          client_name: firstName,
          clean_type: cleanType,
          address,
        },
      });

      onComplete();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    const currentStepName = steps[step];

    if (currentStepName === 'Contact') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Your details</h2>
        <div className="space-y-2"><Label>Full Name *</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Mobile Number *</Label><Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0412 345 678" type="tel" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Email Address *</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" className="h-12 rounded-xl" /></div>
      </div>
    );

    if (currentStepName === 'Property') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Property details</h2>
        <div className="space-y-2"><Label>Property Address *</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St, Richmond VIC 3121" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Property Type</Label><OptionGrid options={['House', 'Apartment', 'Townhouse', 'Unit']} value={propertyType} onChange={setPropertyType} cols={4} /></div>
        <div className="space-y-2"><Label>Bedrooms</Label><OptionGrid options={['1', '2', '3', '4', '5+']} value={bedrooms} onChange={setBedrooms} /></div>
        <div className="space-y-2"><Label>Bathrooms</Label><OptionGrid options={['1', '2', '3', '4+']} value={bathrooms} onChange={setBathrooms} cols={4} /></div>
        <div className="space-y-2"><Label>Separate Toilets</Label><OptionGrid options={['0', '1', '2+']} value={toilets} onChange={setToilets} cols={3} /></div>
        <div className="space-y-2"><Label>Living / Dining Areas</Label><OptionGrid options={['1', '2', '3+']} value={livingAreas} onChange={setLivingAreas} cols={3} /></div>
      </div>
    );

    if (currentStepName === 'Deep Clean Details') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Deep clean extras</h2>
        <div className="space-y-2"><Label>Oven clean required?</Label><YesNo value={ovenClean} onChange={setOvenClean} /></div>
        <div className="space-y-2"><Label>Inside fridge?</Label><YesNo value={insideFridge} onChange={setInsideFridge} /></div>
        <div className="space-y-2"><Label>Inside cupboards / drawers?</Label><YesNo value={insideCupboards} onChange={setInsideCupboards} /></div>
        <div className="space-y-2"><Label>Interior windows?</Label><YesNo value={interiorWindows} onChange={setInteriorWindows} /></div>
        <div className="space-y-2"><Label>Outdoor areas — balcony or patio?</Label><YesNo value={outdoorAreas} onChange={setOutdoorAreas} /></div>
        <div className="space-y-2"><Label>Garage?</Label><YesNo value={garage} onChange={setGarage} /></div>
        <div className="space-y-2"><Label>When was the property last professionally cleaned?</Label><OptionGrid options={['Recently', '6+ months ago', 'Never', 'Not sure']} value={lastCleaned} onChange={setLastCleaned} cols={2} /></div>
        <div className="space-y-2"><Label>Property condition</Label><OptionGrid options={['Good', 'Needs significant work']} value={propertyCondition} onChange={setPropertyCondition} cols={2} /></div>
      </div>
    );

    if (currentStepName === 'Preferences') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Your preferences</h2>
        <div className="space-y-2"><Label>Do you have pets at the property?</Label><YesNo value={pets} onChange={setPets} /></div>
        <div className="space-y-2"><Label>One-off or recurring?</Label><OptionGrid options={['One-off', 'Weekly', 'Fortnightly', 'Monthly']} value={frequency} onChange={setFrequency} cols={2} /></div>
        <div className="space-y-2">
          <Label>Preferred day(s) of week</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(d => (
              <button key={d} type="button" onClick={() => setPreferredDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${preferredDays.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2"><Label>Preferred time of day</Label><OptionGrid options={['Morning', 'Midday', 'Afternoon', 'Flexible']} value={preferredTime} onChange={setPreferredTime} cols={2} /></div>
      </div>
    );

    if (currentStepName === 'Access') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Property access</h2>
        <div className="space-y-2"><Label>Access method</Label><OptionGrid options={['Someone home', 'Key provided', 'Lockbox', 'Other']} value={accessMethod} onChange={setAccessMethod} cols={2} /></div>
        <div className="space-y-2"><Label>Access instructions</Label><Input value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)} placeholder="e.g. Lockbox code 1234, side gate" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Parking available?</Label><OptionGrid options={['Driveway', 'Street parking', 'No parking nearby', 'Other']} value={parking} onChange={setParking} cols={2} /></div>
      </div>
    );

    if (currentStepName === 'Final Details') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Almost done!</h2>
        <div className="space-y-2"><Label>Is this your first clean with Brightly?</Label><YesNo value={firstClean} onChange={setFirstClean} /></div>
        <div className="space-y-2"><Label>How did you hear about us?</Label><OptionGrid options={['Google', 'Referral', 'Social media', 'Letterbox', 'Other']} value={referral} onChange={setReferral} cols={3} /></div>

        <div className="space-y-2">
          <Label>Upload photos of your property (optional, up to 3)</Label>
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {photos.map((p, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden">
                  <img src={p.url} className="w-full h-full object-cover" />
                  <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          {photos.length < 3 && (
            <>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              <Button type="button" variant="outline" className="w-full h-12 rounded-xl gap-2 border-dashed" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {uploading ? 'Uploading...' : `Upload Photos (${photos.length}/3)`}
              </Button>
            </>
          )}
        </div>

        <div className="space-y-2"><Label>Anything specific you'd like us to focus on? (optional)</Label><Textarea value={focusAreas} onChange={e => setFocusAreas(e.target.value)} placeholder="e.g. Extra attention on kitchen grease, mould in bathroom..." className="rounded-xl" /></div>

        <div className="flex items-start gap-3 pt-2">
          <Checkbox checked={tcsAccepted} onCheckedChange={(v) => setTcsAccepted(v === true)} id="tcs" className="mt-0.5" />
          <label htmlFor="tcs" className="text-sm text-foreground">
            I agree to Brightly's{' '}
            <button type="button" onClick={() => setTermsOpen(true)} className="text-primary underline font-medium">Terms & Conditions</button>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto">
          <Progress value={progress} className="h-2 [&>div]:bg-primary" />
          <p className="text-xs text-muted-foreground mt-1.5">Step {step + 1} of {totalSteps} — {steps[step]}</p>
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        {renderStep()}

        <div className="flex gap-3 mt-8 pb-8">
          <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => step === 0 ? onBack() : setStep(s => s - 1)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          {step < totalSteps - 1 ? (
            <Button className="flex-1 rounded-xl h-12 bg-primary text-primary-foreground hover:bg-primary/90 gap-2 font-bold" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button className="flex-1 rounded-xl h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" onClick={handleSubmit} disabled={submitting || !tcsAccepted}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Request My Quote →
            </Button>
          )}
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
