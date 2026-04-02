import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useActionsData, type ActionItem } from '@/hooks/useActionsData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, CalendarPlus, MessageSquare, Clock, PlayCircle, CheckCircle2, ChevronRight, UserCheck } from 'lucide-react';
import { ScheduleApprovalModal } from '@/components/schedule/ScheduleApprovalModal';
import { ConfirmCleanModal } from '@/components/schedule/ConfirmCleanModal';

interface GroupConfig {
  key: string;
  label: string;
  icon: React.ElementType;
}

const GROUPS: GroupConfig[] = [
  { key: 'quotes_needed', label: '📝 Quotes Needed', icon: FileText },
  { key: 'awaiting_response', label: '📩 Awaiting Client Response', icon: Clock },
  { key: 'confirm_clean_date', label: '📅 Confirm Clean Date', icon: UserCheck },
  { key: 'awaiting_schedule', label: '📅 Pending Schedule Approval', icon: CalendarPlus },
  { key: 'unread_messages', label: '💬 Unread Messages', icon: MessageSquare },
  { key: 'jobs_in_progress', label: '🔄 Jobs In Progress', icon: PlayCircle },
  { key: 'completed_today', label: '✅ Completed Today', icon: CheckCircle2 },
];

function ActionCard({ item, actionLabel, onClick }: { item: ActionItem; actionLabel: string; onClick?: () => void }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <div
      onClick={handleClick}
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
      <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs font-bold">
        {actionLabel} <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

export default function ActionsPage() {
  const [searchParams] = useSearchParams();
  const filterGroup = searchParams.get('filter');
  const [approvalItem, setApprovalItem] = useState<ActionItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<ActionItem | null>(null);

  const {
    quotesNeeded,
    awaitingResponse,
    confirmCleanDate,
    awaitingSchedule,
    unreadMessages,
    jobsInProgress,
    completedToday,
    totalCount,
  } = useActionsData();

  const dataMap: Record<string, ActionItem[]> = {
    quotes_needed: quotesNeeded,
    awaiting_response: awaitingResponse,
    confirm_clean_date: confirmCleanDate,
    awaiting_schedule: awaitingSchedule,
    unread_messages: unreadMessages,
    jobs_in_progress: jobsInProgress,
    completed_today: completedToday,
  };

  const actionLabels: Record<string, string> = {
    quotes_needed: 'Send Quote',
    awaiting_response: 'View',
    confirm_clean_date: 'Confirm & Assign',
    awaiting_schedule: 'Approve',
    unread_messages: 'Reply',
    jobs_in_progress: 'View',
    completed_today: 'Review',
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
        if (items.length === 0) return null;

        return (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-extrabold text-foreground">{group.label}</h2>
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map(item => (
                <ActionCard
                  key={item.id}
                  item={item}
                  actionLabel={actionLabels[group.key]}
                  onClick={
                    group.key === 'awaiting_schedule' ? () => setApprovalItem(item) :
                    group.key === 'confirm_clean_date' ? () => setConfirmItem(item) :
                    undefined
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      <ScheduleApprovalModal
        open={!!approvalItem}
        onOpenChange={(open) => { if (!open) setApprovalItem(null); }}
        item={approvalItem}
      />

      <ConfirmCleanModal
        open={!!confirmItem}
        onOpenChange={(open) => { if (!open) setConfirmItem(null); }}
        item={confirmItem}
      />
    </div>
  );
}
