import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  FormCard, SectionHeader, QuestionLabel, OptionGrid, YesNo,
  FormShell, FormNavButtons,
} from './FormUI';

interface Props { onComplete: () => void; onBack: () => void; }

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
  const [bedTypes, setBedTypes] = useState<Record<number, string>>({});

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
    if (STEPS[step] === 'Contact') return !!(fullName.trim() && mobile.trim() && email.trim());
    if (STEPS[step] === 'Property') return !!address.trim();
    return true;
  };

  const handleSubmit = async () => {
    if (!tcsAccepted) { toast.error('Please agree to the Terms & Conditions'); return; }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      const bedroomCount = parseInt(bedrooms) || 1;
      const bedConfigStr = Array.from({ length: bedroomCount }, (_, i) => `Bedroom ${i + 1}: ${bedTypes[i] || 'Not specified'}`).join(', ');
      const formData = {
        bed_config: bedConfigStr, bed_types: bedTypes, linen_change: linenChange,
        consumables_restock: consumablesRestock, toiletries_included: toiletriesIncluded,
        checkout_time: checkoutTime, checkin_time: checkinTime,
        access_method: accessMethod, access_instructions: accessInstructions,
        parking, platform, first_clean: firstClean, hosting_notes: hostingNotes,
      };
      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName, last_name: lastName, phone: mobile, email, address,
        property_type: propertyType, clean_type: 'Airbnb / Short-Stay Turnover',
        bedrooms: parseInt(bedrooms) || 0, bathrooms: parseInt(bathrooms) || 0,
        referral_source: referral || null, extra_notes: hostingNotes || null,
        photos: photos.map(p => ({ url: p.url, label: '' })),
        status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(), form_data: formData,
      } as any);
      if (error) throw error;
      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: mobile, client_name: firstName, clean_type: 'Airbnb / Short-Stay Turnover', address },
      });
      onComplete();
    } catch (err: any) { toast.error(err.message || 'Something went wrong'); }
    finally { setSubmitting(false); }
  };

  const renderStep = () => {
    const s = STEPS[step];

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
        <SectionHeader icon="🏠" label="Property Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Property Address *</QuestionLabel><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St, Richmond VIC 3121" className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><QuestionLabel>Property Type</QuestionLabel><OptionGrid options={['House', 'Apartment', 'Townhouse', 'Unit']} value={propertyType} onChange={setPropertyType} cols={4} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Bedrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4', '5+']} value={bedrooms} onChange={setBedrooms} /></div>
            <div className="space-y-2"><QuestionLabel>Bathrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4+']} value={bathrooms} onChange={setBathrooms} cols={4} /></div>
            <div className="space-y-2"><QuestionLabel sub="e.g. 1x King, 2x Single">Bed configuration</QuestionLabel><Input value={bedConfig} onChange={e => setBedConfig(e.target.value)} placeholder="1x King, 2x Single" className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><QuestionLabel>Number of towel sets needed</QuestionLabel><OptionGrid options={['1', '2', '3', '4+']} value={towelSets} onChange={setTowelSets} cols={4} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Hosting Details') return (
      <>
        <SectionHeader icon="🛏️" label="Hosting Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel sub="Brightly supplies all linen">Linen change required?</QuestionLabel><YesNo value={linenChange} onChange={setLinenChange} /></div>
            <div className="space-y-2"><QuestionLabel sub="Toilet paper, soap, hand wash — Brightly supplies">Consumables restock required?</QuestionLabel><YesNo value={consumablesRestock} onChange={setConsumablesRestock} /></div>
            <div className="space-y-2"><QuestionLabel>Are toiletries included in your listing?</QuestionLabel><YesNo value={toiletriesIncluded} onChange={setToiletriesIncluded} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Typical guest checkout time</QuestionLabel><Input type="time" value={checkoutTime} onChange={e => setCheckoutTime(e.target.value)} className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><QuestionLabel>Typical next check-in time</QuestionLabel><Input type="time" value={checkinTime} onChange={e => setCheckinTime(e.target.value)} className="h-12 rounded-xl" /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Access') return (
      <>
        <SectionHeader icon="🔑" label="Access & Logistics" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Property access</QuestionLabel><OptionGrid options={['Lockbox', 'Key safe', 'Host present', 'Other']} value={accessMethod} onChange={setAccessMethod} cols={2} /></div>
            <div className="space-y-2"><QuestionLabel sub="Code, location, etc.">Access instructions</QuestionLabel><Input value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)} placeholder="e.g. Lockbox code 5678, behind the mailbox" className="h-12 rounded-xl" /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Parking available?</QuestionLabel><OptionGrid options={['Driveway', 'Street parking', 'No parking nearby', 'Other']} value={parking} onChange={setParking} cols={2} /></div>
            <div className="space-y-2"><QuestionLabel>Hosting platform</QuestionLabel><OptionGrid options={['Airbnb', 'Stayz', 'Booking.com', 'Direct', 'Other']} value={platform} onChange={setPlatform} cols={3} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Final Details') return (
      <>
        <SectionHeader icon="🎉" label="Final Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Is this your first clean with Brightly?</QuestionLabel><YesNo value={firstClean} onChange={setFirstClean} /></div>
            <div className="space-y-2"><QuestionLabel>How did you hear about us?</QuestionLabel><OptionGrid options={['Google', 'Referral', 'Social media', 'Other']} value={referral} onChange={setReferral} cols={2} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2">
              <QuestionLabel sub="Up to 3 images">Upload photos (optional)</QuestionLabel>
              {photos.length > 0 && <div className="flex gap-2 flex-wrap">{photos.map((p, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                  <img src={p.url} className="w-full h-full object-cover" />
                  <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>))}</div>}
              {photos.length < 3 && (<>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                <Button type="button" variant="outline" className="w-full h-12 rounded-xl gap-2 border-dashed" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {uploading ? 'Uploading...' : `Upload (${photos.length}/3)`}
                </Button></>)}
            </div>
            <div className="space-y-2"><QuestionLabel>Any special hosting notes for our cleaners? (optional)</QuestionLabel><Textarea value={hostingNotes} onChange={e => setHostingNotes(e.target.value)} placeholder="e.g. Guest left late, priority areas..." className="rounded-xl" /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="flex items-start gap-3">
            <Checkbox checked={tcsAccepted} onCheckedChange={(v) => setTcsAccepted(v === true)} id="tcs" className="mt-0.5" />
            <label htmlFor="tcs" className="text-sm text-foreground">I agree to Brightly's{' '}<button type="button" onClick={() => setTermsOpen(true)} className="text-primary underline font-medium">Terms & Conditions</button></label>
          </div>
        </FormCard>
      </>
    );
  };

  return (
    <FormShell step={step} totalSteps={totalSteps} stepLabel={STEPS[step]} termsOpen={termsOpen} onTermsClose={() => setTermsOpen(false)}>
      {renderStep()}
      <FormNavButtons
        step={step} totalSteps={totalSteps} canNext={canNext()} submitting={submitting} tcsAccepted={tcsAccepted}
        onBack={() => step === 0 ? onBack() : setStep(s => s - 1)}
        onNext={() => setStep(s => s + 1)} onSubmit={handleSubmit}
      />
    </FormShell>
  );
}
