// One screen for every lead. Replaces the three tabs (Clients / Leads / Quotes)
// that read four different data sources and stacked two unrelated lists in one
// tab.
//
// Reads quote_requests.stage, which is now the single source of truth. The old
// profiles.lead_stage machine is not consulted at all.

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OPEN_STAGES, STAGES, stageDef, isRotting, ageLabel, leadName, type LeadStage } from '@/lib/leadPipeline';
import LeadDetailSlideOver from '@/components/clients/LeadDetailSlideOver';
import { AlertCircle, Flame, MessageSquare, Loader2 } from 'lucide-react';

export default function LeadPipelinePage() {
  const qc = useQueryClient();
  const [openLead, setOpenLead] = useState<any>(null);
  const [showClosed, setShowClosed] = useState(false);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['lead-pipeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    // Someone waiting on an answer is the most time-critical thing in the
    // business, so this refreshes on its own rather than waiting for a reload.
    refetchInterval: 60_000,
  });

  const move = async (lead: any, stage: LeadStage) => {
    const now = new Date().toISOString();
    const patch: any = { stage, stage_changed_at: now };
    // Moving a lead on is answering them, so it clears the reply flag.
    if (stage !== 'in_conversation') patch.needs_reply_at = null;
    const { error } = await (supabase.from('quote_requests') as any).update(patch).eq('id', lead.id);
    if (error) { toast.error(`Could not move: ${error.message}`); return; }
    // Cast: lead_events is new and the generated types have not been
    // regenerated yet. Same pattern the rest of the codebase uses.
    await (supabase as any).from('lead_events').insert({
      lead_id: lead.id, kind: 'stage_change', from_stage: lead.stage, to_stage: stage, actor: 'admin',
    } as any);
    qc.invalidateQueries({ queryKey: ['lead-pipeline'] });
    toast.success(`${leadName(lead) || 'Lead'} moved to ${stageDef(stage).label}`);
  };

  const needsReply = useMemo(
    () => leads.filter((l: any) => l.needs_reply_at).sort(
      (a: any, b: any) => new Date(a.needs_reply_at).getTime() - new Date(b.needs_reply_at).getTime()),
    [leads]);

  const byStage = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const s of STAGES) m[s.key] = [];
    for (const l of leads as any[]) (m[l.stage] ||= []).push(l);
    return m;
  }, [leads]);

  const columns = showClosed ? STAGES : OPEN_STAGES;

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-black text-primary">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {leads.filter((l: any) => !stageDef(l.stage).closed).length} open
          </p>
        </div>
        <button onClick={() => setShowClosed(v => !v)}
          className="ml-auto rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">
          {showClosed ? 'Hide won and lost' : 'Show won and lost'}
        </button>
      </div>

      {/* The one queue that matters: people waiting on a human. */}
      {needsReply.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/30 p-4">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-5 w-5" />
            <h2 className="font-black">
              {needsReply.length} {needsReply.length === 1 ? 'person is' : 'people are'} waiting on you
            </h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsReply.map((l: any) => (
              <button key={l.id} onClick={() => setOpenLead(l)}
                className="flex items-center gap-2 rounded-xl border border-rose-300 bg-card px-3 py-2 text-left hover:border-rose-500">
                <MessageSquare className="h-4 w-4 text-rose-500 shrink-0" />
                <span className="text-sm font-bold">{leadName(l) || l.phone}</span>
                <span className="text-xs text-muted-foreground">{ageLabel(l.needs_reply_at)} ago</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {columns.map(s => {
          const items = byStage[s.key] || [];
          return (
            <div key={s.key} className={`rounded-2xl border-t-4 ${s.tone} bg-card border border-border overflow-hidden`}>
              <div className="px-3 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                  <span className="font-black text-sm text-foreground">{s.label}</span>
                  <span className="ml-auto text-sm font-bold text-muted-foreground">{items.length}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{s.blurb}</p>
              </div>

              <div className="max-h-[62vh] overflow-y-auto divide-y divide-border">
                {items.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing here</p>}
                {items.map((l: any) => {
                  const rot = isRotting(l);
                  const price = l.total_inc_gst ?? l.form_data?.quoted_inc_gst;
                  return (
                    <button key={l.id} onClick={() => setOpenLead(l)}
                      className={`w-full px-3 py-2.5 text-left hover:bg-muted/50 ${rot ? 'bg-rose-50 dark:bg-rose-950/20' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold text-sm text-foreground">{leadName(l) || l.phone || 'Unknown'}</span>
                        {rot && <Flame className="h-3.5 w-3.5 text-rose-500 shrink-0" aria-label="Sitting too long" />}
                        {price != null && <span className="ml-auto text-sm font-bold text-primary shrink-0">${Math.round(Number(price))}</span>}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {l.bedrooms || '?'}bd · {l.bathrooms || '?'}ba
                        {l.address ? ` · ${l.address}` : ' · no address'}
                      </p>
                      <p className={`mt-0.5 text-[11px] font-semibold ${rot ? 'text-rose-600' : 'text-muted-foreground'}`}>
                        {ageLabel(l.stage_changed_at || l.created_at)} in {s.label.toLowerCase()}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <LeadDetailSlideOver
        lead={openLead}
        open={!!openLead}
        onClose={() => { setOpenLead(null); qc.invalidateQueries({ queryKey: ['lead-pipeline'] }); }}
        onMoveStage={move}
      />
    </div>
  );
}
