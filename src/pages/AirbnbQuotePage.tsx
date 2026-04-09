import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const STORAGE_KEY = 'brightly_airbnb_quote';

const PROPERTY_TYPES = ['House', 'Apartment', 'Townhouse', 'Unit'];
const BEDROOM_OPTIONS = ['1', '2', '3', '4', '5+'];
const BATHROOM_OPTIONS = ['1', '2', '3', '4+'];
const PLATFORMS = ['Airbnb', 'Stayz', 'Booking.com', 'VRBO', 'Other'];
const PROPERTY_COUNTS = ['1', '2-3', '4-10', '10+'];

const PRICING_NO_LINEN: Record<string, [number, number] | null> = {
  '1-1': [135, 170], '2-1': [170, 205], '2-2': [205, 245],
  '3-2': [245, 280], '4-2': [280, 350], '4-3': [315, 390], '5-0': null,
};
const PRICING_LINEN: Record<string, [number, number] | null> = {
  '1-1': [175, 215], '2-1': [250, 285], '2-2': [290, 325],
  '3-2': [360, 395], '4-2': [435, 505], '4-3': [475, 545], '5-0': null,
};

const CONSUMABLES = [
  { key: 'amenities', icon: '🧴', label: 'Amenities Kit', desc: 'Shampoo, conditioner, body wash, soap bar', price: 6.5 },
  { key: 'tea_coffee', icon: '☕', label: 'Tea & Coffee Kit', desc: 'Tea, coffee, sugar, milk portions', price: 6.5 },
  { key: 'wash', icon: '🧺', label: 'Wash Kit', desc: 'Laundry powder, dishwasher tablets', price: 7.5 },
];

const BTN_YELLOW = { backgroundColor: '#FEDB00', color: '#0C463D' };

function PillButton({ selected, onClick, children, className = '' }: {
  selected: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn('rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition-all min-h-[56px]',
        selected ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-foreground hover:border-primary/40',
        className)}>
      {children}
    </button>
  );
}

function MultiPill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition-all min-h-[56px]',
        selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:border-primary/40')}>
      {children}
    </button>
  );
}

function getPriceKey(beds: string, baths: string): string {
  const b = parseInt(beds) || 1;
  if (b >= 5) return '5-0';
  const ba = parseInt(baths) || 1;
  return `${b}-${ba}`;
}

