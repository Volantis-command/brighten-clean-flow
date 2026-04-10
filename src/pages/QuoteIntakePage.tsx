import { useState } from 'react';
import { Home, SprayCan, Building2, BedDouble } from 'lucide-react';
import ResidentialForm from '@/components/quote-intake/ResidentialForm';
import AirbnbForm from '@/components/quote-intake/AirbnbForm';
import CommercialForm from '@/components/quote-intake/CommercialForm';

type CleanType = 'standard' | 'deep' | 'airbnb' | 'commercial' | null;

const OPTIONS = [
  { key: 'standard' as const, label: 'Standard Clean', icon: Home, desc: 'Regular home cleaning — kitchens, bathrooms & living areas.' },
  { key: 'deep' as const, label: 'Deep Clean', icon: SprayCan, desc: 'Top-to-bottom clean including ovens, fridges & windows.' },
  { key: 'airbnb' as const, label: 'Airbnb Turnover', icon: BedDouble, desc: 'Guest-ready turnovers with linen & hosting touches.' },
  { key: 'commercial' as const, label: 'Commercial', icon: Building2, desc: 'Offices, retail, medical & industrial spaces.' },
];

function Welcome({ onSelect }: { onSelect: (t: CleanType) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#1C1C1E' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'rgba(28,28,30,0.9)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'Nunito, sans-serif', color: '#F2F2F7' }}>
            Brightly<span style={{ color: '#FEDB00' }}>.</span>
          </h1>
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(46,93,78,0.2)', color: '#86EFAC' }}>
            New Enquiry
          </span>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-5 py-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ color: '#F2F2F7' }}>
            Get Your Quote
          </h2>
          <p className="mt-3 text-base" style={{ color: 'rgba(242,242,247,0.5)' }}>
            Tell us about your space and we'll have a quote to you within 24 hours.
          </p>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-widest mb-5" style={{ color: 'rgba(242,242,247,0.4)' }}>
          What type of clean are you after?
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
              onMouseEnter={() => setHovered(opt.key)}
              onMouseLeave={() => setHovered(null)}
              className="flex flex-col items-center justify-center text-center rounded-2xl p-6 min-h-[176px] transition-all duration-300 active:scale-[0.97] backdrop-blur-sm"
              style={{
                background: hovered === opt.key ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
                border: hovered === opt.key ? '1px solid rgba(46,93,78,0.5)' : '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(46,93,78,0.15)' }}>
                <opt.icon className="w-8 h-8" style={{ color: '#86EFAC' }} />
              </div>
              <p className="text-lg font-semibold leading-tight" style={{ color: '#F2F2F7' }}>{opt.label}</p>
              <p className="text-sm mt-1.5 leading-snug" style={{ color: 'rgba(242,242,247,0.4)' }}>{opt.desc}</p>
            </button>
          ))}
        </div>

        <p className="text-center text-xs pt-10" style={{ color: 'rgba(255,255,255,0.2)' }}>📞 0418 878 707 · brightly.cleaning</p>
      </div>
    </div>
  );
}

function Confirmation() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#1C1C1E' }}>
      <div className="rounded-full p-6 mb-6" style={{ background: 'rgba(46,93,78,0.2)' }}>
        <SprayCan className="w-12 h-12" style={{ color: '#86EFAC' }} />
      </div>
      <h1 className="text-3xl font-extrabold" style={{ color: '#F2F2F7' }}>You're all set!</h1>
      <p className="mt-3 max-w-sm" style={{ color: 'rgba(242,242,247,0.6)' }}>
        We've received your request and will have a quote to you within 24 hours. Keep an eye on your phone for our SMS. 😊
      </p>
      <p className="text-sm mt-8" style={{ color: 'rgba(242,242,247,0.4)' }}>📞 0418 878 707</p>
      <p className="text-xs mt-1" style={{ color: 'rgba(242,242,247,0.3)' }}>Brightly Cleaning 🌿</p>
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
