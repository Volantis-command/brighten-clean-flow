import { describe, it, expect } from 'vitest';
import { suggestRoom, outstandingItems, clientStatusText, type JobFeedbackItem, type ClientFeedbackItem } from '@/lib/clientFeedback';

describe('suggestRoom', () => {
  it('picks the room from the words used', () => {
    expect(suggestRoom('The oven glass was still greasy')).toBe('Kitchen');
    expect(suggestRoom('hair left in the shower drain')).toBe('Bathroom');
    expect(suggestRoom('Please change the sheets in the spare room')).toBe('Bedroom');
    expect(suggestRoom('cobwebs on the balcony')).toBe('Outdoor');
  });

  it('uses the first room mentioned', () => {
    expect(suggestRoom('shower was fine but the fridge smelt')).toBe('Bathroom');
  });

  it('does not match words inside other words', () => {
    // "bath" must not fire inside "bathroom"-less words like "sabbath", "bed" not inside "embedded"
    expect(suggestRoom('the embedded speaker was dusty')).toBeNull();
  });

  it('gives no guess rather than a wrong one', () => {
    expect(suggestRoom('mirror had smudges')).toBeNull();
    expect(suggestRoom('')).toBeNull();
    expect(suggestRoom(null)).toBeNull();
  });
});

const item = (over: Partial<JobFeedbackItem>): JobFeedbackItem => ({
  id: 'x', category: 'missed', room: null, message: 'm', status: 'open', created_at: '2026-11-24T00:00:00Z',
  source_job_id: null, source_job_date: null, this_job_outcome: null, this_job_note: null,
  this_job_checked_by: null, times_not_done: 0, last_not_done_note: null, last_not_done_date: null,
  last_not_done_by: null, ...over,
});

describe('outstandingItems', () => {
  it('counts only notes not yet answered on this job', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', this_job_outcome: 'done' }),
      item({ id: 'c', this_job_outcome: 'not_done', this_job_note: 'no key' }),
      item({ id: 'd', category: 'every_clean' }),
    ];
    expect(outstandingItems(items).map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('copes with no data', () => {
    expect(outstandingItems(undefined)).toEqual([]);
  });
});

describe('clientStatusText', () => {
  const base: ClientFeedbackItem = {
    id: 'x', category: 'missed', room: null, message: 'm', status: 'open', created_at: '2026-11-24T00:00:00Z',
    source_job_id: null, source_job_date: null, resolved_at: null, resolved_job_date: null, resolved_by: null,
    carried: false,
  };
  const fmt = (d: string) => d;

  it('says who did it and when', () => {
    expect(clientStatusText({ ...base, status: 'done', resolved_job_date: '4 Dec', resolved_by: 'Jess' }, fmt))
      .toBe('Done on 4 Dec by Jess');
  });

  it('never leaks the cleaner reason, only that it carried', () => {
    expect(clientStatusText({ ...base, carried: true }, fmt)).toBe('Carried to the next clean');
  });

  it('standing notes read as standing', () => {
    expect(clientStatusText({ ...base, category: 'every_clean' }, fmt)).toBe('On every clean');
  });

  it('new one-off notes are booked in', () => {
    expect(clientStatusText(base, fmt)).toBe('Booked in for the next clean');
  });
});
