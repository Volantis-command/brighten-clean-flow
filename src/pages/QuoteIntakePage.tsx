import { useState } from 'react';
import { Sparkles, Home, SprayCan, Building2, BedDouble } from 'lucide-react';
import ResidentialForm from '@/components/quote-intake/ResidentialForm';
import AirbnbForm from '@/components/quote-intake/AirbnbForm';
import CommercialForm from '@/components/quote-intake/CommercialForm';

type CleanType = 'standard' | 'deep' | 'airbnb' | 'commercial' | null;

const OPTIONS = [
  { key: 'standard' as const, label: 'Standard House Clean', icon: Home, desc: 'Regular home cleaning — kitchens, bathrooms, bedrooms & living areas.' },
  { key: 'deep' as const, label: 'Deep Clean', icon: SprayCan, desc: 'Thorough top-to-bottom clean including ovens, fridges, windows & more.' },
  { key: 'airbnb' as const, label: 'Airbnb / Short-Stay Turnover', icon: BedDouble, desc: 'Guest-ready turnovers with linen, consumables & hosting touches.' },
  { key: 'commercial' as const, label: 'Commercial Clean', icon: Building2, desc: 'Offices, retail, medical, hospitality & industrial spaces.' },
];

function Welcome({ onSelect }: { onSelect: (t: CleanType) => void }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary px-6 pt-12 pb-10 text-center">
        <h1 className="text-3xl md:text-4xl font-extrabold text-primary-foreground tracking-tight">
          Get Your Brightly Quote <Sparkles className="inline w-7 h-7 mb-1" />
        </h1>
        <p className="text-primary-foreground/70 mt-3 text-sm md:text-base max-w-md mx-auto">
          Tell us about your space and we'll have a quote to you within 24 hours.
        </p>
      </div>
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-8 space-y-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">What type of clean are you after?</p>
        {OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className="w-full flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary hover:shadow-md transition-all active:scale-[0.98]"
          >
            <div className="rounded-xl bg-primary/10 p-3 shrink-0">
              <opt.icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground">{opt.label}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
        <p className="text-center text-xs text-muted-foreground pt-4">📞 0418 878 707 · brightly.cleaning</p>
      </div>
    </div>
  );
}

function Confirmation() {
  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-primary-foreground/10 backdrop-blur rounded-full p-6 mb-6">
        <Sparkles className="w-12 h-12 text-accent" />
      </div>
      <h1 className="text-3xl font-extrabold text-primary-foreground">You're all set!</h1>
      <p className="text-primary-foreground/70 mt-3 max-w-sm">
        We've received your request and will have a quote to you within 24 hours. Keep an eye on your phone for our SMS. 😊
      </p>
      <p className="text-primary-foreground/50 text-sm mt-8">📞 0418 878 707</p>
      <p className="text-primary-foreground/40 text-xs mt-1">Brightly Cleaning 🌿</p>
    </div>
  );
}

export default function QuoteIntakePage() {
  const [selectedType, setSelectedType] = useState<CleanType>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <Confirmation />;
  if (!selectedType) return <Welcome onSelect={setSelectedType} />;

  if (selectedType === 'airbnb') return <AirbnbForm onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
  if (selectedType === 'commercial') return <CommercialForm onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
  return <ResidentialForm isDeepClean={selectedType === 'deep'} onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
}
