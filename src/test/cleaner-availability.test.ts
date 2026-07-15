import { describe, expect, it } from 'vitest';
import { isWeeklyDayAvailable } from '@/hooks/useCleanerConflicts';

describe('isWeeklyDayAvailable', () => {
  it('supports the short-day array saved by onboarding', () => {
    expect(isWeeklyDayAvailable(['mon', 'wed', 'fri'], 'wed')).toBe(true);
    expect(isWeeklyDayAvailable(['mon', 'wed', 'fri'], 'thu')).toBe(false);
  });

  it('supports full day names from the staff self-service form', () => {
    expect(isWeeklyDayAvailable(['Monday', 'Sunday'], 'sun')).toBe(true);
    expect(isWeeklyDayAvailable(['Monday', 'Sunday'], 'sat')).toBe(false);
  });

  it('supports the shift object used by the admin staff profile', () => {
    expect(isWeeklyDayAvailable({ tue: ['am'], wed: [] }, 'tue')).toBe(true);
    expect(isWeeklyDayAvailable({ tue: ['am'], wed: [] }, 'wed')).toBe(false);
  });

  it('uses the existing weekday default when no pattern has been saved', () => {
    expect(isWeeklyDayAvailable(null, 'mon')).toBe(true);
    expect(isWeeklyDayAvailable(null, 'sun')).toBe(false);
  });
});
