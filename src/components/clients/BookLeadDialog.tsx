// ============================================================================
// Book a lead straight in.
//
// BJ, 18 Oct 2026: "i spoke with him on the phone and he is happy to proceed."
// One button on the lead, pick the date and time (prefilled from their quote,
// override anything), and it does the lot: creates the client and property,
// puts the clean on the Schedule with the quoted price attached, moves the
// lead into Clients, and optionally assigns a cleaner, which texts them to
// accept exactly like any other job.
// ============================================================================

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import { CalendarCheck, CalendarIcon, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimeSelect } from '@/components/ui/time-select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { syncJobAssignment } from '@/lib/jobAssignment';
import { edgeErrorMessage } from '@/lib/edgeError';

interface Props {
  lead: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked?: (jobId: string) => void;
}

/** The quote's own numbers, whichever shape the lead carries them in. */
function quotedPrice(lead: any): { inc: number | null; ex: number | null } {
  const inc = lead?.total_inc_gst ?? lead?.form_data?.quoted_inc_gst ?? null;
  const ex = lead?.total_ex_gst ?? lead?.form_data?.quoted_ex_gst ?? null;
  const incN = inc == null ? null : Number(inc);
  const exN = ex == null ? null : (Number(ex) || null);
  return {
    inc: incN && incN > 0 ? incN : null,
    ex: exN && exN > 0 ? exN : (incN ? Math.round((incN / 1.1) * 100) / 100 : null),
  };
}

function quotedHours(lead: any): number {
  const h = Number(lead?.estimated_hours ?? lead?.form_data?.estimated_hours ?? 0);
  if (h > 0) return h;
  // Nothing on the quote: fall back to the size of the place.
  const beds = Number(lead?.bedrooms || 0);
  const baths = Number(lead?.bathrooms || 0);
  const base = 1.5 + beds * 0.5 + baths * 0.4;
  const deep = String(lead?.clean_type || '').toLowerCase().includes('deep');
  return Math.round((deep ? base * 1.6 : base) * 2) / 2;
}

