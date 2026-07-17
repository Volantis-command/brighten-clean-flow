import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, ShieldCheck, Camera, Clock, ArrowRight } from 'lucide-react';
import {
  FormCard, SectionHeader, QuestionLabel, OptionGrid, YesNo, GreenInput,
} from '@/components/quote-intake/FormUI';
import { TermsModal } from '@/components/quote/TermsModal';

/* ── Brand tokens (match the intake forms) ── */
const BG = '#173A27';
const CARD = '#1F4A32';
const BORDER = 'rgba(255,255,255,0.10)';
const YELLOW = '#FEDB00';
const WHITE = '#FFFFFF';
const MUTED = 'rgba(255,255,255,0.55)';

type Freq = 'one-off' | 'weekly' | 'fortnightly' | 'monthly';
const FREQS: { key: Freq; label: string; sub: string }[] = [
  { key: 'one-off', label: 'One-off', sub: 'Single turnover' },
  { key: 'weekly', label: 'Weekly', sub: 'Every week' },
  { key: 'fortnightly', label: 'Fortnightly', sub: 'Every 2 weeks' },
  { key: 'monthly', label: 'Monthly', sub: 'Every month' },
];

const money = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function InstantQuotePage() {
  const [phase, setPhase] = useState<'configure' | 'book' | 'done'>('configure');
  const [termsOpen, setTermsOpen] = useState(false);

  // config
  const [propertyType, setPropertyType] = useState('Apartment');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [kitchens, setKitchens] = useState('1');
  const [livingAreas, setLivingAreas] = useState('1');
  const [balconies, setBalconies] = useState('0');
  const [sofaBeds, setSofaBeds] = useState('0');
  const [bedTypes, setBedTypes] = useState<Record<number, string>>({});
  const [linenRequired, setLinenRequired] = useState<boolean | null>(true);
  const [amenitiesKit, setAmenitiesKit] = useState(false);
  const [washKit, setWashKit] = useState(false);
  const [teaCoffeeKit, setTeaCoffeeKit] = useState(false);
  const [photoReport, setPhotoReport] = useState(false);
  const [frequency, setFrequency] = useState<Freq>('weekly');

  // price
  const [prices, setPrices] = useState<Record<string, number> | null>(null);
  const [estHours, setEstHours] = useState<number | null>(null);
  const [pricing, setPricing] = useState(false);

  // booking
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('11:00');
  const [tcsAccepted, setTcsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedPrice, setConfirmedPrice] = useState<number | null>(null);

  const bedroomCount = Math.min(parseInt(bedrooms) || 1, 5);

  const buildConfig = useCallback(() => {
    const types = Array.from({ length: bedroomCount }, (_, i) => bedTypes[i]).filter(Boolean);
    return {
      bedrooms: parseInt(bedrooms) || 0,
      bathrooms: parseInt(bathrooms) || 0,
      kitchens: parseInt(kitchens) || 1,
      livingAreas: parseInt(livingAreas) || 1,
      balconies: parseInt(balconies) || 0,
      sofaBeds: parseInt(sofaBeds) || 0,
      bedTypes: types,
      linenRequired: linenRequired !== false,
      consumables: { amenities_kit: amenitiesKit, wash_kit: washKit, tea_coffee_kit: teaCoffeeKit },
      includePhotoReport: photoReport,
      propertyType,
    };
  }, [bedroomCount, bedTypes, bedrooms, bathrooms, kitchens, livingAreas, balconies, sofaBeds,
      linenRequired, amenitiesKit, washKit, teaCoffeeKit, photoReport, propertyType]);

  // Debounced live re-price on any config change.
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    setPricing(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-instant-quote', { body: buildConfig() });
        if (error) throw error;
        setPrices(data.frequencies);
        setEstHours(data.estimatedHours);
      } catch {
        setPrices(null);
      } finally {
        setPricing(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [buildConfig]);

  const currentPrice = prices ? prices[frequency] : null;

  const submitBooking = async () => {
    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      toast.error('Name, mobile and property address are required'); return;
    }
    if (!tcsAccepted) { toast.error('Please agree to the Terms & Conditions'); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-instant-booking', {
        body: {
          ...buildConfig(),
          fullName: fullName.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(),
          preferredDate, preferredTime, frequency, tcsAccepted: true,
        },
      });
      if (error || data?.error) throw new Error(data?.error || 'Submit failed');
      setConfirmedPrice(data.totalIncGst ?? currentPrice);
      // Google Ads conversion (mirrors the existing quote flow)
      if (typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'conversion', {
          send_to: 'AW-18046329250/gQZiCLyh9qocEKLDlJ1D',
          value: data.totalIncGst ?? 150, currency: 'AUD',
        });
      }
      setPhase('done');
      window.scrollTo(0, 0);
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong — please call us on 0418 878 707');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Confirmation ── */
  if (phase === 'done') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: BG }}>
        <span className="text-2xl font-extrabold mb-10" style={{ color: WHITE }}>Brightly<span style={{ color: YELLOW }}>.</span></span>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(254,219,0,0.15)' }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: YELLOW }} />
        </div>
        <h1 className="text-3xl font-extrabold mb-3" style={{ color: WHITE }}>Booking request received</h1>
        <p className="max-w-sm text-base mb-6" style={{ color: MUTED }}>
          Your {frequency === 'one-off' ? 'turnover' : `${frequency} turnover`} is <b style={{ color: WHITE }}>{money(confirmedPrice)}</b> per clean.
          We're confirming your cleaner now and will text you on <b style={{ color: WHITE }}>{phone}</b> shortly to lock in the details.
        </p>
        <div className="rounded-2xl px-8 py-5 text-sm" style={{ background: CARD, border: `1px solid ${BORDER}`, color: MUTED }}>
          <p className="font-bold mb-0.5" style={{ color: WHITE }}>Need it sooner?</p>
          <p>Call us on <span style={{ color: YELLOW }}>0418 878 707</span></p>
        </div>
      </div>
    );
  }

  /* ── Configure + Book (single scroll, sticky price bar) ── */
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      {/* header */}
      <header className="px-6 pt-7 pb-2 max-w-2xl mx-auto w-full flex items-center justify-between">
        <span className="text-2xl font-extrabold tracking-tight" style={{ color: WHITE }}>Brightly<span style={{ color: YELLOW }}>.</span></span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Instant Quote</span>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 space-y-4 pb-40">
        <div className="px-1 pb-2">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: YELLOW }}>Airbnb Turnover · Instant Price</p>
          <h1 className="text-3xl font-extrabold leading-tight mb-1" style={{ color: WHITE }}>Get your exact price in 60 seconds</h1>
          <p className="text-base" style={{ color: MUTED }}>Tell us about your place — the price updates live. No waiting, no login.</p>
        </div>

        {/* trust row */}
        <div className="flex flex-wrap gap-2">
          {[{ i: ShieldCheck, t: 'Police-checked & insured' }, { i: Camera, t: 'Photo report every clean' }, { i: Clock, t: '24hr turnaround' }].map(({ i: Icon, t }) => (
            <div key={t} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.75)' }}>
              <Icon className="w-3.5 h-3.5" style={{ color: YELLOW }} /> {t}
            </div>
          ))}
        </div>

        {phase === 'configure' && (
          <>
            <SectionHeader icon="🏠" label="Your Property" />
            <FormCard>
              <div className="space-y-5">
                <div className="space-y-2"><QuestionLabel>Property type</QuestionLabel><OptionGrid options={['House', 'Apartment', 'Townhouse', 'Unit']} value={propertyType} onChange={setPropertyType} cols={4} /></div>
                <div className="space-y-2"><QuestionLabel>Bedrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4', '5+']} value={bedrooms} onChange={(v) => { setBedrooms(v); setBedTypes({}); }} /></div>
                <div className="space-y-2"><QuestionLabel>Bathrooms</QuestionLabel><OptionGrid options={['1', '2', '3', '4+']} value={bathrooms} onChange={setBathrooms} cols={4} /></div>
                <div className="space-y-2"><QuestionLabel>Kitchens</QuestionLabel><OptionGrid options={['1', '2', '3+']} value={kitchens} onChange={setKitchens} cols={3} /></div>
                <div className="space-y-2"><QuestionLabel>Living areas</QuestionLabel><OptionGrid options={['1', '2', '3+']} value={livingAreas} onChange={setLivingAreas} cols={3} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><QuestionLabel>Balconies</QuestionLabel><OptionGrid options={['0', '1', '2+']} value={balconies} onChange={setBalconies} cols={3} /></div>
                  <div className="space-y-2"><QuestionLabel>Sofa beds</QuestionLabel><OptionGrid options={['0', '1', '2+']} value={sofaBeds} onChange={setSofaBeds} cols={3} /></div>
                </div>
              </div>
            </FormCard>

            <SectionHeader icon="🛏️" label="Linen & Extras" />
            <FormCard>
              <div className="space-y-5">
                <div className="space-y-2"><QuestionLabel sub="We supply & launder hotel-grade linen">Linen change included?</QuestionLabel><YesNo value={linenRequired} onChange={setLinenRequired} /></div>
                {linenRequired && (
                  <div className="space-y-3">
                    <QuestionLabel sub="Pick the bed in each room (used for linen)">Bed configuration</QuestionLabel>
                    {Array.from({ length: bedroomCount }, (_, i) => (
                      <div key={i} className="space-y-2">
                        <p className="text-xs font-semibold" style={{ color: 'rgba(240,253,244,0.8)' }}>Bedroom {i + 1}</p>
                        <OptionGrid options={['King', 'Queen', 'King Single', 'Single']} value={bedTypes[i] || ''} onChange={(v) => setBedTypes(prev => ({ ...prev, [i]: v }))} cols={4} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormCard>

            <FormCard>
              <div className="space-y-4">
                <QuestionLabel sub="Optional — added to each clean">Consumable kits & reporting</QuestionLabel>
                {[
                  { label: 'Amenities kit — shampoo, soap, body wash', v: amenitiesKit, set: setAmenitiesKit },
                  { label: 'Wash kit — dishwasher, detergent, bin liners', v: washKit, set: setWashKit },
                  { label: 'Tea / coffee kit — tea, coffee, milk, sugar', v: teaCoffeeKit, set: setTeaCoffeeKit },
                  { label: 'Photo report — every room photographed', v: photoReport, set: setPhotoReport },
                ].map(({ label, v, set }) => (
                  <button key={label} type="button" onClick={() => set(!v)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all"
                    style={{ background: v ? 'rgba(254,219,0,0.12)' : 'rgba(0,0,0,0.2)', border: `1px solid ${v ? YELLOW : BORDER}`, color: WHITE }}>
                    <span className="w-5 h-5 rounded-md flex items-center justify-center flex-none"
                      style={{ background: v ? YELLOW : 'transparent', border: `1.5px solid ${v ? YELLOW : 'rgba(255,255,255,0.3)'}`, color: '#111' }}>
                      {v && '✓'}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </FormCard>

            <SectionHeader icon="🔁" label="How Often" />
            <FormCard>
              <div className="grid grid-cols-2 gap-3">
                {FREQS.map(f => {
                  const sel = frequency === f.key;
                  return (
                    <button key={f.key} type="button" onClick={() => setFrequency(f.key)}
                      className="rounded-xl px-4 py-3 text-left transition-all"
                      style={{ background: sel ? YELLOW : 'rgba(0,0,0,0.2)', border: `1.5px solid ${sel ? YELLOW : BORDER}`, color: sel ? '#111' : WHITE }}>
                      <p className="text-sm font-bold">{f.label}</p>
                      <p className="text-xs" style={{ color: sel ? 'rgba(0,0,0,0.6)' : MUTED }}>{f.sub}</p>
                      {prices && <p className="text-sm font-extrabold mt-1">{money(prices[f.key])}<span className="text-xs font-medium">/clean</span></p>}
                    </button>
                  );
                })}
              </div>
            </FormCard>
          </>
        )}

        {phase === 'book' && (
          <>
            <SectionHeader icon="📅" label="Book Your Clean" />
            <FormCard>
              <div className="space-y-5">
                <div className="space-y-2"><QuestionLabel>Full name *</QuestionLabel><GreenInput value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" /></div>
                <div className="space-y-2"><QuestionLabel>Mobile *</QuestionLabel><GreenInput value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="0412 345 678" /></div>
                <div className="space-y-2"><QuestionLabel>Email</QuestionLabel><GreenInput value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="jane@example.com" /></div>
                <div className="space-y-2"><QuestionLabel>Property address *</QuestionLabel><GreenInput value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Ocean Ave, Surfers Paradise QLD" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><QuestionLabel>{frequency === 'one-off' ? 'Preferred date' : 'First clean date'}</QuestionLabel><GreenInput value={preferredDate} onChange={e => setPreferredDate(e.target.value)} type="date" min={new Date().toISOString().split('T')[0]} /></div>
                  <div className="space-y-2"><QuestionLabel>Preferred time</QuestionLabel><GreenInput value={preferredTime} onChange={e => setPreferredTime(e.target.value)} type="time" /></div>
                </div>
                <label className="flex items-start gap-3 pt-1 cursor-pointer">
                  <input type="checkbox" checked={tcsAccepted} onChange={e => setTcsAccepted(e.target.checked)} className="mt-1 w-4 h-4 accent-[#FEDB00]" />
                  <span className="text-sm" style={{ color: WHITE }}>I agree to Brightly's{' '}
                    <button type="button" onClick={() => setTermsOpen(true)} className="underline font-medium" style={{ color: '#86EFAC' }}>Terms &amp; Conditions</button>
                  </span>
                </label>
              </div>
            </FormCard>
            <p className="text-center text-xs" style={{ color: MUTED }}>
              No payment now. We confirm your cleaner, then text you to lock it in.
            </p>
          </>
        )}
      </div>

      {/* Sticky price bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 px-5 py-4" style={{ background: 'rgba(10,20,15,0.92)', backdropFilter: 'blur(10px)', borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <div className="flex-none">
            <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: MUTED }}>
              {frequency === 'one-off' ? 'Per turnover' : `${frequency} · per clean`}
            </p>
            <p className="text-3xl font-extrabold leading-none flex items-center gap-2" style={{ color: WHITE }}>
              {pricing && !currentPrice ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: YELLOW }} /> : money(currentPrice)}
              <span className="text-xs font-medium" style={{ color: MUTED }}>inc GST</span>
            </p>
          </div>
          {phase === 'configure' ? (
            <button onClick={() => { setPhase('book'); window.scrollTo(0, 0); }} disabled={!currentPrice}
              className="flex-1 h-14 rounded-xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: YELLOW, color: '#111' }}>
              Book this clean <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex-1 flex gap-2">
              <button onClick={() => { setPhase('configure'); }} className="h-14 px-4 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${BORDER}`, color: WHITE }}>Edit</button>
              <button onClick={submitBooking} disabled={submitting}
                className="flex-1 h-14 rounded-xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: YELLOW, color: '#111' }}>
                {submitting && <Loader2 className="w-5 h-5 animate-spin" />} Confirm booking
              </button>
            </div>
          )}
        </div>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
