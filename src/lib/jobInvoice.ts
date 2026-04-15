import { supabase } from '@/integrations/supabase/client';

/**
 * Trigger the full auto-invoice flow for a completed job:
 *   1. Build & push a DRAFT invoice to Xero (xero-auto-invoice-job)
 *   2. Authorise & email the invoice immediately (xero-send-invoice)
 *
 * Per Brendan's spec: invoices are sent straight after the clean is finished.
 * If the send step fails (Xero down, missing client email, etc.), the job
 * stays at invoice_status='draft' and surfaces on /invoices/pending so admin
 * can retry manually.
 *
 * Errors are caught and logged so they don't block the cleaner's completion
 * flow. The cleaner's UX never depends on Xero working.
 *
 * Idempotent: xero-auto-invoice-job skips jobs that already have an
 * xero_invoice_id, so calling this twice on the same job is safe.
 */
export async function triggerJobAutoInvoice(jobId: string): Promise<void> {
  if (!jobId) return;

  // Step 1: create draft in Xero
  let draftCreated = false;
  try {
    const { error } = await supabase.functions.invoke('xero-auto-invoice-job', {
      body: { job_id: jobId, send_email: false }, // we send in step 2, not via this fn
    });
    if (error) {
      console.error('[auto-invoice] draft creation failed:', error);
      return;
    }
    draftCreated = true;
    console.log('[auto-invoice] draft created for job', jobId);
  } catch (e) {
    console.error('[auto-invoice] draft creation threw:', e);
    return;
  }

  if (!draftCreated) return;

  // Step 2: authorise + email immediately (matches spec: send straight after clean)
  try {
    const { error } = await supabase.functions.invoke('xero-send-invoice', {
      body: { job_id: jobId },
    });
    if (error) {
      console.error('[auto-invoice] send-invoice failed (will appear in /invoices/pending):', error);
      // Leave invoice_status='draft'; admin can retry from PendingInvoicesPage.
    } else {
      console.log('[auto-invoice] sent for job', jobId);
    }
  } catch (e) {
    console.error('[auto-invoice] send-invoice threw:', e);
  }
}

/**
 * Manually retry sending an invoice that's stuck in draft state.
 * Used by the /invoices/pending page when auto-send failed.
 */
export async function retrySendInvoice(jobId: string): Promise<{ ok: boolean; error?: string }> {
  if (!jobId) return { ok: false, error: 'missing job id' };
  try {
    const { error } = await supabase.functions.invoke('xero-send-invoice', {
      body: { job_id: jobId },
    });
    if (error) return { ok: false, error: (error as any).message || 'unknown error' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'unknown error' };
  }
}
