import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Check, X, Calendar, MapPin, Clock, Users, AlertTriangle, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCleanersList } from '@/hooks/useCleanersList';
import { syncJobAssignment, initialJobStatusForAssignment } from '@/lib/jobAssignment';

const SOURCE_ICONS: Record<string, string> = {
  guesty: '🏠',
  airbnb_ical: '🔴',
  stayz_ical: '🟡',
  booking_ical: '🔵',
  manual_ical: '📅',
};

type DayJob = {
  id: string;
  property_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  cleaner_1_id: string | null;
  cleaner_2_id: string | null;
  estimated_duration: number | null;
  properties: { property_name: string | null; address: string | null } | null;
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-emerald-500/10 text-emerald-600',
  in_progress: 'bg-blue-500/10 text-blue-600',
  completed: 'bg-muted text-muted-foreground',
  pending_cleaner: 'bg-amber-500/10 text-amber-600',
  awaiting_cleaner_acceptance: 'bg-amber-500/10 text-amber-600',
};

function statusLabel(status: string) {
  if (status === 'pending_cleaner') return 'Needs cleaner';
  if (status === 'awaiting_cleaner_acceptance') return 'Awaiting acceptance';
  return status.replace(/_/g, ' ');
}

function DayDecisionPanel({
  suggestion,
  jobs,
  isLoading,
  pendingCount,
  cleanerNames,
}: {
  suggestion: any;
  jobs: DayJob[];
  isLoading: boolean;
  pendingCount: number;
  cleanerNames: Record<string, string>;
}) {
  if (!suggestion?.suggested_clean_date) return null;

  const date = new Date(`${suggestion.suggested_clean_date}T00:00:00`);
  const property = suggestion.properties as any;
  const unassignedCount = jobs.filter((job) => !job.cleaner_1_id && !job.cleaner_2_id).length;
  const samePropertyJob = jobs.find((job) => job.property_id === suggestion.property_id);

  return (
    <aside className="lg:sticky lg:top-4 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      <div className="border-b border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary">Day at a glance</p>
        <div className="mt-2 flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <span className="text-[10px] font-bold uppercase">{format(date, 'MMM')}</span>
            <span className="text-2xl font-black leading-none">{format(date, 'd')}</span>
          </div>
          <div className="min-w-0 pt-1">
            <h2 className="text-xl font-extrabold text-foreground">{format(date, 'EEEE')}</h2>
            <p className="text-sm text-muted-foreground">{format(date, 'd MMMM yyyy')}</p>
            <p className="mt-1 truncate text-xs font-semibold text-primary">Reviewing {property?.property_name || 'this request'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-border p-4">
        <div className="rounded-xl bg-muted/60 p-3 text-center">
          <p className="text-xl font-black text-foreground">{jobs.length}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Booked</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3 text-center">
          <p className="text-xl font-black text-primary">{jobs.length + 1}</p>
          <p className="text-[10px] font-bold uppercase text-primary">If approved</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${unassignedCount ? 'bg-amber-500/10' : 'bg-muted/60'}`}>
          <p className={`text-xl font-black ${unassignedCount ? 'text-amber-600' : 'text-foreground'}`}>{unassignedCount}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Unassigned</p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {samePropertyJob && (
          <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="font-semibold">This property already has a clean on this day. Approval will be blocked as a duplicate.</p>
          </div>
        )}

        {pendingCount > 1 && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Sparkles className="h-4 w-4" />
            {pendingCount} requests are waiting for this same day.
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-foreground">Already scheduled</h3>
          <span className="text-xs text-muted-foreground">{jobs.length} clean{jobs.length === 1 ? '' : 's'}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <Calendar className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2 text-sm font-bold text-foreground">The day is currently clear</p>
            <p className="mt-1 text-xs text-muted-foreground">Approving this would create the first clean.</p>
          </div>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {jobs.map((job) => {
              const assignedNames = [job.cleaner_1_id, job.cleaner_2_id]
                .filter(Boolean)
                .map((id) => cleanerNames[id as string] || 'Cleaner');
              return (
                <div key={job.id} className="rounded-xl border border-border bg-background/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-foreground">{job.properties?.property_name || 'Property'}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {job.scheduled_time?.slice(0, 5) || 'Time not set'}
                        {job.estimated_duration ? ` · ${job.estimated_duration} hrs` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold capitalize ${STATUS_STYLES[job.status] || 'bg-muted text-muted-foreground'}`}>
                      {statusLabel(job.status)}
                    </span>
                  </div>
                  <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${assignedNames.length ? 'text-muted-foreground' : 'text-amber-600'}`}>
                    <Users className="h-3 w-3" />
                    {assignedNames.length ? assignedNames.join(' + ') : 'No cleaner assigned'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-primary">Proposed addition</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-foreground">{property?.property_name || 'Property'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{suggestion.suggested_clean_time?.slice(0, 5) || '10:00'} · Not yet scheduled</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary px-2 py-1 text-[10px] font-extrabold text-primary-foreground">+1 clean</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function BookingSuggestionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: cleaners = [] } = useCleanersList();
  const [approveModal, setApproveModal] = useState<any>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [cleanerId, setCleanerId] = useState('');
  const [cleanTime, setCleanTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['booking-suggestions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_suggestions' as any)
        .select('*, properties(property_name, address, default_cleaner_id, price_turnover)')
        .eq('status', 'pending')
        .order('checkout_date', { ascending: true });
      return (data || []) as any[];
    },
  });

  const selectedSuggestion = suggestions.find((suggestion: any) => suggestion.id === selectedSuggestionId)
    || suggestions[0]
    || null;
  const selectedCleanDate = selectedSuggestion?.suggested_clean_date || null;

  const { data: dayJobs = [], isLoading: dayJobsLoading } = useQuery({
    queryKey: ['booking-suggestion-day-jobs', selectedCleanDate],
    enabled: Boolean(selectedCleanDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, property_id, scheduled_date, scheduled_time, status, cleaner_1_id, cleaner_2_id, estimated_duration, properties(property_name, address)')
        .eq('scheduled_date', selectedCleanDate as string)
        .neq('status', 'cancelled')
        .order('scheduled_time', { ascending: true });
      if (error) throw error;
      return (data || []) as DayJob[];
    },
  });

  const cleanerNames = Object.fromEntries(cleaners.map((cleaner) => [cleaner.id, cleaner.full_name]));
  const sameDayPendingCount = selectedCleanDate
    ? suggestions.filter((suggestion: any) => suggestion.suggested_clean_date === selectedCleanDate).length
    : 0;

  const handleApprove = async () => {
    if (!approveModal || !user) return;
    setSubmitting(true);
    try {
      const prop = approveModal.properties as any;
      const finalCleanerId = cleanerId || prop?.default_cleaner_id || null;
      const sourceReference = approveModal.external_ref || approveModal.id;

      // Guard 1 — don't double-book: if a live job already exists for this
      // property on this date (e.g. created by the Hostaway pipeline, or a
      // previous approval), refuse instead of stacking a second clean.
      const { data: dupe } = await supabase
        .from('jobs')
        .select('id')
        .eq('property_id', approveModal.property_id)
        .eq('scheduled_date', approveModal.suggested_clean_date)
        .neq('status', 'cancelled')
        .limit(1);
      if (dupe && dupe.length > 0) {
        toast.error('A clean already exists for this property on that date.');
        setSubmitting(false);
        return;
      }

      const { data: job, error: jobErr } = await supabase.from('jobs').insert({
        property_id: approveModal.property_id,
        scheduled_date: approveModal.suggested_clean_date,
        scheduled_time: cleanTime,
        cleaner_1_id: finalCleanerId,
        status: initialJobStatusForAssignment(finalCleanerId, null),
        price_ex_gst: prop?.price_turnover || null,
        source: approveModal.source,
        source_turnover_key: `ical:${approveModal.property_id}:${sourceReference}`,
        source_external_refs: [sourceReference],
        source_synced_at: new Date().toISOString(),
        notes: approveModal.guest_name ? `Guest: ${approveModal.guest_name}` : null,
      } as any).select('id').single();
      if (jobErr) throw jobErr;

      // Guard 2 — atomic claim: only convert if still pending. If another tab
      // or admin already converted this suggestion, we lost the race — roll
      // back the job we just created so we don't leave a duplicate behind.
      const { data: claimed, error: claimErr } = await (supabase.from('booking_suggestions' as any) as any)
        .update({ status: 'converted', created_job_id: job.id, decided_at: new Date().toISOString(), decided_by: user.id })
        .eq('id', approveModal.id)
        .eq('status', 'pending')
        .select('id');
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) {
        await supabase.from('jobs').delete().eq('id', job.id);
        toast.error('This booking was already approved elsewhere.');
        setSubmitting(false);
        return;
      }

      // Sync acceptance + notify cleaner
      if (job?.id && finalCleanerId) {
        await syncJobAssignment(job.id, { sendSms: true });
      }

      toast.success('Booking approved — job created');
      queryClient.invalidateQueries({ queryKey: ['booking-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['booking-suggestion-day-jobs', approveModal.suggested_clean_date] });
      setApproveModal(null);
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const handleReject = async (id: string) => {
    if (!user) return;
    const { error } = await (supabase.from('booking_suggestions' as any) as any)
      .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: user.id })
      .eq('id', id);
    if (error) { toast.error('Failed to reject suggestion: ' + error.message); return; }
    toast.success('Suggestion rejected');
    queryClient.invalidateQueries({ queryKey: ['booking-suggestions'] });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">Bookings to Approve</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : suggestions.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center text-muted-foreground">
          No pending booking suggestions. All caught up! ✓
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.82fr)]">
          <div className="space-y-3">
            {suggestions.map((s: any) => {
              const prop = s.properties as any;
              const isSelected = selectedSuggestion?.id === s.id;
              return (
                <div key={s.id} className="space-y-3">
                  <div
                    onClick={() => setSelectedSuggestionId(s.id)}
                    className={`cursor-pointer space-y-3 rounded-2xl border bg-card p-4 shadow-md transition-all ${
                      isSelected
                        ? 'border-primary/70 ring-2 ring-primary/15'
                        : 'border-border hover:border-primary/30 hover:shadow-lg'
                    }`}
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-lg">{SOURCE_ICONS[s.source] || '📅'}</span>
                        <p className="truncate font-bold text-foreground">{prop?.property_name || 'Unknown'}</p>
                      </div>
                      {prop?.address && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{prop.address}</p>}
                      {s.guest_name && <p className="text-xs text-muted-foreground">Guest: {s.guest_name}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold uppercase text-muted-foreground">{s.source}</span>
                      {isSelected && <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">Showing day</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Checkout: {s.checkout_date ? format(new Date(s.checkout_date + 'T00:00:00'), 'MMM d') : '—'}</span>
                    </div>
                    <div className="flex items-center gap-1 font-bold text-primary">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Clean: {s.suggested_clean_date ? format(new Date(s.suggested_clean_date + 'T00:00:00'), 'MMM d') : '—'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 gap-1 bg-brightly font-bold text-white hover:bg-brightly-hover"
                      onClick={() => { setSelectedSuggestionId(s.id); setApproveModal(s); setCleanerId(prop?.default_cleaner_id || ''); setCleanTime(s.suggested_clean_time || '10:00'); }}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1 border-destructive font-bold text-destructive"
                      onClick={() => handleReject(s.id)}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                  </div>
                  {isSelected && (
                    <div className="lg:hidden">
                      <DayDecisionPanel
                        suggestion={selectedSuggestion}
                        jobs={dayJobs}
                        isLoading={dayJobsLoading}
                        pendingCount={sameDayPendingCount}
                        cleanerNames={cleanerNames}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden lg:block">
            <DayDecisionPanel
              suggestion={selectedSuggestion}
              jobs={dayJobs}
              isLoading={dayJobsLoading}
              pendingCount={sameDayPendingCount}
              cleanerNames={cleanerNames}
            />
          </div>
        </div>
      )}

      <Dialog open={!!approveModal} onOpenChange={() => setApproveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {approveModal?.suggested_clean_date && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  {format(new Date(`${approveModal.suggested_clean_date}T00:00:00`), 'EEEE, d MMMM')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dayJobs.length} clean{dayJobs.length === 1 ? '' : 's'} already scheduled · {dayJobs.filter((job) => !job.cleaner_1_id && !job.cleaner_2_id).length} unassigned
                </p>
              </div>
            )}
            <div>
              <Label>Clean Time</Label>
              <TimeSelect value={cleanTime} onChange={setCleanTime} />
            </div>
            <div>
              <Label>Assign Cleaner</Label>
              <Select value={cleanerId} onValueChange={setCleanerId}>
                <SelectTrigger><SelectValue placeholder="Select cleaner" /></SelectTrigger>
                <SelectContent>
                  {cleaners.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleApprove} disabled={submitting} className="w-full bg-brightly hover:bg-brightly-hover text-white font-bold">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
