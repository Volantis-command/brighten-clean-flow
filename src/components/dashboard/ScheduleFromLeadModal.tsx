import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, User, MapPin, Phone, Mail, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { syncJobAssignment, initialJobStatusForAssignment } from '@/lib/jobAssignment';

/**
 * Opens from Dashboard -> Accepted column -> "Schedule Clean" / "Assign Cleaner".
 *
 * Fixes Brendan's flow complaint: the old buttons navigated to /schedule with
 * a query param that nobody read — net effect: the admin landed on an empty
 * calendar and had to start over from scratch. This modal opens inline, shows
 * everything we already know about the client + property, and lets admin
 * finish the scheduling in one step.
 *
 * Flow on Save:
 *   1. Call `link-intake-to-profile` edge function so the client profile +
 *      property + client_properties link exist and are reused if already there
 *      (idempotent, server-side, bypasses RLS).
 *   2. Insert a job row with the returned property_id. The DB trigger forces
 *      the right initial status (pending_cleaner / awaiting_cleaner_acceptance).
 *   3. Call syncJobAssignment if a cleaner was picked — creates the
 *      job_acceptances row and SMSes the cleaner.
 *   4. Mark the quote_request as 'scheduled' so it moves out of the Accepted
 *      column on the dashboard.
 */

const DURATIONS = [
  { value: '60', label: '1 hr' },
  { value: '90', label: '1.5 hr' },
  { value: '120', label: '2 hr' },
  { value: '150', label: '2.5 hr' },
  { value: '180', label: '3 hr' },
  { value: '240', label: '4 hr' },
  { value: '300', label: '5 hr' },
];

interface Lead {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  clean_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  total_inc_gst?: number | null;
  total_ex_gst?: number | null;
  estimated_hours?: number | null;
  form_data?: Record<string, any> | null;
}

