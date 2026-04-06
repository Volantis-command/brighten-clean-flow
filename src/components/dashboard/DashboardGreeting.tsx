import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export function DashboardGreeting() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLine = format(now, "EEEE, d MMMM · h:mm a");

  return (
    <div
      className="relative overflow-hidden rounded-2xl noise-overlay shimmer fade-in"
      style={{
        background: 'linear-gradient(135deg, #0C463D 0%, #1A6B5E 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      }}
    >
      <div className="relative z-10 px-6 py-7 md:px-8 md:py-8">
        <p
          className="text-[11px] font-semibold uppercase mb-1.5"
          style={{ letterSpacing: '0.08em', color: '#86EFAC' }}
        >
          {dateLine}
        </p>
        <h1
          className="font-extrabold leading-tight"
          style={{
            fontSize: '28px',
            color: '#F0FDF4',
            letterSpacing: '-0.02em',
          }}
        >
          {greeting}, {firstName}.
        </h1>
      </div>
      {/* subtle radial accent */}
      <div
        className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(254, 219, 0, 0.10) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}
