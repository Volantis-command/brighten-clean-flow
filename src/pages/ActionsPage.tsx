import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useActionsData, type ActionItem } from '@/hooks/useActionsData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, FileText, CalendarPlus, MessageSquare, Mail, Star, CheckCircle2, ChevronRight, Clock } from 'lucide-react';

interface GroupConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const GROUPS: GroupConfig[] = [
  { key: 'urgent', label: '🔴 Urgent', icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10', borderColor: 'border-destructive/30' },
  { key: 'new_enquiries', label: '🟢 New Enquiries', icon: FileText, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/30' },
  { key: 'awaiting_quote', label: '🟡 Awaiting Quote', icon: FileText, color: 'text-[hsl(45,100%,40%)]', bgColor: 'bg-[hsl(45,100%,51%)]/10', borderColor: 'border-[hsl(45,100%,51%)]/30' },
  { key: 'awaiting_response', label: '📩 Awaiting Client Response', icon: Clock, color: 'text-[hsl(200,80%,50%)]', bgColor: 'bg-[hsl(200,80%,50%)]/10', borderColor: 'border-[hsl(200,80%,50%)]/30' },
  { key: 'client_accepted', label: '🎉 Client Accepted — Awaiting Date', icon: CheckCircle2, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/30' },
  { key: 'awaiting_schedule', label: '📅 Awaiting Schedule Approval', icon: CalendarPlus, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-300' },
  { key: 'awaiting_approval', label: '🟠 Awaiting Approval', icon: CheckCircle2, color: 'text-[hsl(30,100%,50%)]', bgColor: 'bg-[hsl(30,100%,50%)]/10', borderColor: 'border-[hsl(30,100%,50%)]/30' },
  { key: 'booking_requests', label: '📋 Pending Booking Requests', icon: CalendarPlus, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/30' },
  { key: 'unread_messages', label: '💬 Unread Messages', icon: MessageSquare, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/30' },
  { key: 'onboarding_unsent', label: '📝 Onboarding Forms Not Sent', icon: Mail, color: 'text-[hsl(45,100%,40%)]', bgColor: 'bg-[hsl(45,100%,51%)]/10', borderColor: 'border-[hsl(45,100%,51%)]/30' },
  { key: 'new_feedback', label: '⭐ New Feedback', icon: Star, color: 'text-primary', bgColor: 'bg-primary/10', borderColor: 'border-primary/30' },
];

function ActionCard({ item, actionLabel }: { item: ActionItem; actionLabel: string }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => item.path && navigate(item.path)}
      className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-[0.98]"
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm truncate">{item.title}</p>
        {item.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>}
        {item.timestamp && (
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
          </p>
        )}
      </div>
      {item.path && (
        <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs font-bold">
          {actionLabel} <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export default function ActionsPage() {
  const [searchParams] = useSearchParams();
  const filterGroup = searchParams.get('filter');
  const {
    urgentJobs,
    newEnquiries,
    awaitingQuote,
    awaitingResponse,
    clientAccepted,
    awaitingSchedule,
    awaitingApproval,
    bookingRequests,
    unreadMessages,
    onboardingNotSent,
    newFeedback,
    totalCount,
  } = useActionsData();

  const dataMap: Record<string, ActionItem[]> = {
    urgent: urgentJobs,
    new_enquiries: newEnquiries,
    awaiting_quote: awaitingQuote,
    awaiting_response: awaitingResponse,
    awaiting_approval: awaitingApproval,
    booking_requests: bookingRequests,
    unread_messages: unreadMessages,
    onboarding_unsent: onboardingNotSent,
    new_feedback: newFeedback,
  };

  const actionLabels: Record<string, string> = {
    urgent: 'View',
    new_enquiries: 'Send Quote',
    awaiting_quote: 'Set Price',
    awaiting_response: 'View',
    awaiting_approval: 'Confirm',
    booking_requests: 'Review',
    unread_messages: 'Reply',
    onboarding_unsent: 'Send Now',
    new_feedback: 'View',
  };

  const visibleGroups = filterGroup
    ? GROUPS.filter(g => g.key === filterGroup)
    : GROUPS;

  const hasAnyItems = totalCount > 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Actions Inbox</h1>
        {totalCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {totalCount} pending
          </Badge>
        )}
      </div>

      {!hasAnyItems && (
        <div className="bg-card rounded-2xl shadow-md p-12 text-center">
          <p className="text-4xl mb-4">✅</p>
          <p className="text-xl font-bold text-foreground mb-2">All clear</p>
          <p className="text-muted-foreground">Nothing needs your attention right now.</p>
        </div>
      )}

      {visibleGroups.map(group => {
        const items = dataMap[group.key] || [];
        if (items.length === 0 && !filterGroup) return null;

        return (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-extrabold text-foreground">{group.label}</h2>
              {items.length > 0 && (
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              )}
            </div>
            {items.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border p-6 text-center">
                <p className="text-muted-foreground text-sm">No items in this group.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <ActionCard key={item.id} item={item} actionLabel={actionLabels[group.key]} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