interface Props {
  open: boolean;
  lead: Lead | null;
  /** When true, scrolls focus to the cleaner picker to match "Assign Cleaner" intent. */
  focusCleaner?: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

export default function ScheduleFromLeadModal({ open, lead, focusCleaner, onOpenChange, onScheduled }: Props) {
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();

  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('120');
  const [cleaner1, setCleaner1] = useState<string>('');
  const [cleaner2, setCleaner2] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fullName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || '—';

  // Pre-populate when the modal opens or the lead changes
  useEffect(() => {
    if (!open || !lead) return;

    // Preferred date
    if (lead.preferred_date) {
      try { setDate(new Date(lead.preferred_date + 'T00:00:00')); } catch { setDate(undefined); }
    } else {
      setDate(undefined);
    }

    // Preferred time — accept HH:MM or legacy window labels
    const preferred = lead.preferred_time?.trim() || lead.form_data?.preferred_time?.trim() || '';
    if (/^\d{1,2}:\d{2}/.test(preferred)) {
      setTime(preferred.slice(0, 5));
    } else {
      const lower = preferred.toLowerCase();
      if (lower === 'morning') setTime('09:00');
      else if (lower === 'midday') setTime('12:00');
      else if (lower === 'afternoon') setTime('14:00');
      else if (lower === 'evening') setTime('17:00');
      else setTime('09:00');
    }

    // Duration from estimated_hours if available, else default by bed count
    if (lead.estimated_hours && lead.estimated_hours > 0) {
      setDuration(String(Math.round(lead.estimated_hours * 60)));
    } else {
      const beds = lead.bedrooms || 2;
      const baths = lead.bathrooms || 1;
      const minutes = Math.max(90, (beds + baths) * 30);
      setDuration(String(minutes));
    }

    setCleaner1('');
    setCleaner2('');
    setNotes('');
  }, [open, lead]);

  if (!lead) return null;

  const handleSave = async () => {
    if (!date) { toast.error('Pick a date first'); return; }
    if (!lead.address) { toast.error('Lead has no address — set it on the quote request first'); return; }

    setSubmitting(true);
    try {
      // ── 1. Ensure profile + property exist (idempotent) ──
      let propertyId: string | null = null;
      try {
        const { data: linkRes, error: linkErr } = await supabase.functions.invoke('link-intake-to-profile', {
          body: {
            first_name: lead.first_name || null,
            last_name: lead.last_name || null,
            full_name: fullName !== '—' ? fullName : null,
            phone: lead.phone || null,
            email: lead.email || null,
            property_address: lead.address,
            bedrooms: lead.bedrooms || null,
            bathrooms: lead.bathrooms || null,
            clean_type: lead.clean_type || null,
          },
        });
        if (linkErr) throw linkErr;
        propertyId = (linkRes as any)?.property_id || null;
      } catch (e: any) {
        console.error('[schedule-from-lead] link-intake-to-profile failed', e);
      }

      const scheduledDate = format(date, 'yyyy-MM-dd');
      const priceIncGst = lead.total_inc_gst || null;
      const priceExGst = lead.total_ex_gst || (priceIncGst ? priceIncGst / 1.1 : null);

      // ── 2. Check if a job already exists for this lead ──
      // When a client accepts via /quote-view, create-booking-from-quote has
      // ALREADY created the job(s) with linked_quote_id set to the quote's id.
      // Find that job via: lead -> form_data.quote_id -> jobs.linked_quote_id.
      // Without this check we'd create a second, duplicate job every time admin
      // clicked Schedule Clean on a lead that was accepted through the portal.
      let existingJobId: string | null = null;
      const leadQuoteId = lead.form_data?.quote_id;
      if (leadQuoteId) {
        const { data: existing } = await supabase
          .from('jobs')
          .select('id, status')
          .eq('linked_quote_id', leadQuoteId)
          .is('recurring_parent_id', null) // only the parent, not recurring children
          .in('status', ['pending_cleaner', 'awaiting_cleaner_acceptance', 'confirmed', 'scheduled'])
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (existing?.id) existingJobId = existing.id;
      }

      let jobId: string | null = existingJobId;

      if (existingJobId) {
        // ── 2a. Update the existing job instead of creating a new one ──
        const { error: updErr } = await supabase.from('jobs').update({
          scheduled_date: scheduledDate,
          scheduled_time: time,
          estimated_duration: parseInt(duration),
          cleaner_1_id: cleaner1 || null,
          cleaner_2_id: cleaner2 || null,
          notes: notes || null,
          property_id: propertyId,
        } as any).eq('id', existingJobId);
        if (updErr) throw updErr;
      } else {
        // ── 2b. No existing job — create one ──
        // jobs table has client_name but NOT property_address — the address
        // lives on the linked properties record via property_id.
        const { data: inserted, error: jobErr } = await supabase.from('jobs').insert({
          property_id: propertyId,
          client_name: fullName !== '—' ? fullName : null,
          scheduled_date: scheduledDate,
          scheduled_time: time,
          estimated_duration: parseInt(duration),
          cleaner_1_id: cleaner1 || null,
          cleaner_2_id: cleaner2 || null,
          notes: notes || null,
          status: initialJobStatusForAssignment(cleaner1 || null, cleaner2 || null),
          price_inc_gst: priceIncGst,
          price_ex_gst: priceExGst,
          source: 'pipeline_schedule',
          linked_quote_id: leadQuoteId || null,
        } as any).select('id').single();
        if (jobErr) throw jobErr;
        jobId = inserted.id;
      }

      // ── 3. Sync cleaner assignment — creates / refreshes acceptance rows, sends SMS ──
      if (jobId) {
        try {
          // forceReaccept=true when we just changed assignment on an existing job
          // so the cleaner re-accepts against the new date / cleaner
          await syncJobAssignment(jobId, { sendSms: Boolean(cleaner1 || cleaner2), forceReaccept: Boolean(existingJobId) });
        } catch (e: any) {
          toast.warning(`Job saved but cleaner notification failed: ${e.message}`);
        }
      }

      // ── 4. Mark the quote_request as scheduled so it moves out of the Accepted column ──
      await supabase.from('quote_requests').update({
        status: 'scheduled',
        preferred_date: scheduledDate,
        preferred_time: time,
      }).eq('id', lead.id);

      toast.success(
        existingJobId
          ? (cleaner1 ? 'Updated — cleaner notified ✓' : 'Updated ✓')
          : (cleaner1 ? 'Scheduled + cleaner notified ✓' : 'Scheduled — assign a cleaner when ready')
      );
      queryClient.invalidateQueries({ queryKey: ['ops-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      onScheduled?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-primary flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {focusCleaner ? 'Assign Cleaner' : 'Schedule Clean'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Schedule a job for the accepted lead. All known client info is pre-filled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Pre-filled client / property card — read-only summary */}
          <div className="bg-secondary rounded-xl p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <User className="h-4 w-4 text-primary" /> {fullName}
            </div>
            {lead.address && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {lead.address}
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
              {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>}
              {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>}
              {lead.clean_type && <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-bold">{lead.clean_type}</span>}
              {lead.total_inc_gst && <span className="font-bold text-primary">${Number(lead.total_inc_gst).toFixed(2)} inc GST</span>}
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-semibold', !date && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'EEEE, d MMMM yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="p-3"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Start Time *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cleaners — auto-focus if opened in "Assign Cleaner" mode */}
          <div className="space-y-1">
            <Label className={cn('text-sm font-semibold', focusCleaner && 'text-primary')}>
              Cleaner 1 {focusCleaner && '*'}
            </Label>
            <Select value={cleaner1 || '__none__'} onValueChange={(v) => setCleaner1(v === '__none__' ? '' : v)}>
              <SelectTrigger className={cn('rounded-xl', focusCleaner && !cleaner1 && 'ring-2 ring-primary/40')}>
                <SelectValue placeholder="Select cleaner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Leave unassigned (I'll assign later) —</SelectItem>
                {(cleaners as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Cleaner 2 (optional)</Label>
            <Select value={cleaner2 || '__none__'} onValueChange={(v) => setCleaner2(v === '__none__' ? '' : v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {(cleaners as any[])
                  .filter((c: any) => c.id !== cleaner1)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Notes for Cleaner (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl min-h-[72px]" placeholder="Any special instructions…" />
          </div>

          <Button onClick={handleSave} disabled={submitting || !date} className="w-full rounded-xl bg-brightly hover:bg-brightly-hover text-white font-bold text-base py-5">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scheduling…</> : cleaner1 ? 'Schedule + Notify Cleaner' : 'Schedule (assign cleaner later)'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
