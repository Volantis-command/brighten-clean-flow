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
  FormShell, FormNavButtons, darkInputClass, darkTextareaClass,
} from './FormUI';

interface Props { onComplete: () => void; onBack: () => void; }

export default function CommercialForm({ onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const uploadIdRef = useRef(crypto.randomUUID());

  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [abn, setAbn] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');

  const [address, setAddress] = useState('');
  const [spaceType, setSpaceType] = useState('Office');
  const [approxSize, setApproxSize] = useState('100–300m²');
  const [toiletsBathrooms, setToiletsBathrooms] = useState('1');
  const [kitchenBreakroom, setKitchenBreakroom] = useState<boolean | null>(null);
  const [floorTypes, setFloorTypes] = useState('Both');

  const [afterHours, setAfterHours] = useState<boolean | null>(null);
  const [securityAlarm, setSecurityAlarm] = useState<boolean | null>(null);
  const [frequency, setFrequency] = useState('Weekly');
  const [preferredTime, setPreferredTime] = useState('Flexible');
  const [parking, setParking] = useState('Yes');

  const [firstClean, setFirstClean] = useState<boolean | null>(null);
  const [referral, setReferral] = useState('');
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [specialAttention, setSpecialAttention] = useState('');
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const STEPS = ['Business Details', 'Space Details', 'Operations', 'Final Details'];
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
    if (STEPS[step] === 'Business Details') return !!(contactName.trim() && mobile.trim() && email.trim());
    if (STEPS[step] === 'Space Details') return !!address.trim();
    return true;
  };

  const handleSubmit = async () => {
    if (!tcsAccepted) { toast.error('Please agree to the Terms & Conditions'); return; }
    setSubmitting(true);
    try {
      const nameParts = contactName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      const formData = {
        business_name: businessName, abn, invoice_email: invoiceEmail,
        space_type: spaceType, approx_size: approxSize, toilets_bathrooms: toiletsBathrooms,
        kitchen_breakroom: kitchenBreakroom, floor_types: floorTypes,
        after_hours: afterHours, security_alarm: securityAlarm,
        frequency, preferred_time: preferredTime, parking, first_clean: firstClean,
        special_attention: specialAttention,
      };
      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName, last_name: lastName, phone: mobile, email, address,
        property_type: spaceType, clean_type: 'Commercial Clean',
        referral_source: referral || null, extra_notes: specialAttention || null,
        photos: photos.map(p => ({ url: p.url, label: '' })),
        status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(), form_data: formData,
      } as any);
      if (error) throw error;
      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: mobile, client_name: firstName, clean_type: 'Commercial Clean', address },
      });
      onComplete();
    } catch (err: any) { toast.error(err.message || 'Something went wrong'); }
    finally { setSubmitting(false); }
  };

  const renderStep = () => {
    const s = STEPS[step];

    if (s === 'Business Details') return (
      <>
        <SectionHeader icon="🏢" label="Business Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Business Name</QuestionLabel><Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Acme Pty Ltd" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Contact Name *</QuestionLabel><Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Mobile Number *</QuestionLabel><Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0412 345 678" type="tel" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Email Address *</QuestionLabel><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@acme.com.au" type="email" className={darkInputClass} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel sub="Optional">ABN</QuestionLabel><Input value={abn} onChange={e => setAbn(e.target.value)} placeholder="12 345 678 901" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel sub="If different from contact email">Preferred invoice email</QuestionLabel><Input value={invoiceEmail} onChange={e => setInvoiceEmail(e.target.value)} placeholder="accounts@acme.com.au" type="email" className={darkInputClass} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Space Details') return (
      <>
        <SectionHeader icon="📐" label="Space Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Property Address *</QuestionLabel><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="456 Collins St, Melbourne VIC 3000" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Type of space</QuestionLabel><OptionGrid options={['Office', 'Retail', 'Restaurant / Café', 'Medical', 'Gym', 'Warehouse', 'Other']} value={spaceType} onChange={setSpaceType} cols={3} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Approximate size</QuestionLabel><OptionGrid options={['Under 100m²', '100–300m²', '300–500m²', '500m²+']} value={approxSize} onChange={setApproxSize} cols={2} /></div>
            <div className="space-y-2"><QuestionLabel>Number of toilets / bathrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4+']} value={toiletsBathrooms} onChange={setToiletsBathrooms} cols={4} /></div>
            <div className="space-y-2"><QuestionLabel>Kitchen or break room?</QuestionLabel><YesNo value={kitchenBreakroom} onChange={setKitchenBreakroom} /></div>
            <div className="space-y-2"><QuestionLabel>Floor types</QuestionLabel><OptionGrid options={['Carpet', 'Hard floor', 'Both']} value={floorTypes} onChange={setFloorTypes} cols={3} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Operations') return (
      <>
        <SectionHeader icon="⚙️" label="Operations" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>After-hours access required?</QuestionLabel><YesNo value={afterHours} onChange={setAfterHours} /></div>
            <div className="space-y-2">
              <QuestionLabel>Security system or alarm?</QuestionLabel><YesNo value={securityAlarm} onChange={setSecurityAlarm} />
              {securityAlarm && <p className="text-xs mt-1" style={{ color: 'rgba(240,253,244,0.5)' }}>Instructions will be provided separately</p>}
            </div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Frequency needed</QuestionLabel><OptionGrid options={['Daily', 'Weekly', 'Fortnightly', 'Monthly', 'One-off']} value={frequency} onChange={setFrequency} cols={3} /></div>
            <div className="space-y-2"><QuestionLabel>Preferred time of day</QuestionLabel><OptionGrid options={['Morning', 'Midday', 'Afternoon', 'After hours', 'Flexible']} value={preferredTime} onChange={setPreferredTime} cols={3} /></div>
            <div className="space-y-2"><QuestionLabel>Parking available?</QuestionLabel><OptionGrid options={['Yes', 'No', 'Street']} value={parking} onChange={setParking} cols={3} /></div>
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
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                  <img src={p.url} className="w-full h-full object-cover" />
                  <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                </div>))}</div>}
              {photos.length < 3 && (<>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                <Button type="button" variant="outline" className="w-full h-12 rounded-xl gap-2 border-dashed border-[rgba(255,255,255,0.2)] bg-transparent text-[#F0FDF4] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F0FDF4]" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} {uploading ? 'Uploading...' : `Upload (${photos.length}/3)`}
                </Button></>)}
            </div>
            <div className="space-y-2"><QuestionLabel>Any areas requiring special attention? (optional)</QuestionLabel><Textarea value={specialAttention} onChange={e => setSpecialAttention(e.target.value)} placeholder="e.g. Reception area needs daily vacuuming..." className={darkTextareaClass} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="flex items-start gap-3">
            <Checkbox checked={tcsAccepted} onCheckedChange={(v) => setTcsAccepted(v === true)} id="tcs" className="mt-0.5 border-[rgba(255,255,255,0.3)] data-[state=checked]:bg-[#2E5D4E] data-[state=checked]:border-[#2E5D4E] data-[state=checked]:text-white" />
            <label htmlFor="tcs" className="text-sm" style={{ color: '#F0FDF4' }}>I agree to Brightly's{' '}<button type="button" onClick={() => setTermsOpen(true)} className="underline font-medium" style={{ color: '#86EFAC' }}>Terms & Conditions</button></label>
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
