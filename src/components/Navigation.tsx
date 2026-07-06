import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Calendar, Bot, Calculator, Users, Settings, UserCircle, User, ClipboardList, Inbox, Sparkles, ClipboardCheck, MapPin, DollarSign, Package } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAlertsData } from '@/hooks/useAlertsData';

type AppRole = 'admin' | 'head_cleaner' | 'cleaner' | 'client';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  roles: AppRole[];
  badge?: number;
}

const navItems: NavItem[] = [
  { label: 'Alerts', path: '/actions', icon: Inbox, roles: ['admin', 'head_cleaner'] },
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'My Jobs', path: '/my-jobs', icon: ClipboardList, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'Schedule', path: '/schedule', icon: Calendar, roles: ['admin', 'head_cleaner', 'cleaner'] },
  { label: 'Map', path: '/map', icon: MapPin, roles: ['admin', 'head_cleaner'] },
  { label: 'Quality (QC)', path: '/qc', icon: ClipboardCheck, roles: ['admin', 'head_cleaner'] },
  { label: 'AI Assistant', path: '/ai-assistant', icon: Bot, roles: ['admin', 'head_cleaner'] },
  { label: 'Quoting', path: '/quoting', icon: Calculator, roles: ['admin'] },
  { label: 'Airbnb Quote', path: '/airbnb-quote', icon: Sparkles, roles: ['admin'] },
  { label: 'Clients', path: '/clients', icon: UserCircle, roles: ['admin'] },
  { label: 'Staff', path: '/staff', icon: Users, roles: ['admin'] },
  { label: 'Timesheets', path: '/timesheets', icon: ClipboardList, roles: ['admin'] },
  { label: 'Financials', path: '/financials', icon: DollarSign, roles: ['admin'] },
  { label: 'Linen', path: '/linen', icon: Package, roles: ['admin'] },
  { label: 'Settings', path: '/settings', icon: Settings, roles: ['admin'] },
];

// Admin mobile bottom nav — explicit 5-item list (Map excluded; Airbnb Quote included)
const adminMobileItems: NavItem[] = [
  { label: 'Alerts',       path: '/actions',       icon: Inbox,          roles: ['admin'] },
  { label: 'Dashboard',    path: '/dashboard',     icon: LayoutDashboard, roles: ['admin'] },
  { label: 'My Jobs',      path: '/my-jobs',       icon: ClipboardList,  roles: ['admin'] },
  { label: 'Schedule',     path: '/schedule',      icon: Calendar,       roles: ['admin'] },
  { label: 'Airbnb Quote', path: '/airbnb-quote',  icon: Sparkles,       roles: ['admin'] },
];

// Cleaners get a simplified bottom nav
const cleanerMobileItems: NavItem[] = [
  { label: 'Today', path: '/dashboard', icon: LayoutDashboard, roles: ['cleaner'] },
  { label: 'My Jobs', path: '/my-jobs', icon: Sparkles, roles: ['cleaner'] },
  { label: 'Schedule', path: '/schedule', icon: Calendar, roles: ['cleaner'] },
  { label: 'Profile', path: '/profile', icon: User, roles: ['cleaner'] },
];

const NAV_BG = '#0A0F0E';
const NAV_BORDER = 'rgba(255,255,255,0.06)';

export function MobileNav() {
  const { role } = useAuth();
  const { totalCount } = useAlertsData();

  // Cleaners get a simplified 4-item nav with bigger tap targets
  if (role === 'cleaner') {
    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom"
        style={{ background: NAV_BG, borderTop: `1px solid ${NAV_BORDER}` }}
      >
        <div className="flex justify-around items-center py-1 px-2">
          {cleanerMobileItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-4 py-3 rounded-2xl transition-all duration-200 min-w-[72px] ${
                  isActive ? 'text-[#FEDB00]' : 'text-[#86EFAC]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-6 w-6" />
                  <span className="text-xs font-bold">{item.label}</span>
                  {isActive && (
                    <div
                      className="w-8 h-1 rounded-full"
                      style={{ background: '#FEDB00', boxShadow: '0 0 8px rgba(254,219,0,0.6)' }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    );
  }

  const mobileItems = role === 'admin'
    ? adminMobileItems.map(item => item.path === '/actions' ? { ...item, badge: totalCount } : item)
    : navItems.filter((item) => role && item.roles.includes(role))
        .map(item => item.path === '/actions' ? { ...item, badge: totalCount } : item)
        .slice(0, 5);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ background: NAV_BG, borderTop: `1px solid ${NAV_BORDER}` }}
    >
      <div className="flex justify-around items-center py-2 px-1">
        {mobileItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-0 relative ${
                isActive ? 'text-[#FEDB00]' : 'text-[#86EFAC]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.badge && item.badge > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2.5 text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 tabular-nums"
                      style={{ background: '#EF4444', color: '#FFFFFF' }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold truncate">{item.label}</span>
                {isActive && (
                  <div
                    className="w-5 h-0.5 rounded-full"
                    style={{ background: '#FEDB00', boxShadow: '0 0 6px rgba(254,219,0,0.6)' }}
                  />
                )}
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
  const { totalCount } = useAlertsData();

  const filtered = navItems.filter((item) => role && item.roles.includes(role));
  const filteredWithBadge = filtered.map(item =>
    item.path === '/actions' ? { ...item, badge: totalCount } : item
  );

  const roleBadgeLabel = role === 'head_cleaner' ? 'Head Cleaner' : role === 'admin' ? 'Admin' : 'Cleaner';

  return (
    <aside
      className="hidden md:flex flex-col w-64 min-h-screen"
      style={{
        background: NAV_BG,
        borderRight: `1px solid ${NAV_BORDER}`,
      }}
    >
      <div className="p-6 pb-4">
        <h2
          className="font-extrabold tracking-tight"
          style={{ fontFamily: 'Nunito, sans-serif', fontSize: '32px', color: '#F0FDF4' }}
        >
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h2>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {filteredWithBadge.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-200 relative ${
                isActive
                  ? 'text-[#FEDB00]'
                  : 'text-[#86EFAC] hover:text-[#F0FDF4]'
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: 'rgba(254,219,0,0.08)',
                    borderLeft: '3px solid #FEDB00',
                    paddingLeft: '13px',
                  }
                : undefined
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="h-5 w-5" />
                <span className="flex-1">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span
                    className="text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 tabular-nums"
                    style={{
                      background: isActive ? '#EF4444' : 'rgba(239,68,68,0.2)',
                      color: isActive ? '#FFFFFF' : '#FCA5A5',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4" style={{ borderTop: `1px solid ${NAV_BORDER}` }}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm"
            style={{ background: '#FEDB00', color: '#0C463D' }}
          >
            {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate" style={{ color: '#F0FDF4' }}>{profile?.full_name || 'User'}</p>
            <span
              className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(254,219,0,0.15)', color: '#FEDB00' }}
            >
              {roleBadgeLabel}
            </span>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full text-sm font-semibold text-left transition-colors"
          style={{ color: '#86EFAC' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
