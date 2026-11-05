// Is this cleaner already working at that time?
//
// THE BUG THIS FIXES (BJ, 5 Nov 2026)
// Jess was booked on Rumble, Fri 6 Nov 11:00 for 2 hours. Putting her on
// another clean at 10:00 the same day showed her as "✅ available".
//
// The check was not wrong, it was looking at nothing. It asked the database
// for jobs with status 'scheduled' or 'in_progress'. In production there is
// exactly ONE job with status 'scheduled' out of 505, and 'in_progress' is not
// a status this system has ever written. The real ones are 'confirmed' (261),
// 'completed' (182), 'awaiting_cleaner_acceptance' (25) and 'pending_cleaner'
// (17). So the double-booking check matched 1 job in 505 and was effectively
// dead from the day the statuses changed under it.
//
// Hence a DENYLIST, not an allowlist. A cancelled job frees the cleaner; every
// other status means they are committed. Statuses get added to this system
// regularly, and an allowlist goes quietly stale, which is exactly what
// happened. Anything new is treated as "booked" until someone decides
// otherwise, which fails safe.
export const FREED_STATUS = 'cancelled';

/** The app's own default when a job has no duration recorded. 30 of 505 do not. */
export const DEFAULT_JOB_MINUTES = 120;

export type CleanerJob = {
  property_name: string;
  /** 'HH:mm', or null on the handful of jobs with no time. */
  time: string | null;
  /** Minutes. Null where none was recorded. */
  durationMin: number | null;
};

/** 'HH:mm' to minutes past midnight. Null if it is not a time. */
export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Does an existing job overlap the window we are about to book?
 *
 * Half-open on purpose: a clean finishing at 11:00 and one starting at 11:00
 * do not overlap. Back-to-back is the normal shape of a turnover day and
 * flagging it would train everyone to click through the warning.
 *
 * A job with no time recorded counts as a clash. We cannot prove it overlaps
 * and we cannot prove it does not, and for a double-booking guard the safe
 * answer is to make someone look. There is one such job in the whole database.
 */
export function clashes(job: CleanerJob, startTime: string, durationMin: number): boolean {
  const newStart = toMinutes(startTime);
  if (newStart === null) return false;
  const newEnd = newStart + (durationMin > 0 ? durationMin : DEFAULT_JOB_MINUTES);

  const jobStart = toMinutes(job.time);
  if (jobStart === null) return true;
  const jobEnd = jobStart + (job.durationMin && job.durationMin > 0 ? job.durationMin : DEFAULT_JOB_MINUTES);

  return newStart < jobEnd && jobStart < newEnd;
}

/** The existing jobs that actually overlap, as opposed to merely sharing a day. */
export function findClashes(jobs: CleanerJob[], startTime: string, durationMin: number): CleanerJob[] {
  return jobs.filter((j) => clashes(j, startTime, durationMin));
}

/** "Rumble at 11:00", for a warning someone has to read quickly. */
export function describeJob(job: CleanerJob): string {
  return job.time ? `${job.property_name} at ${job.time}` : `${job.property_name} (no time set)`;
}
