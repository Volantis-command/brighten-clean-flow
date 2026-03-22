import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { RecurringJobSection, defaultRecurringConfig, RecurringConfig, getIntervalWeeks } from '@/components/schedule/RecurringJobSection';
import { generateRecurringDates } from '@/lib/recurringJobs';

const DURATIONS = [
  { value: '60', label: '1 hr' },
  { value: '90', label: '1.5 hr' },
  { value: '120', label: '2 hr' },
  { value: '150', label: '2.5 hr' },
  { value: '180', label: '3 hr' },
  { value: '210', label: '3.5 hr' },
  { value: '240', label: '4 hr' },
  { value: '300', label: '4 hr+' },
];

export default function EditJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const [saving, setSaving] = useState(false);
  const [editScope, setEditScope] = useState<'this' | 'future'>('this');

  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('120');
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

  // Load series info if this job belongs to a series
  const seriesId = (job as any)?.series_id;
  const { data: series } = useQuery({
    queryKey: ['job-series', seriesId],
    queryFn: async () => {
      const { data } = await supabase.from('job_series' as any).select('*').eq('id', seriesId).single();
      return data as any;
    },
    enabled: !!seriesId,
  });

  useEffect(() => {
    if (job) {
      setDate(parseISO(job.scheduled_date));
      setTime(job.scheduled_time?.slice(0, 5) || '09:00');
      setDuration(String(job.estimated_duration || 120));
      setCleaner1(job.cleaner_1_id || '');
      setCleaner2(job.cleaner_2_id || '');
      setNotes(job.notes || '');
      setStatus(job.status || 'scheduled');
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

    setSaving(true);

    const updatePayload: any = {
      scheduled_date: format(date, 'yyyy-MM-dd'),
      scheduled_time: time,
      estimated_duration: parseInt(duration),
      cleaner_1_id: cleaner1,
      cleaner_2_id: cleaner2 || null,
      notes: notes || null,
      status,
    };

    if (editScope === 'future' && seriesId) {
      // Update all future jobs in the series
      const { error } = await supabase.from('jobs')
        .update({
          scheduled_time: time,
          estimated_duration: parseInt(duration),
          cleaner_1_id: cleaner1,
          cleaner_2_id: cleaner2 || null,
          notes: notes || null,
        } as any)
        .eq('series_id', seriesId)
        .gte('scheduled_date', format(date, 'yyyy-MM-dd'))
        .eq('status', 'scheduled');

      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }

      // Also update the series record
      await supabase.from('job_series' as any).update({
        cleaner_1_id: cleaner1,
        cleaner_2_id: cleaner2 || null,
        notes: notes || null,
        interval_weeks: getIntervalWeeks(recurring),
        frequency: recurring.frequency,
        end_date: recurring.endType === 'until' && recurring.endDate ? format(recurring.endDate, 'yyyy-MM-dd') : null,
      } as any).eq('id', seriesId);

      toast.success('All future jobs updated!');
    } else {
      // Update just this job
      const { error } = await supabase.from('jobs').update(updatePayload).eq('id', jobId!);

      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
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
        {/* Property (read-only) */}
        <Section title="Property">
          <div className="bg-secondary rounded-2xl px-4 py-3">
            <p className="font-bold text-foreground text-sm">{property?.property_name}</p>
            <p className="text-xs text-muted-foreground">{[property?.address, property?.suburb].filter(Boolean).join(', ')}</p>
          </div>
        </Section>

        {/* Status */}
        <Section title="Status">
          <FormField label="Job Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </Section>

        {/* Date & Time */}
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
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Time *">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-14 rounded-2xl" />
            </FormField>
            <FormField label="Estimated Duration">
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </Section>

        {/* Cleaners */}
        <Section title="Assigned Cleaners">
          <FormField label="Cleaner 1 *">
            <Select value={cleaner1} onValueChange={setCleaner1}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                {cleaners.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Cleaner 2">
            <Select value={cleaner2 || '__none__'} onValueChange={(v) => setCleaner2(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {cleaners.filter((c: any) => c.id !== cleaner1).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </Section>

        {/* Notes */}
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
