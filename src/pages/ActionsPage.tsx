import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertsData, type AlertItem } from '@/hooks/useAlertsData';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, ChevronUp, CheckCircle2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function useDismissed() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('brightly-dismissed-alerts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('brightly-dismissed-alerts', JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { dismissed, dismiss };
}

export default function ActionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { groups, totalCount } = useAlertsData();
  const { dismissed, dismiss } = useDismissed();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(groups.map(g => g.key)));
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function setLoading(id: string, loading: boolean) {
    setLoadingActions(prev => {
      const next = new Set(prev);
      loading ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function handleRaiseInvoice(item: AlertItem) {
    const jobId = item.meta?.jobId;
    if (!jobId) return;
    setLoading(item.id, true);
    const { error } = await supabase.from('jobs').update({
      invoice_status: 'raised',
      invoice_raised_at: new Date().toISOString(),
    }).eq('id', jobId);
    setLoading(item.id, false);
    if (error) { toast.error('Failed to raise invoice'); return; }
    toast.success('Invoice raised');
    queryClient.invalidateQueries({ queryKey: ['alerts-not-invoiced'] });
  }

  async function handleSendInvoice(item: AlertItem) {
    const jobId = item.meta?.jobId;
    if (!jobId) return;
    setLoading(item.id, true);
    try {
      await supabase.functions.invoke('xero-create-invoice', { body: { job_id: jobId, action: 'send' } });
    } catch { /* non-blocking */ }
    const { error } = await supabase.from('jobs').update({
      invoice_status: 'sent',
      invoice_sent_at: new Date().toISOString(),
    }).eq('id', jobId);
    setLoading(item.id, false);
    if (error) { toast.error('Failed to send invoice'); return; }
    toast.success('Invoice sent');
    queryClient.invalidateQueries({ queryKey: ['alerts-not-sent'] });
  }

  async function handleExtraTime(item: AlertItem, approved: boolean) {
    const jobId = item.meta?.jobId;
    if (!jobId) return;
    setLoading(item.id, true);
    await supabase.from('jobs').update({
      extra_time_approved: approved,
      extra_time_requested: !approved ? false : undefined,
    } as any).eq('id', jobId);
    try {
      await supabase.functions.invoke('send-job-sms', {
        body: { to: 'CLEANER', job_id: jobId, message: approved ? 'Extra time approved. Take the time you need.' : 'Extra time request denied. Please complete within the allocated time.' },
      });
    } catch { /* non-blocking */ }
    setLoading(item.id, false);
    toast.success(approved ? 'Extra time approved' : 'Extra time denied');
    queryClient.invalidateQueries({ queryKey: ['alerts-extra-time'] });
  }

  // Filter dismissed items and count visible
  const visibleGroups = groups.map(g => ({
    ...g,
    items: g.items.filter(i => !dismissed.has(i.id)),
  }));
  const visibleCount = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-6 max-w-3xl mx-auto overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Alerts</h1>
        {visibleCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {visibleCount} pending
          </Badge>
        )}
      </div>

      {visibleCount === 0 && (
        <div className="bg-card rounded-2xl shadow-md p-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <p className="text-xl font-bold text-foreground mb-2">All clear</p>
          <p className="text-muted-foreground">No outstanding actions.</p>
        </div>
      )}

      {visibleGroups.map(group => {
        if (group.items.length === 0) return null;
        const isOpen = openGroups.has(group.key);

        return (
          <Collapsible key={group.key} open={isOpen} onOpenChange={() => toggleGroup(group.key)}>
            <div className={`border-l-4 ${group.borderColor} rounded-r-2xl bg-card shadow-sm`}>
              <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between min-h-[48px]">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{group.icon}</span>
                  <h2 className="text-base font-extrabold text-foreground">{group.label}</h2>
                  <Badge variant="secondary" className="text-xs">{group.items.length}</Badge>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-2">
                  {group.items.map(item => (
                    <AlertRow
                      key={item.id}
                      item={item}
                      groupKey={group.key}
                      loading={loadingActions.has(item.id)}
                      onDismiss={() => dismiss(item.id)}
                      onNavigate={() => item.path && navigate(item.path)}
                      onRaiseInvoice={() => handleRaiseInvoice(item)}
                      onSendInvoice={() => handleSendInvoice(item)}
                      onApproveExtra={() => handleExtraTime(item, true)}
                      onDenyExtra={() => handleExtraTime(item, false)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}

interface AlertRowProps {
  item: AlertItem;
  groupKey: string;
  loading: boolean;
  onDismiss: () => void;
  onNavigate: () => void;
  onRaiseInvoice: () => void;
  onSendInvoice: () => void;
  onApproveExtra: () => void;
  onDenyExtra: () => void;
}

function AlertRow({ item, groupKey, loading, onDismiss, onNavigate, onRaiseInvoice, onSendInvoice, onApproveExtra, onDenyExtra }: AlertRowProps) {
  const renderActions = () => {
    if (loading) {
      return <Button variant="outline" size="sm" disabled className="shrink-0 text-xs">Working...</Button>;
    }

    switch (groupKey) {
      case 'not_invoiced':
        return (
          <Button size="sm" className="shrink-0 text-xs font-bold bg-green-600 hover:bg-green-700 text-white" onClick={e => { e.stopPropagation(); onRaiseInvoice(); }}>
            Raise Invoice
          </Button>
        );
      case 'not_sent':
        return (
          <Button size="sm" className="shrink-0 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground" onClick={e => { e.stopPropagation(); onSendInvoice(); }}>
            Send Now
          </Button>
        );
      case 'extra_time':
        return (
          <div className="flex gap-1.5">
            <Button size="sm" className="text-xs font-bold bg-green-600 hover:bg-green-700 text-white" onClick={e => { e.stopPropagation(); onApproveExtra(); }}>
              Approve
            </Button>
            <Button size="sm" variant="outline" className="text-xs font-bold text-destructive border-destructive" onClick={e => { e.stopPropagation(); onDenyExtra(); }}>
              Deny
            </Button>
          </div>
        );
      case 'not_clocked_on':
        return (
          <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs font-bold" onClick={e => { e.stopPropagation(); onNavigate(); }}>
            SMS Cleaner <ChevronRight className="h-3 w-3" />
          </Button>
        );
      case 'overdue':
        return (
          <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs font-bold" onClick={e => { e.stopPropagation(); onNavigate(); }}>
            View Invoice <ChevronRight className="h-3 w-3" />
          </Button>
        );
      case 'quotes_awaiting':
        return (
          <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs font-bold" onClick={e => { e.stopPropagation(); onNavigate(); }}>
            View Quote <ChevronRight className="h-3 w-3" />
          </Button>
        );
      default:
        return (
          <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs font-bold" onClick={e => { e.stopPropagation(); onNavigate(); }}>
            View Job <ChevronRight className="h-3 w-3" />
          </Button>
        );
    }
  };

  return (
    <div
      onClick={onNavigate}
      className="bg-background rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:shadow-sm transition-all min-h-[48px] overflow-hidden"
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm truncate">{item.title}</p>
        {item.subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{item.subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
        <div className="flex-1 sm:flex-none">{renderActions()}</div>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
