import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, CalendarIcon, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const STORAGE_KEY = 'brightly_residential_quote';

type CleanType = 'house' | 'deep' | 'eol' | null;

const CLEAN_TYPES = [
  { key: 'house' as const, icon: '🏠', label: 'House Clean', desc: 'Regular maintenance — spotless finish' },
  { key: 'deep' as const, icon: '✨', label: 'Deep Clean', desc: 'Top-to-bottom thorough clean' },
  { key: 'eol' as const, icon: '🔑', label: 'End of Lease', desc: 'Bond clean — move-out ready' },
];

const PROPERTY_TYPES = ['House', 'Apartment', 'Townhouse', 'Unit'];
const BEDROOM_OPTIONS = ['1', '2', '3', '4', '5+'];
const BATHROOM_OPTIONS = ['1', '2', '3', '4+'];

const EXTRAS = [
  { key: 'oven', icon: '🔥', label: 'Inside Oven', price: 40 },
  { key: 'fridge', icon: '❄️', label: 'Inside Fridge', price: 35 },
  { key: 'windows', icon: '🪟', label: 'Inside Windows', price: 25 },
  { key: 'garage', icon: '🚗', label: 'Garage', price: 60 },
  { key: 'balcony', icon: '🌿', label: 'Balcony / Outdoor Area', price: 40 },
];

const TIME_PREFS = ['Morning (7am–12pm)', 'Afternoon (12pm–5pm)', 'Either'];

type PriceRange = [number, number] | null;

const PRICING: Record<string, Record<string, Record<string, PriceRange>>> = {
  house: {
    no: {
      '1-1': [110, 140], '2-1': [130, 165], '2-2': [140, 210],
      '3-2': [185, 240], '4-2': [220, 280], '4-3': [255, 320], '5-0': null,
    },
    yes: {
      '1-1': [175, 215], '2-1': [250, 285], '2-2': [290, 325],
      '3-2': [360, 395], '4-2': [435, 505], '4-3': [475, 545], '5-0': null,
    },
  },
  deep: {
    no: {
      '1-1': [190, 245], '2-1': [245, 295], '2-2': [295, 350],
      '3-2': [350, 405], '4-2': [405, 515], '4-3': [460, 570], '5-0': null,
    },
    yes: {
      '1-1': [230, 285], '2-1': [320, 375], '2-2': [380, 435],
      '3-2': [470, 525], '4-2': [560, 670], '4-3': [620, 730], '5-0': null,
    },
  },
  eol: {
    no: {
      '1-1': [220, 285], '2-1': [285, 350], '2-2': [350, 415],
      '3-2': [415, 485], '4-2': [485, 615], '4-3': [550, 680], '5-0': null,
    },
    yes: {
      '1-1': [220, 285], '2-1': [285, 350], '2-2': [350, 415],
      '3-2': [415, 485], '4-2': [485, 615], '4-3': [550, 680], '5-0': null,
    },
  },
};

function getPriceKey(beds: string, baths: string): string {
  const b = parseInt(beds) || 1;
  const ba = parseInt(baths) || 1;
  if (b >= 5) return '5-0';
  return `${b}-${ba}`;
}

function getPrice(cleanType: CleanType, linen: boolean, beds: string, baths: string): PriceRange {
  if (!cleanType) return null;
  const key = getPriceKey(beds, baths);
  const linenKey = (cleanType === 'eol' ? 'no' : linen ? 'yes' : 'no');
  const matrix = PRICING[cleanType]?.[linenKey];
  if (!matrix) return null;
  if (matrix[key] !== undefined) return matrix[key];
  return null;
}

const BTN_YELLOW = { backgroundColor: '#FEDB00', color: '#0C463D' };

function PillButton({ selected, onClick, children, className = '' }: {
  selected: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition-all min-h-[56px]',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-card text-foreground hover:border-primary/40',
        className
      )}>
      {children}
    </button>
  );
}

