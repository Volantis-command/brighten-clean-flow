// The booking form opens on whatever the calendar slot said.
//
// These look trivial, and the bug they guard is not: a form that opens on the
// wrong day is invisible. Nothing errors, nothing looks broken, and you find
// out when a cleaner is booked for the wrong date.

import { describe, it, expect } from 'vitest';
import { parseSlotDate, parseSlotTime } from '@/lib/scheduleSlot';

const TODAY = new Date('2026-11-05T14:00:00');
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('parseSlotDate', () => {
  it('opens on the day that was clicked', () => {
    expect(ymd(parseSlotDate('2026-11-16', TODAY))).toBe('2026-11-16');
    expect(ymd(parseSlotDate('2026-11-19', TODAY))).toBe('2026-11-19');
  });

  it('keeps the date local, never shifting a day on the timezone', () => {
    const d = parseSlotDate('2026-11-16', TODAY);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(0);
  });

  it('survives the year boundary', () => {
    expect(ymd(parseSlotDate('2026-01-01', TODAY))).toBe('2026-01-01');
    expect(ymd(parseSlotDate('2026-12-31', TODAY))).toBe('2026-12-31');
  });

  it('falls back to today when there is nothing usable in the URL', () => {
    for (const junk of [null, '', 'rubbish', '16-11-2026', '2026/11/16']) {
      expect(ymd(parseSlotDate(junk, TODAY))).toBe('2026-11-05');
    }
  });

  it('falls back on a date that matches the shape but is not a real date', () => {
    // The regex accepts this. Date does not.
    expect(ymd(parseSlotDate('2026-13-45', TODAY))).toBe('2026-11-05');
  });
});

describe('parseSlotTime', () => {
  it('opens on the hour that was clicked', () => {
    expect(parseSlotTime('08:00')).toBe('08:00');
    expect(parseSlotTime('00:00')).toBe('00:00');
    expect(parseSlotTime('23:30')).toBe('23:30');
  });

  it('falls back to 9am on anything it does not recognise', () => {
    for (const junk of [null, '', '9:00', '24:00', '12:60', 'abc']) {
      expect(parseSlotTime(junk)).toBe('09:00');
    }
  });
});
