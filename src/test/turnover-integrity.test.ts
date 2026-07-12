import { describe, expect, it } from 'vitest';
import {
  dateInTimeZone,
  hostawayTurnoverKey,
  isCancelledStay,
  isConfirmedStay,
  mergeExternalRefs,
} from '../../supabase/functions/_shared/turnover-integrity';
import { icalDateToISO, parseICalEvents } from '../../supabase/functions/_shared/ical';

describe('turnover integrity', () => {
  it('uses Brisbane as the operating date across the UTC day boundary', () => {
    expect(dateInTimeZone('Australia/Brisbane', 0, new Date('2026-07-11T15:30:00Z'))).toBe('2026-07-12');
  });

  it('fails closed when Hostaway omits a reservation status', () => {
    expect(isConfirmedStay('')).toBe(false);
    expect(isConfirmedStay('pending')).toBe(false);
    expect(isConfirmedStay('confirmed')).toBe(true);
    expect(isCancelledStay('cancelled')).toBe(true);
  });

  it('maps different reservation IDs to one property checkout key', () => {
    expect(hostawayTurnoverKey('property-1', '2026-08-07')).toBe('hostaway:property-1:2026-08-07');
    expect(mergeExternalRefs(['reservation-a'], 'reservation-b')).toEqual(['reservation-a', 'reservation-b']);
    expect(mergeExternalRefs(['reservation-a'], 'reservation-a')).toEqual(['reservation-a']);
  });
});

describe('iCal parsing', () => {
  it('unfolds lines, preserves UID and extracts date values with parameters', () => {
    const calendar = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:booking-123',
      'SUMMARY:Guest booking for a very long',
      ' property name',
      'DTSTART;VALUE=DATE:20260715',
      'DTEND;VALUE=DATE:20260718',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseICalEvents(calendar)).toEqual([{ uid: 'booking-123', summary: 'Guest booking for a very longproperty name', dtstart: '20260715', dtend: '20260718' }]);
    expect(icalDateToISO('20260718')).toBe('2026-07-18');
  });

  it('rejects malformed date conversion', () => {
    expect(() => icalDateToISO('2026-07-18')).toThrow('Invalid iCal date');
  });
});
