// ============================================================================
// Is this clean finished with?
//
// BJ, 28 Oct 2026: "i need a clear tick somewhere i can tick to say its closed
// off, invoice sent, or no invoice needed but closed off, no further action
// needed."
//
// One rule, used by every view: a job is CLOSED when closed_off_at is set.
// Paid is not part of it. Xero owns paid.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

export type CloseReason = 'invoice_sent' | 'no_invoice_needed';

export interface JobClosure {
  /** Nothing further owed on this clean. */
  closed: boolean;
  reason: CloseReason | null;
  /** Short chip for the calendar when something is still owed. Null when fine. */
  chip: string | null;
  /** 'warn' reads amber, 'bad' reads red. */
  tone: 'warn' | 'bad' | null;
  /** The sentence for the job panel and the close-off list. */
  detail: string | null;
}

const OK: JobClosure = { closed: true, reason: null, chip: null, tone: null, detail: null };

export function jobClosure(job: any): JobClosure {
  if (!job) return OK;
  if (job.status === 'cancelled') return { closed: true, reason: null, chip: null, tone: null, detail: null };

  if (job.closed_off_at) {
    return {
      closed: true,
      reason: (job.closed_off_reason as CloseReason) || null,
      chip: null,
      tone: null,
      detail: job.closed_off_reason === 'no_invoice_needed' ? 'Closed off, no invoice needed' : 'Closed off, invoice sent',
    };
  }

  // Still being worked. The work colours already say that, so no chip.
  if (job.status !== 'completed') {
    if (job.status === 'pending_cleaner') {
      return { closed: false, reason: null, chip: 'No cleaner', tone: 'warn', detail: 'Nobody is on this clean yet.' };
    }
    return { closed: false, reason: null, chip: null, tone: null, detail: null };
  }

  // Done, so the only question left is the money.
  const st = String(job.invoice_status || 'none');
  if (st === 'failed') {
    return { closed: false, reason: null, chip: 'Invoice failed', tone: 'bad', detail: job.invoice_error || 'Xero refused the invoice.' };
  }
  if (st === 'none') {
    return { closed: false, reason: null, chip: 'Invoice', tone: 'warn', detail: 'Done, but never invoiced.' };
  }
  if (st === 'draft') {
    return { closed: false, reason: null, chip: 'Send it', tone: 'warn', detail: 'Draft sitting in Xero, waiting to be approved and sent.' };
  }
  // sent / authorised / paid without a close-off stamp: treat as needing the tick.
  return { closed: false, reason: null, chip: 'Tick off', tone: 'warn', detail: `Invoice is ${st}. Tick it off to close the job.` };
}

/** Close a clean off. */
export async function closeOffJob(jobId: string, reason: CloseReason) {
  const { data: auth } = await supabase.auth.getUser();
  const patch: Record<string, any> = {
    closed_off_at: new Date().toISOString(),
    closed_off_reason: reason,
    closed_off_by: auth?.user?.id ?? null,
  };
  // Saying the invoice went out is also saying so on the invoice itself, so the
  // Financials page stops listing it as outstanding.
  if (reason === 'invoice_sent') patch.invoice_sent_at = patch.closed_off_at;
  const { error } = await supabase.from('jobs').update(patch as any).eq('id', jobId);
  if (error) throw new Error(`Could not close the job off: ${error.message}`);
}

export async function reopenJob(jobId: string) {
  const { error } = await supabase
    .from('jobs')
    .update({ closed_off_at: null, closed_off_reason: null, closed_off_by: null } as any)
    .eq('id', jobId);
  if (error) throw new Error(`Could not reopen the job: ${error.message}`);
}
