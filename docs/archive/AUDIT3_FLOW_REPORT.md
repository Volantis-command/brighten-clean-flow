# Brightly — Audit 3 Flow Report

## STAGE 1: ENQUIRY
- ✅ ResidentialQuotePage saves ALL fields to quote_requests (first_name, last_name, phone, email, address, clean_type, bedrooms, bathrooms, preferred_date via form_data, notes)
- ✅ AirbnbQuotePage saves all fields correctly; 4+ properties triggers "we'll call you" + admin notification
- ✅ Admin alert fires via send-quote-notification edge function
- ✅ LeadsTab in /clients page shows new enquiries with correct status badges

## STAGE 2: QUOTE CREATION
- 🔧 **FIX: QuotingPage was missing client_email in pre-population** — editQuote object now includes `client_email: qrData.email` for both quote_requests and leads fallback paths
- 🔧 **FIX: NewQuoteCalculator leads fallback was missing clientEmail** — now populates `clientEmail: lead.email || ''`
- ✅ URL param clean_type correctly pre-selects via normaliseLegacyServiceType
- ✅ Lead data pre-populates: name, phone, email (fixed), address, bedrooms, bathrooms
- ✅ Save correctly updates quote_requests status to 'quote_sent' via saveMutation
- ✅ Send Quote SMS fires via send-quote-notification edge function with price in message
- ✅ Pipeline card moves from "new_enquiry" to "quote_sent"

## STAGE 3A: SMS ACCEPTANCE PATH
- ✅ twilio-inbound-sms: YES matching works (case-insensitive, converts to uppercase)
- ✅ Correctly identifies Airbnb vs Residential from clean_type (includes 'airbnb', 'short-stay', 'turnover', 'commercial')
- ✅ Residential: sends booking link `/book?lead=ID`
- ✅ Airbnb: sends "we'll be in touch" message, NO booking link
- ✅ /book page loads with date picker, time selector, frequency selector
- ✅ Booking submission updates quote_requests with preferred_date, preferred_time, status='accepted'

## STAGE 3B: MANUAL ACCEPTANCE (ScheduleAfterAcceptModal)
All 7 steps verified and fixed:

- ✅ Step 1: quotes.status → 'accepted'
- ✅ Step 2: quote_requests.status → 'accepted' (if leadId exists)
- ✅ Step 2b: Client profile created — upserts to profiles with full_name, first_name, last_name, phone, email, role='client'; adds user_roles entry
- 🔧 **FIX: Step 2b property creation** — When propertyId is null, now auto-creates a proper `properties` table record and links via `client_properties`. Previously only stored address text in client_properties without a property_id, causing "Unknown Property" in schedule and breaking client detail job queries.
- ✅ Step 3: Job created with client_name, property_address, scheduled_date, scheduled_time, cleaner_1_id, estimated_duration, price_inc_gst, price_ex_gst, resolved property_id
- ✅ Step 4: Google Calendar event via create-calendar-event edge function
- ✅ Step 5: Cleaner SMS via send-job-sms (only if cleanerId set)
- ✅ Step 6: Client SMS — correct format with name, clean type, time, date, cleaner name
- ✅ Step 7: Xero invoice via xero-auto-invoice-job (graceful fail — logs error, reports as queued)

## STAGE 4: CLIENT IN SYSTEM
- ✅ Profile created in profiles table with full_name, phone, email, role='client'
- ✅ user_roles entry created with role='client'
- ✅ client_properties entry links address to profile (now with proper property_id)
- 🔧 **FIX: ClientDetailPage job query** — Previously only queried jobs by property_id, missing jobs without a formal property link. Now also queries by client_name for fallback matching.
- 🔧 **FIX: ClientDetailPage Save Notes button** — Notes section previously said "saved locally" but never persisted to DB. Added "Save Notes" button that writes to profiles.internal_notes.
- ✅ Client appears in /clients page after quote accepted
- ✅ Client detail page shows job history, feedback, requests, messages tabs

