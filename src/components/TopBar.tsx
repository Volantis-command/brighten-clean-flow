import { useAuth } from '@/contexts/AuthContext';
import { Bell } from 'lucide-react';

export function TopBar() {
  const { profile, role } = useAuth();
  const roleBadgeLabel = role === 'head_cleaner' ? 'Head Cleaner' : role === 'admin' ? 'Admin' : 'Cleaner';
  const firstName = profile?.full_name?.split(' ')[0] || 'User';

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card">
      <div className="md:hidden">
        <h1 className="text-lg font-extrabold text-primary">✨ Brightly</h1>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <button className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold text-foreground">{firstName}</p>
            <span className="inline-block text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
              {roleBadgeLabel}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
