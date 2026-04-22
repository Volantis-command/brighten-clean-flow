# Brightly — Audit 4 Report: Post-Gap-Fill Review

## Audit Summary

Full post-gap-fill audit completed. All existing features verified, missing features added, edge cases handled.

---

## 1. CLIENT PORTAL — Verified
- `/client/:token` loads portal correctly
- Properties tab queries `client_properties` correctly
- Clean history queries jobs by `property_id` with `client_name` fallback
- Quotes tab queries by phone/email
- Account tab shows client details
- "Book a clean" links to residential form
- Mobile layout fits 390px

## 2. STAFF PORTAL — Verified
- `CleanerPortalPage` renders inductions, clean history, pay sections
- Cleaner onboarding sign-off dates from `cleaner_onboarding`
- Clean history queries `jobs WHERE cleaner_1_id = staff.id`
- Pay calculates from `clock_events` / `time_entries`

## 3. PROPERTY PASSPORT — Verified
- Admin can edit all passport fields via `PropertyPassportSection`
- Cleaner sees passport data on `JobDetailPage` (access, host preferences, product restrictions)
- Access codes visible in job detail

## 4. SMS SCHEDULER — Verified
- `scheduled_sms` table queried by `useProcessScheduledSms`
- Hook fires on dashboard mount, processes pending records
- Sends via `send-job-sms` edge function
- **Fixed:** Now checks job status before sending — cancelled jobs skip SMS
- **Fixed:** Missing phone numbers already handled (marks as failed)

## 5. QUOTE DECLINE — Verified
- Inbound SMS detection for NO/decline keywords
- Updates `quote_requests` + `quotes` to 'declined'
- Admin notification created
- Pipeline shows declined leads

## 6. THANK YOU PAGES — Verified
- `ResidentialQuotePage` and `AirbnbQuotePage` show thank-you state after submit
- Green tick, name, "within 1 hour" messaging
- Dark green branded styling

## 7. FULL FLOW RE-CHECK — Verified
- Enquiry → pipeline card → quoting page with pre-filled fields
- Quote save → `quote_sent` status
- Mark accepted → client created → job created → all steps work
- Job in schedule → visible on calendar
- Cleaner sees job in portal
- Clock on → `clock_events` + `time_entries` written
- Clock off → completion form
- QC queue → audit → pass/fail → **no client notification** (correct)
- Job complete → Xero invoice attempt (graceful fail)
- Review SMS queued in `scheduled_sms`

---

## 8. NEW FEATURES ADDED

### 8a. Job Cancellation with Client SMS + Cleanup
**Files:** `CancelJobModal.tsx`
- Cancel job → all pending `scheduled_sms` records for that job marked `cancelled`
- SMS now sent via `supabase.functions.invoke` (proper auth) instead of raw fetch
- Client cancellation SMS checkbox works correctly

### 8b. Job Reschedule with Client Notification SMS
**Files:** `RescheduleJobModal.tsx` (new), `JobDetailPage.tsx`, `SchedulePage.tsx`
- New `RescheduleJobModal` on job detail page: pick new date/time, optional client + cleaner SMS
- Cancels old pending `scheduled_sms` records before rescheduling
- Client gets reschedule SMS: "Hi {name}, your clean at {property} has been rescheduled to {date} at {time}"
- Calendar drag-and-drop now offers "Notify all" (cleaner + client) instead of just cleaner
- Schedule page also cancels old `scheduled_sms` on drag-and-drop reschedule

### 8c. Click-to-Call on Cleaner Job Detail
**Files:** `JobDetailPage.tsx`, `PreClockOnView.tsx`, `CleanWorkflowPage.tsx`
- Cleaners see "Call Client" button (`tel:` link) next to "Open in Maps" on job detail
- Also added to `PreClockOnView` (pre-clock-on screen in clean workflow)
- Client phone looked up via `client_properties` → `profiles`
- Gracefully hidden when no client phone on file

### 8d. Day View Filter on Schedule Page
**Status:** Already existed — `CalendarViewToggle` has day/week/month options, `CalendarDayView` component renders hourly grid. No changes needed.

---

## 9. EDGE CASES HANDLED

### No Phone Number
- `scheduleJobSmsReminders()`: Already checks `job.client_phone` and `job.cleaner_phone` before creating records
- `useProcessScheduledSms`: Marks SMS as `failed` with "Missing phone or message" if no phone
- `RescheduleJobModal`: Shows "(no phone on file)" and disables client SMS checkbox when no phone
- Click-to-call: Button hidden when no client phone

### Cancelled Jobs
- `CancelJobModal`: Now cancels all pending `scheduled_sms` records for the job
- `useProcessScheduledSms`: Now checks `jobs.status` before sending — skips cancelled jobs
- `RescheduleJobModal`: Cancels old pending SMS before creating new schedule

### Unassigned Cleaners
- `scheduleJobSmsReminders()`: Only creates cleaner SMS if `job.cleaner_phone` exists
- SMS resend: Only attempts if `cleaner_1_id` is set
- Cleaner reminder SMS: Skipped entirely if no cleaner assigned

### Two Cleaners Assigned
- `scheduleJobSmsReminders()` only sends to `cleaner_1_id` phone (by design — `cleaner_2_id` is secondary)
- Acceptance badges shown for both cleaners on job detail

---

## 10. MOBILE AUDIT (390px)
- All pages scroll vertically, no horizontal overflow
- Buttons minimum 44px height (h-12 = 48px, h-14 = 56px, h-16 = 64px)
- Text truncated intentionally with `truncate` class where needed
- Forms usable on mobile keyboard (date/time pickers use native controls)

---

## 11. BUILD STATUS
- TypeScript: 0 errors (`npx tsc --noEmit` clean)
- Vite build: Success (3.17s, 2,258KB JS bundle)
- No runtime errors in component structure

---

## Files Changed
- `src/components/job-detail/CancelJobModal.tsx` — scheduled_sms cleanup on cancel, proper supabase.functions.invoke
- `src/components/job-detail/RescheduleJobModal.tsx` — **NEW** — reschedule with client + cleaner SMS
- `src/pages/JobDetailPage.tsx` — reschedule button, click-to-call, client phone lookup
- `src/pages/SchedulePage.tsx` — drag-and-drop now notifies client + cleaner, cancels old SMS
- `src/pages/CleanWorkflowPage.tsx` — client phone passed to PreClockOnView
- `src/components/clean-workflow/PreClockOnView.tsx` — click-to-call button
- `src/hooks/useProcessScheduledSms.ts` — skip cancelled jobs, job status check before send