## STAGE 5: SCHEDULING
- ✅ Job created with correct client_name (not "Unknown Property" — fixed via auto-property creation)
- ✅ Job has property_address, scheduled_date, scheduled_time, cleaner_1_id, estimated_duration, status='scheduled'
- ✅ Job appears in /schedule page (now has proper property_id)
- ✅ Calendar event created via Google Calendar integration

## STAGE 6: CLEANER FLOW
- ✅ CleanerPortalPage: Shows assigned job via token-based access
- ✅ CleanWorkflowPage: Full clock on/off workflow with geofence check (300m)
- 🔧 **FIX: clock_events not written on clock-in** — CleanWorkflowPage now inserts clock_events record with event_type='clock_in' alongside the time_entries record. Previously only CompletionStep wrote clock_out events.
- ✅ CompletionStep: clock_off event written to clock_events table
- ✅ time_entries: clock_in_time and clock_out_time recorded
- ✅ Photo upload works per completion step
- ✅ Room checklist shown for completion
- ✅ Job status updates to 'completed'
- ✅ Admin SMS sent on completion
- ✅ Auto Xero invoice fires on completion via triggerJobAutoInvoice

## STAGE 7: QC
- ✅ HeadCleanerQCPage shows completed jobs split into "Awaiting QC" and "Recently Audited"
- ✅ QC audit saves per-room ratings (pass/pass_with_notes/fail) with notes
- ✅ On fail: revisit job created with failed room names in notes
- ✅ On fail: admin notified via notifications table
- ✅ On fail: assigned cleaners notified
- 🔧 **FIX: Client notification on QC fail** — Added SMS to client on QC fail: "Our quality check found areas that didn't meet our standard. We've scheduled a complimentary revisit." Looks up client via client_properties → profiles.

## STAGE 8: INVOICE & REVIEW
- ✅ xero-auto-invoice-job fires on job completion (via CompletionStep → triggerJobAutoInvoice)
- ✅ xero-auto-invoice-job also fires on manual acceptance (Step 7 in ScheduleAfterAcceptModal)
- ✅ send-review-rebook-sms edge function exists for review/rebook SMS
- ⚠️ Review/rebook SMS is not auto-triggered — requires manual invocation or external cron. No DB trigger or scheduled function currently configured.

## ADDITIONAL FIXES
- 🔧 **useCleanersList: director_approved gate** — Cleaner assignment dropdowns now filter out cleaners where `director_approved === false`. Only approved cleaners appear in the ScheduleAfterAcceptModal and other assignment UIs.
- 🔧 **LeadsTab: 'accepted' status missing from pipeline** — ScheduleAfterAcceptModal and BookingPage set quote_requests.status to 'accepted', but LeadsTab only listed 'client_accepted'. Added 'accepted' to LEAD_STATUSES, STATUS_CONFIG, FILTER_GROUP, and navigation targets so accepted leads show correctly in the pipeline.

## SUMMARY

| Stage | Status | Issues Found | Fixed |
|-------|--------|-------------|-------|
| 1. Enquiry | ✅ Working | 0 | — |
| 2. Quote Creation | ✅ Fixed | 2 (missing email pre-population) | 2 |
| 3A. SMS Acceptance | ✅ Working | 0 | — |
| 3B. Manual Acceptance | ✅ Fixed | 1 (property not auto-created) | 1 |
| 4. Client in System | ✅ Fixed | 2 (job query + notes save) | 2 |
| 5. Scheduling | ✅ Fixed | 1 (Unknown Property) | 1 (via Stage 3B fix) |
| 6. Cleaner Flow | ✅ Fixed | 1 (clock_events missing) | 1 |
| 7. QC | ✅ Fixed | 1 (no client notification) | 1 |
| 8. Invoice & Review | ⚠️ Partial | 1 (no auto-trigger for review SMS) | 0 (requires cron) |
| Cross-cutting | ✅ Fixed | 2 (director gate + accepted status) | 2 |

**Total: 11 issues found, 10 fixed. 1 deferred (review/rebook SMS cron).**
