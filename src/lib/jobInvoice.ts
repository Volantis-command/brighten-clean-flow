import { supabase } from '@/integrations/supabase/client';

/**
 * Create a DRAFT invoice in Xero for a completed job. Stops there —
 * does NOT authorise or email the invoice.
 *
 * Spec change 2026-04-28 (Brendan): "i dont want invoices sent, i just
 * want them drafted, and i will send them" — the auto-send step that
 * used to follow this function has been removed. Drafts wait in Xero
 * for Brendan to review (and edit if needed — see the price fix in
 * xero-auto-invoice-job that landed alongside this change) before he
 * sends them himself from the Xero UI.
 *
 * Errors are caught and logged so they don't block the cleaner's
 * completion flow. The cleaner's UX never depends on Xero working.
 *
 * Idempotent: xero-auto-invoice-job skips jobs that already have an
 * xero_invoice_id, so calling this twice on the same job is safe.
 */
export async function triggerJobAutoInvoice(jobId: string): Promise<void> {
  if (!jobId) return;

  try {
    const { error } = await supabase.functions.invoke('xero-auto-invoice-job', {
      body: { job_id: jobId, send_email: false },
    });
    if (error) {
      console.error('[auto-invoice] draft creation failed:', error);
      return;
    }
    console.log('[auto-invoice] draft created for job', jobId);
  } catch (e) {
    console.error('[auto-invoice] draft creation threw:', e);
  }
}

// retrySendInvoice removed 2026-04-28 — Brendan sends invoices from
// Xero directly now, so the manual "send from Brightly" path on
// /invoices/pending was deleted alongside this. xero-send-invoice
// edge function is left in place but unused (no harm; redeploys are
// no-ops). Add it back if we ever expose Send from the admin UI again.
