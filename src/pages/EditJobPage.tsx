import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useCleanerConflicts, useAllCleanerAvailability } from '@/hooks/useCleanerConflicts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, CalendarIcon } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { RecurringJobSection, defaultRecurringConfig, RecurringConfig, getIntervalWeeks } from '@/components/schedule/RecurringJobSection';
import { CleanerConflictWarning } from '@/components/schedule/CleanerConflictWarning';
import { findClashes, describeJob, DEFAULT_JOB_MINUTES, type CleanerJob } from '@/lib/cleanerClash';
import { syncJobAssignment } from '@/lib/jobAssignment';
import { useAuth } from '@/contexts/AuthContext';
import { DURATIONS } from '@/lib/jobDurations';
import { JOB_CLEAN_TYPES, defaultCleanType } from '@/lib/serviceTypes';


export default function EditJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const [saving, setSaving] = useState(false);
  const [editScope, setEditScope] = useState<'this' | 'future'>('this');
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('120');
  const [cleanType, setCleanType] = useState<string>('House Clean');
  const [cleaner1, setCleaner1] = useState('');
  const [cleaner2, setCleaner2] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('scheduled');
  const [recurring, setRecurring] = useState<RecurringConfig>(defaultRecurringConfig);

  const { data: job, isLoading } = useQuery({
    queryKey: ['edit-job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb)')
        .eq('id', jobId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  const seriesId = (job as any)?.series_id;
  const { data: series } = useQuery({
    queryKey: ['job-series', seriesId],
    queryFn: async () => {
      const { data } = await supabase.from('job_series').select('*').eq('id', seriesId).single();
      return data as any;
    },
    enabled: !!seriesId,
  });

  // Availability check
  const { unavailableMap, unavailableReason, dayName } = useAllCleanerAvailability(date, cleaners.map((c: any) => c.id));

  // How long this clean runs, so "booked at the same time" means overlapping
  // hours rather than merely the same day.
  const jobMinutes = Number(duration) || DEFAULT_JOB_MINUTES;

  // The job being edited is always in its own cleaner's list, so it is filtered
  // out by id first. Without that, every job would clash with itself.
  const toCleanerJob = (c: { property_name: string; scheduled_time: string | null; estimated_duration: number | null }): CleanerJob =>
    ({ property_name: c.property_name, time: c.scheduled_time, durationMin: c.estimated_duration });

  // Conflict detection for cleaner 1
  const c1Conflicts = useCleanerConflicts(cleaner1, date);
  const c1FilteredConflicts = c1Conflicts.conflicts.filter(c => c.id !== jobId).map(toCleanerJob);
  const c1Clashes = findClashes(c1FilteredConflicts, time, jobMinutes);
  const c1Unavailable = !!unavailableMap[cleaner1];
  const c1HasIssue = c1Unavailable || c1FilteredConflicts.length > 0 || c1Conflicts.isOnLeave;

  const c2Conflicts = useCleanerConflicts(cleaner2 || undefined, date);
  const c2FilteredConflicts = c2Conflicts.conflicts.filter(c => c.id !== jobId).map(toCleanerJob);
  const c2Clashes = cleaner2 ? findClashes(c2FilteredConflicts, time, jobMinutes) : [];
  const c2Unavailable = cleaner2 ? !!unavailableMap[cleaner2] : false;
  const c2HasIssue = cleaner2 && (c2Unavailable || c2FilteredConflicts.length > 0 || c2Conflicts.isOnLeave);

  const hasUnavailableCleaner = Boolean((cleaner1 && c1Unavailable) || (cleaner2 && c2Unavailable));
  // Moving a job onto a slot the cleaner is already working is the same
  // mistake as booking a new one there, so it is blocked the same way.
  const hasClashingCleaner = Boolean(c1Clashes.length || c2Clashes.length);
  const canOverrideAvailability = role === 'admin';
  const blocked = hasUnavailableCleaner || hasClashingCleaner;
  const availabilityOverride = blocked && canOverrideAvailability && conflictAcknowledged;
  const hasHardBlock = blocked && !availabilityOverride;
  const hasAnyConflict = c1HasIssue || c2HasIssue;

  const cleaner1Name = cleaners.find((c: any) => c.id === cleaner1)?.full_name || 'Cleaner';
  const cleaner2Name = cleaners.find((c: any) => c.id === cleaner2)?.full_name || 'Cleaner';

  const getCleanerLabel = (c: any) => {
    const name = c.full_name || c.email;
    if (unavailableMap[c.id]) return `❌ ${name} (${unavailableReason[c.id]?.kind === 'leave' ? 'on leave' : 'not available'})`;
    return name;
  };

  useEffect(() => {
    if (job) {
      setDate(parseISO(job.scheduled_date));
      setTime(job.scheduled_time?.slice(0, 5) || '09:00');
      setDuration(String(job.estimated_duration || 120));
      // Pre-6-Nov jobs were given a type by the backfill rather than by a
      // person. Showing that value lets it be corrected here, and saving marks
      // it as chosen.
      setCleanType((job as any).service_type || defaultCleanType((job as any).properties?.client_type));
      setCleaner1(job.cleaner_1_id || '');
      setCleaner2(job.cleaner_2_id || '');
      setNotes(job.notes || '');
      setStatus(job.status || 'scheduled');
      setConflictAcknowledged(Boolean((job as any).availability_override));
    }
  }, [job]);

  useEffect(() => {
    if (series) {
      setRecurring({
        enabled: true,
        frequency: series.frequency || 'weekly',
        customWeeks: series.interval_weeks || 1,
        endType: series.end_date ? 'until' : 'ongoing',
        endDate: series.end_date ? parseISO(series.end_date) : undefined,
        preferredDays: [],
      });
    }
  }, [series]);

  const handleSave = async () => {
    if (!date) { toast.error('Please select a date.'); return; }
    if (!cleaner1) { toast.error('Please assign at least one cleaner.'); return; }
    if (hasHardBlock) {
      const clash = c1Clashes[0] || c2Clashes[0];
      toast.error(
        clash
          ? `Cannot save. That cleaner is already on ${describeJob(clash)}.`
          : 'Cannot save — a cleaner is not available on this day.'
      );
      return;
    }
    if (hasAnyConflict && !conflictAcknowledged) { toast.error('Please acknowledge the conflict warning before saving.'); return; }

    setSaving(true);

    const updatePayload: any = {
      scheduled_date: format(date, 'yyyy-MM-dd'),
      scheduled_time: time,
      estimated_duration: parseInt(duration),
      service_type: cleanType,
      service_type_inferred: false,
      cleaner_1_id: cleaner1,
      cleaner_2_id: cleaner2 || null,
      notes: notes || null,
      status,
      availability_override: availabilityOverride,
      availability_override_reason: availabilityOverride ? 'Admin manually overrode cleaner availability while editing this clean.' : null,
    };

    // Detect changes that invalidate prior cleaner acceptance (re-acceptance required).
    // Rule (decision 1B): re-accept on date, time, or cleaner change — not for cosmetic edits.
    const dateChanged = format(date, 'yyyy-MM-dd') !== job.scheduled_date;
    const timeChanged = time !== (job.scheduled_time?.slice(0, 5) || '');
    const cleaner1Changed = (cleaner1 || null) !== (job.cleaner_1_id || null);
    const cleaner2Changed = (cleaner2 || null) !== (job.cleaner_2_id || null);
    const assignmentChanged = cleaner1Changed || cleaner2Changed;
    const scheduleChanged = dateChanged || timeChanged;
    const shouldReaccept = job.status === 'confirmed' && (scheduleChanged || assignmentChanged);

    if (editScope === 'future' && seriesId) {
      // Future recurring edit: touch every live future clean in the series.
      // (Skip in-progress, completed, cancelled, flagged — terminal or in flight.)
      //
      // Moving the date here used to do nothing at all: the new date was used
      // only as the "from here on" filter and was never written, while the
      // toast still said every job was updated. Changing the day now SHIFTS the
      // whole series by the same number of days, which is what moving a standing
      // booking means. The cleans stay on cadence, just on the new weekday.
      const dayShift = differenceInCalendarDays(date, new Date(job.scheduled_date + 'T00:00:00'));

      const { data: futureRows, error: readErr } = await supabase.from('jobs')
        .select('id, scheduled_date')
        .eq('series_id', seriesId)
        .gte('scheduled_date', job.scheduled_date)
        .in('status', ['scheduled', 'pending_cleaner', 'awaiting_cleaner_acceptance', 'confirmed'])
        .order('scheduled_date', { ascending: true });
      if (readErr) { toast.error(readErr.message); setSaving(false); return; }

      const sharedPatch = {
        scheduled_time: time,
        estimated_duration: parseInt(duration),
        service_type: cleanType,
        service_type_inferred: false,
        cleaner_1_id: cleaner1,
        cleaner_2_id: cleaner2 || null,
        notes: notes || null,
        availability_override: availabilityOverride,
        availability_override_reason: availabilityOverride ? 'Admin manually overrode cleaner availability for future cleans in this series.' : null,
      };

      // Shifting dates one row at a time, furthest first, so two cleans never
      // collide on the same date mid-shift (the unique index would refuse).
      const ordered = dayShift > 0 ? [...(futureRows || [])].reverse() : (futureRows || []);
      const moved: string[] = [];
      let failed: string | null = null;
      for (const row of ordered) {
        const patch: any = { ...sharedPatch };
        if (dayShift !== 0) {
          patch.scheduled_date = format(addDays(new Date(row.scheduled_date + 'T00:00:00'), dayShift), 'yyyy-MM-dd');
        }
        const { error: rowErr } = await supabase.from('jobs').update(patch).eq('id', row.id);
        if (rowErr) { failed = rowErr.message; break; }
        moved.push(row.id);
      }
      if (failed) {
        toast.error(`Updated ${moved.length} of ${ordered.length} cleans, then stopped: ${failed}`, { duration: 12000 });
        setSaving(false);
        return;
      }
      const updatedFuture = moved.map((id) => ({ id }));
      const error = null as any;
      if (error) { toast.error(error); setSaving(false); return; }

      await supabase.from('job_series').update({
        cleaner_1_id: cleaner1,
        cleaner_2_id: cleaner2 || null,
        notes: notes || null,
        interval_weeks: getIntervalWeeks(recurring),
        frequency: recurring.frequency,
        // The series anchor moves with the cleans, so tonight's top up carries
        // on from the new day instead of dragging them back to the old one.
        start_date: format(date, 'yyyy-MM-dd'),
        end_date: recurring.endType === 'until' && recurring.endDate ? format(recurring.endDate, 'yyyy-MM-dd') : null,
      } as any).eq('id', seriesId);

      // Re-sync each touched child job (forces re-acceptance).
      // SMS only on the first one to avoid flooding — cleaners will see the set in /my-jobs.
      const touchedIds = (updatedFuture || []).map((r: any) => r.id);
      for (let i = 0; i < touchedIds.length; i++) {
        await syncJobAssignment(touchedIds[i], { sendSms: i === 0, forceReaccept: true });
      }

      toast.success(
        dayShift === 0
          ? `${moved.length} future cleans updated`
          : `${moved.length} future cleans moved ${Math.abs(dayShift)} day${Math.abs(dayShift) === 1 ? '' : 's'} ${dayShift > 0 ? 'later' : 'earlier'}`,
      );
    } else {
      const { error } = await supabase.from('jobs').update(updatePayload).eq('id', jobId!);
      if (error) { toast.error(error.message); setSaving(false); return; }

      // Send update SMS to client if date/time changed
      if (scheduleChanged) {
        try {
          const res = await supabase.functions.invoke('send-client-booking-sms', {
            body: { job_id: jobId, is_update: true },
          });
          const data = res.data as any;
          if (data?.error) {
            toast.error(`⚠️ Client update SMS failed: ${data.error}`);
          }
        } catch (err: any) {
          toast.error(`⚠️ Client update SMS failed: ${err.message}`);
        }
      }

      // Re-sync the cleaner acceptance state machine.
      // - If assignment changed: new cleaners need to accept; old ones are removed.
      // - If schedule changed on a confirmed job: existing cleaners must re-accept.
      // - Otherwise (cosmetic edit): no-op sync won't change anything.
      if (assignmentChanged || shouldReaccept) {
        try {
          await syncJobAssignment(jobId!, { sendSms: true, forceReaccept: shouldReaccept });
        } catch (err: any) {
          toast.error(`⚠️ Job saved but cleaner notification failed: ${err.message}`);
        }
      }

      toast.success('Job updated!');
    }

    queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    navigate(`/jobs/${jobId}`);
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-primary font-bold text-lg">Loading job…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground text-center py-8">Job not found.</p>
      </div>
    );
  }

  const property = job.properties as any;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/jobs/${jobId}`)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Edit Job</h1>

      {seriesId && (
        <div className="bg-primary/5 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-primary">🔄 This is a recurring job</p>
          <div className="flex gap-2">
            <button
              onClick={() => setEditScope('this')}
              className={cn(
                'flex-1 h-10 rounded-xl font-bold text-xs transition-colors',
                editScope === 'this' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              Edit this job only
            </button>
            <button
              onClick={() => setEditScope('future')}
              className={cn(
                'flex-1 h-10 rounded-xl font-bold text-xs transition-colors',
                editScope === 'future' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              Edit all future jobs
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Section title="Property">
          <div className="bg-secondary rounded-2xl px-4 py-3">
            <p className="font-bold text-foreground text-sm">
              {property?.property_name || (job as any)?.client_name || (job as any)?.property_address || 'No property linked'}
            </p>
            <p className="text-xs text-muted-foreground">
              {[property?.address, property?.suburb].filter(Boolean).join(', ') || (job as any)?.property_address || ''}
            </p>
          </div>
        </Section>

        <Section title="Status">
          <FormField label="Job Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* Yellow (state machine) — shown for visibility but set automatically. */}
                <SelectItem value="pending_cleaner">🟡 Needs Cleaner</SelectItem>
                <SelectItem value="awaiting_cleaner_acceptance">🟡 Awaiting Cleaner</SelectItem>
                {/* Green */}
                <SelectItem value="confirmed">🟢 Confirmed</SelectItem>
                {/* Legacy green — only on pre-fix jobs */}
                <SelectItem value="scheduled">🟢 Scheduled (legacy)</SelectItem>
                {/* In-flight / terminal */}
                <SelectItem value="in_progress">🔵 In Progress</SelectItem>
                <SelectItem value="completed">⚪ Completed</SelectItem>
                <SelectItem value="flagged">🔴 Flagged</SelectItem>
                <SelectItem value="cancelled">🔴 Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </Section>

        <Section title="Date & Time">
          <FormField label="Date *">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full h-14 rounded-2xl justify-start text-left font-semibold', !date && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-5 w-5" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setConflictAcknowledged(false); }} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Time *">
              <TimeSelect value={time} onChange={(v: string) => { setTime(v); setConflictAcknowledged(false); }} className="h-14 rounded-2xl" />
            </FormField>
            <FormField label="Estimated Duration">
              <Select value={duration} onValueChange={(v) => { setDuration(v); setConflictAcknowledged(false); }}>
                <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Clean Type">
            <Select value={cleanType} onValueChange={setCleanType}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOB_CLEAN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {(job as any)?.service_type_inferred && (
              <p className="mt-1.5 text-xs text-amber-400">
                Assumed from the property, not chosen. Saving confirms it.
              </p>
            )}
          </FormField>
        </Section>

        <Section title="Assigned Cleaners">
          <FormField label="Cleaner 1 *">
            <Select value={cleaner1} onValueChange={(v) => { setCleaner1(v); setConflictAcknowledged(false); }}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                {cleaners.map((c: any) => (
                  <SelectItem key={c.id} value={c.id} disabled={!!unavailableMap[c.id] && !canOverrideAvailability} className={unavailableMap[c.id] ? 'opacity-60' : ''}>
                    {getCleanerLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {c1HasIssue && !conflictAcknowledged && (
            <CleanerConflictWarning
              cleanerName={cleaner1Name}
              conflicts={c1FilteredConflicts}
              clashes={c1Clashes}
              isOnLeave={c1Conflicts.isOnLeave}
              isUnavailable={c1Unavailable}
              unavailableReason={unavailableReason[cleaner1]}
              dayName={dayName}
              canOverrideAvailability={canOverrideAvailability}
              leaveReason={c1Conflicts.leaveOnDate[0]?.reason}
              onConfirm={() => setConflictAcknowledged(true)}
              onCancel={() => setCleaner1(job.cleaner_1_id || '')}
            />
          )}

          <FormField label="Cleaner 2">
            <Select value={cleaner2 || '__none__'} onValueChange={(v) => { setCleaner2(v === '__none__' ? '' : v); setConflictAcknowledged(false); }}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {cleaners.filter((c: any) => c.id !== cleaner1).map((c: any) => (
                  <SelectItem key={c.id} value={c.id} disabled={!!unavailableMap[c.id] && !canOverrideAvailability} className={unavailableMap[c.id] ? 'opacity-60' : ''}>
                    {getCleanerLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {c2HasIssue && !conflictAcknowledged && (
            <CleanerConflictWarning
              cleanerName={cleaner2Name}
              conflicts={c2FilteredConflicts}
              clashes={c2Clashes}
              isOnLeave={c2Conflicts.isOnLeave}
              isUnavailable={c2Unavailable}
              unavailableReason={cleaner2 ? unavailableReason[cleaner2] : undefined}
              dayName={dayName}
              canOverrideAvailability={canOverrideAvailability}
              leaveReason={c2Conflicts.leaveOnDate[0]?.reason}
              onConfirm={() => setConflictAcknowledged(true)}
              onCancel={() => setCleaner2(job.cleaner_2_id || '')}
            />
          )}
        </Section>

        <Section title="Notes">
          <FormField label="Notes for Cleaners">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-2xl min-h-[100px]"
              placeholder="General instructions, linen count, special notes…"
            />
          </FormField>
        </Section>

        <Button variant="accent" size="lg" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Saving…' : editScope === 'future' ? 'Update All Future Jobs' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <h2 className="text-lg font-bold text-primary">{title}</h2>
      {children}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}
