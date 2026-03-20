import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Calendar, Building2, FileText, Bot, Calculator, Users, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';

type AppRole = 'admin' | 'head_cleaner' | 'cleaner';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'Schedule', path: '/schedule', icon: Calendar, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'Properties', path: '/properties', icon: Building2, roles: ['admin', 'head_cleaner'] },
  { label: 'Forms', path: '/forms', icon: FileText, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'AI Assistant', path: '/ai-assistant', icon: Bot, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'Quoting', path: '/quoting', icon: Calculator, roles: ['admin'] },
  { label: 'Staff', path: '/staff', icon: Users, roles: ['admin'] },
  { label: 'Settings', path: '/settings', icon: Settings, roles: ['admin'] },
];

export function MobileNav() {
  const { role } = useAuth();
  const filtered = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 md:hidden">
      <div className="flex justify-around items-center py-2 px-1">
        {filtered.slice(0, 5).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-colors min-w-0 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold truncate">{item.label}</span>
                {isActive && <div className="w-5 h-0.5 bg-accent rounded-full" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function DesktopSidebar() {
  const { role, profile, signOut } = useAuth();
  const filtered = navItems.filter((item) => role && item.roles.includes(role));

  const roleBadgeLabel = role === 'head_cleaner' ? 'Head Cleaner' : role === 'admin' ? 'Admin' : 'Cleaner';

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-primary text-primary-foreground">
      <div className="p-6 pb-4">
        <h2 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h2>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {filtered.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-primary-foreground/80 hover:bg-sidebar-accent hover:text-primary-foreground'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-sm">
            {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate">{profile?.full_name || 'User'}</p>
            <span className="inline-block text-[10px] font-bold bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
              {roleBadgeLabel}
            </span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full text-sm font-semibold text-primary-foreground/70 hover:text-primary-foreground transition-colors text-left"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
