import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { Bell, CheckCheck, Mail, Star, ClipboardList, FileText, AlertTriangle, DollarSign, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const typeIcons: Record<string, React.ElementType> = {
  onboarding: ClipboardList,
  booking_request: Mail,
  feedback: Star,
  job_complete: CheckCheck,
  invoice_paid: DollarSign,
  job_declined: AlertTriangle,
};

const typeLabels: Record<string, string> = {
  onboarding: 'Onboarding',
  booking_request: 'Booking',
  feedback: 'Feedback',
  job_complete: 'Job Complete',
  invoice_paid: 'Invoice',
  job_declined: 'Declined',
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();
  const navigate = useNavigate();
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const types = Array.from(new Set(notifications.map((n) => n.type).filter(Boolean))) as string[];

  const filtered = notifications.filter((n) => {
    if (readFilter === 'unread' && n.read) return false;
    if (readFilter === 'read' && !n.read) return false;
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllAsRead.mutate()}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Tabs value={readFilter} onValueChange={(v) => setReadFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{typeLabels[t] || t}</option>
          ))}
        </select>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm divide-y divide-border">
        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <Bell className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          filtered.map((n) => {
            const Icon = typeIcons[n.type || ''] || FileText;
            return (
              <button
                key={n.id}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                onClick={() => {
                  if (!n.read) markAsRead.mutate(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <div className={`mt-0.5 h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${!n.read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {n.title && <p className="text-sm font-bold text-foreground">{n.title}</p>}
                  <p className="text-sm text-muted-foreground">{n.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!n.read && <div className="mt-3 h-2.5 w-2.5 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
