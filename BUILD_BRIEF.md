# Brightly — Gap Fill Build Brief

## LIVE CLIENT PROTECTION
⚠️ Lynn Robertson and Alexandra are LIVE clients. DO NOT delete them, their properties, or their data. Only add/improve.

## HARD RULES (never violate)
- QC failures = INTERNAL ONLY. No client notifications on QC fail. Remove any that exist.
- Client SMS = minimal. Only send: (1) booking confirmation, (2) tracker link on day of clean, (3) review request after clean. Remove all others from client-facing flows.
- No GP%, cost, or margin visible to clients ever.
- Dark mode default. Colours: #FEDB00 yellow, #0C463D dark green, #0A0F0E bg.
- All timestamps AEST (Australia/Brisbane).

---

## BUILD 1: CLIENT PORTAL (src/pages/ClientPortalPage.tsx + related)

The client portal at /client/:token needs a complete rebuild. Current state is minimal. Required state:

### Layout
- Header: Brightly logo + client name + "Welcome back"
- Bottom nav: Properties | Cleans | Quotes | Account

### Properties Tab
- Grid of property cards (one per property linked to client)
- Each card shows: property address/name, last clean date, next scheduled clean, QC score badge
- Click property → Property Detail view
- Property Detail shows:
  - Address, access notes (key safe code etc) — masked by default, tap to reveal
  - Clean history for THIS property — list of all cleans, date, cleaner, status, QC score
  - Date range filter (this month / last 3 months / all time)
  - Each clean row: tap to expand → shows room checklist completion, any notes
  - "Book a clean" button → links to residential quote form pre-filled with this property

### Cleans Tab
- All cleans across all properties, sorted newest first
- Filter by: status (completed/scheduled/cancelled), date range
- Each clean card: date, property address, cleaner name, clean type, status badge, QC score if available
- Tap to expand: full detail

### Quotes Tab
- All quotes for this client
- Each quote: date, clean type, price, status (draft/sent/accepted/declined)
- Accepted quotes show the linked job

### Account Tab
- Name, phone, email (read-only display)
- "Contact Us" button → pre-filled SMS

