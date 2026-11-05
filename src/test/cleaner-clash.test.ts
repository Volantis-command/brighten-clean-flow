// Double-booking a cleaner.
//
// The real case: Jess on Rumble, Fri 6 Nov 11:00 for 2 hours, and the form
// offering her for a 10:00 clean the same day as "✅ available".

import { describe, it, expect } from 'vitest';
import { clashes, findClashes, toMinutes, DEFAULT_JOB_MINUTES, type CleanerJob } from '@/lib/cleanerClash';

const rumble: CleanerJob = { property_name: 'Rumble', time: '11:00', durationMin: 120 };

describe('the Rumble case', () => {
  it('blocks the 10:00 two-hour clean that overlaps it', () => {
    expect(clashes(rumble, '10:00', 120)).toBe(true);
  });

  it('still blocks when the new clean sits entirely inside the existing one', () => {
    expect(clashes(rumble, '11:30', 30)).toBe(true);
  });

  it('still blocks when the new clean swallows the existing one', () => {
    expect(clashes(rumble, '09:00', 360)).toBe(true);
  });

  it('allows the same day at a time that does not overlap', () => {
    expect(clashes(rumble, '08:00', 120)).toBe(false);
    expect(clashes(rumble, '14:00', 120)).toBe(false);
  });
});

describe('back to back', () => {
  it('allows a clean starting exactly when the last one ends', () => {
    // Rumble runs 11:00 to 13:00. Starting at 13:00 is a normal turnover day,
    // not a clash, and flagging it would train everyone to click through.
    expect(clashes(rumble, '13:00', 120)).toBe(false);
  });

  it('allows a clean finishing exactly when the next one starts', () => {
    expect(clashes(rumble, '09:00', 120)).toBe(false);
  });

  it('blocks an overlap of a single minute', () => {
    expect(clashes(rumble, '12:59', 60)).toBe(true);
  });
});

describe('missing data', () => {
  it('treats a job with no time as a clash, because it cannot be ruled out', () => {
    expect(clashes({ property_name: 'Mystery', time: null, durationMin: 120 }, '10:00', 120)).toBe(true);
  });

  it('falls back to the default length when a job has no duration', () => {
    const noDuration: CleanerJob = { property_name: 'X', time: '11:00', durationMin: null };
    // Treated as 11:00 to 13:00.
    expect(clashes(noDuration, '12:00', 60)).toBe(true);
    expect(clashes(noDuration, '13:00', 60)).toBe(false);
    expect(DEFAULT_JOB_MINUTES).toBe(120);
  });

  it('does not block when the new job has no usable start time', () => {
    expect(clashes(rumble, '', 120)).toBe(false);
  });
});

describe('findClashes', () => {
  const day: CleanerJob[] = [
    { property_name: 'Early', time: '07:00', durationMin: 120 },
    rumble,
    { property_name: 'Late', time: '15:00', durationMin: 120 },
  ];

  it('picks out only the overlapping job, not the whole day', () => {
    const hits = findClashes(day, '12:00', 60);
    expect(hits.map((j) => j.property_name)).toEqual(['Rumble']);
  });

  it('returns nothing when the cleaner has a free gap', () => {
    expect(findClashes(day, '13:00', 60)).toEqual([]);
  });

  it('can return more than one when a long clean covers several', () => {
    expect(findClashes(day, '07:00', 600).length).toBe(3);
  });
});

describe('toMinutes', () => {
  it('reads the times the database returns', () => {
    expect(toMinutes('11:00')).toBe(660);
    expect(toMinutes('11:00:00')).toBe(660);
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('23:59')).toBe(1439);
  });

  it('refuses anything that is not a time', () => {
    for (const junk of [null, undefined, '', 'abc', '25:00', '11:70']) {
      expect(toMinutes(junk)).toBeNull();
    }
  });
});
