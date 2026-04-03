import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useActionsData, type ActionItem } from '@/hooks/useActionsData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, ChevronUp, CheckCircle2, X } from 'lucide-react';
import { ConfirmCleanModal } from '@/components/schedule/ConfirmCleanModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface GroupConfig {
  key: string;
  label: string;
  borderColor: string;
  actionLabel: string;
}

const GROUPS: GroupConfig[] = [
  { key: 'quotesNeeded', label: 'Quotes Needed', borderColor: 'border-l-primary', actionLabel: 'Send Quote' },
  { key: 'confirm_clean_date', label: 'Confirm Clean Date', borderColor: 'border-l-primary', actionLabel: 'Confirm & Assign' },
  { key: 'quotesAwaiting', label: 'Quotes Awaiting Response', borderColor: 'border-l-amber-400', actionLabel: 'View Quote' },
  { key: 'not_invoiced', label: 'Jobs Not Invoiced', borderColor: 'border-l-destructive', actionLabel: 'Raise Invoice' },
  { key: 'not_sent', label: 'Invoices Not Sent', borderColor: 'border-l-destructive', actionLabel: 'Send Invoice' },
  { key: 'overdue', label: 'Invoices Overdue', borderColor: 'border-l-destructive', actionLabel: 'View' },
  { key: 'extra_time', label: 'Extra Time Requests', borderColor: 'border-l-amber-500', actionLabel: 'Action' },
  { key: 're_clean', label: 'Re-Clean Required', borderColor: 'border-l-destructive', actionLabel: 'View Audit' },
  { key: 'not_clocked_on', label: 'Cleaners Not Clocked On', borderColor: 'border-l-amber-400', actionLabel: 'View' },
  { key: 'low_ratings', label: 'Low Ratings', borderColor: 'border-l-amber-400', actionLabel: 'View Job' },
];

function ActionCard({ item, actionLabel, onAction }: { item: ActionItem; actionLabel: string; onAction?: () => void }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onAction) {
      onAction();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all"
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmItem, setConfirmItem] = useState<ActionItem | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(GROUPS.map(g => g.key)));

  const {
    quotesAwaiting,
    notInvoiced,
    notSent,
    overdue,
    extraTime,
    reClean,
    notClockedOn,
    lowRatings,
    quotesNeeded,
    confirmCleanDate,
    totalCount,
  } = useActionsData();

  const dataMap: Record<string, ActionItem[]> = {
    quotesNeeded,
    confirm_clean_date: confirmCleanDate,
    quotesAwaiting,
    not_invoiced: notInvoiced,
    not_sent: notSent,
    overdue,
    extra_time: extraTime,
    re_clean: reClean,
    not_clocked_on: notClockedOn,
    low_ratings: lowRatings,
  };

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleExtraTimeAction(item: ActionItem, action: 'approve' | 'deny') {
    const jobId = item.meta?.jobId;
    if (!jobId) return;

    if (action === 'approve') {
      await supabase.from('jobs').update({ extra_time_requested: false }).eq('id', jobId);
      try {
        await supabase.functions.invoke('send-job-sms', {
          body: { to: 'CLEANER', job_id: jobId, message: `Extra time approved. Take the time you need.` },
        });
      } catch { /* non-blocking */ }
      toast.success('Extra time approved');
    } else {
      await supabase.from('jobs').update({ extra_time_requested: false }).eq('id', jobId);
      try {
        await supabase.functions.invoke('send-job-sms', {
          body: { to: 'CLEANER', job_id: jobId, message: `Extra time request denied. Please complete within the allocated time.` },
        });
      } catch { /* non-blocking */ }
      toast.success('Extra time denied');
    }
    queryClient.invalidateQueries({ queryKey: ['actions-extra-time'] });
  }

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

      {totalCount === 0 && (
        <div className="bg-card rounded-2xl shadow-md p-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <p className="text-xl font-bold text-foreground mb-2">All clear</p>
          <p className="text-muted-foreground">No outstanding actions.</p>
        </div>
      )}

      {GROUPS.map(group => {
        const items = dataMap[group.key] || [];
        if (items.length === 0) return null;
        const isOpen = openGroups.has(group.key);

        return (
          <Collapsible key={group.key} open={isOpen} onOpenChange={() => toggleGroup(group.key)}>
            <div className={`border-l-4 ${group.borderColor} rounded-r-2xl bg-card`}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-foreground">{group.label}</h2>
                  <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-2">
                  {items.map(item => {
                    if (group.key === 'extra_time') {
                      return (
                        <div key={item.id} className="bg-card rounded-2xl border border-border p-4">
                          <p className="font-bold text-foreground text-sm">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleExtraTimeAction(item, 'approve')}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => handleExtraTimeAction(item, 'deny')}>
                              Deny
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <ActionCard
                        key={item.id}
                        item={item}
                        actionLabel={group.actionLabel}
                        onAction={
                          group.key === 'confirm_clean_date' ? () => setConfirmItem(item) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      <ConfirmCleanModal
        open={!!confirmItem}
        onOpenChange={(open) => { if (!open) setConfirmItem(null); }}
        item={confirmItem}
      />
    </div>
  );
}
