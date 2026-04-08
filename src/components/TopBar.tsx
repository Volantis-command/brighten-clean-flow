import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/components/NotificationBell';

export function TopBar() {
  const { profile, role } = useAuth();
  const roleBadgeLabel = role === 'head_cleaner' ? 'Head Cleaner' : role === 'admin' ? 'Admin' : 'Cleaner';
  const firstName = profile?.full_name?.split(' ')[0] || 'User';

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-background border-b border-border">
      <div className="md:hidden">
        <h1 className="text-2xl font-extrabold font-sans text-foreground">
          Brightly<span className="text-accent">.</span>
        </h1>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm bg-primary text-primary-foreground">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold text-foreground">{firstName}</p>
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-primary">
              {roleBadgeLabel}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
