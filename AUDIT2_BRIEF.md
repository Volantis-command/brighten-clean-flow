# Brightly App — Comprehensive Button & Flow Audit (Audit 2)

## Objective
Every single button, link, flow, and feature must be working or documented as broken.
Produce a comprehensive gap analysis report at the end.

## App Structure
- Roles: admin, cleaner, head_cleaner
- Clean types: Standard/House Clean, Deep Clean, End of Lease, Airbnb/Short-Stay
- Key flows: Quote → Accept → Schedule → Assign → Clock On → Clean → QC → Invoice → Review

---

## AUDIT AREAS

### 1. NAVIGATION — Every Route
Check App.tsx for all routes. For each route:
- Does the page component exist?
- Does it load without crashing?
- Is it protected by auth?
- Is it accessible from the nav?

List any routes that are broken, missing, or dead ends.

### 2. DASHBOARD — Every Button & Card
In OperationsDashboard.tsx and DashboardPage.tsx:
- [ ] Each pipeline column card — does clicking navigate correctly with lead data?
- [ ] "New Enquiry" → "Send Quote" button — wired up with onClick?
- [ ] "Quote Sent" → "Follow Up" button — does it send an SMS?
- [ ] "Quote Sent" → "Mark Accepted" button — does it update status in DB?
- [ ] "Accepted" → "Schedule Clean" button — does it open a modal?
- [ ] "Accepted" → "Assign Cleaner" button — does it do something?
- [ ] Stat tiles — do they show real data?
- [ ] Alerts section — do "View Quote" buttons work?
- [ ] Quick action buttons — do they navigate correctly?
- [ ] "Today at a Glance" jobs — do they link to job detail?

### 3. QUOTE CALCULATOR — Full Form Save
In NewQuoteCalculator.tsx:
- [ ] Save/Update Quote button — does it save ALL form fields?
- [ ] Hours field — does 2.5 save correctly (numeric column fix applied)?
- [ ] Send Quote SMS — does it fire correctly?
- [ ] "Mark Accepted ✓" button — does it open ScheduleAfterAcceptModal?
- [ ] ScheduleAfterAcceptModal — do all 7 steps fire (quote update, lead update, job create, calendar, cleaner SMS, client SMS, Xero)?
- [ ] Client SMS text — does it include name, time, date, cleaner name?

### 4. SCHEDULING — Full Flow
In ScheduleCleanModal, ScheduleApprovalModal, EditJobPage, JobDetailPage:
- [ ] Schedule Clean modal opens with correct pre-fill
- [ ] Date picker works
- [ ] Cleaner dropdown populates from DB
- [ ] Time picker (specific time, not window) — saves correctly
- [ ] Saves job to DB with all fields: client_name, property_address, scheduled_date, scheduled_time, cleaner_1_id, estimated_duration
- [ ] Calendar event fires on schedule
- [ ] Client confirmation SMS fires

### 5. JOB DETAIL PAGE
- [ ] Job title shows client name (not "Unknown Property") when no property_id
- [ ] Address shows correctly
- [ ] Date/time/duration shows
- [ ] Assigned cleaner shows
- [ ] Status badge correct
- [ ] Invoice badge shows (paid/draft/none)
- [ ] "Send Tracker Link" button — fires SMS to client?
- [ ] "Mark Complete" button — does it work?
- [ ] "Create Invoice" button — does it call Xero edge function?
- [ ] Edit Job button — opens EditJobPage?

### 6. CLEANER PORTAL — Complete Flow
In CleanerPortal, CleanerClockCard, ActiveJobView, CompletionStep:
- [ ] Cleaner logs in → sees their assigned jobs
- [ ] Clock On button — geofence check fires?
- [ ] Clock On — records clock_events in DB with timestamp, location
- [ ] Job checklist shows — room by room
- [ ] Photo upload per room works
- [ ] Clock Off button — records clock_out in DB
- [ ] Job completion step — fires?
- [ ] Head cleaner QC flag — can cleaner flag an issue?

### 7. HEAD CLEANER QC MODULE
In HeadCleanerQC, HeadCleanerQCAudit:
- [ ] Head cleaner sees QC queue
- [ ] Can open job audit
- [ ] Room-by-room photo review
- [ ] Pass/Fail per room
- [ ] Overall QC result saved to qc_audits table
- [ ] Client or admin notified on QC fail?

