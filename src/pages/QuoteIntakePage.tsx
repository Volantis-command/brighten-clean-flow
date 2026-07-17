import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Home, SprayCan, Building2, BedDouble, CheckCircle2 } from 'lucide-react';
import QuoteDetailView from '@/components/quote/QuoteDetailView';
import ResidentialForm from '@/components/quote-intake/ResidentialForm';
import AirbnbForm from '@/components/quote-intake/AirbnbForm';
import CommercialForm from '@/components/quote-intake/CommercialForm';

type CleanType = 'standard' | 'deep' | 'airbnb' | 'commercial' | null;

const BG     = '#173A27';
const CARD   = '#1F4A32';
const YELLOW = '#FEDB00';
const WHITE  = '#FFFFFF';
const BORDER = 'rgba(255,255,255,0.10)';
const MUTED  = 'rgba(255,255,255,0.55)';

const OPTIONS = [
  {
    key: 'standard' as const,
    label: 'Standard Clean',
    icon: Home,
    desc: 'Regular home cleaning — kitchens, bathrooms & living areas.',
  },
  {
    key: 'deep' as const,
    label: 'Deep Clean',
    icon: SprayCan,
    desc: 'Top-to-bottom clean including ovens, fridges & windows.',
  },
  {
    key: 'airbnb' as const,
    label: 'Airbnb Turnover',
    icon: BedDouble,
    desc: 'Guest-ready turnovers with linen & hosting touches.',
  },
  {
    key: 'commercial' as const,
    label: 'Commercial',
    icon: Building2,
    desc: 'Offices, retail, medical & industrial spaces.',
  },
];

function Welcome({ onSelect }: { onSelect: (t: CleanType) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-7 pb-2 max-w-2xl mx-auto w-full">
        <span className="text-2xl font-extrabold tracking-tight" style={{ color: WHITE }}>
          Brightly<span style={{ color: YELLOW }}>.</span>
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
          Get a Quote
        </span>
      </header>

      {/* Hero */}
      <div className="px-6 pt-8 pb-6 max-w-2xl mx-auto w-full">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: YELLOW }}>
          Free Quote · 24 Hours
        </p>
        <h1 className="text-3xl font-extrabold leading-tight mb-2" style={{ color: WHITE }}>
          What type of clean<br />do you need?
        </h1>
        <p className="text-base" style={{ color: MUTED }}>
          Tell us about your space and we'll have a quote to you within 24 hours.
        </p>
      </div>

      {/* Service cards */}
      <div className="px-6 pb-10 max-w-2xl mx-auto w-full">
        <div className="grid grid-cols-2 gap-4">
          {OPTIONS.map(opt => {
            const isHovered = hovered === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onSelect(opt.key)}
                onMouseEnter={() => setHovered(opt.key)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-col items-start text-left rounded-2xl p-5 min-h-[160px] cursor-pointer transition-all duration-200"
                style={{
                  background: isHovered ? YELLOW : CARD,
                  border: `1.5px solid ${isHovered ? YELLOW : BORDER}`,
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  boxShadow: isHovered ? '0 12px 32px rgba(254,219,0,0.2)' : 'none',
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-all duration-200"
                  style={{ background: isHovered ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)' }}
                >
                  <opt.icon
                    className="w-5 h-5"
                    style={{ color: isHovered ? '#111' : YELLOW }}
                  />
                </div>
                <p
                  className="text-base font-bold mb-1 leading-tight"
                  style={{ color: isHovered ? '#111' : WHITE }}
                >
                  {opt.label}
                </p>
                <p
                  className="text-xs leading-snug"
                  style={{ color: isHovered ? 'rgba(0,0,0,0.6)' : MUTED }}
                >
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs mt-10" style={{ color: MUTED }}>
          0418 878 707 · brightly.cleaning
        </p>
      </div>
    </div>
  );
}

function Confirmation() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: BG }}
    >
      {/* Logo */}
      <div className="mb-10">
        <span className="text-2xl font-extrabold" style={{ color: WHITE }}>
          Brightly<span style={{ color: YELLOW }}>.</span>
        </span>
      </div>

      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: `rgba(254,219,0,0.15)` }}
      >
        <CheckCircle2 className="w-10 h-10" style={{ color: YELLOW }} />
      </div>

      <h1 className="text-3xl font-extrabold mb-3" style={{ color: WHITE }}>
        You're all set!
      </h1>
      <p className="max-w-sm text-base mb-10" style={{ color: MUTED }}>
        We've received your request and will have a quote to you within 24 hours.
        Keep an eye on your phone for our SMS.
      </p>

      <div
        className="rounded-2xl px-8 py-5 text-sm"
        style={{ background: CARD, border: `1px solid ${BORDER}`, color: MUTED }}
      >
        <p className="font-bold mb-0.5" style={{ color: WHITE }}>Questions?</p>
        <p>Call us on <span style={{ color: YELLOW }}>0418 878 707</span></p>
      </div>
    </div>
  );
}

export default function QuoteIntakePage() {
  const { token } = useParams<{ token: string }>();
  const [selectedType, setSelectedType] = useState<CleanType>(null);
  const [submitted, setSubmitted] = useState(false);

  // Google Ads conversion tracking — fires once when any quote form is submitted
  useEffect(() => {
    if (submitted && typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to: 'AW-18046329250/gQZiCLyh9qocEKLDlJ1D',
        value: 150.0,
        currency: 'AUD',
      });
    }
  }, [submitted]);

  if (token) return <QuoteDetailView token={token} />;
  if (submitted) return <Confirmation />;
  if (!selectedType) return <Welcome onSelect={setSelectedType} />;

  if (selectedType === 'airbnb')
    return <AirbnbForm onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
  if (selectedType === 'commercial')
    return <CommercialForm onComplete={() => setSubmitted(true)} onBack={() => setSelectedType(null)} />;
  return (
    <ResidentialForm
      isDeepClean={selectedType === 'deep'}
      onComplete={() => setSubmitted(true)}
      onBack={() => setSelectedType(null)}
    />
  );
}
