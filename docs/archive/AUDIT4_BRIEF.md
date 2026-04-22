# Brightly — Audit 4: Post-Gap-Fill Review

## Context
Major gap fill just completed. Now audit everything again with fresh eyes.
Compare what was described vs what actually exists in code.

## Rules (never violate)
- QC failures = internal only, no client SMS
- Client SMS = only 3: booking confirmation, tracker link, review request
- Lynn Robertson and Alexandra = live clients, never touch their data
- Dark mode default, #FEDB00 yellow CTAs, #0C463D dark green
- No GP%/cost visible to clients

## AUDIT EVERYTHING

### 1. CLIENT PORTAL — just built
- Does /client/:token load the new portal?
- Properties tab: does it query client_properties correctly?
- Clean history: does it query jobs by property_id AND client_name fallback?
- Date filter: does it work?
- Quotes tab: does it query quotes by phone/email?
- Account tab: shows client details?
- "Book a clean" button: goes to residential form pre-filled?
- Mobile layout: fits 390px, no horizontal scroll?

### 2. STAFF PORTAL — just built
- Inductions tab: queries sop_documents + cleaner_onboarding for sign-off dates?
- Paperwork tab: paperwork_status column exists in profiles? Migration created?
- Clean history tab: queries jobs WHERE cleaner_1_id = staff.id?
- Pay tab: calculates from clock_events?
- Does director_approved gate now enforce on job assignment dropdowns?

### 3. PROPERTY PASSPORT — just built
- Admin can edit all passport fields?
- Migration adds new columns to client_properties?
- Cleaner sees passport on JobDetailPage?
- Access codes masked until clocked in?

### 4. SMS SCHEDULER — just built
- scheduled_sms table exists (migration created)?
- When job scheduled → 3 SMS records inserted (client reminder 24hr, cleaner reminder morning of, review 24hr after)?
- useProcessScheduledSms hook fires on dashboard load?
- Processes pending SMS via Twilio correctly?
- Does NOT send QC fail SMS to clients?

### 5. QUOTE DECLINE — just built
- twilio-inbound-sms detects NO/no thanks/not interested?
- Updates quote_requests + quotes to 'declined'?
- Admin notification created?
- Pipeline shows declined leads correctly?

### 6. THANK YOU PAGES — just built
- ResidentialQuotePage shows thank you state after submit?
- AirbnbQuotePage shows thank you state?
- Content: green tick, name, "within 1 hour", phone number?
- Dark green branded styling?

### 7. FULL FLOW RE-CHECK
Walk through entire flow again:
- Enquiry → new_enquiry pipeline card ✓?
- Pipeline card → QuotingPage with ALL lead fields pre-filled ✓?
- Quote save → quote_sent status ✓?
- Mark Accepted → client created → job created → all 7 steps ✓?
- Job in schedule → visible on schedule page ✓?
- Cleaner sees job in portal ✓?
- Clock on → clock_events written ✓?
- Room checklist + photos ✓?
- Clock off ✓?
- QC queue → audit → pass/fail → no client notification ✓?
- Job complete → Xero invoice attempt (graceful fail) ✓?
- Review SMS queued in scheduled_sms ✓?

### 8. ANYTHING ELSE MISSING?
Think hard. What would a real cleaning business need that isn't in the app yet?
- Can admin manually add a clean without a quote (regular clients)?
- Can admin see a weekly/monthly revenue summary?
- Is there a way to see all jobs for a specific date (day view)?
- Can admin cancel a job and notify the client?
- Can admin reschedule a job and notify the client?
- Can cleaner call the client from the job detail (click-to-call)?
- Is there an emergency contact for cleaners?
- Can head cleaner assign a QC audit to a specific cleaner for review?

### 9. MOBILE AUDIT
On 390px screen:
- Every page scrolls vertically, no horizontal overflow
- All buttons tappable (minimum 44px height)
- No text truncated unintentionally
- Forms usable on phone keyboard

### 10. EDGE CASES
- What if client has no phone number — do SMS flows fail gracefully?
- What if cleaner is unassigned from a job — what happens to scheduled SMS?
- What if job is cancelled — does scheduled_sms get cleaned up?
- What if two cleaners are assigned — does only cleaner_1 get SMS?

## DELIVERABLES
1. Fix every bug found
2. Add anything missing that doesn't need BJ input
3. Add job cancellation with client notification
4. Add job reschedule with client notification  
5. Add click-to-call for cleaner on job detail
6. Add day view / date filter on schedule page if missing
7. Commit: "audit4: post-gap-fill review and fixes"
8. Save AUDIT4_REPORT.md
9. Run: openclaw system event --text 'Claude Code done: Brightly Audit 4 complete' --mode now
