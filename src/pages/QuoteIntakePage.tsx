import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Home, SprayCan, Building2, BedDouble } from 'lucide-react';
import QuoteDetailView from '@/components/quote/QuoteDetailView';
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <header className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 pt-6 mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h1>
        <span className="text-[#3A7560] text-sm font-medium">New Enquiry</span>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-1">Get Your Quote</h2>
          <p className="text-base text-white/50 mb-8">
            Tell us about your space and we'll have a quote to you within 24 hours.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSelect(opt.key)}
              className="flex flex-col items-center justify-center text-center rounded-2xl p-8 min-h-[160px] cursor-pointer transition-all duration-200 bg-white/5 border border-white/15 hover:bg-white/10 hover:border-white/20"
            >
              <opt.icon className="w-10 h-10 text-white/70 mb-3" />
              <p className="text-base font-semibold text-white text-center leading-tight">{opt.label}</p>
              <p className="text-sm mt-1.5 leading-snug text-white/40">{opt.desc}</p>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-white/20 pt-10 pb-6">📞 0418 878 707 · brightly.cleaning</p>
      </div>
    </div>
  );
}

function Confirmation() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full p-6 mb-6 bg-[#3A7560]/20">
        <SprayCan className="w-12 h-12 text-[#3A7560]" />
      </div>
      <h1 className="text-3xl font-bold text-white">You're all set!</h1>
      <p className="mt-3 max-w-sm text-base text-white/50">
        We've received your request and will have a quote to you within 24 hours. Keep an eye on your phone for our SMS. 😊
      </p>
      <p className="text-sm mt-8 text-white/40">📞 0418 878 707</p>
      <p className="text-xs mt-1 text-white/30">Brightly Cleaning 🌿</p>
    </div>
  );
}

export default function QuoteIntakePage() {
  const { token } = useParams<{ token: string }>();
  const [selectedType, setSelectedType] = useState<CleanType>(null);
  const [submitted, setSubmitted] = useState(false);

  // If a token is present, show the quote detail view (not the intake form)
  if (token) return <QuoteDetailView token={token} />;

  if (submitted) return <Confirmation />;
  if (!selectedType) return <Welcome onSelect={setSelectedType} />;

  if (selectedType === 'airbnb') return <AirbnbForm onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
  if (selectedType === 'commercial') return <CommercialForm onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
  return <ResidentialForm isDeepClean={selectedType === 'deep'} onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
}