export default function BookLeadDialog({ lead, open, onOpenChange, onBooked }: Props) {
  const qc = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const price = useMemo(() => quotedPrice(lead), [lead]);

  const [date, setDate] = useState<Date>(() => (lead?.preferred_date ? parseISO(lead.preferred_date) : addDays(startOfDay(new Date()), 1)));
  const [time, setTime] = useState(() => (lead?.preferred_time ? String(lead.preferred_time).slice(0, 5) : '09:00'));
  const [hours, setHours] = useState(() => String(quotedHours(lead)));
  const [priceInc, setPriceInc] = useState(() => (price.inc != null ? String(price.inc) : ''));
  const [cleanerId, setCleanerId] = useState('');
  const [cleaner2Id, setCleaner2Id] = useState('');
  const [textClient, setTextClient] = useState(true);
  const [saving, setSaving] = useState(false);

  const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || 'Client';
  const usedQuotedTime = !!lead?.preferred_time;
  const usedQuotedDate = !!lead?.preferred_date;

  const book = async () => {
    const incN = Number(priceInc);
    const hoursN = Number(hours);
    if (!date) { toast.error('Pick a date for the clean.'); return; }
    const dateStr = format(date, 'yyyy-MM-dd');
    if (!(incN > 0)) { toast.error('Put a price on the clean before booking it.'); return; }
    if (!(hoursN > 0)) { toast.error('How long is the clean? Put the hours in.'); return; }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('link-intake-to-profile', {
        body: {
          first_name: lead.first_name, last_name: lead.last_name, full_name: name,
          phone: lead.phone || null, email: lead.email || null,
          property_address: lead.address || `${name}'s property`,
          bedrooms: lead.bedrooms || null, bathrooms: lead.bathrooms || null,
          clean_type: lead.clean_type || 'Standard Clean',
          create_job: true,
          scheduled_date: dateStr,
          scheduled_time: time || null,
          price_inc_gst: incN,
          price_ex_gst: Math.round((incN / 1.1) * 100) / 100,
          estimated_hours: hoursN,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      const jobId = (data as any)?.job_id;
      const profileId = (data as any)?.client_profile_id;
      if (!jobId) throw new Error('The client was created but the clean was not. Check the address on the lead and try again.');

      // They are a client now, not a lead.
      if (profileId) {
        await supabase.from('profiles').update({ lead_stage: 'active' } as any).eq('id', profileId);
      }
      await supabase.from('quote_requests').update({ status: 'accepted' } as any).eq('id', lead.id);

      // A cleaner picked here goes through the normal flow: they get the job
      // text and have to accept it, same as any other clean.
      let cleanerNote = 'No cleaner yet, assign one on the Schedule.';
      if (cleanerId) {
        const { error: assignErr } = await supabase
          .from('jobs')
          .update({
            cleaner_1_id: cleanerId,
            cleaner_2_id: cleaner2Id || null,
            status: 'awaiting_cleaner_acceptance',
          } as any)
          .eq('id', jobId);
        if (assignErr) {
          cleanerNote = `Booked, but the cleaner was not assigned: ${assignErr.message}`;
        } else {
          try {
            await syncJobAssignment(jobId, { sendSms: true });
            cleanerNote = cleaner2Id
              ? 'Both cleaners have been texted to accept it.'
              : 'The cleaner has been texted to accept it.';
          } catch (e: any) {
            cleanerNote = `Booked and assigned, but the text failed: ${e.message}`;
          }
        }
      }

      if (textClient) {
        try {
          await supabase.functions.invoke('send-client-booking-sms', { body: { job_id: jobId } });
        } catch { /* the booking stands even if the text does not go */ }
      }

      ['quote-requests-leads', 'clients-list', 'client-lead-stages', 'schedule-jobs',
       'lead-scheduled-job', 'property-ids-with-jobs', 'dashboard-jobs'].forEach(function (k) {
        qc.invalidateQueries({ queryKey: [k] });
      });

      toast.success(
        `${name} is booked for ${format(date, 'EEE d MMM')}${time ? ` at ${time}` : ''}. ${cleanerNote}`,
        { duration: 8000 },
      );
      onBooked?.(jobId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Could not book the clean', { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold">
            <CalendarCheck className="h-5 w-5 text-primary" /> Book {name} in
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <p className="font-semibold text-foreground">
              {lead?.clean_type || 'Clean'}
              {lead?.bedrooms ? ` · ${lead.bedrooms} bed` : ''}
              {lead?.bathrooms ? ` · ${lead.bathrooms} bath` : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{lead?.address || 'No address on the lead'}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Date
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="mt-1 h-11 w-full justify-start rounded-xl text-sm font-semibold normal-case text-foreground">
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {format(date, 'EEE d MMM yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    disabled={(d) => d < startOfDay(new Date())}
                    initialFocus
                    className="pointer-events-auto p-3"
                  />
                </PopoverContent>
              </Popover>
              {usedQuotedDate && <span className="mt-1 block text-[11px] font-medium normal-case text-primary">From their quote</span>}
            </div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Start time
              <TimeSelect value={time} onChange={setTime} className="mt-1 h-11 rounded-xl" />
              {usedQuotedTime && <span className="mt-1 block text-[11px] font-medium normal-case text-primary">From their quote</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Tomorrow', d: addDays(startOfDay(new Date()), 1) },
              { label: format(addDays(startOfDay(new Date()), 2), 'EEE'), d: addDays(startOfDay(new Date()), 2) },
              { label: format(addDays(startOfDay(new Date()), 3), 'EEE'), d: addDays(startOfDay(new Date()), 3) },
              { label: 'Next week', d: addDays(startOfDay(new Date()), 7) },
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setDate(q.d)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  format(q.d, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Hours on site
              <Input type="number" min="0.5" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Price inc GST
              <Input type="number" min="0" step="1" value={priceInc} onChange={(e) => setPriceInc(e.target.value)} className="mt-1 h-10 rounded-xl" />
              {price.inc != null && <span className="mt-1 block text-[11px] font-medium normal-case text-primary">Quoted ${Math.round(price.inc)}</span>}
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Cleaner 1
              <select
                value={cleanerId}
                onChange={(e) => { setCleanerId(e.target.value); if (!e.target.value) setCleaner2Id(''); }}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground"
              >
                <option value="">Assign later</option>
                {cleaners.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Cleaner 2
              <select
                value={cleaner2Id}
                disabled={!cleanerId}
                onChange={(e) => setCleaner2Id(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground disabled:opacity-50"
              >
                <option value="">None</option>
                {cleaners.filter((c: any) => c.id !== cleanerId).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.full_name || c.email}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            Both cleaners get the job text and have to accept it, same as the Schedule does.
            {Number(hours) > 0 && cleaner2Id ? ` Two on site means about ${Math.round((Number(hours) / 2) * 10) / 10} hours each.` : ''}
          </p>

          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input type="checkbox" checked={textClient} onChange={(e) => setTextClient(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
            Text {name.split(' ')[0]} a confirmation
          </label>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 rounded-xl font-bold" onClick={book} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Book the clean'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
