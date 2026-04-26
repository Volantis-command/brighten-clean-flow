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
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between max-w-2xl mx-auto w-full px-6 pt-6 mb-8">
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-brightly-yellow">.</span>
        </h1>
        <span className="text-primary text-sm font-medium">New Enquiry</span>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-1">Get Your Quote</h2>
          <p className="text-base text-muted-foreground mb-8">
            Tell us about your space and we'll have a quote to you within 24 hours. 🌿
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {OPTIONS.map(opt => {
            const isHovered = hovered === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onSelect(opt.key)}
                onMouseEnter={() => setHovered(opt.key)}
                onMouseLeave={() => setHovered(null)}
                className={`group flex flex-col items-center justify-center text-center rounded-2xl p-8 min-h-[160px] cursor-pointer transition-all duration-200 bg-card border ${
                  isHovered
                    ? 'border-primary shadow-lg shadow-primary/20 -translate-y-0.5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-3 transition-all duration-200 ${
                  isHovered ? 'bg-primary/15 scale-105' : 'bg-secondary'
                }`}>
                  <opt.icon className={`w-7 h-7 transition-colors duration-200 ${
                    isHovered ? 'text-primary' : 'text-foreground/70'
                  }`} />
                </div>
                <p className="text-base font-semibold text-foreground text-center leading-tight">{opt.label}</p>
                <p className="text-sm mt-1.5 leading-snug text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground/60 pt-10 pb-6">📞 0418 878 707 · brightly.cleaning 🌿</p>
      </div>
    </div>
  );
}

function Confirmation() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full p-6 mb-6 bg-primary/15">
        <SprayCan className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-3xl font-bold text-foreground">You're all set!</h1>
      <p className="mt-3 max-w-sm text-base text-muted-foreground">
        We've received your request and will have a quote to you within 24 hours. Keep an eye on your phone for our SMS. 😊
      </p>
      <p className="text-sm mt-8 text-muted-foreground">📞 0418 878 707</p>
      <p className="text-xs mt-1 text-muted-foreground/70">Brightly Cleaning 🌿</p>
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
