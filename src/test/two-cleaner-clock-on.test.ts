// Jess could not clock on once Lucy had. 21 and 22 Nov 2026, two real jobs,
// Jess's hours lost both times. The view was resolved from job.clock_on, which
// belongs to whoever arrived first, so the second cleaner was dropped straight
// into the active clean with no Clock On button anywhere.
//
// These lock the per-cleaner behaviour in place.
import { describe, it, expect } from 'vitest';
import { resolveView } from '@/pages/CleanWorkflowPage';

const scheduled = { status: 'scheduled', clock_on: null, pre_clean_assessment_completed_at: null };
const running = { status: 'in_progress', clock_on: '2026-11-22T00:00:33Z', pre_clean_assessment_completed_at: null };
const assessed = { ...running, pre_clean_assessment_completed_at: '2026-11-22T00:02:00Z' };

describe('resolveView', () => {
  it('first cleaner, nobody on site yet, gets the clock on screen', () => {
    expect(resolveView(scheduled, false)).toBe('pre_clock_on');
  });

  it('THE BUG: second cleaner still gets the clock on screen after the first one starts', () => {
    expect(resolveView(running, false)).toBe('pre_clock_on');
  });

  it('once this cleaner has clocked on, the pre-clean questions are next', () => {
    expect(resolveView(running, true)).toBe('assessment');
  });

  it('second cleaner skips the questions the first one already answered', () => {
    expect(resolveView(assessed, true)).toBe('active');
  });

  it('clocking off does not offer a second clock on, which is what made the 0 minute entries', () => {
    expect(resolveView(assessed, true)).toBe('active');
  });

  it('a completed job shows the done screen whatever this cleaner did', () => {
    expect(resolveView({ ...assessed, status: 'completed' }, false)).toBe('done');
    expect(resolveView({ ...assessed, status: 'completed' }, true)).toBe('done');
  });
});