### 8. CLEANER ONBOARDING
In CleanerOnboarding, StaffOnboardingPage:
- [ ] 5-step onboarding flow loads
- [ ] Each step saves progress
- [ ] SOP acceptance recorded
- [ ] director_approved gate — cleaner cannot access jobs until approved
- [ ] Admin can approve onboarding from StaffPage

### 9. STAFF PAGE — All Actions
- [ ] Staff list loads with all team members
- [ ] Click staff member → opens detail panel
- [ ] Edit button → opens edit modal with ALL fields (name, email, phone, role)
- [ ] Edit saves to profiles table
- [ ] "Set Temp Password" → opens dialog → sets password via auth.admin (or shows clear error)
- [ ] "Send Reset Email" → fires supabase.auth.resetPasswordForEmail()
- [ ] "Send Onboarding Link" → generates link and sends SMS
- [ ] Remove staff → confirmation → removes from system

### 10. CLIENT DETAIL & PORTAL
- [ ] Client list loads
- [ ] Click client → opens ClientDetailPage
- [ ] Edit client details
- [ ] View client's job history
- [ ] View client's quotes
- [ ] Portal link generation — does "Send Portal Link" fire SMS?
- [ ] Client portal (/client/:token) — loads for client without login?

### 11. SMS FLOWS — All Messages
Audit every SMS in the app. For each:
- Does the edge function exist in supabase/functions/?
- Is the URL app.brightly.cleaning (not localhost or brightly.cleaning)?
- Is the message content correct and professional?

Check:
- Quote link SMS (send-quote-link-sms)
- Quote notification SMS (send-quote-notification)  
- Job SMS (send-job-sms) — all types: cleaner_assigned, job_reminder, quote_accepted, tracker_link
- Booking confirmation SMS (send-client-booking-sms)
- Review/rebook SMS (send-review-rebook-sms)
- Onboarding SMS (send-onboarding-sms)
- Reminder SMS (send-reminder-sms)

### 12. PUBLIC ROUTES
- [ ] /residential-quote — loads? Dark theme? Form submits?
- [ ] /airbnb — loads? Dark theme? Form submits?
- [ ] /book?lead=ID — loads? Shows date picker (NOT "we'll be in touch")?
- [ ] /client/:token — loads? Client portal works?
- [ ] /tracker/:jobId — loads? Live tracker shows?

### 13. XERO INTEGRATION
- [ ] Xero settings page shows connected status
- [ ] Auto-invoice on job completion — edge function deployed? (NOTE: may fail on free Supabase plan)
- [ ] xero-auto-invoice-job function — is it deployed? Test response.
- [ ] If not deployed, show clear "Invoice queued" message rather than silent fail

### 14. AI SOP ASSISTANT
- [ ] AI Assistant page loads
- [ ] sop_documents table has data
- [ ] Asking a question returns an answer from SOPs
- [ ] If edge function not deployed, show clear error

### 15. SETTINGS PAGE
- [ ] All settings sections load
- [ ] Pricing rates — can edit and save?
- [ ] Notifications settings — can toggle?
- [ ] Xero integration section — shows connected?
- [ ] Google Calendar section — shows connected?

---

## REPORT FORMAT
At the end, produce a structured gap analysis:

### ✅ WORKING
List everything confirmed working

### ⚠️ PARTIAL
List things that partially work but have issues

### ❌ BROKEN / NOT DEPLOYED
List everything broken, missing onclick handlers, or requiring Supabase Pro for edge functions

### 🔧 RECOMMENDED FIXES (priority order)
Top 10 fixes ranked by business impact

---

## INSTRUCTIONS
- Read every relevant file — don't assume something works just because the code looks right
- Check that onClick handlers actually do something (not empty functions or console.log only)
- Check that DB queries reference columns that actually exist
- Fix any bugs you find while auditing — don't just report them
- For anything requiring Supabase Pro (edge functions), note it but don't try to fix it
- Commit all fixes: "audit2: comprehensive button and flow fixes"
- Save the gap analysis report to AUDIT2_REPORT.md in the repo root
- Then run: openclaw system event --text 'Claude Code done: Brightly Audit 2 complete with gap analysis' --mode now
