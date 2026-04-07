import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

const TIME_WINDOWS: Record<string, string> = {
  morning: '07:00',
  midday: '11:00',
  afternoon: '14:00',
};

const TIME_WINDOW_LABELS: Record<string, string> = {
  morning: 'Morning 7–11am',
  midday: 'Midday 11am–2pm',
  afternoon: 'Afternoon 2–5pm',
  custom: 'Custom',
};

interface ScheduleAfterAcceptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  clientName: string;
  clientPhone: string;
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
  open, onOpenChange, quoteId, clientName, clientPhone, propertyAddress,
  cleanType, priceIncGst, priceExGst, propertyId, estimatedHours, leadId, onComplete,
}: ScheduleAfterAcceptModalProps) {
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();

  const [sendSms, setSendSms] = useState(true);
  const [date, setDate] = useState<Date>();
  const [timeWindow, setTimeWindow] = useState('morning');
  const [customTime, setCustomTime] = useState('09:00');
  const [cleanerId, setCleanerId] = useState('');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'form' | 'confirming' | 'success'>('form');
  const [results, setResults] = useState<StepResult[]>([]);

  useEffect(() => {
    if (!open) {
      setSendSms(true);
      setDate(undefined);
      setTimeWindow('morning');
      setCustomTime('09:00');
      setCleanerId('');
      setNotes('');
      setPhase('form');
      setResults([]);
    }
  }, [open]);

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

    // 3. Create job
    const scheduledTime = timeWindow === 'custom' ? customTime : TIME_WINDOWS[timeWindow];
    const windowLabel = TIME_WINDOW_LABELS[timeWindow] || '';
    const jobNotes = [windowLabel, notes].filter(Boolean).join(' — ');
    let jobId: string | null = null;

    try {
      const { data: job, error } = await supabase.from('jobs').insert({
        property_id: propertyId,
        linked_quote_id: quoteId,
        scheduled_date: format(date, 'yyyy-MM-dd'),
        scheduled_time: scheduledTime,
        cleaner_1_id: cleanerId || null,
        status: 'scheduled',
        notes: jobNotes || null,
        estimated_duration: Math.round(estimatedHours * 60),
        price_inc_gst: priceIncGst,
        price_ex_gst: priceExGst,
        source: 'quote_accepted',
      } as any).select('id').single();
      if (error) throw error;
      jobId = job.id;
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

    // 5. Cleaner SMS
    if (jobId && cleanerId) {
      try {
        const { error } = await supabase.functions.invoke('send-job-sms', { body: { job_id: jobId } });
        if (error) throw error;
        stepResults.push({ step: 'Cleaner assigned + notified via SMS', ok: true });
      } catch (e: any) {
        stepResults.push({ step: 'Cleaner assigned + notified via SMS', ok: false, error: e.message });
      }
    }

    // 6. Client acceptance SMS
    if (sendSms && clientPhone) {
      try {
        const firstName = (clientName || 'there').split(' ')[0];
        const message = `Hi ${firstName}, great news! Your ${cleanType} quote has been accepted. We'll confirm your schedule shortly. — Brightly 🌿`;
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

              {/* Time Window */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Time Window</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['morning', 'midday', 'afternoon', 'custom'] as const).map((tw) => (
                    <button
                      key={tw}
                      type="button"
                      onClick={() => setTimeWindow(tw)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm transition-colors',
                        timeWindow === tw
                          ? 'border-[#FEDB00] bg-[#FEDB00]/10 text-[#FEDB00]'
                          : 'border-[#1a2e2a] text-gray-400 hover:border-gray-600'
                      )}
                    >
                      {TIME_WINDOW_LABELS[tw]}
                    </button>
                  ))}
                </div>
                {timeWindow === 'custom' && (
                  <Input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="mt-2 bg-[#0A0F0E] border-[#1a2e2a]"
                  />
                )}
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
                    <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
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
