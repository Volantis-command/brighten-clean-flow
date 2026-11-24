/**
 * Client feedback loop.
 *
 * A client leaves a note on any clean. It shows on the cleaner's screen for
 * the next clean at that property and stays there until a cleaner marks it
 * Done. "Couldn't do" (with a reason) carries it to the clean after. "Every
 * clean" notes never close. All the carry rules live in the database
 * (supabase/migrations/20261124120000_client_feedback_loop.sql); this file is
 * the shared wording and the small pure helpers the screens use.
 */
import { supabase } from '@/integrations/supabase/client';

export type FeedbackCategory = 'missed' | 'next_clean' | 'every_clean';

export const CATEGORY_META: Record<FeedbackCategory, {
  client: string;          // what the client taps
  clientUpcoming: string;  // same, when they're writing on a clean not done yet
  hint: string;
  cleaner: string;         // badge the cleaner sees
  placeholder: string;
}> = {
  missed: {
    client: 'Something was missed',
    clientUpcoming: 'Something was missed',
    hint: 'We fix it on the next clean',
    cleaner: 'Missed last time',
    placeholder: 'e.g. The oven glass still had grease on it',
  },
  next_clean: {
    client: 'Do this on the next clean',
    clientUpcoming: 'Do this on this clean',
    hint: 'A one-off request',
    cleaner: 'Client request',
    placeholder: 'e.g. Please wipe out the fridge, we are clearing it',
  },
  every_clean: {
    client: 'Do this every clean',
    clientUpcoming: 'Do this every clean',
    hint: 'A standing instruction for this property',
    cleaner: 'Every clean',
    placeholder: 'e.g. Lock the balcony door before you leave',
  },
};

export const ROOMS = ['Kitchen', 'Bathroom', 'Bedroom', 'Living', 'Laundry', 'Outdoor', 'Whole home'] as const;

// First room word that appears in the note wins. Ambiguous words (sink, mirror,
// floor) are left out on purpose: a wrong guess is worse than no guess.
const ROOM_WORDS: Record<string, string[]> = {
  Kitchen: ['kitchen', 'oven', 'stove', 'cooktop', 'rangehood', 'range hood', 'fridge', 'freezer', 'microwave',
    'dishwasher', 'benchtop', 'bench', 'kettle', 'toaster', 'pantry', 'dishes', 'cutlery', 'splashback'],
  Bathroom: ['bathroom', 'ensuite', 'shower', 'toilet', 'loo', 'bathtub', 'bath', 'vanity', 'basin', 'grout',
    'towel rail', 'soap scum'],
  Bedroom: ['bedroom', 'bed', 'beds', 'sheets', 'pillow', 'pillows', 'pillowcase', 'doona', 'duvet', 'quilt',
    'wardrobe', 'mattress', 'bedside'],
  Living: ['living', 'lounge', 'couch', 'sofa', 'cushion', 'cushions', 'tv', 'coffee table', 'rug', 'dining'],
  Laundry: ['laundry', 'washing machine', 'washer', 'dryer', 'lint'],
  Outdoor: ['balcony', 'deck', 'patio', 'bbq', 'barbecue', 'pool', 'outdoor', 'outside', 'terrace', 'garden',
    'courtyard', 'alfresco', 'verandah', 'veranda'],
};

export function suggestRoom(text: string | null | undefined): string | null {
  const t = ` ${(text || '').toLowerCase()} `;
  let best: { room: string; at: number } | null = null;
  for (const [room, words] of Object.entries(ROOM_WORDS)) {
    for (const w of words) {
      const m = new RegExp(`[^a-z]${w.replace(/ /g, '\\s+')}[^a-z]`).exec(t);
      if (m && (!best || m.index < best.at)) best = { room, at: m.index };
    }
  }
  return best?.room ?? null;
}

/** One note as the cleaner sees it on a job (job_client_feedback). */
export interface JobFeedbackItem {
  id: string;
  category: FeedbackCategory;
  room: string | null;
  message: string;
  status: 'open' | 'done';
  created_at: string;
  source_job_id: string | null;
  source_job_date: string | null;
  this_job_outcome: 'done' | 'not_done' | null;
  this_job_note: string | null;
  this_job_checked_by: string | null;
  times_not_done: number;
  last_not_done_note: string | null;
  last_not_done_date: string | null;
  last_not_done_by: string | null;
}

/** One note as the client sees it (client_feedback_for_report). */
export interface ClientFeedbackItem {
  id: string;
  category: FeedbackCategory;
  room: string | null;
  message: string;
  status: 'open' | 'done';
  created_at: string;
  source_job_id: string | null;
  source_job_date: string | null;
  resolved_at: string | null;
  resolved_job_date: string | null;
  resolved_by: string | null;
  carried: boolean;
}

/** Notes the cleaner still has to answer before finishing this job. */
export function outstandingItems(items: JobFeedbackItem[] | undefined | null): JobFeedbackItem[] {
  return (items || []).filter((i) => !i.this_job_outcome);
}

/** Plain-words status for the client. No cleaner excuses: those go to the office. */
export function clientStatusText(item: ClientFeedbackItem, fmtDate: (d: string) => string): string {
  if (item.status === 'done') {
    const when = item.resolved_job_date ? fmtDate(item.resolved_job_date) : null;
    return ['Done', when && `on ${when}`, item.resolved_by && `by ${item.resolved_by}`].filter(Boolean).join(' ');
  }
  if (item.category === 'every_clean') return 'On every clean';
  if (item.carried) return 'Carried to the next clean';
  return 'Booked in for the next clean';
}

// The generated Supabase types don't know these functions yet.
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args);

export async function fetchJobFeedback(jobId: string): Promise<JobFeedbackItem[]> {
  const { data, error } = await rpc('job_client_feedback', { p_job_id: jobId });
  if (error) throw error;
  return (data || []) as JobFeedbackItem[];
}

export async function recordFeedbackCheck(
  itemId: string, jobId: string, outcome: 'done' | 'not_done', note?: string,
): Promise<void> {
  const { error } = await rpc('record_client_feedback_check', {
    p_item_id: itemId, p_job_id: jobId, p_outcome: outcome, p_note: note ?? null,
  });
  if (error) throw error;
}

export async function fetchClientFeedback(reportToken: string): Promise<ClientFeedbackItem[]> {
  const { data, error } = await rpc('client_feedback_for_report', { p_report_token: reportToken });
  if (error) throw error;
  return (data || []) as ClientFeedbackItem[];
}

export async function submitClientFeedback(
  reportToken: string, category: FeedbackCategory, message: string, room: string | null,
): Promise<string> {
  const { data, error } = await rpc('submit_client_feedback', {
    p_report_token: reportToken, p_category: category, p_message: message, p_room: room,
  });
  if (error) throw error;
  return data as string;
}
