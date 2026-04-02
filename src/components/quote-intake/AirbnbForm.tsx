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

interface Props { onComplete: () => void; onBack: () => void; }

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
  return <div className="grid grid-cols-2 gap-2">
    {[true, false].map(v => (
      <button key={String(v)} type="button" onClick={() => onChange(v)}
        className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${value === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/50'}`}>
        {v ? 'Yes' : 'No'}
      </button>
    ))}
  </div>;
}

export default function AirbnbForm({ onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const uploadIdRef = useRef(crypto.randomUUID());

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [bedConfig, setBedConfig] = useState('');
  const [towelSets, setTowelSets] = useState('2');

  const [linenChange, setLinenChange] = useState<boolean | null>(null);
  const [consumablesRestock, setConsumablesRestock] = useState<boolean | null>(null);
  const [toiletriesIncluded, setToiletriesIncluded] = useState<boolean | null>(null);
  const [checkoutTime, setCheckoutTime] = useState('10:00');
  const [checkinTime, setCheckinTime] = useState('15:00');

  const [accessMethod, setAccessMethod] = useState('Lockbox');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [parking, setParking] = useState('Street parking');
  const [platform, setPlatform] = useState('Airbnb');

  const [firstClean, setFirstClean] = useState<boolean | null>(null);
  const [referral, setReferral] = useState('');
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [hostingNotes, setHostingNotes] = useState('');
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const STEPS = ['Contact', 'Property', 'Hosting Details', 'Access', 'Final Details'];
  const totalSteps = STEPS.length;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 3) { toast.error('Max 3 photos'); return; }
    setUploading(true);
    for (const file of files) {
      const path = `${uploadIdRef.current}/${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
      const { error } = await supabase.storage.from('quote-photos').upload(path, file, { contentType: file.type });
      if (error) { toast.error('Upload failed'); continue; }
      const { data } = supabase.storage.from('quote-photos').getPublicUrl(path);
      setPhotos(prev => [...prev, { url: data.publicUrl }]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const canNext = () => {
    if (STEPS[step] === 'Contact') return fullName.trim() && mobile.trim() && email.trim();
    if (STEPS[step] === 'Property') return address.trim();
    return true;
  };

  const handleSubmit = async () => {
    if (!tcsAccepted) { toast.error('Please agree to the Terms & Conditions'); return; }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      const formData = {
        bed_config: bedConfig,
        towel_sets: towelSets,
        linen_change: linenChange,
        consumables_restock: consumablesRestock,
        toiletries_included: toiletriesIncluded,
        checkout_time: checkoutTime,
        checkin_time: checkinTime,
        access_method: accessMethod,
        access_instructions: accessInstructions,
        parking,
        platform,
        first_clean: firstClean,
        hosting_notes: hostingNotes,
      };

      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName, last_name: lastName, phone: mobile, email, address,
        property_type: propertyType, clean_type: 'Airbnb / Short-Stay Turnover',
        bedrooms: parseInt(bedrooms) || 0, bathrooms: parseInt(bathrooms) || 0,
        referral_source: referral || null, extra_notes: hostingNotes || null,
        photos: photos.map(p => ({ url: p.url, label: '' })),
        status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(),
        form_data: formData,
      } as any);
      if (error) throw error;

      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: mobile, client_name: firstName, clean_type: 'Airbnb / Short-Stay Turnover', address },
      });
      onComplete();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally { setSubmitting(false); }
  };

  const renderStep = () => {
    const s = STEPS[step];
    if (s === 'Contact') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Your details</h2>
        <div className="space-y-2"><Label>Full Name *</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Mobile Number *</Label><Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0412 345 678" type="tel" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Email Address *</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" className="h-12 rounded-xl" /></div>
      </div>
    );

    if (s === 'Property') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Property details</h2>
        <div className="space-y-2"><Label>Property Address *</Label><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St, Richmond VIC 3121" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Property Type</Label><OptionGrid options={['House', 'Apartment', 'Townhouse', 'Unit']} value={propertyType} onChange={setPropertyType} cols={4} /></div>
        <div className="space-y-2"><Label>Bedrooms</Label><OptionGrid options={['1', '2', '3', '4', '5+']} value={bedrooms} onChange={setBedrooms} /></div>
        <div className="space-y-2"><Label>Bathrooms</Label><OptionGrid options={['1', '2', '3', '4+']} value={bathrooms} onChange={setBathrooms} cols={4} /></div>
        <div className="space-y-2"><Label>Bed configuration</Label><Input value={bedConfig} onChange={e => setBedConfig(e.target.value)} placeholder="e.g. 1x King, 2x Single" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Number of towel sets needed</Label><OptionGrid options={['1', '2', '3', '4+']} value={towelSets} onChange={setTowelSets} cols={4} /></div>
      </div>
    );

    if (s === 'Hosting Details') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Hosting details</h2>
        <div className="space-y-2">
          <Label>Linen change required?</Label><YesNo value={linenChange} onChange={setLinenChange} />
          <p className="text-xs text-muted-foreground">Brightly supplies all linen</p>
        </div>
        <div className="space-y-2">
          <Label>Consumables restock required?</Label><YesNo value={consumablesRestock} onChange={setConsumablesRestock} />
          <p className="text-xs text-muted-foreground">Toilet paper, soap, hand wash — Brightly supplies</p>
        </div>
        <div className="space-y-2"><Label>Are toiletries included in your listing?</Label><YesNo value={toiletriesIncluded} onChange={setToiletriesIncluded} /></div>
        <div className="space-y-2"><Label>Typical guest checkout time</Label><Input type="time" value={checkoutTime} onChange={e => setCheckoutTime(e.target.value)} className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Typical next check-in time</Label><Input type="time" value={checkinTime} onChange={e => setCheckinTime(e.target.value)} className="h-12 rounded-xl" /></div>
      </div>
    );

    if (s === 'Access') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Access & logistics</h2>
        <div className="space-y-2"><Label>Property access</Label><OptionGrid options={['Lockbox', 'Key safe', 'Host present', 'Other']} value={accessMethod} onChange={setAccessMethod} cols={2} /></div>
        <div className="space-y-2"><Label>Access instructions</Label><Input value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)} placeholder="e.g. Lockbox code 5678, behind the mailbox" className="h-12 rounded-xl" /></div>
        <div className="space-y-2"><Label>Parking available?</Label><OptionGrid options={['Driveway', 'Street parking', 'No parking nearby', 'Other']} value={parking} onChange={setParking} cols={2} /></div>
        <div className="space-y-2"><Label>Hosting platform</Label><OptionGrid options={['Airbnb', 'Stayz', 'Booking.com', 'Direct', 'Other']} value={platform} onChange={setPlatform} cols={3} /></div>
      </div>
    );

    if (s === 'Final Details') return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-foreground">Almost done!</h2>
        <div className="space-y-2"><Label>Is this your first clean with Brightly?</Label><YesNo value={firstClean} onChange={setFirstClean} /></div>
        <div className="space-y-2"><Label>How did you hear about us?</Label><OptionGrid options={['Google', 'Referral', 'Social media', 'Other']} value={referral} onChange={setReferral} cols={2} /></div>
        <div className="space-y-2">
          <Label>Upload photos (optional, up to 3)</Label>
          {photos.length > 0 && <div className="flex gap-2 flex-wrap">{photos.map((p, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden"><img src={p.url} className="w-full h-full object-cover" />
              <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
            </div>))}</div>}
          {photos.length < 3 && <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            <Button type="button" variant="outline" className="w-full h-12 rounded-xl gap-2 border-dashed" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {uploading ? 'Uploading...' : `Upload (${photos.length}/3)`}
            </Button></>}
        </div>
        <div className="space-y-2"><Label>Any special hosting notes for our cleaners? (optional)</Label><Textarea value={hostingNotes} onChange={e => setHostingNotes(e.target.value)} placeholder="e.g. Guest left late, priority areas..." className="rounded-xl" /></div>
        <div className="flex items-start gap-3 pt-2">
          <Checkbox checked={tcsAccepted} onCheckedChange={(v) => setTcsAccepted(v === true)} id="tcs" className="mt-0.5" />
          <label htmlFor="tcs" className="text-sm text-foreground">I agree to Brightly's{' '}<button type="button" onClick={() => setTermsOpen(true)} className="text-primary underline font-medium">Terms & Conditions</button></label>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto">
          <Progress value={((step + 1) / totalSteps) * 100} className="h-2 [&>div]:bg-primary" />
          <p className="text-xs text-muted-foreground mt-1.5">Step {step + 1} of {totalSteps} — {STEPS[step]}</p>
        </div>
      </div>
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        {renderStep()}
        <div className="flex gap-3 mt-8 pb-8">
          <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => step === 0 ? onBack() : setStep(s => s - 1)}><ArrowLeft className="w-4 h-4" /> Back</Button>
          {step < totalSteps - 1 ? (
            <Button className="flex-1 rounded-xl h-12 bg-primary text-primary-foreground hover:bg-primary/90 gap-2 font-bold" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next <ArrowRight className="w-4 h-4" /></Button>
          ) : (
            <Button className="flex-1 rounded-xl h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" onClick={handleSubmit} disabled={submitting || !tcsAccepted}>
              {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Request My Quote →
            </Button>
          )}
        </div>
      </div>
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
