// ============================================================================
// Shadow cleans — client helpers.
//
// A trainee joins a real job run by an admin or head cleaner, who rates it out
// of 10 with Pass, Needs more work or Fail. Every write goes through the
// staff-onboarding function, which rebuilds the trainee's training record and
// pre-start checklist each time, so the rules live in one place (server side).
// ============================================================================

import { addDays, format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/edgeError';
import { sendJobSms } from '@/lib/sendJobSms';

export type ShadowOutcome = 'pass' | 'needs_more_work' | 'fail';
export type ShadowStatus = 'scheduled' | 'rated' | 'cancelled';

export const OUTCOME_LABEL: Record<ShadowOutcome, string> = {
  pass: 'Pass',
  needs_more_work: 'Needs more work',
  fail: 'Fail',
};

export interface ShadowClean {
  id: string;
  trainee_id: string;
  trainee_name: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  job_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  property_name: string | null;
  property_address: string | null;
  status: ShadowStatus;
  rating: number | null;
  outcome: ShadowOutcome | null;
  notes: string | null;
  rated_at: string | null;
}

export type TraineeStep = 'shadow_clean_1' | 'shadow_clean_2' | 'qc' | 'done';

export interface Trainee {
  id: string;
  name: string;
  phone: string | null;
  step: TraineeStep;
  stepLabel: string;
  scheduledCount: number;
}

export interface SuggestedJob {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  property_name: string;
  suburb: string | null;
  client_type: string | null;
  supervisor_name: string;
}

/** Mirrors the server's rules, for labels only. The server decides. */
export function traineeNextStep(training: any): { step: TraineeStep; label: string } {
  const sc1 = training?.shadow_clean_1;
  const sc2 = training?.shadow_clean_2;
  const done = (s: any) => Boolean(s?.date && s?.supervisor && s?.debrief_completed);
  const qcPassed = Number(sc2?.qc_score ?? 0) >= 80 && (!sc2?.outcome || sc2.outcome === 'pass');
  if (!done(sc1)) return { step: 'shadow_clean_1', label: 'Needs Shadow Clean 1' };
  if (!done(sc2)) return { step: 'shadow_clean_2', label: 'Needs Shadow Clean 2' };
  if (!qcPassed) return { step: 'qc', label: 'Shadow Clean 2 not passed yet' };
  return { step: 'done', label: 'Shadow cleans complete' };
}

const STEP_ORDER: Record<TraineeStep, number> = { shadow_clean_1: 0, shadow_clean_2: 1, qc: 2, done: 3 };

export function shortDate(date: string, time?: string | null): string {
  return `${format(parseISO(date), 'EEE d MMM')}${time ? ` · ${String(time).slice(0, 5)}` : ''}`;
}

async function call(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('staff-onboarding', { body: { action, ...payload } });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Everyone still in training, ordered by what they need next: Shadow Clean 1
 * first, then 2, then a pass. Trainees who have finished shadow cleans drop off.
 */
export async function fetchTrainees(): Promise<Trainee[]> {
  const { data: rows, error } = await supabase
    .from('staff_onboarding')
    .select('user_id, full_name, phone, training_record, director_approved')
    .or('director_approved.is.null,director_approved.eq.false');
  if (error) throw new Error(`Could not load trainees: ${error.message}`);

  const list = ((rows as any[]) || []).filter(r => r.user_id);
  const ids = list.map(r => r.user_id);
  if (!ids.length) return [];

  const [{ data: profiles }, { data: booked }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone').in('id', ids),
    supabase.from('staff_shadow_cleans' as any).select('trainee_id').eq('status', 'scheduled').in('trainee_id', ids),
  ]) as any[];

  const profile = new Map(((profiles as any[]) || []).map(p => [p.id, p]));
  const count = new Map<string, number>();
  ((booked as any[]) || []).forEach(b => count.set(b.trainee_id, (count.get(b.trainee_id) || 0) + 1));

  return list
    .map(r => {
      const { step, label } = traineeNextStep(r.training_record);
      const p = profile.get(r.user_id);
      return {
        id: r.user_id,
        name: (p?.full_name || r.full_name || 'Unnamed cleaner').trim(),
        phone: p?.phone || r.phone || null,
        step,
        stepLabel: label,
        scheduledCount: count.get(r.user_id) || 0,
      } as Trainee;
    })
    .filter(t => t.step !== 'done')
    .sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step] || a.name.localeCompare(b.name));
}

export async function fetchTraineeSessions(traineeId: string): Promise<ShadowClean[]> {
  const { data, error } = await supabase
    .from('staff_shadow_cleans' as any)
    .select('*')
    .eq('trainee_id', traineeId)
    .order('scheduled_date', { ascending: false });
  if (error) throw new Error(`Could not load shadow cleans: ${error.message}`);
  return (data as unknown as ShadowClean[]) || [];
}

