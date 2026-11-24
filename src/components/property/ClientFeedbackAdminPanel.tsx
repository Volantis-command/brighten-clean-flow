import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Archive, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CATEGORY_META, ROOMS, suggestRoom, type FeedbackCategory } from '@/lib/clientFeedback';

const fmt = (d?: string | null) => (d ? format(parseISO(d), 'd MMM yyyy') : '');

/**
 * Office view of one property's client notes: what is still open, what each
 * cleaner answered, and why anything was not done. The office can add a note
 * the client gave by phone or email, reopen one, or archive it.
 */
export default function ClientFeedbackAdminPanel({ propertyId }: { propertyId: string }) {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const queryClient = useQueryClient();
  const key = ['client-feedback-admin', propertyId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const db = supabase as any;
      const { data: items, error } = await db
        .from('client_feedback_items')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (items || []).map((i: any) => i.id);
      const { data: checks } = ids.length
        ? await db.from('client_feedback_checks').select('*').in('item_id', ids).order('created_at')
        : { data: [] };
      const jobIds = [...new Set([
        ...(items || []).flatMap((i: any) => [i.source_job_id, i.resolved_job_id]),
        ...(checks || []).map((c: any) => c.job_id),
      ].filter(Boolean))];
      const peopleIds = [...new Set([
        ...(items || []).flatMap((i: any) => [i.client_id, i.resolved_by]),
        ...(checks || []).map((c: any) => c.cleaner_id),
      ].filter(Boolean))];
      const [{ data: jobs }, { data: people }] = await Promise.all([
        jobIds.length ? supabase.from('jobs').select('id, scheduled_date').in('id', jobIds) : Promise.resolve({ data: [] }),
        peopleIds.length ? supabase.from('profiles').select('id, full_name').in('id', peopleIds) : Promise.resolve({ data: [] }),
      ]);
      const jobDate = Object.fromEntries((jobs || []).map((j: any) => [j.id, j.scheduled_date]));
      const name = Object.fromEntries((people || []).map((p: any) => [p.id, p.full_name]));
      return { items: (items || []) as any[], checks: (checks || []) as any[], jobDate, name };
    },
  });

  const update = async (id: string, patch: Record<string, unknown>, done: string) => {
    const { error } = await (supabase as any).from('client_feedback_items')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(done);
    queryClient.invalidateQueries({ queryKey: key });
  };

  const items = data?.items || [];
  const open = items.filter((i) => i.status === 'open');
  const closed = items.filter((i) => i.status !== 'open');

  return (
    <div className="mt-4 space-y-4">
      {isAdmin && <AddNote propertyId={propertyId} userId={user?.id} onAdded={() => queryClient.invalidateQueries({ queryKey: key })} />}

      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No client notes yet. Clients leave them from the clean report or their portal.
        </p>
      )}

      {[{ title: `Open (${open.length})`, list: open }, { title: `Done and archived (${closed.length})`, list: closed }]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.title} className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">{g.title}</h3>
            {g.list.map((i) => {
              const checks = (data?.checks || []).filter((c) => c.item_id === i.id);
              return (
                <div key={i.id} className={cn('rounded-xl border bg-card p-3 space-y-2',
                  i.status === 'open' ? 'border-amber-300' : 'border-border opacity-80')}>
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {CATEGORY_META[i.category as FeedbackCategory]?.cleaner || i.category}
                    </span>
                    {i.room && <span className="font-bold text-muted-foreground">{i.room}</span>}
                    <span className="text-muted-foreground">
                      {i.created_via === 'admin' ? 'Added by office' : `From ${data?.name[i.client_id] || 'client'}`}
                      {' · '}{fmt(i.created_at)}
                      {i.source_job_id && data?.jobDate[i.source_job_id] ? ` · on the ${fmt(data.jobDate[i.source_job_id])} clean` : ''}
                    </span>
                    {i.status === 'done' && (
                      <span className="font-bold text-primary">
                        Done {fmt(data?.jobDate[i.resolved_job_id])}{i.resolved_by ? ` by ${data?.name[i.resolved_by] || 'cleaner'}` : ''}
                      </span>
                    )}
                    {i.status === 'archived' && <span className="font-bold text-muted-foreground">Archived</span>}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{i.message}</p>
                  {checks.length > 0 && (
                    <ul className="text-xs space-y-0.5 border-t border-border pt-2">
                      {checks.map((c) => (
                        <li key={c.id} className={c.outcome === 'done' ? 'text-primary' : 'text-destructive'}>
                          {fmt(data?.jobDate[c.job_id])} · {data?.name[c.cleaner_id] || 'Cleaner'}:{' '}
                          {c.outcome === 'done' ? 'Done' : `Couldn't do. ${c.note || ''}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isAdmin && (
                    <div className="flex gap-2">
                      {i.status !== 'open' && (
                        <Button size="sm" variant="outline" onClick={() => update(i.id, {
                          status: 'open', resolved_at: null, resolved_job_id: null, resolved_by: null,
                          archived_at: null, archived_by: null,
                        }, 'Reopened. It shows on the next clean.')}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen
                        </Button>
                      )}
                      {i.status !== 'archived' && (
                        <Button size="sm" variant="ghost" onClick={() => update(i.id, {
                          status: 'archived', archived_at: new Date().toISOString(), archived_by: user?.id,
                        }, 'Archived. Cleaners no longer see it.')}>
                          <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function AddNote({ propertyId, userId, onAdded }: { propertyId: string; userId?: string; onAdded: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('next_clean');
  const [message, setMessage] = useState('');
  const [room, setRoom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const text = message.trim();
    if (text.length < 2) return;
    setSaving(true);
    const { data: link } = await supabase.from('client_properties').select('client_id')
      .eq('property_id', propertyId).limit(1).maybeSingle();
    const { error } = await (supabase as any).from('client_feedback_items').insert({
      property_id: propertyId,
      client_id: (link as any)?.client_id ?? null,
      category, message: text, room: room ?? suggestRoom(text),
      created_via: 'admin', created_by: userId ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Added. The next cleaner will see it.');
    setMessage(''); setRoom(null);
    onAdded();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">Add a note from the client</p>
      <p className="text-xs text-muted-foreground -mt-2">For feedback that came by phone, text or email.</p>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(CATEGORY_META) as FeedbackCategory[]).map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={cn('text-xs font-bold px-2.5 py-1 rounded-full border',
              category === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground')}>
            {CATEGORY_META[c].client}
          </button>
        ))}
      </div>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={2}
        placeholder={CATEGORY_META[category].placeholder} />
      <div className="flex flex-wrap gap-1.5">
        {ROOMS.map((r) => (
          <button key={r} type="button" onClick={() => setRoom(room === r ? null : r)}
            className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border',
              room === r ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground')}>
            {r}
          </button>
        ))}
      </div>
      <Button size="sm" disabled={saving || message.trim().length < 2} onClick={save}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add note'}
      </Button>
    </div>
  );
}
