import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components/NotificationBell';

export function TopBar() {
  const { profile, role } = useAuth();
  const roleBadgeLabel = role === 'head_cleaner' ? 'Head Cleaner' : role === 'admin' ? 'Admin' : 'Cleaner';
  const firstName = profile?.full_name?.split(' ')[0] || 'User';

  return (
    <header
      className="h-16 flex items-center justify-between px-4 md:px-6"
      style={{
        background: '#0A0F0E',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="md:hidden">
        <h1
          className="text-2xl font-extrabold"
          style={{ fontFamily: 'Nunito, sans-serif', color: '#F0FDF4' }}
        >
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h1>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div
            className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ background: '#FEDB00', color: '#0C463D' }}
          >
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold" style={{ color: '#F0FDF4' }}>{firstName}</p>
            <span
              className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(254,219,0,0.15)', color: '#FEDB00' }}
            >
              {roleBadgeLabel}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
