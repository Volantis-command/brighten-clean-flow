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
    <div className="min-h-screen flex flex-col" style={{ background: '#0A0F0E' }}>
      <div className="px-6 pt-12 pb-10 text-center" style={{ background: '#2E5D4E' }}>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
          Get Your Brightly Quote <Sparkles className="inline w-7 h-7 mb-1" />
        </h1>
        <p className="text-white/70 mt-3 text-sm md:text-base max-w-md mx-auto">
          Tell us about your space and we'll have a quote to you within 24 hours.
        </p>
      </div>
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-8 space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(240,253,244,0.5)' }}>What type of clean are you after?</p>
        {OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            className="w-full flex items-start gap-4 rounded-2xl p-5 text-left shadow-sm transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div className="rounded-xl p-3 shrink-0" style={{ background: 'rgba(46,93,78,0.2)' }}>
              <opt.icon className="w-6 h-6" style={{ color: '#86EFAC' }} />
            </div>
            <div>
              <p className="font-bold" style={{ color: '#F0FDF4' }}>{opt.label}</p>
              <p className="text-sm mt-0.5" style={{ color: 'rgba(240,253,244,0.5)' }}>{opt.desc}</p>
            </div>
          </button>
        ))}
        <p className="text-center text-xs pt-4" style={{ color: 'rgba(255,255,255,0.3)' }}>📞 0418 878 707 · brightly.cleaning</p>
      </div>
    </div>
  );
}

function Confirmation() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#0A0F0E' }}>
      <div className="rounded-full p-6 mb-6" style={{ background: 'rgba(46,93,78,0.2)' }}>
        <Sparkles className="w-12 h-12" style={{ color: '#86EFAC' }} />
      </div>
      <h1 className="text-3xl font-extrabold" style={{ color: '#F0FDF4' }}>You're all set!</h1>
      <p className="mt-3 max-w-sm" style={{ color: 'rgba(240,253,244,0.6)' }}>
        We've received your request and will have a quote to you within 24 hours. Keep an eye on your phone for our SMS. 😊
      </p>
      <p className="text-sm mt-8" style={{ color: 'rgba(240,253,244,0.4)' }}>📞 0418 878 707</p>
      <p className="text-xs mt-1" style={{ color: 'rgba(240,253,244,0.3)' }}>Brightly Cleaning 🌿</p>
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