export async function fetchJobSessions(jobId: string): Promise<ShadowClean[]> {
  const { data, error } = await supabase
    .from('staff_shadow_cleans' as any)
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load shadow cleans: ${error.message}`);
  return (data as unknown as ShadowClean[]) || [];
}

/**
 * Good jobs to shadow in the next three weeks: run by an admin or head cleaner,
 * not already booked for this trainee, and not one they're working themselves.
 * Airbnb turnovers come first on any given day, since onboarding trains Airbnb
 * housekeeping.
 */
export async function fetchSuggestedJobs(traineeId: string): Promise<SuggestedJob[]> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const until = format(addDays(new Date(), 21), 'yyyy-MM-dd');

  const [{ data: leads }, { data: jobs, error }, { data: booked }] = await Promise.all([
    supabase.from('user_roles').select('user_id').in('role', ['admin', 'head_cleaner']),
    supabase
      .from('jobs')
      .select('id, scheduled_date, scheduled_time, status, cleaner_1_id, cleaner_2_id, properties(property_name, suburb, client_type)')
      .gte('scheduled_date', today)
      .lte('scheduled_date', until)
      .not('status', 'in', '(cancelled,completed)')
      .not('cleaner_1_id', 'is', null)
      .order('scheduled_date', { ascending: true }),
    supabase.from('staff_shadow_cleans' as any).select('job_id').eq('trainee_id', traineeId).neq('status', 'cancelled'),
  ]) as any[];
  if (error) throw new Error(`Could not load upcoming jobs: ${error.message}`);

  const leadIds = new Set(((leads as any[]) || []).map(l => l.user_id));
  const taken = new Set(((booked as any[]) || []).map(b => b.job_id));
  const candidates = ((jobs as any[]) || []).filter(j =>
    leadIds.has(j.cleaner_1_id) && j.cleaner_1_id !== traineeId && j.cleaner_2_id !== traineeId && !taken.has(j.id));

  const supervisorIds = [...new Set(candidates.map(j => j.cleaner_1_id))];
  const { data: profiles } = supervisorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', supervisorIds)
    : { data: [] as any[] };
  const names = new Map(((profiles as any[]) || []).map(p => [p.id, p.full_name || '']));

  const airbnb = (j: SuggestedJob) => (j.client_type === 'airbnb' ? 1 : 0);
  return candidates
    .map(j => ({
      id: j.id,
      scheduled_date: j.scheduled_date,
      scheduled_time: j.scheduled_time,
      property_name: j.properties?.property_name || 'Clean',
      suburb: j.properties?.suburb || null,
      client_type: j.properties?.client_type || null,
      supervisor_name: names.get(j.cleaner_1_id) || 'Supervisor',
    }))
    .sort((a, b) =>
      a.scheduled_date.localeCompare(b.scheduled_date)
      || airbnb(b) - airbnb(a)
      || String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')))
    .slice(0, 8);
}

/** Book the shadow clean, then text the trainee where and when. */
export async function addShadowClean(traineeId: string, jobId: string): Promise<{ smsSent: boolean }> {
  const data = await call('shadow_add', { trainee_id: traineeId, job_id: jobId });
  const trainee = data?.trainee;
  const job = data?.job;
  if (!trainee?.phone || !job) return { smsSent: false };

  const first = String(trainee.name || 'there').split(' ')[0];
  const supervisor = String(data?.supervisor?.name || 'the team').split(' ')[0];
  const when = `${format(parseISO(job.scheduled_date), 'EEE d MMM')}${job.scheduled_time ? ` at ${String(job.scheduled_time).slice(0, 5)}` : ''}`;
  const where = [job.property_name, job.property_address].filter(Boolean).join(', ');
  try {
    await sendJobSms({
      to: trainee.phone,
      message: `Hi ${first}, you're booked for a shadow clean with ${supervisor} on ${when}${where ? `, ${where}` : ''}. It's a paid training clean at your usual hourly rate, and your hours log automatically when the clean finishes. Any questions, call 0418 878 707.`,
    });
    return { smsSent: true };
  } catch {
    // The booking stands even if the text fails.
    return { smsSent: false };
  }
}

export async function rateShadowClean(sessionId: string, rating: number, outcome: ShadowOutcome, notes: string) {
  return call('shadow_rate', { session_id: sessionId, rating, outcome, notes });
}

export async function cancelShadowClean(sessionId: string) {
  return call('shadow_cancel', { session_id: sessionId });
}