export default function AirbnbQuotePage() {
  const [step, setStep] = useState(0);
  const STEPS = ['Property', 'Add-ons', 'Your Details'];

  // Step 1
  const [propertyType, setPropertyType] = useState('Apartment');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [platforms, setPlatforms] = useState<string[]>(['Airbnb']);
  const [propCount, setPropCount] = useState('1');
  const [linen, setLinen] = useState(false);

  // Step 2
  const [consumables, setConsumables] = useState<Record<string, boolean>>({});

  // Step 3
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [suburb, setSuburb] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.propertyType) setPropertyType(d.propertyType);
        if (d.bedrooms) setBedrooms(d.bedrooms);
        if (d.bathrooms) setBathrooms(d.bathrooms);
        if (d.platforms) setPlatforms(d.platforms);
        if (d.propCount) setPropCount(d.propCount);
        if (d.linen !== undefined) setLinen(d.linen);
        if (d.consumables) setConsumables(d.consumables);
        if (d.fullName) setFullName(d.fullName);
        if (d.mobile) setMobile(d.mobile);
        if (d.email) setEmail(d.email);
        if (d.suburb) setSuburb(d.suburb);
      }
    } catch {}
  }, []);

  const saveToStorage = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        propertyType, bedrooms, bathrooms, platforms, propCount, linen, consumables, fullName, mobile, email, suburb,
      }));
    } catch {}
  }, [propertyType, bedrooms, bathrooms, platforms, propCount, linen, consumables, fullName, mobile, email, suburb]);

  useEffect(() => { saveToStorage(); }, [saveToStorage]);

  const priceKey = getPriceKey(bedrooms, bathrooms);
  const priceRange = linen ? PRICING_LINEN[priceKey] : PRICING_NO_LINEN[priceKey];
  const consumablesTotal = CONSUMABLES.reduce((sum, c) => sum + (consumables[c.key] ? c.price : 0), 0);
  const showVolumeDiscount = ['2-3', '4-10', '10+'].includes(propCount);
  const isHighVolume = ['4-10', '10+'].includes(propCount);

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return true;
    if (step === 2) return !!(fullName.trim() && mobile.trim() && email.trim() && suburb.trim());
    return true;
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !mobile.trim() || !email.trim() || !suburb.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const nameParts = fullName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      const selectedConsumables = CONSUMABLES.filter(c => consumables[c.key]).map(c => c.label);

      const formData = {
        property_type: propertyType, linen, platforms, property_count: propCount,
        consumables: selectedConsumables, consumables_total: consumablesTotal,
        volume_discount_eligible: showVolumeDiscount,
        high_volume: isHighVolume,
      };

      const { error } = await supabase.from('quote_requests').insert({
        first_name: firstName, last_name: lastName, phone: mobile, email, address: suburb,
        property_type: propertyType, clean_type: 'Airbnb / Short-Stay Turnover',
        bedrooms: parseInt(bedrooms) || 0, bathrooms: parseInt(bathrooms) || 0,
        status: 'form_submitted', form_submitted_at: new Date().toISOString(),
        tcs_accepted: true, tcs_accepted_at: new Date().toISOString(),
        form_data: formData,
      } as any);
      if (error) throw error;

      await supabase.functions.invoke('send-quote-notification', {
        body: { type: 'intake_submitted', client_phone: mobile, client_name: firstName, clean_type: 'Airbnb / Short-Stay Turnover', address: suburb },
      });

      // High-volume portfolio — create admin alert
      if (isHighVolume) {
        await (await import('@/lib/alerts')).createAlert({
          event_type: 'new_lead',
          title: `🏢 High-volume Airbnb enquiry — ${propCount} properties`,
          body: `${firstName} ${lastName} (${mobile}) — ${propCount} properties in ${suburb}. Call to set up custom plan.`,
          link: '/dashboard',
        });
      }

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
        <h1 className="text-2xl font-extrabold" style={{ color: '#F0FDF4' }}>
          {isHighVolume ? `Thanks ${submittedFirst}!` : `Thanks ${submittedFirst}!`}
        </h1>
        <p className="text-lg font-semibold mt-2" style={{ color: '#86EFAC' }}>
          {isHighVolume ? "We've received your enquiry." : "We've received your quote request."}
        </p>
        <p className="mt-4 max-w-sm" style={{ color: '#86EFAC' }}>
          {isHighVolume
            ? 'For portfolios of 4+ properties, a Brightly team member will call you to set up a custom cleaning plan and pricing.'
            : 'Our team will be in touch within 24 hours.'}
        </p>
        <p className="mt-6 font-bold" style={{ color: '#FEDB00' }}>Questions? Call Brendan on 0418 878 707</p>
        <div className="mt-8">
          <span className="text-2xl font-extrabold tracking-tight" style={{ color: '#F0FDF4', fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </span>
        </div>
        <Button className="mt-8 h-14 px-8 rounded-xl font-bold" style={BTN_YELLOW} onClick={() => window.location.href = '/'}>Back to Brightly</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      {/* Header */}
      <div className="bg-primary px-6 pt-8 pb-6 text-center">
        <h1 className="text-3xl font-extrabold text-primary-foreground tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h1>
        <Badge className="mt-2 bg-primary-foreground/10 text-primary-foreground border-0 text-xs">
          Gold Coast's #1 Short-Stay Cleaning Network
        </Badge>
        <h2 className="text-xl font-bold text-primary-foreground mt-3">Join the Brightly Network</h2>
        <p className="text-primary-foreground/70 text-sm mt-1">Set up your short-stay property in 2 minutes</p>
      </div>

      {/* Progress */}
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

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6 space-y-6 pb-48">
        {step === 0 && (
          <>
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

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Which platforms are you on?</h3>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map(p => (
                  <MultiPill key={p} selected={platforms.includes(p)} onClick={() => togglePlatform(p)}>{p}</MultiPill>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">How many properties do you manage?</h3>
              <div className="grid grid-cols-4 gap-2">
                {PROPERTY_COUNTS.map(c => (
                  <PillButton key={c} selected={propCount === c} onClick={() => setPropCount(c)}>{c}</PillButton>
                ))}
              </div>
              {showVolumeDiscount && !isHighVolume && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                  style={{ backgroundColor: '#FEDB00', color: '#0C463D' }}>
                  <span className="text-sm font-extrabold">🎉 Volume discount unlocked — 2+ properties</span>
                </div>
              )}
              {isHighVolume && (
                <div className="mt-3 rounded-xl border-2 border-primary p-4 text-center space-y-2"
                  style={{ background: 'rgba(12, 70, 61, 0.2)' }}>
                  <p className="text-base font-extrabold text-foreground">We'll call you to set up a custom plan</p>
                  <p className="text-sm text-muted-foreground">For portfolios of 4+ properties, we create a tailored pricing and scheduling package.</p>
                  <p className="text-sm font-bold text-primary">📞 0418 878 707</p>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Linen changing between guests?</h3>
              <div className="grid grid-cols-2 gap-2">
                <PillButton selected={!linen} onClick={() => setLinen(false)}>No linen</PillButton>
                <button type="button" onClick={() => setLinen(true)}
                  className={cn('rounded-xl border-2 px-4 py-3 text-left transition-all min-h-[56px]',
                    linen ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40')}>
                  <p className="text-sm font-semibold text-foreground">Yes — include linen</p>
                  <p className="text-xs text-muted-foreground">We wash, press and replace between every guest</p>
                </button>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold text-foreground">Consumable kits — per clean</h2>
              <p className="text-sm text-muted-foreground mt-1">We stock and replace these between every guest stay</p>
              <div className="space-y-3 mt-4">
                {CONSUMABLES.map(c => (
                  <button key={c.key} type="button" onClick={() => setConsumables(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
                    className={cn('w-full flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all min-h-[56px]',
                      consumables[c.key] ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40')}>
                    <span className="text-2xl mt-0.5">{c.icon}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground text-sm">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.desc}</p>
                    </div>
                    <span className="text-sm font-bold text-primary whitespace-nowrap">+${c.price.toFixed(2)}</span>
                    <div className={cn('w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0',
                      consumables[c.key] ? 'bg-primary border-primary' : 'border-border')}>
                      {consumables[c.key] && <CheckCircle2 className="w-4 h-4 text-primary-foreground" />}
                    </div>
                  </button>
                ))}
              </div>
              {consumablesTotal > 0 && (
                <p className="text-sm font-bold text-primary mt-3">Add-ons per clean: ${consumablesTotal.toFixed(2)}</p>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-xl font-extrabold text-foreground">Almost done — where should we send your quote?</h2>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Full Name *</label>
                <div className="relative">
                  <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" className="h-14 rounded-xl" />
                  {fullName.trim() && <CheckCircle2 className="text-brightly w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" />}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Mobile Number *</label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="04xx xxx xxx" type="tel" inputMode="tel" className="h-14 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Email Address *</label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" type="email" inputMode="email" className="h-14 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">Property Suburb *</label>
                <Input value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="e.g. Burleigh Heads" className="h-14 rounded-xl" />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>🔒</span>
              <span>No lock-in contracts. Cancel anytime. Photo verified after every clean.</span>
            </div>
          </>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-4 py-4 z-20">
        <div className="max-w-lg mx-auto space-y-3">
          {(step === 0 || step === 1) && priceRange && !isHighVolume && (
            <div className="bg-primary/10 rounded-xl px-4 py-3 text-center">
              <p className="text-sm font-bold text-primary">
                Estimated per turnover: ${(priceRange[0] + consumablesTotal).toFixed(0)}–${(priceRange[1] + consumablesTotal).toFixed(0)} incl. GST
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Volume discounts available for 2+ properties</p>
            </div>
          )}
          {(step === 0 || step === 1) && isHighVolume && (
            <div className="bg-primary/10 rounded-xl px-4 py-3 text-center">
              <p className="text-sm font-bold text-primary">Custom pricing — we'll call you</p>
            </div>
          )}
          {(step === 0 || step === 1) && !priceRange && parseInt(bedrooms) >= 5 && (
            <div className="bg-primary/10 rounded-xl px-4 py-3 text-center">
              <p className="text-sm font-bold text-primary">5+ bedrooms — call us for a quote</p>
            </div>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="outline" className="rounded-xl h-[60px] px-5 font-semibold" onClick={() => setStep(s => s - 1)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
            {step < 2 ? (
              <Button className="flex-1 rounded-xl h-[60px] font-bold text-base" style={BTN_YELLOW}
                onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button className="flex-1 rounded-xl h-[60px] font-bold text-base" style={BTN_YELLOW}
                onClick={handleSubmit} disabled={submitting || !canNext()}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Join the Network →
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
