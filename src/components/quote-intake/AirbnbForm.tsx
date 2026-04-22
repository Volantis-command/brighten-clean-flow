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

const CONSUMABLE_KITS_CLIENT = [
  { key: 'amenities_kit', name: 'Amenities Kit', price: '$6.50 inc GST', desc: '1× Shampoo, 1× Conditioner, 1× Body Wash, 1× Hand Soap' },
  { key: 'wash_kit', name: 'Wash Kit', price: '$7.50 inc GST', desc: 'Dishwasher powder, liquid, detergent, scourer, bin liners' },
  { key: 'tea_coffee_kit', name: 'Tea/Coffee Kit', price: '$6.50 inc GST', desc: 'Tea, Coffee, Milk & Sugar' },
];

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
  const [kitchens, setKitchens] = useState('1');
  const [livingAreas, setLivingAreas] = useState('1');
  const [balconies, setBalconies] = useState('0');
  const [sofaBeds, setSofaBeds] = useState('0');
  const [outdoorAreas, setOutdoorAreas] = useState<boolean | null>(null);

  const [linenChange, setLinenChange] = useState<boolean | null>(null);
  const [amenitiesKit, setAmenitiesKit] = useState<boolean | null>(null);
  const [washKit, setWashKit] = useState<boolean | null>(null);
  const [teaCoffeeKit, setTeaCoffeeKit] = useState<boolean | null>(null);
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

  const STEPS = ['Property', 'Hosting Details', 'Access', 'Final Details', 'Contact'];
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
    if (STEPS[step] === 'Property') return !!address.trim();
    if (STEPS[step] === 'Contact') return !!(fullName.trim() && mobile.trim() && email.trim());
    return true;
  };

  const handleSubmit = async () => {
    if (!tcsAccepted) { toast.error('Please agree to the Terms & Conditions'); return; }
    if (!fullName.trim() || !mobile.trim() || !email.trim()) {
      toast.error('Name, mobile and email are required');
      setStep(STEPS.indexOf('Contact'));
      return;
    }
    if (!address.trim()) { toast.error('Property address is required'); setStep(STEPS.indexOf('Property')); return; }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      const bedroomCount = parseInt(bedrooms) || 1;
      const bedConfigStr = Array.from({ length: bedroomCount }, (_, i) => `Bedroom ${i + 1}: ${bedTypes[i] || 'Not specified'}`).join(', ');
      const formData = {
        bed_config: bedConfigStr,
        bed_types: bedTypes,
        kitchens: parseInt(kitchens) || 1,
        living_areas: parseInt(livingAreas) || 1,
        balconies: parseInt(balconies) || 0,
        sofa_beds: parseInt(sofaBeds) || 0,
        outdoor_areas: outdoorAreas === true,
        linen_change: linenChange,
        amenities_kit: amenitiesKit === true,
        wash_kit: washKit === true,
        tea_coffee_kit: teaCoffeeKit === true,
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
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(), form_data: formData,
      } as any);
      if (error) throw error;

      // Create / reuse a client profile + property + link them so the client
      // portal immediately shows the property they just registered. Matches
      // what ResidentialForm and CommercialForm do — previously missing from
      // AirbnbForm, which is why Airbnb clients landed in the system with
      // "No properties yet". (Brendan flagged 2026-04-22.) Non-blocking.
      try {
        await supabase.functions.invoke('link-intake-to-profile', {
          body: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName.trim(),
            phone: mobile,
            email,
            property_address: address,
            property_type: propertyType,
            bedrooms: parseInt(bedrooms) || null,
            bathrooms: parseInt(bathrooms) || null,
            clean_type: 'Airbnb / Short-Stay Turnover',
            // Property details so the Passport tab lands populated
            access_method: accessMethod || null,
            access_notes: accessInstructions || null,
            parking_instructions: parking || null,
            checkin_time: checkinTime || null,
            checkout_time: checkoutTime || null,
            host_preferences: hostingNotes || null,
          },
        });
      } catch (linkErr) {
        console.error('[airbnb-intake] link-intake-to-profile failed (non-blocking):', linkErr);
      }

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
            <div className="space-y-2"><QuestionLabel>Full Name *</QuestionLabel><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Mobile Number *</QuestionLabel><Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="0412 345 678" type="tel" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Email Address *</QuestionLabel><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" className={darkInputClass} /></div>
          </div>
        </FormCard>
      </>
    );

    if (s === 'Property') return (
      <>
        <SectionHeader icon="🏠" label="Property Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Property Address *</QuestionLabel><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St, Richmond VIC 3121" className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Property Type</QuestionLabel><OptionGrid options={['House', 'Apartment', 'Townhouse', 'Unit']} value={propertyType} onChange={setPropertyType} cols={4} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Bedrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4', '5+']} value={bedrooms} onChange={(v) => { setBedrooms(v); setBedTypes({}); }} /></div>
            <div className="space-y-2"><QuestionLabel>Bathrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4+']} value={bathrooms} onChange={setBathrooms} cols={4} /></div>
            <div className="space-y-2"><QuestionLabel>Kitchens</QuestionLabel><OptionGrid options={['1', '2', '3+']} value={kitchens} onChange={setKitchens} cols={3} /></div>
            <div className="space-y-2"><QuestionLabel>Living Areas</QuestionLabel><OptionGrid options={['1', '2', '3+']} value={livingAreas} onChange={setLivingAreas} cols={3} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Balconies</QuestionLabel><OptionGrid options={['0', '1', '2+']} value={balconies} onChange={setBalconies} cols={3} /></div>
            <div className="space-y-2"><QuestionLabel>Sofa Beds</QuestionLabel><OptionGrid options={['0', '1', '2+']} value={sofaBeds} onChange={setSofaBeds} cols={3} /></div>
            <div className="space-y-2"><QuestionLabel>Outdoor areas to clean?</QuestionLabel><YesNo value={outdoorAreas} onChange={setOutdoorAreas} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="space-y-5">
            <QuestionLabel sub="Select the bed type for each bedroom">Bed configuration</QuestionLabel>
            {Array.from({ length: Math.min(parseInt(bedrooms) || 1, 5) }, (_, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-semibold" style={{ color: '#F0FDF4' }}>Bedroom {i + 1}</p>
                <OptionGrid options={['King', 'Queen', 'Double', 'King Single', 'Single', 'Bunk Beds']} value={bedTypes[i] || ''} onChange={(v) => setBedTypes(prev => ({ ...prev, [i]: v }))} cols={3} />
              </div>
            ))}
          </div>
        </FormCard>
      </>
    );

    if (s === 'Hosting Details') return (
      <>
        <SectionHeader icon="🛏️" label="Hosting Details" />
        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel sub="Brightly supplies all linen">Is linen required?</QuestionLabel><YesNo value={linenChange} onChange={setLinenChange} /></div>
          </div>
        </FormCard>

        <SectionHeader icon="🧴" label="Consumable Kits" />
        {CONSUMABLE_KITS_CLIENT.map(kit => (
          <FormCard key={kit.key}>
            <div className="space-y-3">
              <QuestionLabel sub={kit.desc}>
                {kit.name} — {kit.price}
              </QuestionLabel>
              <p className="text-sm" style={{ color: 'rgba(240,253,244,0.5)' }}>Would you like this included?</p>
              <YesNo
                value={kit.key === 'amenities_kit' ? amenitiesKit : kit.key === 'wash_kit' ? washKit : teaCoffeeKit}
                onChange={(v) => {
                  if (kit.key === 'amenities_kit') setAmenitiesKit(v);
                  else if (kit.key === 'wash_kit') setWashKit(v);
                  else setTeaCoffeeKit(v);
                }}
              />
            </div>
          </FormCard>
        ))}

        <FormCard>
          <div className="space-y-5">
            <div className="space-y-2"><QuestionLabel>Typical guest checkout time</QuestionLabel><Input type="time" value={checkoutTime} onChange={e => setCheckoutTime(e.target.value)} className={darkInputClass} /></div>
            <div className="space-y-2"><QuestionLabel>Typical next check-in time</QuestionLabel><Input type="time" value={checkinTime} onChange={e => setCheckinTime(e.target.value)} className={darkInputClass} /></div>
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
            <div className="space-y-2"><QuestionLabel sub="Code, location, etc.">Access instructions</QuestionLabel><Input value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)} placeholder="e.g. Lockbox code 5678, behind the mailbox" className={darkInputClass} /></div>
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
            <div className="space-y-2"><QuestionLabel>Any special hosting notes for our cleaners? (optional)</QuestionLabel><Textarea value={hostingNotes} onChange={e => setHostingNotes(e.target.value)} placeholder="e.g. Guest left late, priority areas..." className={darkTextareaClass} /></div>
          </div>
        </FormCard>
        <FormCard>
          <div className="flex items-start gap-3">
            <Checkbox checked={tcsAccepted} onCheckedChange={(v) => setTcsAccepted(v === true)} id="tcs" className="mt-0.5 border-[rgba(255,255,255,0.3)] data-[state=checked]:bg-[#3A7560] data-[state=checked]:border-[#3A7560] data-[state=checked]:text-white" />
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
