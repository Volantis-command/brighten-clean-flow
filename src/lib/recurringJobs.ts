import { addWeeks, addMonths, format, isBefore, isAfter } from 'date-fns';
import { RecurringConfig, getIntervalWeeks } from '@/components/schedule/RecurringJobSection';

export interface GeneratedJob {
  scheduled_date: string;
}

export function generateRecurringDates(
  startDate: Date,
  config: RecurringConfig
): string[] {
  if (!config.enabled) return [];

  const intervalWeeks = getIntervalWeeks(config);
  const maxEnd = config.endType === 'until' && config.endDate
    ? config.endDate
    : addMonths(startDate, 12);

  const dates: string[] = [];
  let current = addWeeks(startDate, intervalWeeks);

  while (isBefore(current, maxEnd) || format(current, 'yyyy-MM-dd') === format(maxEnd, 'yyyy-MM-dd')) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = addWeeks(current, intervalWeeks);
    if (dates.length > 200) break; // safety limit
  }

  return dates;
}
