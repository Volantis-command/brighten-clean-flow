import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ATTENTION_AREAS = [
  'Kitchen deep clean', 'Oven', 'Bathrooms', 'Windows', 'Balcony/outdoor',
  'Under furniture', 'Ceiling fans', 'Fridge', 'No specific areas',
];

interface Props {
  propertyId: string;
  clientId: string;
  propertyName: string;
  onComplete: () => void;
}

export default function CleanBookingForm({ propertyId, clientId, propertyName, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [frequency, setFrequency] = useState<string>('one-off');
  const [recurringFreq, setRecurringFreq] = useState('weekly');
  const [date, setDate] = useState<Date>();
  const [preferredTime, setPreferredTime] = useState('flexible');
  const [cleanType, setCleanType] = useState('turnover');
  const [attentionAreas, setAttentionAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [sameCleaner, setSameCleaner] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleArea = (area: string) => {
    setAttentionAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Create job as awaiting_quote instead of clean_request
      const { data: jobData } = await supabase.from('jobs').insert({
        property_id: propertyId,
        scheduled_date: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        scheduled_time: preferredTime === 'morning' ? '08:00' : preferredTime === 'afternoon' ? '12:00' : null,
        status: 'awaiting_quote',
        notes: [cleanType.replace(/_/g, ' '), notes].filter(Boolean).join(' — ') || null,
        source: 'client_portal',
      } as any).select('id').single();

      // Also create clean_request for tracking
      await supabase.from('clean_requests' as any).insert({
        client_id: clientId,
        property_id: propertyId,
        requested_date: date ? format(date, 'yyyy-MM-dd') : null,
        preferred_time: preferredTime,
        clean_type: cleanType,
        frequency: frequency === 'one-off' ? 'one-off' : recurringFreq,
        attention_areas: attentionAreas,
        notes,
        same_cleaner: sameCleaner,
        status: 'pending',
      } as any);

      // Notify admins
      const notifLink = jobData?.id ? `/jobs/${jobData.id}` : '/requests';
      await (await import('@/lib/alerts')).createAlert({
        event_type: 'new_lead',
        title: 'New Booking Request — Awaiting Quote',
        body: `New clean request for ${propertyName} on ${date ? format(date, 'dd MMM yyyy') : 'TBD'} — set price to schedule.`,
        link: notifLink,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success('Clean request submitted!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (submitted) {
    return (
      <div className="text-center py-12 space-y-4">
        <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
        <h2 className="text-2xl font-extrabold text-primary">Request Received!</h2>
        <p className="text-muted-foreground">We'll confirm your booking and price shortly.</p>
        <Button onClick={onComplete} className="mt-4">Back to Portal</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-primary">Book a Clean</h2>
        <p className="text-sm text-muted-foreground">{propertyName}</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Clean Type</h3>
          {['one-off', 'regular'].map(f => (
            <button key={f} onClick={() => setFrequency(f)} className={`w-full p-4 rounded-xl border text-left ${frequency === f ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <p className="font-bold capitalize">{f === 'one-off' ? 'One-off Clean' : 'Regular Schedule'}</p>
              <p className="text-sm text-muted-foreground">{f === 'one-off' ? 'Single clean session' : 'Recurring clean schedule'}</p>
            </button>
          ))}
          {frequency === 'regular' && (
            <div className="grid grid-cols-2 gap-2">
              {['weekly', 'fortnightly', 'every_3_weeks', 'monthly'].map(f => (
                <button key={f} onClick={() => setRecurringFreq(f)} className={`p-3 rounded-xl border text-sm font-semibold ${recurringFreq === f ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  {f.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          )}
          <Button onClick={() => setStep(2)} className="w-full">Next</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Date & Time</h3>
          <div>
            <Label>Preferred Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} disabled={(d) => d < new Date()} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Preferred Time</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {['morning', 'afternoon', 'flexible'].map(t => (
                <button key={t} onClick={() => setPreferredTime(t)} className={`p-3 rounded-xl border text-sm font-semibold capitalize ${preferredTime === t ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  {t === 'morning' ? 'Morning (8-12)' : t === 'afternoon' ? 'Afternoon (12-4)' : 'Flexible'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(3)} className="flex-1">Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Clean Details</h3>
          <div>
            <Label>Type of Clean</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { value: 'standard_clean', label: 'Standard Clean' },
                { value: 'deep_clean', label: 'Deep Clean' },
                { value: 'end_of_lease', label: 'Bond / End of Lease Clean' },
                { value: 'office_commercial', label: 'Office / Commercial Clean' },
                { value: 'other', label: 'Other' },
              ].map(ct => (
                <button key={ct.value} onClick={() => setCleanType(ct.value)} className={`p-3 rounded-xl border text-sm font-semibold ${cleanType === ct.value ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Areas needing extra attention</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ATTENTION_AREAS.map(area => (
                <button key={area} onClick={() => toggleArea(area)} className={`px-3 py-1.5 rounded-full text-sm border ${attentionAreas.includes(area) ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
                  {area}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Special notes for cleaner</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Guest checked out late, focus on bathrooms" className="rounded-xl mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setSameCleaner(!sameCleaner)} className={`w-5 h-5 rounded border flex items-center justify-center ${sameCleaner ? 'bg-primary border-primary' : 'border-border'}`}>
              {sameCleaner && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
            </button>
            <span className="text-sm">Request same cleaner as last time</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
            <Button onClick={() => setStep(4)} className="flex-1">Next</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Confirm Booking</h3>
          <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Property</span><span className="font-semibold">{propertyName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-semibold capitalize">{cleanType.replace(/_/g, ' ')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-semibold">{date ? format(date, 'dd MMM yyyy') : 'TBD'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-semibold capitalize">{preferredTime}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frequency</span><span className="font-semibold capitalize">{frequency === 'one-off' ? 'One-off' : recurringFreq.replace(/_/g, ' ')}</span></div>
            {attentionAreas.length > 0 && <div><span className="text-muted-foreground">Extra attention:</span><p className="font-semibold">{attentionAreas.join(', ')}</p></div>}
            {notes && <div><span className="text-muted-foreground">Notes:</span><p className="font-semibold">{notes}</p></div>}
            {sameCleaner && <p className="font-semibold text-primary">✓ Same cleaner requested</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Back</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="flex-1 bg-primary text-primary-foreground font-bold gap-2">
              {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit Request
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
