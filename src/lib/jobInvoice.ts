import { supabase } from '@/integrations/supabase/client';

/**
 * Trigger the auto-invoice flow for a completed job. Fires the
 * `xero-auto-invoice-job` edge function which builds the invoice
 * line items (labour + extras + linen + consumables) and pushes
 * it to Xero. Safe to call multiple times — the edge function
 * skips jobs that already have an xero_invoice_id.
 *
 * Errors are caught and logged so they don't block the cleaner's
 * completion flow. The admin can always manually push from Job Detail.
 */
export async function triggerJobAutoInvoice(jobId: string): Promise<void> {
  if (!jobId) return;
  try {
    const { error } = await supabase.functions.invoke('xero-auto-invoice-job', {
      body: { job_id: jobId, send_email: true },
    });
    if (error) {
      console.error('[auto-invoice] failed:', error);
    } else {
      console.log('[auto-invoice] success for job', jobId);
    }
  } catch (e) {
    console.error('[auto-invoice] threw:', e);
  }
}
