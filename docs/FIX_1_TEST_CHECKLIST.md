# Fix 1 — Manual Test Checklist

The job status state machine is now wired end-to-end. Pull these changes,
let Lovable apply the migration, then walk through the tests below.

## Setup

1. `git pull` in the local repo.
2. Open Lovable / Supabase — the migration `20260415120000_job_status_state_machine.sql`
   should apply automatically. After it runs:
   - The `jobs.status` enum will accept the new values.
   - Any existing rows with `status='complete'` get normalised to `'completed'`.
   - Existing rows with `status='scheduled'` are left as-is (will display green
     under the legacy label).
3. Make sure you have at least one test cleaner account you can log into.

---

## Test 1 — Public quote acceptance lands as YELLOW (no cleaner yet)

1. Open a public quote link `/quote/<token>` and accept it (`/quote/<token>/accept`).
2. Open the calendar (`/schedule`) — the new job should appear **YELLOW**
   with the label **"Needs Cleaner"**.
3. Verify in Supabase: `select status from jobs order by created_at desc limit 1;`
   → should be `'pending_cleaner'`.

If recurring (weekly / fortnightly / monthly): every child job in the series
should also be yellow with **"Needs Cleaner"**.

---

## Test 2 — Admin assigns a cleaner → still YELLOW (awaiting acceptance)

1. From the calendar, click the yellow job and edit it (`/jobs/<id>/edit`).
2. Pick a cleaner, save.
3. Calendar now shows the job as **YELLOW** with label **"Awaiting Cleaner"**.
4. The assigned cleaner should receive:
   - An in-app alert ("New Job Offer") visible at `/actions`.
   - A SMS (only if Twilio is configured).
5. Supabase check: `jobs.status` is now `'awaiting_cleaner_acceptance'` and
   a `job_acceptances` row exists with `acceptance_status='pending'`.

Same expected behavior when assigning via:
- Add Job (`/schedule/new`)
- Schedule Clean Modal (from a Client detail page)
- Schedule After Accept Modal (from quote pricing flow)
- Booking Requests (`/requests`)
- Booking Suggestions (`/bookings/suggestions`)

---

## Test 3 — Cleaner accepts → GREEN

1. Log in as the assigned cleaner.
2. Open `/my-jobs`. At the top of the page, an **"Awaiting your acceptance"**
   section should list the job.
3. Tap **Accept** → confirmation dialog → confirm.
4. Toast: *"Accepted — job confirmed ✓"* (if you were the only cleaner) OR
   *"Accepted — waiting on other cleaner"* (if 2 cleaners assigned).
5. Calendar now shows the job as **GREEN** with label **"Confirmed"**.

### Two-cleaner case
- Both cleaners must Accept before the job turns green.
- After the first cleaner accepts, the job stays yellow ("Awaiting Cleaner")
  until the second cleaner also accepts.
- Once both accept → green + admin gets a "Job Confirmed" alert.

---

## Test 4 — Cleaner declines → reverts to YELLOW + admin alert

1. Log in as the assigned cleaner.
2. Open `/my-jobs`. In the "Awaiting your acceptance" card, tap **Decline**.
3. Optionally type a reason → confirm.
4. Toast: *"Declined — admin has been notified to reassign"*.
5. Calendar now shows the job as **YELLOW "Needs Cleaner"** (cleaner slot cleared).
6. Admin should see a notification at `/actions`: *"Cleaner Declined Job"*.

If two cleaners were assigned and only one declined:
- Their slot is cleared, the OTHER cleaner remains assigned.
- Job stays in `awaiting_cleaner_acceptance` (still yellow) since the other
  cleaner hasn't acted yet.

---

## Test 5 — Edit a confirmed job → re-acceptance required (decision 1B)

Setup: a job currently in `confirmed` (green) state.

1. Open `/jobs/<id>/edit`.
2. Change the **date** (or time, or cleaner) → save.
3. Calendar now shows the job back to **YELLOW "Awaiting Cleaner"**.
4. Cleaner sees it again in their "Awaiting your acceptance" section.
5. Cleaner must Accept again to flip back to green.

Cosmetic edit (notes only, no date/cleaner change):
- Job stays green. No re-acceptance required.

---

## Test 6 — Recurring jobs all use the state machine

1. Create a recurring job series (weekly = 8 occurrences, fortnightly = 4, monthly = 2).
2. All child jobs land yellow with the appropriate label.
3. Cleaner sees ALL pending offers in `/my-jobs` → can accept/decline each
   individually.
4. Each occurrence's status transitions independently.

---

## Test 7 — Completion still works (the 'complete' → 'completed' fix)

1. As cleaner, clock in to a confirmed job.
2. Run through the cleaning workflow.
3. Submit the completion form.
4. Job status should be `'completed'` (not the old `'complete'`).
5. Dashboard, Financials, Property profile, Staff performance — all the
   completed-job counts and revenue rows should include this job.

---

## Known good behaviors (regression checks)

- Calendar status filter chips (`/schedule`) include the new yellow buckets.
- Job detail status dropdown (`/jobs/<id>/edit`) shows the new statuses with
  color emoji prefixes.
- Empty `/my-jobs` still shows "No jobs scheduled for today" if there are
  neither pending offers nor today's jobs.
- Existing rows with `status='scheduled'` (pre-fix legacy) still render
  green and behave as before.

---

## What is NOT yet covered (intentional — coming in later fixes)

- ❌ **Xero invoice draft → send → paid lifecycle** (Fix 3)
- ❌ **Client portal "Add Property"** (Fix 4 — Lynn's case)
- ❌ **Cleaner workflow → SOPs integration** (Fix 5)
- ❌ **Stripe payment** (Fix 6, when ready)

If something on this checklist fails, ping me with the symptom and I'll dig in.