export default function ResidentialQuotePage() {
  const [step, setStep] = useState(0);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const STEPS = ['Clean Type', 'Extras', 'Your Details', 'Review'];

  // Step 1
  const [cleanType, setCleanType] = useState<CleanType>(null);
  const [propertyType, setPropertyType] = useState('House');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [linen, setLinen] = useState(false);

  // Step 2
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const [asap, setAsap] = useState(true);
  const [date, setDate] = useState<Date>();
  const [timePref, setTimePref] = useState('Either');
  const [notes, setNotes] = useState('');

  // Step 3
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [accessMethod, setAccessMethod] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [parking, setParking] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.cleanType) setCleanType(d.cleanType);
        if (d.propertyType) setPropertyType(d.propertyType);
        if (d.bedrooms) setBedrooms(d.bedrooms);
        if (d.bathrooms) setBathrooms(d.bathrooms);
        if (d.linen !== undefined) setLinen(d.linen);
        if (d.extras) setExtras(d.extras);
        if (d.asap !== undefined) setAsap(d.asap);
        if (d.timePref) setTimePref(d.timePref);
        if (d.notes) setNotes(d.notes);
        if (d.fullName) setFullName(d.fullName);
        if (d.mobile) setMobile(d.mobile);
        if (d.email) setEmail(d.email);
        if (d.address) setAddress(d.address);
        if (d.accessMethod) setAccessMethod(d.accessMethod);
        if (d.accessInstructions) setAccessInstructions(d.accessInstructions);
        if (d.parking) setParking(d.parking);
      }
    } catch {}
  }, []);

  const saveToStorage = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cleanType, propertyType, bedrooms, bathrooms, linen, extras, asap, timePref, notes,
        fullName, mobile, email, address, accessMethod, accessInstructions, parking,
      }));
    } catch {}
  }, [cleanType, propertyType, bedrooms, bathrooms, linen, extras, asap, timePref, notes, fullName, mobile, email, address, accessMethod, accessInstructions, parking]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  const priceRange = getPrice(cleanType, linen, bedrooms, bathrooms);
  const extrasTotal = EXTRAS.reduce((sum, e) => sum + (extras[e.key] ? e.price : 0), 0);

  const toggleExtra = (key: string) => setExtras(prev => ({ ...prev, [key]: !prev[key] }));

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isMobileValid = /^04\d{8}$/.test(mobile.replace(/\s/g, ''));

  const canNext = () => {
    if (step === 0) return !!cleanType;
    if (step === 1) return true;
    if (step === 2) return !!(fullName.trim() && mobile.trim() && email.trim() && address.trim());
    if (step === 3) return !!(fullName.trim() && mobile.trim() && email.trim() && address.trim());
    return true;
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !mobile.trim() || !email.trim() || !address.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      const cleanTypeLabel = cleanType === 'house' ? 'Standard Clean' : cleanType === 'deep' ? 'Deep Clean' : 'Bond / End of Lease Clean';
      const selectedExtras = EXTRAS.filter(e => extras[e.key]).map(e => e.label);

      const formData = {
        property_type: propertyType, linen, extras: selectedExtras, extras_total: extrasTotal,
        asap, preferred_date: date ? format(date, 'yyyy-MM-dd') : null, time_preference: timePref,
        notes, price_estimate: priceRange ? `$${priceRange[0]}–$${priceRange[1]}` : 'Call us',
        access_method: accessMethod, access_instructions: accessInstructions, parking,
      };

      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName, last_name: lastName, phone: mobile, email, address,
        property_type: propertyType, clean_type: cleanTypeLabel,
        bedrooms: parseInt(bedrooms) || 0, bathrooms: parseInt(bathrooms) || 0,
        status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(),
        form_data: formData,
      } as any);
      if (error) throw error;

      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: mobile, client_name: firstName, clean_type: cleanTypeLabel, address },
      });

      localStorage.removeItem(STORAGE_KEY);
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const submittedFirst = fullName.trim().split(/\s+/)[0] || 'there';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#0C463D' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-[scale-in_0.4s_ease-out]" style={{ background: 'rgba(254,219,0,0.15)' }}>
          <CheckCircle2 className="w-14 h-14" style={{ color: '#2E5D4E' }} />
        </div>
        <h1 className="text-2xl font-extrabold" style={{ color: '#F0FDF4' }}>Thanks {submittedFirst}!</h1>
        <p className="text-lg font-semibold mt-2" style={{ color: '#86EFAC' }}>We've received your quote request.</p>
        <p className="mt-4 max-w-sm" style={{ color: '#86EFAC' }}>Our team will be in touch within 24 hours.</p>
        <p className="mt-6 font-bold" style={{ color: '#FEDB00' }}>Questions? Call Brendan on 0418 878 707</p>
        <div className="mt-8">
          <span className="text-2xl font-extrabold tracking-tight" style={{ color: '#F0FDF4', fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </span>
        </div>
        <Button className="mt-8 h-14 px-8 rounded-xl font-bold" style={BTN_YELLOW} onClick={() => window.location.href = '/'}>
          Back to Brightly
        </Button>
      </div>
    );
  }

  const cleanTypeLabel = cleanType === 'house' ? 'House Clean' : cleanType === 'deep' ? 'Deep Clean' : cleanType === 'eol' ? 'End of Lease' : '';
  const selectedExtras = EXTRAS.filter(e => extras[e.key]);

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      {/* Progress bar */}
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto">
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-2 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
          <div className="flex justify-between mt-2">
            {STEPS.map((s, i) => (
              <span key={s} className={cn('text-xs font-semibold', i <= step ? 'text-primary' : 'text-muted-foreground')}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-6 pb-48">
        {/* STEP 1 — Clean Type + Property */}
        {step === 0 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold text-foreground">What type of clean?</h2>
              <div className="space-y-3 mt-4">
                {CLEAN_TYPES.map(ct => (
                  <button key={ct.key} onClick={() => setCleanType(ct.key)} type="button"
                    className={cn(
                      'w-full flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all min-h-[56px]',
                      cleanType === ct.key
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/40'
                    )}>
                    <span className="text-2xl">{ct.icon}</span>
                    <div>
                      <p className="font-bold text-foreground">{ct.label}</p>
                      <p className="text-sm text-muted-foreground">{ct.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Property type</h3>
              <div className="grid grid-cols-2 gap-2">
                {PROPERTY_TYPES.map(pt => (
                  <PillButton key={pt} selected={propertyType === pt} onClick={() => setPropertyType(pt)}>{pt}</PillButton>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Bedrooms</h3>
              <div className="flex gap-2">
                {BEDROOM_OPTIONS.map(b => (
                  <PillButton key={b} selected={bedrooms === b} onClick={() => setBedrooms(b)} className="flex-1">{b}</PillButton>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Bathrooms</h3>
              <div className="flex gap-2">
                {BATHROOM_OPTIONS.map(b => (
                  <PillButton key={b} selected={bathrooms === b} onClick={() => setBathrooms(b)} className="flex-1">{b}</PillButton>
                ))}
              </div>
            </div>


          </>
        )}

        {/* STEP 2 — Extras + Timing */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold text-foreground">Any extras?</h2>
              <p className="text-sm text-muted-foreground mt-1">Add on what you need</p>
              <div className="space-y-2 mt-4">
                {EXTRAS.map(e => (
                  <button key={e.key} type="button" onClick={() => toggleExtra(e.key)}
                    className={cn(
                      'w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all min-h-[56px]',
                      extras[e.key] ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'
                    )}>
                    <span className="text-xl">{e.icon}</span>
                    <span className="flex-1 font-semibold text-foreground text-sm">{e.label}</span>
                    <span className="text-sm font-bold text-primary">+${e.price}</span>
                    <div className={cn(
                      'w-6 h-6 rounded-md border-2 flex items-center justify-center',
                      extras[e.key] ? 'bg-primary border-primary' : 'border-border'
                    )}>
                      {extras[e.key] && <CheckCircle2 className="w-4 h-4 text-primary-foreground" />}
                    </div>
                  </button>
                ))}
              </div>
              {extrasTotal > 0 && (
                <p className="text-sm font-bold text-primary mt-3">Extras selected: ${extrasTotal}</p>
              )}
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">When do you need it?</h3>
              <div className="space-y-3">
                <PillButton selected={asap} onClick={() => { setAsap(true); setDate(undefined); }} className="w-full">
                  As Soon As Possible
                </PillButton>
                <div className="text-center text-xs text-muted-foreground font-semibold">OR</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" onClick={() => setAsap(false)}
                      className={cn('w-full h-14 rounded-xl justify-start text-left font-normal',
                        !asap && date ? 'border-primary' : '', !date && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, 'EEEE, d MMMM yyyy') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setAsap(false); }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Time preference</h3>
              <div className="grid grid-cols-3 gap-2">
                {TIME_PREFS.map(t => (
                  <PillButton key={t} selected={timePref === t} onClick={() => setTimePref(t)} className="text-xs">
                    {t}
                  </PillButton>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Anything we should know?</h3>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={500}
                placeholder="Pets, special requests, areas to skip…" className="rounded-xl" />
              <p className="text-xs text-muted-foreground text-right mt-1">{notes.length}/500</p>
            </div>
          </>
        )}

        {/* STEP 3 — Your Details + Access */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-extrabold text-foreground">Almost done — your details & access</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Full Name *</label>
                <div className="relative">
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith"
                    className={cn('h-14 rounded-xl', fullName.trim() ? 'border-brightly-light' : '')} />
                  {fullName.trim() && <CheckCircle2 className="text-brightly w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Mobile Number *</label>
                <div className="relative">
                  <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="04xx xxx xxx" type="tel" inputMode="tel"
                    className={cn('h-14 rounded-xl', mobile.trim() ? (isMobileValid ? 'border-brightly-light' : 'border-destructive') : '')} />
                  {mobile.trim() && isMobileValid && <CheckCircle2 className="text-brightly w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
                {mobile.trim() && !isMobileValid && <p className="text-destructive text-xs">Enter a valid AU mobile (04xx xxx xxx)</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Email Address *</label>
                <div className="relative">
                  <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" inputMode="email"
                    className={cn('h-14 rounded-xl', email.trim() ? (isEmailValid ? 'border-brightly-light' : 'border-destructive') : '')} />
                  {email.trim() && isEmailValid && <CheckCircle2 className="text-brightly w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
                {email.trim() && !isEmailValid && <p className="text-destructive text-xs">Enter a valid email address</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Property Address *</label>
                <div className="relative">
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Smith St, Burleigh Heads QLD"
                    className={cn('h-14 rounded-xl', address.trim() ? 'border-brightly-light' : '')} />
                  {address.trim() && <CheckCircle2 className="text-brightly w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
              </div>
            </div>

            <div className="space-y-4 mt-2">
              <h3 className="text-base font-bold text-foreground">Access & Parking</h3>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Access method</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Someone home', 'Key provided', 'Lockbox', 'Other'].map(m => (
                    <PillButton key={m} selected={accessMethod === m} onClick={() => setAccessMethod(m)}>{m}</PillButton>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Access instructions</label>
                <Input value={accessInstructions} onChange={e => setAccessInstructions(e.target.value)}
                  placeholder="e.g. Lockbox code 1234, side gate" className="h-14 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Parking</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Driveway', 'Street parking', 'No parking nearby', 'Other'].map(p => (
                    <PillButton key={p} selected={parking === p} onClick={() => setParking(p)}>{p}</PillButton>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              By submitting you agree to our <a href="#" className="underline text-primary">Terms & Conditions</a> and <a href="#" className="underline text-primary">Privacy Policy</a>
            </p>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>🔒</span>
              <span>Your details are safe. We'll never share your information.</span>
            </div>
          </>
        )}

        {/* STEP 4 — Review */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-extrabold text-foreground">Review your quote request</h2>

            <div className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Clean type</span>
                <span className="text-sm font-bold text-foreground">{cleanTypeLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Property</span>
                <span className="text-sm font-bold text-foreground">{propertyType} · {bedrooms} bed · {bathrooms} bath</span>
              </div>
              {linen && cleanType !== 'eol' && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Linen</span>
                  <span className="text-sm font-bold text-foreground">Included</span>
                </div>
              )}
              {selectedExtras.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Extras</span>
                  <span className="text-sm font-bold text-foreground">{selectedExtras.map(e => e.label).join(', ')} (+${extrasTotal})</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">When</span>
                <span className="text-sm font-bold text-foreground">{asap ? 'ASAP' : date ? format(date, 'd MMM yyyy') : 'Flexible'} · {timePref}</span>
              </div>
              {priceRange && (
                <div className="flex justify-between border-t border-border pt-3 mt-3">
                  <span className="text-sm font-bold text-foreground">Estimated quote</span>
                  <span className="text-sm font-extrabold text-primary">${priceRange[0] + extrasTotal}–${priceRange[1] + extrasTotal} incl. GST</span>
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-5 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-bold text-foreground">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Mobile</span>
                <span className="text-sm font-bold text-foreground">{mobile}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-bold text-foreground">{email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Address</span>
                <span className="text-sm font-bold text-foreground truncate max-w-[200px]">{address}</span>
              </div>
              {accessMethod && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Access</span>
                  <span className="text-sm font-bold text-foreground">{accessMethod}</span>
                </div>
              )}
              {parking && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Parking</span>
                  <span className="text-sm font-bold text-foreground">{parking}</span>
                </div>
              )}
            </div>

            {notes && (
              <div className="bg-card rounded-xl border border-border p-5">
                <p className="text-sm text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground">{notes}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-4 py-4 z-20">
        <div className="max-w-lg mx-auto space-y-3">
          {/* Price badge — total only, includes extras */}
          {(step === 0 || step === 1) && priceRange && (
            <div className="bg-primary/10 rounded-xl px-4 py-3 text-center">
              <p className="text-sm font-bold text-primary">
                Estimated quote: ${priceRange[0] + extrasTotal}–${priceRange[1] + extrasTotal} incl. GST
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Confirmed within 24 hours</p>
            </div>
          )}
          {(step === 0 || step === 1) && !priceRange && cleanType && parseInt(bedrooms) >= 5 && (
            <div className="bg-primary/10 rounded-xl px-4 py-3 text-center">
              <p className="text-sm font-bold text-primary">5+ bedrooms — call us for a quote</p>
            </div>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="outline" className="rounded-xl h-[60px] px-5 font-semibold" onClick={() => { setStep(s => s - 1); scrollToTop(); }}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
            {step < 3 ? (
              <Button className="flex-1 rounded-xl h-[60px] font-bold text-base" style={BTN_YELLOW}
                onClick={() => { setStep(s => s + 1); scrollToTop(); }} disabled={!canNext()}>
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button className="flex-1 rounded-xl h-[60px] font-bold text-base" style={BTN_YELLOW}
                onClick={handleSubmit} disabled={submitting || !canNext()}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Request My Quote →
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
