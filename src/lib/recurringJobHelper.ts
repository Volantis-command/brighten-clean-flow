import { addWeeks, addMonths, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export type RecurringFrequency = 'one-off' | 'weekly' | 'fortnightly' | 'monthly';

interface RecurringJobParams {
  parentJobId: string;
  frequency: RecurringFrequency;
  startDate: string; // yyyy-MM-dd
  scheduledTime?: string | null;
  propertyId?: string | null;
  priceExGst?: number | null;
  priceIncGst?: number | null;
  notes?: string | null;
  cleanerId?: string | null;
  seriesId?: string | null;
  estimatedDuration?: number | null;
  source?: string | null;
}

function getNextDates(startDate: Date, frequency: RecurringFrequency, count: number): Date[] {
  const dates: Date[] = [];
  for (let i = 1; i <= count; i++) {
    switch (frequency) {
      case 'weekly':
        dates.push(addWeeks(startDate, i));
        break;
      case 'fortnightly':
        dates.push(addWeeks(startDate, i * 2));
        break;
      case 'monthly':
        dates.push(addMonths(startDate, i));
        break;
    }
  }
  return dates;
}

function getRecurringCount(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly': return 8;
    case 'fortnightly': return 4;
    case 'monthly': return 2;
    default: return 0;
  }
}

function frequencyToIntervalWeeks(frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'weekly': return 1;
    case 'fortnightly': return 2;
    case 'monthly': return 4;
    default: return 1;
  }
}

export async function createRecurringJobSeries(params: RecurringJobParams): Promise<{ seriesId: string | null; jobCount: number }> {
  const { parentJobId, frequency, startDate, scheduledTime, propertyId, priceExGst, priceIncGst, notes, cleanerId, estimatedDuration, source } = params;
  
  if (frequency === 'one-off') return { seriesId: null, jobCount: 0 };

  const count = getRecurringCount(frequency);
  const start = new Date(startDate + 'T00:00:00');
  const futureDates = getNextDates(start, frequency, count);

  // Create job_series record
  const { data: seriesData, error: seriesError } = await supabase.from('job_series').insert({
    frequency,
    interval_weeks: frequencyToIntervalWeeks(frequency),
    start_date: startDate,
    property_id: propertyId || null,
    cleaner_1_id: cleanerId || null,
    notes: notes || null,
    price_ex_gst: priceExGst,
  } as any).select('id').single();

  if (seriesError) throw seriesError;
  const seriesId = (seriesData as any)?.id || null;

  // Update parent job with series_id and frequency
  await supabase.from('jobs').update({
    series_id: seriesId,
    frequency,
    recurring_parent_id: null,
  } as any).eq('id', parentJobId);

  // Generate child jobs
  if (futureDates.length > 0) {
    const childJobs = futureDates.map(d => ({
      property_id: propertyId || null,
      scheduled_date: format(d, 'yyyy-MM-dd'),
      scheduled_time: scheduledTime || null,
      estimated_duration: estimatedDuration || null,
      cleaner_1_id: cleanerId || null,
      notes: notes || null,
      status: 'scheduled',
      price_ex_gst: priceExGst || null,
      price_inc_gst: priceIncGst || null,
      series_id: seriesId,
      frequency,
      recurring_parent_id: parentJobId,
      source: source || 'recurring',
    }));

    for (let i = 0; i < childJobs.length; i += 50) {
      await supabase.from('jobs').insert(childJobs.slice(i, i + 50) as any);
    }
  }

  return { seriesId, jobCount: futureDates.length };
}
