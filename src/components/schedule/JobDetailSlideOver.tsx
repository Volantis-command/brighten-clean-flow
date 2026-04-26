import { useState } from 'react';
import { X, MapPin, Clock, Timer, Users, Send, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getStatusColor, getAcceptanceIcon } from './CalendarStatusColors';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ScheduleJob } from '@/hooks/useScheduleJobs';
import { format } from 'date-fns';
import { jobLabel } from '@/lib/jobLabel';
import { useCleanersList } from '@/hooks/useCleanersList';
import { syncJobAssignment } from '@/lib/jobAssignment';
import { createRecurringJobSeries, type RecurringFrequency } from '@/lib/recurringJobHelper';

interface JobDetailSlideOverProps {
  job: ScheduleJob | null;
  nameMap: Record<string, string>;
  acceptances?: { cleaner_id: string; cleaner_name: string; acceptance_status: string }[];
  onClose: () => void;
}

const STATUSES = [
  'pending_cleaner',
  'awaiting_cleaner_acceptance',
  'awaiting_quote',
  'confirmed',
  'scheduled',
  'in_progress',
  'completed',
  'flagged',
  'cancelled',
];

export function JobDetailSlideOver({ job, nameMap, acceptances, onClose }: JobDetailSlideOverProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [resendingSms, setResendingSms] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assigningCleaner, setAssigningCleaner] = useState(false);
  const [convertingFreq, setConvertingFreq] = useState(false);
  const { data: cleanersList = [] } = useCleanersList();

  if (!job) return null;

  const handleCleanerChange = async (slot: 'cleaner_1_id' | 'cleaner_2_id', value: string) => {
    setAssigningCleaner(true);
    try {
      const newId = value === '__none__' ? null : value;
      const { error } = await supabase.from('jobs').update({ [slot]: newId } as any).eq('id', job.id);
      if (error) throw error;
      // syncJobAssignment recomputes status, manages job_acceptances rows, sends SMS to new cleaner
      await syncJobAssignment(job.id, { sendSms: true });
      toast.success(newId ? 'Cleaner assigned ✓' : 'Cleaner removed');
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-acceptances'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to update cleaner');
    } finally {
      setAssigningCleaner(false);
    }
  };

  const sc = getStatusColor(job.status);
  const cleaners = [
    job.cleaner_1_id ? { id: job.cleaner_1_id, name: nameMap[job.cleaner_1_id] || 'Unknown' } : null,
    job.cleaner_2_id ? { id: job.cleaner_2_id, name: nameMap[job.cleaner_2_id] || 'Unknown' } : null,
  ].filter(Boolean) as { id: string; name: string }[];

  const handleFrequencyChange = async (newFreq: RecurringFrequency) => {
    if (newFreq === (job.frequency || 'one-off')) return;

    // Going FROM one-off TO recurring → create job_series + future child jobs
    if ((job.frequency || 'one-off') === 'one-off' && newFreq !== 'one-off') {
      if (!confirm(`Convert this job to ${newFreq}? This will auto-create future cleans at the same time and duration. You can edit or cancel each one individually.`)) return;
      setConvertingFreq(true);
      try {
        // Pull the full job row — the slide-over only gets a slim ScheduleJob
        // shape, but createRecurringJobSeries needs price + property + duration.
        const { data: full } = await supabase
          .from('jobs')
          .select('property_id, scheduled_date, scheduled_time, estimated_duration, price_ex_gst, price_inc_gst, notes, cleaner_1_id, source')
          .eq('id', job.id)
          .single();
        if (!full || !full.scheduled_date) throw new Error('Cannot convert: missing scheduled date');

        const result = await createRecurringJobSeries({
          parentJobId: job.id,
          frequency: newFreq,
          startDate: full.scheduled_date,
          scheduledTime: full.scheduled_time,
          propertyId: full.property_id,
          priceExGst: full.price_ex_gst,
          priceIncGst: full.price_inc_gst,
          notes: full.notes,
          cleanerId: full.cleaner_1_id,
          estimatedDuration: full.estimated_duration,
          source: full.source,
        });
        toast.success(`Converted to ${newFreq} — ${result.jobCount} future cleans created ✓`);
        queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      } catch (e: any) {
        toast.error(`Failed to convert: ${e.message || 'unknown error'}`);
      } finally {
        setConvertingFreq(false);
      }
      return;
    }

    // Going FROM recurring TO one-off, or between recurring frequencies →
    // just update the parent's frequency. We don't auto-delete future
    // children — admin can cancel each one individually if they want.
    setConvertingFreq(true);
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ frequency: newFreq } as any)
        .eq('id', job.id);
      if (error) throw error;
      toast.success(`Frequency set to ${newFreq}. Future cleans (if any) were not changed — cancel them individually.`);
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    } catch (e: any) {
      toast.error(`Update failed: ${e.message || 'unknown error'}`);
    } finally {
      setConvertingFreq(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Status updated to ${getStatusColor(newStatus).label}`);
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    }
    setUpdatingStatus(false);
  };

  const handleResendSms = async () => {
    setResendingSms(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-job-sms', {
        body: { job_id: job.id },
      });
      if (error) throw error;
      toast.success('SMS sent to cleaner ✓');
    } catch (e: any) {
      toast.error(`SMS failed: ${e.message}`);
    }
    setResendingSms(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from('jobs').delete().eq('id', job.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Job deleted');
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      onClose();
    }
    setDeleting(false);
  };

  const address = [job.properties?.address, job.properties?.suburb].filter(Boolean).join(', ');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-background shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-extrabold text-primary truncate">Job Details</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Property */}
          <div>
            <h3 className="text-xl font-extrabold text-foreground">{jobLabel(job)}</h3>
            {address && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <MapPin className="h-4 w-4" />
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener"
                  className="underline hover:text-primary"
                  onClick={e => e.stopPropagation()}
                >
                  {address}
                </a>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Status</label>
            <Select value={job.status} onValueChange={handleStatusChange} disabled={updatingStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    <span className={cn('inline-block w-2 h-2 rounded-full mr-2', getStatusColor(s).dot)} />
                    {getStatusColor(s).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency — convert one-off to recurring (or change cadence) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase">Frequency</label>
            <Select
              value={(job.frequency as RecurringFrequency) || 'one-off'}
              onValueChange={(v) => handleFrequencyChange(v as RecurringFrequency)}
              disabled={convertingFreq}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-off">One-off (single clean)</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="fortnightly">Fortnightly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {(job.frequency || 'one-off') === 'one-off' && (
              <p className="text-[10px] text-muted-foreground">
                Switching from one-off to recurring auto-creates future cleans at the same time + cleaner. Each is editable individually.
              </p>
            )}
          </div>

          {/* Date / Time / Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Date</p>
              <p className="text-sm font-bold text-foreground">
                {format(new Date(job.scheduled_date + 'T00:00:00'), 'EEE, d MMM yyyy')}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Time</p>
              <p className="text-sm font-bold text-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {job.scheduled_time?.slice(0, 5) || '—'}
              </p>
            </div>
            {job.estimated_duration && (
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Duration</p>
                <p className="text-sm font-bold text-foreground flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  {job.estimated_duration / 60}hr
                </p>
              </div>
            )}
            {job.price_ex_gst != null && job.price_ex_gst > 0 && (
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Price</p>
                <p className="text-sm font-extrabold text-foreground">${job.price_ex_gst.toFixed(2)} ex GST</p>
                {job.price_inc_gst && (
                  <p className="text-[10px] text-muted-foreground">${job.price_inc_gst.toFixed(2)} inc GST</p>
                )}
              </div>
            )}
          </div>

          {/* Cleaners — assignable inline */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Cleaners
            </label>

            {/* Existing assigned cleaners with acceptance status */}
            {cleaners.length > 0 && (
              <div className="space-y-2">
                {cleaners.map(c => {
                  const acc = acceptances?.find(a => a.cleaner_id === c.id);
                  return (
                    <div key={c.id} className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-extrabold">
                          {c.name.charAt(0)}
                        </span>
                        <span className="text-sm font-bold text-foreground">{c.name}</span>
                      </div>
                      {acc ? (
                        <span className="text-sm">{getAcceptanceIcon(acc.acceptance_status)} {acc.acceptance_status}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">📵 Not Sent</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Assign / change cleaner dropdowns */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Cleaner 1</label>
                <Select
                  value={job.cleaner_1_id || '__none__'}
                  onValueChange={(v) => handleCleanerChange('cleaner_1_id', v)}
                  disabled={assigningCleaner}
                >
                  <SelectTrigger className="w-full h-10 mt-0.5">
                    <SelectValue placeholder="Assign cleaner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {(cleanersList as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Cleaner 2 (optional)</label>
                <Select
                  value={job.cleaner_2_id || '__none__'}
                  onValueChange={(v) => handleCleanerChange('cleaner_2_id', v)}
                  disabled={assigningCleaner}
                >
                  <SelectTrigger className="w-full h-10 mt-0.5">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(cleanersList as any[])
                      .filter((c: any) => c.id !== job.cleaner_1_id)
                      .map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">Changing cleaners sends a fresh acceptance offer via SMS.</p>
            </div>
          </div>

          {/* Notes */}
          {job.notes && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Notes</label>
              <p className="text-sm text-foreground bg-muted/50 rounded-xl p-3">{job.notes}</p>
            </div>
          )}

          {/* Awaiting quote banner */}
          {job.status === 'awaiting_quote' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-sm font-bold text-amber-800">⚠️ This job needs a price before scheduling</p>
              <Button
                variant="default"
                className="mt-3"
                onClick={() => { onClose(); navigate(`/jobs/${job.id}`); }}
              >
                Set Price
              </Button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-border p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleResendSms} disabled={resendingSms}>
              <Send className="h-4 w-4" />
              {resendingSms ? 'Sending…' : 'Resend SMS'}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { onClose(); navigate(`/jobs/${job.id}`); }}>
              <ExternalLink className="h-4 w-4" />
              Full Details
            </Button>
          </div>

          {!confirmDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Job
            </Button>
          ) : (
            <div className="bg-destructive/10 rounded-xl p-3 space-y-2">
              <p className="text-sm font-bold text-destructive">Delete this job? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" className="flex-1" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
