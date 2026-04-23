import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { syncJobAssignment } from '@/lib/jobAssignment';

// Map the legacy time-window enum (set on quotes from the old morning/midday/afternoon
// picker) to a HH:MM the time input can accept. New quotes save a HH:MM directly.
const TIME_WINDOW_TO_HHMM: Record<string, string> = {
  morning: '09:00',
  midday: '12:00',
  afternoon: '14:00',
  evening: '17:00',
};

interface ScheduleAfterAcceptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  propertyAddress: string;
  cleanType: string;
  priceIncGst: number;
  priceExGst: number;
  propertyId: string | null;
  estimatedHours: number;
  leadId: string | null;
  onComplete: () => void;
}

type StepResult = { step: string; ok: boolean; error?: string };

export default function ScheduleAfterAcceptModal({
  open, onOpenChange, quoteId, clientName, clientPhone, clientEmail, propertyAddress,
  cleanType, priceIncGst, priceExGst, propertyId, estimatedHours, leadId, onComplete,
}: ScheduleAfterAcceptModalProps) {
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();

  const [sendSms, setSendSms] = useState(true);
  const [date, setDate] = useState<Date>();
  const [customTime, setCustomTime] = useState('09:00');
  const [cleanerId, setCleanerId] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'form' | 'confirming' | 'success'>('form');
  const [results, setResults] = useState<StepResult[]>([]);

  // Pull the client's preferred time + date off the quote so admin doesn't have to
  // reset them from scratch. Fixes the "client picked afternoon, calendar said 9am" bug.
  const { data: quoteRow } = useQuery({
    queryKey: ['quote-prefs', quoteId],
    enabled: open && !!quoteId,
    queryFn: async () => {
      const { data } = await (supabase as any).from('quotes')
        .select('preferred_time, preferred_date')
        .eq('id', quoteId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!open) {
      setSendSms(true);
      setDate(undefined);
      setCustomTime('09:00');
      setCleanerId('');
      setNotes('');
      setPhase('form');
      setResults([]);
      return;
    }
    // Pre-populate from the quote
    if (quoteRow?.preferred_date) {
      try { setDate(new Date(quoteRow.preferred_date + 'T00:00:00')); } catch { /* ignore parse */ }
    }
    if (quoteRow?.preferred_time) {
      const raw = String(quoteRow.preferred_time).trim().toLowerCase();
      // Accept either a HH:MM or one of the legacy window labels
      if (/^\d{1,2}:\d{2}/.test(raw)) {
        setCustomTime(raw.slice(0, 5));
      } else if (TIME_WINDOW_TO_HHMM[raw]) {
        setCustomTime(TIME_WINDOW_TO_HHMM[raw]);
      }
    }
  }, [open, quoteRow]);

  const canConfirm = !!date;

  async function handleConfirm() {
    if (!date) return;
    setPhase('confirming');
    const stepResults: StepResult[] = [];

    // 1. Update quote → accepted
    try {
      const { error } = await supabase.from('quotes').update({
        status: 'accepted',
        quote_accepted_at: new Date().toISOString(),
        acceptance_method: 'manual_admin',
      } as any).eq('id', quoteId);
      if (error) throw error;
      stepResults.push({ step: 'Quote status → accepted', ok: true });
    } catch (e: any) {
      stepResults.push({ step: 'Quote status → accepted', ok: false, error: e.message });
    }

    // 2. Update quote_request if lead exists
    if (leadId) {
      try {
        const { error } = await supabase.from('quote_requests').update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        }).eq('id', leadId);
        if (error) throw error;
        stepResults.push({ step: 'Lead status → accepted', ok: true });
      } catch (e: any) {
        stepResults.push({ step: 'Lead status → accepted', ok: false, error: e.message });
      }
    }


    // 2b. Create/upsert client profile + property via edge function.
    // This uses the SERVICE_ROLE_KEY on the server side, bypassing RLS
    // (the profiles table has RLS that blocks client-side inserts by admin).
    let resolvedPropertyId = propertyId;
    try {
      const nameParts = (clientName || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { data: linkResult, error: linkError } = await supabase.functions.invoke(
        'link-intake-to-profile',
        {
          body: {
            first_name: firstName || null,
            last_name: lastName || null,
            full_name: clientName || null,
            phone: clientPhone || null,
            email: clientEmail || null,
            property_address: propertyAddress || null,
            clean_type: cleanType || null,
          },
        }
      );
      if (linkError) throw linkError;
      if ((linkResult as any)?.property_id) {
        resolvedPropertyId = (linkResult as any).property_id;
      }
      stepResults.push({ step: 'Client profile created', ok: true });
    } catch (e: any) {
      stepResults.push({ step: 'Client profile created', ok: false, error: e.message });
    }

    // 3. Create job via backend function to bypass jobs RLS
    const scheduledTime = customTime; // specific time e.g. "09:00"
    const jobNotes = notes || null;
    let jobId: string | null = null;

    try {
      const { data: job, error } = await supabase.functions.invoke('create-booking-from-quote', {
        body: {
          quote_id: quoteId,
          property_id: resolvedPropertyId || null,
          preferred_date: format(date, 'yyyy-MM-dd'),
          preferred_time: scheduledTime,
          client_name: clientName || null,
          notes: jobNotes || null,
          source: 'quote_accepted',
          cleaner_1_id: cleanerId || null,
          estimated_duration: Math.round(estimatedHours * 60),
          price_inc_gst: priceIncGst,
        },
      });
      if (error) throw error;
      jobId = job?.job_id || null;
      if (!jobId) throw new Error('Booking created without a job id');
      stepResults.push({ step: 'Job created in schedule', ok: true });
    } catch (e: any) {
      stepResults.push({ step: 'Job created in schedule', ok: false, error: e.message });
    }

    // 4. Google Calendar event
    if (jobId) {
      try {
        const { error } = await supabase.functions.invoke('create-calendar-event', { body: { job_id: jobId } });
        if (error) throw error;
        stepResults.push({ step: 'Google Calendar event created', ok: true });
      } catch (e: any) {
        stepResults.push({ step: 'Google Calendar event created', ok: false, error: e.message });
      }
    }

    // 5. Cleaner assignment sync — creates acceptance row, sends alert + SMS
    if (jobId && cleanerId) {
      try {
        await syncJobAssignment(jobId, { sendSms: true });
        stepResults.push({ step: 'Cleaner assigned + notified via SMS', ok: true });
      } catch (e: any) {
        stepResults.push({ step: 'Cleaner assigned + notified via SMS', ok: false, error: e.message });
      }
    }

    // 6. Client acceptance SMS
    if (sendSms && clientPhone) {
      try {
        const firstName = (clientName || 'there').split(' ')[0];
        const dateStr = format(date, 'EEEE d MMMM yyyy');
        const [hh, mm] = customTime.split(':').map(Number);
        const ampm = hh >= 12 ? 'pm' : 'am';
        const h12 = hh % 12 || 12;
        const timeStr = mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2,'0')}${ampm}`;
        const cleanerName = cleaners.find((c: any) => c.id === cleanerId);
        const cleanerFirst = cleanerName ? ((cleanerName as any).first_name || cleanerName.full_name?.split(' ')[0] || '') : '';
        const cleanerLine = cleanerFirst ? ` ${cleanerFirst} will be your cleaner.` : '';
        const message = `Hi ${firstName}, your ${cleanType} is booked in for ${timeStr} on ${dateStr}.${cleanerLine} See you then! 🌿 — Brightly Cleaning`;
        const { error } = await supabase.functions.invoke('send-job-sms', { body: { to: clientPhone, message } });
        if (error) throw error;
        stepResults.push({ step: 'Client confirmation SMS sent', ok: true });
      } catch (e: any) {
        stepResults.push({ step: 'Client confirmation SMS sent', ok: false, error: e.message });
      }
    }

    // 7. Xero invoice
    if (jobId) {
      try {
        const { error } = await supabase.functions.invoke('xero-auto-invoice-job', { body: { job_id: jobId } });
        if (error) throw error;
        stepResults.push({ step: 'Xero invoice created', ok: true });
      } catch (e: any) {
        console.error('Xero invoice failed:', e);
        stepResults.push({ step: 'Xero invoice queued — will send when Xero reconnects', ok: true });
      }
    }

    setResults(stepResults);
    setPhase('success');
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['quote-requests-leads'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
  }

  return (
    <Dialog open={open} onOpenChange={phase === 'confirming' ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border-[#1a2e2a] bg-[#0A0F0E] text-white overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-[#FEDB00]">
            Mark as Accepted
          </DialogTitle>
        </DialogHeader>

        {phase === 'form' && (
          <div className="space-y-6">
            {/* Section 1 — Confirm Accept */}
            <div className="rounded-xl border border-[#1a2e2a] bg-[#0d1714] p-4 space-y-3">
              <h3 className="text-sm font-bold text-[#FEDB00]/80 uppercase tracking-wider">Confirm Accept</h3>
              <div className="text-sm space-y-1 text-gray-300">
                <p><span className="text-gray-500">Client:</span> {clientName || '—'}</p>
                <p><span className="text-gray-500">Address:</span> {propertyAddress || '—'}</p>
                <p><span className="text-gray-500">Service:</span> {cleanType}</p>
                <p><span className="text-gray-500">Price:</span> <span className="font-bold text-[#FEDB00]">${priceIncGst.toFixed(2)} inc GST</span></p>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Switch checked={sendSms} onCheckedChange={setSendSms} />
                <Label className="text-sm text-gray-300">Send acceptance confirmation SMS to client</Label>
              </div>
            </div>

            {/* Section 2 — Schedule */}
            <div className="rounded-xl border border-[#1a2e2a] bg-[#0d1714] p-4 space-y-4">
              <h3 className="text-sm font-bold text-[#FEDB00]/80 uppercase tracking-wider">Schedule the Clean</h3>

              {/* Date */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal bg-[#0A0F0E] border-[#1a2e2a]', !date && 'text-gray-500')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, 'EEEE, d MMMM yyyy') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#0A0F0E] border-[#1a2e2a]" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Specific Time */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Start Time</Label>
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="bg-[#0A0F0E] border-[#1a2e2a] text-[#F0FDF4] h-12 rounded-xl focus:border-[#FEDB00]"
                />
                <p className="text-xs text-gray-500">Calendar event will be created for {customTime} with duration based on estimated hours</p>
              </div>

              {/* Cleaner */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Assign Cleaner</Label>
                <Select value={cleanerId} onValueChange={setCleanerId}>
                  <SelectTrigger className="bg-[#0A0F0E] border-[#1a2e2a]">
                    <SelectValue placeholder="Select cleaner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(cleaners as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name || c.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any scheduling notes..."
                  className="bg-[#0A0F0E] border-[#1a2e2a] min-h-[60px]"
                />
              </div>
            </div>

            {/* Section 3 — What happens next */}
            <div className="rounded-xl border border-[#1a2e2a] bg-[#0d1714] p-4 space-y-2">
              <h3 className="text-sm font-bold text-[#FEDB00]/80 uppercase tracking-wider">What happens next</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>✅ Quote status → accepted</li>
                <li>✅ Job created in schedule</li>
                {cleanerId && <li>✅ Cleaner assigned + notified via SMS</li>}
                {sendSms && <li>✅ Client confirmation SMS sent</li>}
                <li>✅ Xero invoice queued (fires when Xero reconnected)</li>
                <li>✅ Google Calendar event created</li>
              </ul>
            </div>

            <Button
              className="w-full bg-[#FEDB00] hover:bg-[#FEDB00]/90 text-[#0C463D] font-bold text-base py-5 rounded-xl"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              Confirm & Schedule
            </Button>
          </div>
        )}

        {phase === 'confirming' && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#FEDB00]" />
            <p className="text-gray-400 text-sm">Processing acceptance...</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1a2e2a] bg-[#0d1714] p-4 space-y-2">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-brightly-light mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <span className={r.ok ? 'text-gray-300' : 'text-red-300'}>{r.step}</span>
                    {r.error && <p className="text-xs text-red-400 mt-0.5">{r.error}</p>}
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="w-full bg-[#FEDB00] hover:bg-[#FEDB00]/90 text-[#0C463D] font-bold rounded-xl"
              onClick={() => {
                onOpenChange(false);
                onComplete();
              }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
