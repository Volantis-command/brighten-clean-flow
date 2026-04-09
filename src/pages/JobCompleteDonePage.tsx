import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

export default function JobCompleteDonePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { jobId } = useParams();
  const nextJob = (location.state as any)?.nextJob;

  function openMaps(address: string, provider: 'apple' | 'google') {
    const encoded = encodeURIComponent(address);
    if (provider === 'apple') {
      window.open(`https://maps.apple.com/?q=${encoded}`, '_blank');
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
    }
  }

  // Background: radial gradient from #0C463D centre to #0A0F0E edges
  const bgStyle: React.CSSProperties = {
    background: 'radial-gradient(circle at 50% 35%, #0C463D 0%, #0A0F0E 70%)',
    minHeight: '100vh',
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center px-6 max-w-lg mx-auto overflow-hidden"
      style={bgStyle}
    >
      {/* Floating dots */}
      <FloatingDots />

      {/* Animated SVG tick — 80px, stroke #2E5D4E, draw-on */}
      <div className="relative z-10 mb-6 flex items-center justify-center">
        <div
          className="rounded-full flex items-center justify-center"
          style={{
            width: 120,
            height: 120,
            background: 'rgba(34,197,94,0.10)',
            border: '2px solid rgba(34,197,94,0.30)',
            boxShadow: '0 0 48px rgba(34,197,94,0.30)',
          }}
        >
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="rgba(34,197,94,0.20)"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M22 41 L35 54 L58 28"
              stroke="#2E5D4E"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className="animate-draw-tick"
            />
          </svg>
        </div>
      </div>

      <div className="relative z-10 text-center animate-slide-up">
        <h1
          className="font-extrabold mb-2"
          style={{ fontSize: '32px', color: '#F0FDF4', letterSpacing: '-0.02em' }}
        >
          {nextJob ? 'Job Complete' : 'All Done for Today!'}
        </h1>
        <p className="text-sm mb-8" style={{ color: '#86EFAC' }}>
          {nextJob
            ? 'Great work! Your next job is ready.'
            : 'Great work. Your timesheet has been updated.'}
        </p>
      </div>

      {nextJob ? (
        <div className="relative z-10 w-full animate-slide-up">
          <div className="glass-card p-5 mb-6 space-y-2">
            <p className="font-bold text-lg" style={{ color: '#F0FDF4' }}>{nextJob.name}</p>
            {nextJob.address && (
              <p className="text-sm flex items-center gap-1.5" style={{ color: '#86EFAC' }}>
                <MapPin className="h-4 w-4 shrink-0" /> {nextJob.address}
              </p>
            )}
            {nextJob.time && (
              <p className="text-sm" style={{ color: '#86EFAC' }}>Scheduled: {nextJob.time}</p>
            )}
          </div>

          <div className="w-full space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={() => nextJob.address && openMaps(nextJob.address, 'apple')}
            >
              Navigate with Apple Maps
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => nextJob.address && openMaps(nextJob.address, 'google')}
            >
              Navigate with Google Maps
            </Button>
            <button
              onClick={() => navigate(`/clean/${nextJob.id}`)}
              className="w-full text-center text-sm font-bold py-3 transition-colors hover:text-[#FEDB00]"
              style={{ color: '#86EFAC' }}
            >
              Skip navigation — go to job
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full animate-slide-up">
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}

function FloatingDots() {
  // Six absolutely-positioned dots that float upward and fade out
  const dots = [
    { left: '15%', delay: '0s', size: 6, color: '#FEDB00' },
    { left: '28%', delay: '0.6s', size: 4, color: '#2E5D4E' },
    { left: '45%', delay: '1.2s', size: 5, color: '#FEDB00' },
    { left: '62%', delay: '0.3s', size: 5, color: '#2E5D4E' },
    { left: '78%', delay: '0.9s', size: 4, color: '#FEDB00' },
    { left: '88%', delay: '1.5s', size: 6, color: '#2E5D4E' },
  ];
  return (
    <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none overflow-hidden">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full animate-float-dot"
          style={{
            left: d.left,
            width: d.size,
            height: d.size,
            background: d.color,
            boxShadow: `0 0 8px ${d.color}`,
            animationDelay: d.delay,
          }}
        />
      ))}
    </div>
  );
}
