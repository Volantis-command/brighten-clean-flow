# End-to-End Flow Audit — Brightly

A specialist audit of every step from "customer submits the intake form" through
"invoice marked paid". This document captures the whole flow, flags every dead
end / half-wired piece, and tracks what's been fixed vs. what's coming.

---

## The canonical flow

```
 A. Lead intake            → Customer fills ResidentialForm / CommercialForm
 B. Quote preparation      → Admin prices & sends the quote
 C. Client accepts         → QuoteViewPage → creates a yellow pending_cleaner job
 D. Admin schedules        → Pipeline card → assigns cleaner → yellow awaiting
 E. Cleaner accepts        → /my-jobs → job turns green confirmed
 F. Job day                → Clock in → checklist → completion form
 G. Post-clean             → Xero draft → sent → paid → feedback → rebook
```

---

## Audit findings by phase

### Phase A — Lead intake

| Step | Status | Notes |
|---|---|---|
| Form submission writes to `quote_requests` | ✅ Works | `ResidentialForm.tsx:102`, `CommercialForm.tsx:89` |
| Profile + property + link created | ✅ Works (as of PR #7) | `link-intake-to-profile` edge function |
| Client confirmation SMS sent | ✅ Works | `send-quote-notification` type=`intake_submitted` |
| Admin notification (bell + SMS) | ✅ Works | Same edge function creates `notifications` rows + SMS to every admin |

**Status: Phase A is solid.**

---

### Phase B — Quote preparation

| Step | Status | Notes |
|---|---|---|
| Dashboard shows new lead in "New Enquiry" column | ✅ Works | `OperationsDashboard.tsx:178` |
| Click lead → opens `/quoting?lead=<id>` | ✅ Works | `OperationsDashboard.tsx:508` |
| NewQuoteCalculator pre-fills from `quote_requests.form_data` | ✅ Works | Includes preferred_time, addons, consumables |
| Hours persist on load from a saved lead | ⚠️ Half-wired → ✅ **FIXED THIS PR** | The `loadLead()` path didn't set `hoursManuallySet=true`, so auto-recalc reset user-edited hours. Same bug as PR #8 on a different load path. |
| Send Quote SMS uses correct URL | ✅ Works (as of PR #3, #4) | `/quote-view/<token>` on `app.brightly.cleaning` |

---

### Phase C — Client accepts

| Step | Status | Notes |
|---|---|---|
| Quote link opens `/quote-view/:token` | ✅ Works | `QuoteViewPage.tsx` |
| Client Accept → quote status update | ✅ Works | Status → `accepted` |
| Job auto-created | ✅ Works | via `create-booking-from-quote` edge function |
| Job lands YELLOW (pending_cleaner) | ✅ Works (as of Fix 1 + PR #6 trigger) | DB trigger guarantees it regardless of caller |
| Admin notified that quote was accepted | ⚠️ Half-wired | Notification exists via `send-quote-notification` type=`accepted` but not a job-created alert. Admin sees it appear on the dashboard's Accepted column, no push. |

---

### Phase D — Admin schedules (the one Brendan complained about)

| Step | Status | Notes |
|---|---|---|
| "Schedule Clean" button pre-fills and schedules | ❌ **BROKEN before this PR** → ✅ **FIXED** | Previously navigated to `/schedule?lead=<id>` which nobody handled — dead end. Now opens a modal inline with client, address, clean type, preferred date, preferred time, duration all pre-filled. Admin only needs date/time/cleaner. |
| "Assign Cleaner" button opens same modal with cleaner picker focused | ❌ → ✅ | Fixed same way, opens with cleaner dropdown ring-highlighted |
| After schedule → lead moves out of "Accepted" column | ❌ → ✅ | Modal now sets quote_request status → `scheduled` |
| Job inserted with right yellow status | ✅ Works | DB trigger + `initialJobStatusForAssignment` |
| Cleaner gets SMS if assigned | ✅ Works | `syncJobAssignment` handles it |

---

### Phase E — Cleaner accepts

| Step | Status | Notes |
|---|---|---|
| `/my-jobs` shows "Awaiting your acceptance" section | ✅ Works (as of Fix 1) | |
| Accept → job turns green (`confirmed`) | ✅ Works | `acceptJob` helper |
| Decline → reverts to `pending_cleaner` + admin alert | ✅ Works | `declineJob` helper |
| Re-acceptance when admin edits date/cleaner on a confirmed job | ✅ Works | `syncJobAssignment({forceReaccept: true})` |

---

### Phase F — Job day

| Step | Status | Notes |
|---|---|---|
| `/clean/:jobId` loads properly (PreClockOnView) | ✅ Works (as of PR #6) | Falls back to `job.property_address` + `job.client_name` if properties record incomplete |
| Clock in creates time_entry, sets `in_progress` | ✅ Works | `ClockInOut.tsx` |
| `/jobs/:jobId/checklist` loads | ✅ Works | `JobChecklistPage` |
| Completion form submission | ⚠️ Half-wired | All photo fields marked required even when optional (e.g. deep-clean-only rooms). Needs conditional required logic. |
| Completion marks status=`completed` + calls `triggerJobAutoInvoice` | ✅ Works | |

---

### Phase G — Post-clean

| Step | Status | Notes |
|---|---|---|
| Xero draft invoice created on completion | ✅ Works | |
| Draft auto-sent to client | ✅ Works (as of Fix 3, PR #2) | `triggerJobAutoInvoice` chains draft → send |
| Failed sends surface on `/invoices/pending` for retry | ✅ Works | |
| pg_cron syncs paid status every 15 min | ✅ Works (as of Fix 3) | |
| Admin alert fires when invoice paid | ✅ Works (as of Fix 3) | |
| Paid visible on Dashboard / Job / Property / Client portal | ✅ Works (as of Fix 3) | |
| Feedback request SMS after completion | ❌ Missing | No code sends feedback request automatically. Client never prompted for review. |
| Rebook SMS after feedback | ⚠️ Partial | `send-review-rebook-sms` function exists but triggering logic unclear. |
| "Clean completed" SMS to client | ✅ Works | `job-completed-sms` in `CompletionFormPage:399` |

---

## What's shipping in this PR

1. **Schedule Clean / Assign Cleaner buttons actually work** (Phase D fix). New `ScheduleFromLeadModal` opens inline with everything pre-filled.
2. **Hours no longer reset on loading a lead into NewQuoteCalculator** (Phase B fix, completes the `hoursManuallySet` class of bug across all load paths).
3. **This audit document** so the flow map is visible and priorities are explicit.

## Follow-ups queued

- **Conditional required fields on CompletionFormPage** — don't block on photos for rooms that aren't part of the booked clean type
- **Feedback request SMS** after job completion — currently a dead end
- **Preferred date/time echoed back to the client** on `/quote-view` so they know what they picked
- **Admin alert when quote is accepted** — currently the admin has to be looking at the dashboard to notice
