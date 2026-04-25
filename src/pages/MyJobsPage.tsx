import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, addDays, startOfDay } from 'date-fns';
import { MapPin, Clock, ChevronRight, Loader2, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { acceptJob, declineJob } from '@/lib/jobAssignment';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Upcoming', className: 'bg-muted text-muted-foreground border-0' },
  confirmed: { label: 'Upcoming', className: 'bg-muted text-muted-foreground border-0' },
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-800 border-0' },
  completed: { label: 'Completed', className: 'bg-brightly/10 text-brightly border-0' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-100 text-destructive border-0' },
};

type View = 'today' | 'tomorrow' | 'week';

const VIEW_LABELS: Record<View, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This Week',
};

export default function MyJobsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');

  const [view, setView] = useState<View>('today');

  const [actionJob, setActionJob] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'decline' | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Compute the date filter for the current view
  const { dateFrom, dateTo, headingDate } = (() => {
    if (view === 'today') {
      return { dateFrom: today, dateTo: today, headingDate: format(new Date(), 'EEEE, d MMMM yyyy') };
    }
    if (view === 'tomorrow') {
      return { dateFrom: tomorrow, dateTo: tomorrow, headingDate: format(addDays(new Date(), 1), 'EEEE, d MMMM yyyy') };
    }
    return { dateFrom: today, dateTo: weekEnd, headingDate: `${format(new Date(), 'd MMM')} – ${format(addDays(new Date(), 6), 'd MMM')}` };
  })();

  // ── Jobs awaiting my acceptance (any date) ──
  const { data: pendingOffers = [], isLoading: loadingPending } = useQuery({
    queryKey: ['my-pending-acceptances', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: acceptances, error } = await supabase
        .from('job_acceptances')
        .select('id, job_id, acceptance_status, sms_sent_at, jobs(id, scheduled_date, scheduled_time, estimated_duration, status, cleaner_1_id, cleaner_2_id, notes, properties(property_name, address, client_type, first_clean))')
        .eq('cleaner_id', user!.id)
        .eq('acceptance_status', 'pending');
      if (error) throw error;

      const today = format(new Date(), 'yyyy-MM-dd');
      return (acceptances || [])
        .map((a: any) => a.jobs)
        .filter((j: any) => j && j.scheduled_date >= today && j.status === 'awaiting_cleaner_acceptance')
        .map((j: any) => ({
          ...j,
          property_name: j.properties?.property_name ?? 'Property',
          address: j.properties?.address ?? null,
          client_type: j.properties?.client_type ?? null,
          first_clean: j.properties?.first_clean === true,
        }))
        .sort((a: any, b: any) => (a.scheduled_date + (a.scheduled_time || '')).localeCompare(b.scheduled_date + (b.scheduled_time || '')));
    },
  });

  // ── Jobs for the selected view (today / tomorrow / this week) ──
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['my-jobs', view, user?.id, role, dateFrom, dateTo],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, estimated_duration, cleaner_1_id, cleaner_2_id, notes, properties(property_name, address, client_type, first_clean)')
        .gte('scheduled_date', dateFrom)
        .lte('scheduled_date', dateTo)
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'])
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true });

      if (role === 'cleaner' || role === 'head_cleaner') {
        query = query.or(`cleaner_1_id.eq.${user!.id},cleaner_2_id.eq.${user!.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch cleaner profiles for avatar initials
      const cleanerIds = new Set<string>();
      (data ?? []).forEach((j: any) => {
        if (j.cleaner_1_id) cleanerIds.add(j.cleaner_1_id);
        if (j.cleaner_2_id) cleanerIds.add(j.cleaner_2_id);
      });

      let profileMap: Record<string, string> = {};
      if (cleanerIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(cleanerIds));
        (profiles ?? []).forEach((p: any) => {
          profileMap[p.id] = p.full_name || '?';
        });
      }

      return (data ?? []).map((j: any) => ({
        ...j,
        property_name: j.properties?.property_name ?? 'Property',
        address: j.properties?.address ?? null,
        client_type: j.properties?.client_type ?? null,
        first_clean: j.properties?.first_clean === true,
        cleaners: [j.cleaner_1_id, j.cleaner_2_id]
          .filter(Boolean)
          .map((id: string) => ({ id, name: profileMap[id] || '?' })),
      }));
    },
  });

  const handleAccept = async (job: any) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { confirmed } = await acceptJob(job.id, user.id);
      toast.success(confirmed ? 'Accepted — job confirmed ✓' : 'Accepted — waiting on other cleaner');
      queryClient.invalidateQueries({ queryKey: ['my-pending-acceptances'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    } catch (e: any) {
      toast.error(e.message || 'Could not accept the job');
    } finally {
      setSubmitting(false);
      setActionJob(null);
      setActionType(null);
    }
  };

  const handleDecline = async (job: any) => {
    if (!user) return;
    setSubmitting(true);
    try {
      await declineJob(job.id, user.id, declineReason || undefined);
      toast.success('Declined — admin has been notified to reassign');
      queryClient.invalidateQueries({ queryKey: ['my-pending-acceptances'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    } catch (e: any) {
      toast.error(e.message || 'Could not decline the job');
    } finally {
      setSubmitting(false);
      setActionJob(null);
      setActionType(null);
      setDeclineReason('');
    }
  };

  if (isLoading && loadingPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* ── Pending offers — if any, show at the top ── */}
      {pendingOffers.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
              Awaiting your acceptance
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendingOffers.length} job{pendingOffers.length === 1 ? '' : 's'} need your response.
            </p>
          </div>

          {pendingOffers.map((job: any) => {
            const serviceLabel = job.client_type === 'airbnb' ? 'Airbnb Turnover' : 'House Clean';
            const durationHrs = job.estimated_duration ? `${(job.estimated_duration / 60).toFixed(1)} hrs` : null;
            const dateLabel = format(parseISO(job.scheduled_date), 'EEE, d MMM');
            return (
              <div
                key={job.id}
                className="bg-card rounded-2xl border-2 border-yellow-400/60 p-4 space-y-3 shadow-md"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-yellow-100 text-yellow-800 border-0 text-[10px] font-bold">
                      NEW OFFER
                    </Badge>
                    {job.first_clean && (
                      <Badge className="bg-amber-200 text-amber-900 border-0 text-[10px] font-bold">
                        ⭐ FIRST CLEAN
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{dateLabel}</span>
                    {job.scheduled_time && (
                      <span className="text-xs font-bold text-foreground">
                        · {job.scheduled_time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-foreground text-base truncate">{job.property_name}</p>
                  {job.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" /> {job.address}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">{serviceLabel}</span>
                    {durationHrs && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {durationHrs}
                      </span>
                    )}
                  </div>
                  {job.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{job.notes}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 rounded-xl font-bold border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => { setActionJob(job); setActionType('decline'); }}
                  >
                    <X className="h-4 w-4 mr-1" /> Decline
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-11 rounded-xl font-bold bg-brightly hover:bg-brightly/90"
                    onClick={() => { setActionJob(job); setActionType('accept'); }}
                  >
                    <Check className="h-4 w-4 mr-1" /> Accept
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Jobs by view ── */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">
          {view === 'week' ? 'My Jobs' : `${VIEW_LABELS[view]}'s Jobs`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{headingDate}</p>
      </div>

      {/* Segmented control: Today / Tomorrow / This Week */}
      <div className="bg-card rounded-2xl border border-border p-1 flex gap-1">
        {(['today', 'tomorrow', 'week'] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-bold transition-colors ${
              view === v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center">
          <p className="text-3xl mb-2">🌴</p>
          <p className="font-bold text-foreground">
            {view === 'today' ? 'No jobs scheduled for today.'
              : view === 'tomorrow' ? 'No jobs scheduled for tomorrow.'
              : 'No jobs scheduled this week.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const st = STATUS_CONFIG[job.status] ?? { label: job.status, className: 'bg-muted text-muted-foreground' };
            const serviceLabel = job.client_type === 'airbnb' ? 'Airbnb Turnover' : 'House Clean';
            const durationHrs = job.estimated_duration ? `${(job.estimated_duration / 60).toFixed(1)} hrs` : null;

            return (
              <button
                key={job.id}
                onClick={() => navigate(`/clean/${job.id}`)}
                className="w-full text-left bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* When showing multiple days, prefix the time with the day */}
                    {view !== 'today' && (
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {format(parseISO(job.scheduled_date), 'EEE, d MMM')}
                      </p>
                    )}
                    {job.scheduled_time && (
                      <p className="text-lg font-extrabold text-foreground">{job.scheduled_time.slice(0, 5)}</p>
                    )}
                    <p className="font-bold text-foreground text-base truncate">{job.property_name}</p>
                    {job.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" /> {job.address}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{serviceLabel}</span>
                      {durationHrs && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {durationHrs}
                        </span>
                      )}
                      {job.first_clean && (
                        <Badge className="bg-amber-200 text-amber-900 border-0 text-[10px] font-bold">
                          ⭐ FIRST CLEAN
                        </Badge>
                      )}
                    </div>
                    {job.cleaners.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {job.cleaners.map((c: any) => (
                          <div
                            key={c.id}
                            className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold"
                            title={c.name}
                          >
                            {c.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge className={`${st.className} text-[10px] font-bold`}>{st.label}</Badge>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Accept confirmation dialog ── */}
      <Dialog
        open={actionType === 'accept' && !!actionJob}
        onOpenChange={(o) => { if (!o) { setActionJob(null); setActionType(null); } }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Accept this job?</DialogTitle>
            <DialogDescription>
              {actionJob && (
                <>
                  {actionJob.property_name} on{' '}
                  {format(parseISO(actionJob.scheduled_date), 'EEE, d MMM')}
                  {actionJob.scheduled_time ? ` at ${actionJob.scheduled_time.slice(0, 5)}` : ''}.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setActionJob(null); setActionType(null); }} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => actionJob && handleAccept(actionJob)} disabled={submitting} className="bg-brightly hover:bg-brightly/90">
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Accepting…</> : 'Yes, Accept'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Decline dialog ── */}
      <Dialog
        open={actionType === 'decline' && !!actionJob}
        onOpenChange={(o) => { if (!o) { setActionJob(null); setActionType(null); setDeclineReason(''); } }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Decline this job?</DialogTitle>
            <DialogDescription>
              Admin will be notified so they can reassign. You can add a reason (optional).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="e.g. Already booked that day, too far, etc."
            className="rounded-xl min-h-[80px]"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setActionJob(null); setActionType(null); setDeclineReason(''); }} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => actionJob && handleDecline(actionJob)} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Declining…</> : 'Decline Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
