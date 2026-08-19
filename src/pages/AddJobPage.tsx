import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useAllCleanerLeave, useAllCleanerAvailability } from '@/hooks/useCleanerConflicts';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { syncToDrive } from '@/lib/driveSync';
import { RecurringJobSection, defaultRecurringConfig, RecurringConfig, getIntervalWeeks } from '@/components/schedule/RecurringJobSection';
import { generateRecurringDates } from '@/lib/recurringJobs';
import { CleanerConflictWarning } from '@/components/schedule/CleanerConflictWarning';
import { syncJobAssignment, initialJobStatusForAssignment } from '@/lib/jobAssignment';
import { useAuth } from '@/contexts/AuthContext';
import { DURATIONS } from '@/lib/jobDurations';


const SOFA_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
];

export default function AddJobPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const [saving, setSaving] = useState(false);
  const [conflictAcknowledged, setConflictAcknowledged] = useState(false);

  const [propertyId, setPropertyId] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('120');
  const [cleaner1, setCleaner1] = useState('');
  const [cleaner2, setCleaner2] = useState('');
  const [notes, setNotes] = useState('');
  const [sofaBed, setSofaBed] = useState('na');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  const [recurring, setRecurring] = useState<RecurringConfig>(defaultRecurringConfig);
  const [priceExGst, setPriceExGst] = useState<number | null>(null);
  const [priceIncGst, setPriceIncGst] = useState<number | null>(null);

  const { leaveMap, conflictMap } = useAllCleanerLeave(date);
  const { unavailableMap, dayName } = useAllCleanerAvailability(date, cleaners.map((c: any) => c.id));

  const { data: properties = [] } = useQuery({
    queryKey: ['properties-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, property_name, address, suburb, price_turnover, client_name, default_price, price_includes_gst')
        .in('status', ['active', 'onboarding'])
        .order('client_name', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filteredProperties = properties.filter((p) =>
    p.property_name.toLowerCase().includes(propertySearch.toLowerCase()) ||
    (p.address || '').toLowerCase().includes(propertySearch.toLowerCase()) ||
    ((p as any).client_name || '').toLowerCase().includes(propertySearch.toLowerCase())
  );

  const selectedProperty = properties.find((p) => p.id === propertyId);

  const handlePropertySelect = (p: any) => {
    setPropertyId(p.id);
    if (p.default_price != null && parseFloat(p.default_price) > 0) {
      const dp = parseFloat(p.default_price);
      if (p.price_includes_gst) {
        setPriceIncGst(dp);
        setPriceExGst(parseFloat((dp / 1.1).toFixed(2)));
      } else {
        setPriceExGst(dp);
        setPriceIncGst(parseFloat((dp * 1.1).toFixed(2)));
      }
    } else if (p.price_turnover) {
      setPriceExGst(Number(p.price_turnover));
      setPriceIncGst(parseFloat((Number(p.price_turnover) * 1.1).toFixed(2)));
    } else {
      setPriceExGst(null);
      setPriceIncGst(null);
    }
  };

  // Conflict state for selected cleaners
  const cleaner1Name = cleaners.find((c: any) => c.id === cleaner1)?.full_name || 'Cleaner';
  const cleaner1OnLeave = !!leaveMap[cleaner1];
  const cleaner1Unavailable = !!unavailableMap[cleaner1];
  const cleaner1Conflicts = conflictMap[cleaner1] || [];
  const cleaner1HasIssue = cleaner1 && (cleaner1Unavailable || cleaner1OnLeave || cleaner1Conflicts.length > 0);

  const cleaner2Name = cleaners.find((c: any) => c.id === cleaner2)?.full_name || 'Cleaner';
  const cleaner2OnLeave = cleaner2 ? !!leaveMap[cleaner2] : false;
  const cleaner2Unavailable = cleaner2 ? !!unavailableMap[cleaner2] : false;
  const cleaner2Conflicts = cleaner2 ? (conflictMap[cleaner2] || []) : [];
  const cleaner2HasIssue = cleaner2 && (cleaner2Unavailable || cleaner2OnLeave || cleaner2Conflicts.length > 0);

  const hasUnavailableCleaner = Boolean((cleaner1 && cleaner1Unavailable) || (cleaner2 && cleaner2Unavailable));
  const canOverrideAvailability = role === 'admin';
  const availabilityOverride = hasUnavailableCleaner && canOverrideAvailability && conflictAcknowledged;
  const hasHardBlock = hasUnavailableCleaner && !availabilityOverride;

  // Reset conflict acknowledged when cleaner or date changes
  const handleCleaner1Change = (v: string) => { setCleaner1(v); setConflictAcknowledged(false); };
  const handleCleaner2Change = (v: string) => { setCleaner2(v === '__none__' ? '' : v); setConflictAcknowledged(false); };
  const handleDateChange = (d: Date | undefined) => { setDate(d); setConflictAcknowledged(false); };

  const getCleanerLabel = (c: any) => {
    const name = c.full_name || c.email;
    const isUnavail = !!unavailableMap[c.id];
    const onLeave = !!leaveMap[c.id];
    const hasJobs = (conflictMap[c.id] || []).length > 0;
    if (isUnavail) return `❌ ${name} (not available)`;
    if (onLeave) return `⚠️ ${name} (on leave)`;
    if (hasJobs) return `${name} (has job)`;
    return `✅ ${name}`;
  };

  const isCleanerDisabled = (id: string) => !!unavailableMap[id] && !canOverrideAvailability;

  const handleSave = async () => {
    if (!propertyId) { toast.error('Please select a property.'); return; }
    if (!date) { toast.error('Please select a date.'); return; }
    if (!cleaner1) { toast.error('Please assign at least one cleaner.'); return; }
    if (hasHardBlock) { toast.error('Cannot save — a cleaner is not available on this day.'); return; }
    const hasAnyConflict = cleaner1HasIssue || cleaner2HasIssue;
    if (hasAnyConflict && !conflictAcknowledged) { toast.error('Please acknowledge the conflict warning before saving.'); return; }

    setSaving(true);

    const combinedNotes = [
      notes,
      sofaBed !== 'na' ? `Sofa bed: ${sofaBed === 'yes' ? 'Yes — needs to be made' : 'No'}` : '',
      specialInstructions ? `Special instructions: ${specialInstructions}` : '',
    ].filter(Boolean).join('\n\n');

    const finalExGst = priceExGst;
    const finalIncGst = priceIncGst;

    let seriesId: string | null = null;

    if (recurring.enabled) {
      const { data: seriesData, error: seriesError } = await supabase.from('job_series').insert({
        frequency: recurring.frequency,
        interval_weeks: getIntervalWeeks(recurring),
        start_date: format(date, 'yyyy-MM-dd'),
        end_date: recurring.endType === 'until' && recurring.endDate ? format(recurring.endDate, 'yyyy-MM-dd') : null,
        property_id: propertyId,
        cleaner_1_id: cleaner1,
        cleaner_2_id: cleaner2 || null,
        notes: combinedNotes || null,
        price_ex_gst: priceExGst,
      } as any).select('id').single();

      if (seriesError) {
        toast.error('Failed to create series: ' + seriesError.message);
        setSaving(false);
        return;
      }
      seriesId = (seriesData as any)?.id || null;
    }

    const { data: jobData, error } = await supabase.from('jobs').insert({
      property_id: propertyId,
      scheduled_date: format(date, 'yyyy-MM-dd'),
      scheduled_time: time,
      estimated_duration: parseInt(duration),
      cleaner_1_id: cleaner1,
      cleaner_2_id: cleaner2 || null,
      notes: combinedNotes || null,
      // Born in 'awaiting_cleaner_acceptance' (yellow) — cleaners must accept before it goes green.
      status: initialJobStatusForAssignment(cleaner1, cleaner2 || null),
      price_ex_gst: priceExGst,
      price_inc_gst: priceIncGst,
      series_id: seriesId,
      availability_override: availabilityOverride,
      availability_override_reason: availabilityOverride ? 'Admin manually overrode cleaner availability during scheduling.' : null,
    } as any).select('id').single();

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    if (recurring.enabled && seriesId) {
      const futureDates = generateRecurringDates(date, recurring);
      if (futureDates.length > 0) {
        const futureJobs = futureDates.map((d) => ({
          property_id: propertyId,
          scheduled_date: d,
          scheduled_time: time,
          estimated_duration: parseInt(duration),
          cleaner_1_id: cleaner1,
          cleaner_2_id: cleaner2 || null,
          notes: combinedNotes || null,
          // Each recurring child needs its own acceptance flow; born yellow.
          status: initialJobStatusForAssignment(cleaner1, cleaner2 || null),
          price_ex_gst: priceExGst,
          price_inc_gst: priceIncGst,
          series_id: seriesId,
          availability_override: availabilityOverride,
          availability_override_reason: availabilityOverride ? 'Admin manually overrode cleaner availability for this recurring schedule.' : null,
        }));
        const insertedChildIds: string[] = [];
        for (let i = 0; i < futureJobs.length; i += 50) {
          const { data: chunkInserted, error: chunkError } = await supabase
            .from('jobs')
            .insert(futureJobs.slice(i, i + 50) as any)
            .select('id');
          if (chunkError) {
            toast.error(`The first clean was saved, but the recurring dates could not all be created: ${chunkError.message}`);
            setSaving(false);
            return;
          }
          (chunkInserted || []).forEach((r: any) => insertedChildIds.push(r.id));
        }
        // Sync acceptance rows + notifications for each recurring child job.
        // SMS is skipped for recurring children to avoid spamming — only the parent gets an SMS;
        // cleaners will see the whole recurring offer grouped in /my-jobs.
        for (const childId of insertedChildIds) {
          await syncJobAssignment(childId, { sendSms: false });
        }
      }
    }

    if (jobData?.id) {
      await supabase.from('job_forms').insert({
        job_id: jobData.id,
        property_id: propertyId,
        cleaner_id: cleaner1,
        second_cleaner_id: cleaner2 || null,
        form_data: {},
      });
    }

    if (jobData?.id) {
      syncToDrive("sync_job_folder", { job_id: jobData.id });
    }

    // Single point of truth: syncJobAssignment handles job_acceptances rows,
    // in-app alerts to cleaners, and the cleaner-assignment SMS.
    if (jobData?.id) {
      try {
        await syncJobAssignment(jobData.id, { sendSms: true });
      } catch (err: any) {
        toast.error(`⚠️ Job saved but cleaner notification failed: ${err.message}`);
      }
    }

    // Send client booking confirmation SMS
    if (jobData?.id) {
      try {
        const clientRes = await supabase.functions.invoke('send-client-booking-sms', {
          body: { job_id: jobData.id },
        });
        const clientData = clientRes.data as any;
        if (clientData?.error) {
          toast.error(`⚠️ Client SMS failed: ${clientData.error}`);
        }
      } catch (err: any) {
        toast.error(`⚠️ Client booking SMS failed: ${err.message}`);
      }
    }

    const jobCount = recurring.enabled ? generateRecurringDates(date, recurring).length + 1 : 1;
    toast.success(recurring.enabled ? `${jobCount} recurring jobs scheduled!` : 'Job scheduled!');
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    navigate('/schedule');
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/schedule')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Schedule Job</h1>

      <div className="space-y-6">
        {/* Property */}
        <Section title="Property">
          <FormField label="Property *">
            {!propertyId ? (
              <div className="space-y-2">
                <Input
                  placeholder="Search properties…"
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  className="h-14 rounded-2xl"
                />
                {propertySearch && (
                  <div className="bg-card border border-border rounded-2xl max-h-48 overflow-y-auto">
                    {filteredProperties.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">No properties found.</p>
                    ) : (
                      (() => {
                        const grouped: Record<string, typeof filteredProperties> = {};
                        filteredProperties.forEach(p => {
                          const client = (p as any).client_name || 'Unassigned';
                          if (!grouped[client]) grouped[client] = [];
                          grouped[client].push(p);
                        });
                        return Object.entries(grouped).map(([client, props]) => (
                          <div key={client}>
                            <p className="px-4 py-1.5 text-xs font-bold text-muted-foreground bg-muted/50 sticky top-0">{client}</p>
                            {props.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => { handlePropertySelect(p); setPropertySearch(''); }}
                                className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0"
                              >
                                <p className="font-bold text-foreground text-sm">{p.property_name}</p>
                                <p className="text-xs text-muted-foreground">{[p.address, p.suburb].filter(Boolean).join(', ')}</p>
                              </button>
                            ))}
                          </div>
                        ));
                      })()
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-secondary rounded-2xl px-4 py-3">
                <div className="flex-1">
                  <p className="font-bold text-foreground text-sm">{selectedProperty?.property_name}</p>
                  <p className="text-xs text-muted-foreground">{[selectedProperty?.address, selectedProperty?.suburb].filter(Boolean).join(', ')}</p>
                  {(selectedProperty as any)?.client_name && (
                    <p className="text-xs text-primary font-semibold mt-0.5">Client: {(selectedProperty as any).client_name}</p>
                  )}
                </div>
                <button onClick={() => setPropertyId('')} className="text-sm font-bold text-primary hover:underline">Change</button>
              </div>
            )}
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
                <Calendar mode="single" selected={date} onSelect={handleDateChange} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start Time *">
              <TimeSelect value={time} onChange={setTime} className="h-14 rounded-2xl" />
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
            <Select value={cleaner1} onValueChange={handleCleaner1Change}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                {cleaners.map((c: any) => (
                  <SelectItem key={c.id} value={c.id} disabled={isCleanerDisabled(c.id)} className={cn(unavailableMap[c.id] ? 'opacity-40 line-through' : leaveMap[c.id] ? 'opacity-60' : '')}>
                    {getCleanerLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Cleaner 1 conflict warning */}
          {cleaner1HasIssue && !conflictAcknowledged && (
            <CleanerConflictWarning
              cleanerName={cleaner1Name}
              conflicts={cleaner1Conflicts}
              isOnLeave={cleaner1OnLeave}
              isUnavailable={cleaner1Unavailable}
              dayName={dayName}
              canOverrideAvailability={canOverrideAvailability}
              onConfirm={() => setConflictAcknowledged(true)}
              onCancel={() => setCleaner1('')}
            />
          )}

          <FormField label="Cleaner 2">
            <Select value={cleaner2 || '__none__'} onValueChange={handleCleaner2Change}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {cleaners.filter((c: any) => c.id !== cleaner1).map((c: any) => (
                  <SelectItem key={c.id} value={c.id} disabled={isCleanerDisabled(c.id)} className={cn(unavailableMap[c.id] ? 'opacity-40 line-through' : leaveMap[c.id] ? 'opacity-60' : '')}>
                    {getCleanerLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* Cleaner 2 conflict warning */}
          {cleaner2HasIssue && !conflictAcknowledged && (
            <CleanerConflictWarning
              cleanerName={cleaner2Name}
              conflicts={cleaner2Conflicts}
              isOnLeave={cleaner2OnLeave}
              isUnavailable={cleaner2Unavailable}
              dayName={dayName}
              canOverrideAvailability={canOverrideAvailability}
              onConfirm={() => setConflictAcknowledged(true)}
              onCancel={() => setCleaner2('')}
            />
          )}
        </Section>

        {/* Recurring */}
        <RecurringJobSection config={recurring} onChange={setRecurring} />

        {/* Job Details */}
        <Section title="Job Details">
          <FormField label="Notes for Cleaners">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-2xl min-h-[100px]"
              placeholder="General instructions, linen count, special notes…"
            />
          </FormField>

          <FormField label="Does sofa bed need to be made?">
            <div className="flex gap-2">
              {SOFA_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSofaBed(opt.value)}
                  className={cn(
                    'flex-1 h-14 rounded-2xl font-bold text-sm transition-colors',
                    sofaBed === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Special Instructions">
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="rounded-2xl min-h-[80px]"
              placeholder="Any one-off instructions for this specific job…"
            />
          </FormField>
        </Section>

        <Button variant="accent" size="lg" onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Scheduling…' : recurring.enabled ? 'Schedule Recurring Jobs' : 'Schedule Job'}
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
