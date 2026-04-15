# Fix 3 — Xero Invoice Lifecycle Test Checklist

Closes the money loop end-to-end: clean done → draft → sent → paid → visible everywhere.

## Setup

1. `git pull` and let Lovable apply the migration `20260415140000_xero_invoice_sync_cron.sql`.
2. Make sure Xero is connected in Settings → Xero (Lovable should preserve OAuth).
3. The pg_cron job `xero-invoice-sync-15min` will start running every 15 minutes after the migration applies. Verify in Supabase SQL editor with `SELECT * FROM cron.job;`.

---

## Test 1 — Auto-send fires on completion

1. As a cleaner, complete a job (`/clean/<jobId>/complete` → submit).
2. Go to that job's detail page (`/jobs/<jobId>`) — the Invoice card should show:
   - **Invoice #** populated
   - Status: **Sent** (blue dot, "Invoice Sent <date>")
3. The client should receive the Xero email.
4. Check `/invoices/pending` → the job should NOT appear (it's no longer "stuck").

If status shows **Draft** instead of **Sent**, the auto-send failed — check `/invoices/pending` and use the **Retry Send** button. This is the safety-net behavior.

---

## Test 2 — Stuck-draft retry

1. Manually break Xero (or wait for a real failure) and complete a job.
2. Job lands at `invoice_status='draft'`. Wait 5+ minutes.
3. Open `/invoices/pending` → the job appears under **"Auto-send failed"** with a yellow border.
4. Click **Retry Send** → toast: *"Invoice sent ✓"* → row disappears.

---

## Test 3 — Paid status detection (cron)

1. Pay an invoice in Xero (or mark it paid manually in Xero's UI).
2. Wait up to 15 minutes (cron tick) OR refresh the dashboard (active-tab refresh).
3. The Job's Invoice card should now show **Paid** with the date.
4. Admin should get a notification at `/actions`: *"Invoice Paid 💰 — Invoice #BCL-XXXX for [Property] ($XX.XX) has been marked paid in Xero."*

---

## Test 4 — Property-level invoice history

### Admin view (`/properties/<id>` → Invoices tab)
- Should show:
  - 3 totals tiles: **Paid**, **Outstanding**, **Draft**
  - All invoices for this property (date, #, amount, status, "Open in Xero" link)

### Client portal (`/client-portal/property/<id>`)
- New "Invoices" section under "Issues & Flags".
- Same data, no admin tools (no Xero deep link, no totals breakdown).

---

## Test 5 — Dashboard KPIs

On the admin dashboard you should now see two new tiles next to "Stuck Drafts":

- **Outstanding** — total $ awaiting payment + count
- **Paid This Month** — total $ paid in the current calendar month + count

Both link to `/financials`.

---

## Test 6 — Client portal status mapping fix

Open the client portal Invoices tab (`/client-portal/dashboard` → Invoices). Any invoice with `status='draft'` should show the **Draft** badge (yellow). Previously it showed "Not Raised" because of a `'raised'` vs `'draft'` mapping bug — that's fixed.

---

## Test 7 — pg_cron sanity check

In Supabase SQL editor:
```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'xero-invoice-sync-15min';
```
Should return one row, `active=true`, `schedule='*/15 * * * *'`.

To see recent runs:
```sql
SELECT * FROM cron.job_run_details
WHERE jobname = 'xero-invoice-sync-15min'
ORDER BY start_time DESC LIMIT 5;
```

---

## What is NOT changed

- The `xero-auto-invoice-job` edge function itself (still creates the draft).
- The Xero OAuth flow (still uses existing `xero_tokens` table).
- The Job Detail invoice card (still shows the same controls — manual override still works).

## What's intentionally NOT in this fix

- ❌ Real-time payment webhooks (cron polling is good enough; webhook = future enhancement)
- ❌ Overdue-payment SMS to client (only admin alert for now)
- ❌ Stripe payment (Fix 6)

---

If anything's off, screenshot it or paste the error and I'll dig in.
