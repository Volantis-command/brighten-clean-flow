# Brightly — End-to-End Flow Audit (Audit 3)

## THE COMPLETE WORKFLOW (verify every step)

### STAGE 1: ENQUIRY
1. Client hits www.brightly.cleaning → clicks "Get a Quote"
2. Chooses: Residential OR Airbnb
3. Fills form → submitted to quote_requests table
4. Admin gets alert in dashboard

CHECK:
- ResidentialQuotePage: Does form submit save ALL fields to quote_requests? (first_name, last_name, phone, email, address, clean_type, bedrooms, bathrooms, preferred_date, notes)
- AirbnbQuotePage: Same check. Also: does 4+ property trigger "we'll call you" + admin notification?
- Does admin alert appear in dashboard (notifications table + pipeline card)?
- Does the pipeline "new_enquiry" column show the new lead?

### STAGE 2: QUOTE CREATION
1. Admin clicks pipeline card → QuotingPage opens at TOP with lead pre-filled
2. All lead fields pre-populate: name, phone, email, address, clean type, bedrooms, bathrooms
3. Admin adjusts hours, pricing, extras
4. Admin saves quote → quote saved to quotes table, lead moves to "quote_sent" in pipeline
5. Admin sends SMS → client gets quote with price

CHECK:
- QuotingPage: Does URL param clean_type correctly pre-select the clean type?
- Does lead data pre-populate ALL fields (name, phone, email, address, bedrooms, bathrooms)?
- Does save correctly update quote_requests status to 'quote_sent'?
- Does Send Quote SMS fire correctly via twilio with the quote price in the message?
- Does the pipeline card move from "new_enquiry" to "quote_sent"?

### STAGE 3: ACCEPTANCE PATHS

PATH A — Client replies YES to SMS:
1. Twilio webhook receives "YES" → finds matching quote_request by phone
2. Residential: sends booking link /book?lead=ID
3. Airbnb: sends "we'll call you" message, NO booking link
4. Client clicks booking link → /book page → picks date + time window → submits
5. Admin sees "accepted" in pipeline, with preferred date

CHECK:
- twilio-inbound-sms: Does YES matching work (case-insensitive, partial match)?
- Does it correctly identify Airbnb vs Residential from clean_type?
- Does /book page load with date picker (NOT "we'll be in touch")?
- Does booking submission update quote_requests with preferred_date, preferred_time, status=accepted?

PATH B — Admin marks accepted manually:
1. Admin opens quote → clicks "Mark Accepted ✓"
2. ScheduleAfterAcceptModal opens
3. Admin picks: specific time, date, cleaner, notes
4. On confirm: ALL 7 steps fire (see below)

CHECK ALL 7 STEPS in ScheduleAfterAcceptModal.handleConfirm():
Step 1: quotes.status → 'accepted' ✓
Step 2: quote_requests.status → 'accepted' (if leadId exists)
Step 2b: CLIENT PROFILE CREATED (new) — upsert to profiles, link property
Step 3: jobs table insert — with client_name, property_address, scheduled_date, scheduled_time, cleaner_1_id, estimated_duration, price_inc_gst, price_ex_gst
Step 4: Google Calendar event via create-calendar-event edge function
Step 5: Cleaner SMS via send-job-sms
Step 6: Client SMS — "Hi [name], your [clean type] is booked for [time] on [date]. [Cleaner] will be your cleaner."
Step 7: Xero invoice via xero-auto-invoice-job (graceful fail if not deployed)

### STAGE 4: CLIENT IN SYSTEM
After acceptance, client MUST exist in:
- profiles table with full_name, phone, email, role='client'
- user_roles table with role='client'  
- client_properties table with their address linked

CHECK:
- Does the client appear in /clients page after quote accepted?
- Can admin click client and see their detail page?
- Does client detail show their job history?
- Does client detail show their quote history?

### STAGE 5: SCHEDULING
Job must exist with:
- Correct client_name (not "Unknown Property")
- Correct property_address
- scheduled_date, scheduled_time
- cleaner_1_id
- estimated_duration (in minutes)
- status = 'scheduled'

CHECK:
- Does job appear in /schedule page?
- Does job detail page show all info correctly?
- Is cleaner visible in the job detail?
- Does the calendar event exist in Google Calendar?

### STAGE 6: CLEAN DAY — CLEANER FLOW
1. Cleaner opens app → sees job in their portal
2. Navigates to job
3. Clicks "Clock On" — geofence check fires (must be within 300m of property)
4. clock_events record created: { user_id, job_id, event_type: 'clock_in', timestamp, lat, lng }
5. Cleaner works through room checklist
6. Each room: mark complete + upload photo
7. Clicks "Clock Off"
8. clock_events record: { event_type: 'clock_off', timestamp }
9. Completion form: any issues? notes?
10. Job status → 'completed'

CHECK:
- Does CleanerPortalPage show the assigned job?
- Does Clock On button appear and work?
- Does geofence check fire (navigator.geolocation)?
- Are clock_events records being written to DB?
- Does room checklist show all rooms?
- Does photo upload work per room?
- Does Clock Off write the record?
- Does job status update to 'completed'?

### STAGE 7: QC
1. Head cleaner sees completed job in QC queue
2. Reviews room-by-room
3. Pass or Fail per room
4. Overall QC result saved
5. If fail: revisit job created, cleaner notified

CHECK:
- Does HeadCleanerQC page show completed jobs?
- Can QC audit be saved?
- On fail: does revisit job get created?
- On fail: does cleaner get notified?
- Is client notified on QC fail? (currently NOT implemented — flag this)

### STAGE 8: INVOICE & REVIEW
1. Job complete → xero-auto-invoice-job fires → invoice created in Xero
2. 24hrs after: review request SMS sent to client
3. 7 days after (Airbnb) or 4 weeks after (Residential): rebook SMS sent

CHECK:
- Does xero-auto-invoice-job fire on job completion?
- Does send-review-rebook-sms fire on schedule?
- Are these automated or manual?
- Is there a trigger/cron or manual-only?

---

## FIXES TO MAKE

For every broken step — fix it. Don't just report.

### High priority fixes:
1. If client profile creation (Step 2b) has any issues — fix
2. If pre-population of quote calculator from lead is missing any fields — fix
3. If job creation is missing any fields — fix
4. If "Unknown Property" still appears anywhere — fix
5. If cleaner clock_events are not being written — fix
6. Add client notification on QC fail
7. Add client notes save button on ClientDetailPage
8. Enforce director_approved gate in cleaner assignment dropdowns

### Also fix:
- Any place where a button has no onClick handler
- Any place where an edge function call will fail silently (add toast error)
- Any missing status transitions in the pipeline

---

## DELIVERABLES
1. Fix all bugs found
2. Save AUDIT3_FLOW_REPORT.md with:
   - ✅ Each stage that works end-to-end
   - ❌ Each broken step with explanation
   - 🔧 Fixes applied
3. Commit: "audit3: end-to-end flow fixes — quote to invoice complete"
4. Run: openclaw system event --text 'Claude Code done: Brightly Audit 3 flow complete' --mode now