### Data queries
- Pull properties from client_properties WHERE client_id = current client id
- Pull jobs WHERE property_id IN (client's properties) OR client_name = client's name
- Pull quotes WHERE client_phone = client's phone OR client_email = client's email

---

## BUILD 2: STAFF PORTAL (src/pages/StaffPage.tsx + StaffDetail components)

The staff detail view when clicking a staff member needs to be comprehensive.

### Staff Detail Panel — tabs:

**Overview Tab**
- Profile photo placeholder (initials avatar)
- Full name, role badge, phone, email
- Hire/start date
- Status: Active / Pending Approval / Suspended
- Director Approved badge (green tick if approved)
- Performance score (average QC rating from their cleans)
- Total cleans completed count

**Inductions Tab**
- List of all SOPs in sop_documents table
- Each row: SOP name, version, date signed, ✅/❌
- "Send Induction" button → resends onboarding SMS link
- Download signed record button (future)

**Paperwork Tab**
- Checklist of required documents:
  - [ ] Police Check
  - [ ] Tax File Number
  - [ ] Bank Details
  - [ ] Signed Employment Contract
  - [ ] Working With Children Check (if applicable)
- Admin can tick each as received
- Store in profiles table as paperwork_status JSONB field
- Add "paperwork_status" JSONB column to profiles if not exists (via migration)

**Clean History Tab**
- All jobs assigned to this cleaner (cleaner_1_id = staff.id)
- List: date, property address, clean type, duration (from clock_events), QC score
- Average QC score shown at top
- Filter by month
- Total hours worked (sum of completed clean durations)

**Availability Tab**
- Weekly availability grid (existing StaffAvailabilitySection component)
- Next 4 weeks schedule preview

**Pay Tab**
- Hours worked this pay period (from clock_events + jobs)
- Hourly rate (from profiles.hourly_rate or default $45/hr)
- Estimated pay this period
- Note: "Payroll processed via external system"

---

## BUILD 3: QUOTE DECLINE HANDLING

When a client replies NO to a quote SMS:
- In twilio-inbound-sms/index.ts: detect "NO", "no thanks", "not interested", "cancel", "nope"
- Update quote_requests status to 'declined'
- Update quotes status to 'declined' (if quote exists)
- Send client SMS: "No worries! If you change your mind, we're here. — Brightly 🌿"
- Create admin notification: "Client declined quote — [name] — [address]"
- Pipeline card moves to declined column or is removed from active pipeline

Also add 'declined' to the STATUS_CONFIG in OperationsDashboard.tsx and LeadsTab.tsx.

---

## BUILD 4: PROPERTY PASSPORT (Residential only)

In ClientDetailPage and the cleaner job view.

### Admin side (ClientDetailPage or PropertyDetailPage):
Add a "Property Passport" section per property with fields:
- Access method (key safe / lockbox / leave under mat / other)
- Access code (masked, tap to reveal)
- Alarm code (masked)
- Garage code (masked)
- Parking notes (free text)
- Pet notes (free text)
- Product restrictions / allergies (free text)
- Special instructions (free text)
- Preferred music/ambience (free text)
- Room-by-room notes: for each room type (kitchen, bathrooms, bedrooms, living) add a notes field
- Property exterior photo (upload)

Store in client_properties table — add columns if needed via migration:
- access_method, access_code, alarm_code, garage_code, parking_notes, pet_notes, product_restrictions, special_instructions, preferences_notes, room_notes JSONB

### Cleaner side (JobDetailPage, ActiveJobView):
When cleaner opens their job, add a "Property Info" collapsible section showing:
- Access method (how to get in)
- Access code (revealed on tap — only visible once clocked in)
- Parking notes
- Pet notes
- Product restrictions
- Special instructions
- Room notes for each room they're cleaning

---

## BUILD 5: REMINDER SMS AUTOMATION (frontend-scheduled via DB)

Since edge functions may not be deployed, create a client-side scheduler approach:
- When a job is scheduled/accepted, insert records into a new table "scheduled_sms" with:
  { job_id, recipient_type ('client'|'cleaner'), message, send_at (timestamp), status ('pending'|'sent'|'failed') }

- Add a "Process Pending SMS" function that fires when admin opens the dashboard:
  - Queries scheduled_sms WHERE send_at <= now() AND status = 'pending'
  - Sends each via Twilio (supabase function or direct)
  - Updates status to 'sent'

- When job is scheduled, auto-insert these records:
  1. Client reminder: send_at = scheduled_date - 24hrs — "Hi [name], reminder: your [clean type] is tomorrow at [time]. [Cleaner] will be your cleaner. 🌿 — Brightly"
  2. Cleaner reminder: send_at = day of clean at 7am — "Hi [cleaner], you have a [clean type] today at [time]: [address]. See you there! — Brightly 🌿"
  3. Client review: send_at = job completion time + 24hrs — "Hi [name], how did your clean go? We'd love your feedback: [review link]. — Brightly 🌿"

- Create src/hooks/useProcessScheduledSms.ts — hook that runs on dashboard mount

---

## BUILD 6: THANK YOU PAGE after public quote form

After ResidentialQuotePage and AirbnbQuotePage submit:
- Currently just resets form
- Change to: show a full-page thank you state (within the same page component, conditional render)
- Thank you page content:
  - Big green tick animation
  - "Thanks [first name]! We've received your quote request."
  - "Our team will be in touch within 1 hour."
  - "Questions? Call Brendan on 0418 878 707"
  - Brightly logo
  - Dark green background, yellow accents

---

## BUILD 7: REMOVE EXCESS CLIENT SMS

Audit every SMS sent to clients and remove these:
- QC fail notifications to clients (remove entirely)
- Any "your cleaner is on their way" during the clean
- Any mid-clean progress updates

Keep these (only):
1. Quote SMS with price
2. Booking confirmation with date/time/cleaner name
3. Tracker link when clean starts (already correct)
4. Review request 24hrs after clean completion

---

## COMMIT & REPORT
When all builds complete:
1. Fix any TypeScript errors (run build)
2. Commit: "feat: client portal, staff portal, property passport, quote decline, SMS scheduler, thank you pages"
3. Save BUILD_REPORT.md with what was built and what was skipped
4. Run: openclaw system event --text 'Claude Code done: Brightly gap fill complete' --mode now

