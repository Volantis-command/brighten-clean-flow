import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useAllCleanerAvailability } from '@/hooks/useCleanerConflicts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CLEAN_TYPES = [
  'House Clean', 'Deep Clean', 'End of Lease', 'Post-Build', 'Turnover Clean',
];

const DURATIONS = [
  { value: '60', label: '1 hr' },
  { value: '90', label: '1.5 hr' },
  { value: '120', label: '2 hr' },
  { value: '150', label: '2.5 hr' },
  { value: '180', label: '3 hr' },
  { value: '240', label: '4 hr' },
];

interface ScheduleCleanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  properties: Array<{ id: string; property_name: string; address?: string | null }>;
}

export default function ScheduleCleanModal({ open, onOpenChange, clientId, clientName, properties }: ScheduleCleanModalProps) {
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const [saving, setSaving] = useState(false);

  const [propertyId, setPropertyId] = useState('');
  const [cleanType, setCleanType] = useState('House Clean');
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('120');
  const [cleanerId, setCleanerId] = useState('');
  const [priceExGst, setPriceExGst] = useState('');
  const [priceIncGst, setPriceIncGst] = useState('');
  const [gstMode, setGstMode] = useState<'ex' | 'inc'>('ex');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const { unavailableMap } = useAllCleanerAvailability(date, cleaners.map((c: any) => c.id));

  // Helper to set both prices from one value
  const setPriceFromEx = (val: string) => {
    setPriceExGst(val);
    setPriceIncGst(val && parseFloat(val) > 0 ? (parseFloat(val) * 1.1).toFixed(2) : '');
  };
  const setPriceFromInc = (val: string) => {
    setPriceIncGst(val);
    setPriceExGst(val && parseFloat(val) > 0 ? (parseFloat(val) / 1.1).toFixed(2) : '');
  };

  // Pre-fill price from property default_price
  const prefillPriceFromProperty = (propId: string) => {
    const prop = properties.find(p => p.id === propId) as any;
    if (prop?.default_price != null && parseFloat(prop.default_price) > 0) {
      const isInc = prop.price_includes_gst === true;
      setGstMode(isInc ? 'inc' : 'ex');
      if (isInc) {
        setPriceFromInc(String(prop.default_price));
      } else {
        setPriceFromEx(String(prop.default_price));
      }
    }
  };

  // Pre-select first property
  useEffect(() => {
    if (open && properties.length > 0 && !propertyId) {
      setPropertyId(properties[0].id);
      prefillPriceFromProperty(properties[0].id);
    }
  }, [open, properties, propertyId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPropertyId('');
      setCleanType('House Clean');
      setDate(undefined);
      setTime('09:00');
      setDuration('120');
      setCleanerId('');
      setPriceExGst('');
      setPriceIncGst('');
      setGstMode('ex');
      setNotes('');
      setInternalNotes('');
    }
  }, [open]);

  const getCleanerLabel = (c: any) => {
    const name = c.full_name || c.email;
    if (unavailableMap[c.id]) return `❌ ${name} (not available)`;
    return name;
  };

  const handleSave = async () => {
    if (!propertyId) { toast.error('Please select a property.'); return; }
    if (!date) { toast.error('Please select a date.'); return; }

    setSaving(true);
    try {
      const hasPrice = priceExGst && parseFloat(priceExGst) > 0;
      const status = hasPrice ? 'scheduled' : 'awaiting_quote';

      const finalExGst = hasPrice ? parseFloat(priceExGst) : null;
      const finalIncGst = hasPrice ? parseFloat(priceIncGst) : null;

      const { data: jobData, error } = await supabase.from('jobs').insert({
        property_id: propertyId,
        scheduled_date: format(date, 'yyyy-MM-dd'),
        scheduled_time: time,
        estimated_duration: parseInt(duration),
        cleaner_1_id: cleanerId || null,
        price_ex_gst: finalExGst,
        price_inc_gst: finalIncGst,
        notes: notes || null,
        price_notes: internalNotes || null,
        status,
        source: 'manual',
      } as any).select('id').single();

      if (error) throw error;

      // Fire Google Calendar event (non-blocking)
      if (jobData?.id) {
        supabase.functions.invoke('create-calendar-event', { body: { job_id: jobData.id } }).catch(() => {});
      }

      if (hasPrice && jobData?.id) {
        // Fire client SMS, cleaner SMS, Xero invoice in parallel
        const promises: Promise<any>[] = [];

        promises.push(
          supabase.functions.invoke('send-client-booking-sms', { body: { job_id: jobData.id } }).catch(e => {
            toast.error(`⚠️ Client SMS failed: ${e.message}`);
          })
        );

        if (cleanerId) {
          promises.push(
            supabase.functions.invoke('send-job-sms', { body: { job_id: jobData.id } }).catch(e => {
              toast.error(`⚠️ Cleaner SMS failed: ${e.message}`);
            })
          );
        }

        promises.push(
          supabase.functions.invoke('xero-create-invoice', { body: { job_id: jobData.id } }).catch(e => {
            toast.error(`⚠️ Xero invoice failed: ${e.message}`);
          })
        );

        await Promise.allSettled(promises);
        toast.success('Job scheduled, client + cleaner notified ✓');
      } else {
        toast.warning('No price set — job saved as Awaiting Quote. Set price to notify client and create invoice.');
      }

      queryClient.invalidateQueries({ queryKey: ['client-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">Schedule a Clean</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client name read-only */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Client</Label>
            <div className="bg-secondary rounded-xl px-3 py-2 text-sm font-medium">{clientName}</div>
          </div>

          {/* Property */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Property *</Label>
            {properties.length === 1 ? (
              <div className="bg-secondary rounded-xl px-3 py-2 text-sm">{properties[0].property_name}</div>
            ) : (
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Clean Type */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Clean Type *</Label>
            <Select value={cleanType} onValueChange={setCleanType}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLEAN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full rounded-xl justify-start text-left font-normal', !date && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Start Time *</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="rounded-xl" />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Cleaner */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Assigned Cleaner</Label>
            <Select value={cleanerId || '__none__'} onValueChange={v => setCleanerId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {cleaners.map((c: any) => (
                  <SelectItem key={c.id} value={c.id} disabled={!!unavailableMap[c.id]} className={unavailableMap[c.id] ? 'opacity-40 line-through' : ''}>
                    {getCleanerLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Price ex GST ($)</Label>
              <Input type="number" step="0.01" min="0" value={priceExGst} onChange={e => setPriceExGst(e.target.value)} className="rounded-xl" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Price inc GST ($)</Label>
              <Input value={priceIncGst ? `$${priceIncGst}` : '—'} readOnly className="rounded-xl bg-muted" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">Notes for Cleaner</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="rounded-xl min-h-[60px]" placeholder="Instructions, linen, special notes…" />
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-semibold">Internal Notes</Label>
            <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} className="rounded-xl min-h-[60px]" placeholder="Admin-only notes (not sent to client)" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save & Schedule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
