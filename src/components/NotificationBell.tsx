import { Bell, CheckCheck, Mail, Star, ClipboardList, FileText, AlertTriangle, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const typeIcons: Record<string, React.ElementType> = {
  onboarding: ClipboardList,
  booking_request: Mail,
  feedback: Star,
  job_complete: CheckCheck,
  invoice_paid: DollarSign,
  job_declined: AlertTriangle,
};

function NotificationItem({ n, onNavigate, onMarkRead }: { n: Notification; onNavigate: (link: string) => void; onMarkRead: (id: string) => void }) {
  const Icon = typeIcons[n.type || ''] || FileText;

  return (
    <button
      className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors rounded-lg ${!n.read ? 'bg-primary/5' : ''}`}
      onClick={() => {
        if (!n.read) onMarkRead(n.id);
        if (n.link) onNavigate(n.link);
      }}
    >
      <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${!n.read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {n.title && <p className="text-xs font-bold text-foreground truncate">{n.title}</p>}
        <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>
      {!n.read && <div className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />}
    </button>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const recent = notifications.slice(0, 20);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative h-10 w-10 rounded-xl flex items-center justify-center hover:bg-sidebar-accent md:hover:bg-muted transition-colors">
          <Bell className="h-5 w-5 text-primary-foreground md:text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[28rem] overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 py-1.5">
          <h3 className="text-sm font-bold text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead.mutate()}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No notifications yet</p>
        ) : (
          <div className="space-y-0.5">
            {recent.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                onNavigate={(link) => navigate(link)}
                onMarkRead={(id) => markAsRead.mutate(id)}
              />
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <button
          onClick={() => navigate('/notifications')}
          className="w-full text-center text-xs font-semibold text-primary py-2 hover:underline"
        >
          View all notifications
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
