# Brightly — Single Onboarding Form Rebuild

## THE PROBLEM
There are currently 5+ different forms/buttons for bringing on a client:
- Dashboard: "Send SMS Quote Link"
- Dashboard: "New Inquiry"
- Properties: "Add Property"
- Clients: "Send Request"
- Clients: "Add Client"

This is confusing and broken. BJ wants ONE form only.

## THE SOLUTION: One Master Onboarding Form

### Single form file: `src/pages/OnboardingPage.tsx`
### Route: `/onboard`

All existing buttons must navigate to `/onboard` (with optional query params).
Do NOT delete the existing buttons — just change their onClick to navigate to `/onboard`.

---

## FORM FLOW

### Step 1 — Clean Type (always first)
Large pill buttons, one selection:
- 🏠 Standard House Clean
- 🏨 Airbnb / Short Stay Turnover
- 🧹 Deep Clean
- 🔑 End of Lease Clean

### Step 2 — Property Details (branches by clean type)

**Standard House Clean:**
- Address (text, required)
- Suburb (text)
- State (dropdown: QLD, NSW, VIC, WA, SA, TAS, ACT, NT)
- Bedrooms (1-5+)
- Bathrooms (1-4+)
- Preferred date (date picker or ASAP toggle)
- Preferred time (Morning / Afternoon / Either)
- Special notes (textarea, optional)
- Access method (Key safe / Leave unlocked / Meet at property / Other)
- Access instructions (text, optional)

**Airbnb / Short Stay Turnover:**
- Property name/nickname (text, required — e.g. "Beach House")
- Address (text, required)
- Suburb (text)
- Bedrooms (1-5+)
- Bathrooms (1-4+)
- Bed types (King / Queen / Double / Single / Bunk — multi-select)
- Number of beds total
- Linen provided by Brightly? (Yes / No)
- Guest check-out time (time picker)
- Guest check-in time (time picker)
- Turnaround window (hours between checkout and checkin)
- Special notes
- Access method + instructions

**Deep Clean:**
- Same as Standard House Clean
- Additional: Last professionally cleaned (dropdown: <3 months / 3-6 months / 6-12 months / 1+ year / Never)
- Is property currently occupied? (Yes / No)

**End of Lease:**
- Same as Standard House Clean
- Additional: Lease end date (date picker)
- Is carpets required? (Yes / No)
- Is oven required? (Yes / No)
- Bond clean required? (Yes / No)
- Agent name (text, optional)

### Step 3 — Client Details (ALWAYS LAST — critical for conversion)
- First name (required)
- Last name (required)
- Mobile phone (required, AU format)
- Email address (required)
- How did you hear about us? (Google / Facebook / Instagram / Referral / Signage / Other) — optional

### Step 4 — Summary + Submit
Show a clean summary of everything entered.
Two submit buttons:
- "Submit & Book" (primary yellow) — submits form
- "Submit & Send Link to Client" (outline) — submits AND sends SMS to client with their booking confirmation

---

## ON SUBMIT — Auto-create everything (critical, non-negotiable)

When form is submitted (by admin OR by client via link):

### 1. Insert into `quote_requests`
All the usual fields: first_name, last_name, phone, email, address, clean_type, bedrooms, bathrooms, preferred_date, time_preference, notes, source, status = 'form_submitted'

### 2. Insert into `properties` table
```
property_name = "{first_name}'s {address}" or Airbnb property nickname
address = address field
suburb = suburb
state = state
client_name = full name
bedrooms = bedrooms
bathrooms = bathrooms
property_type = 'residential' or 'airbnb'
status = 'active'
```
Use `INSERT ... ON CONFLICT DO NOTHING` on address to avoid duplicates.
Save returned property ID.

### 3. Upsert into `profiles` table
```
full_name = first_name + last_name
phone = phone
email = email
role = 'client'
```
Match on phone first, then email.

### 4. Insert into `user_roles`
```
user_id = profile.id
role = 'client'
```
Use upsert ON CONFLICT DO NOTHING.

### 5. Insert into `client_properties` (link table)
```
client_id = profile.id
property_id = property.id
property_address = address
```

### 6. Create admin notification
```
title = "New enquiry — {full_name}"
message = "{clean_type} — {address}"
type = 'new_enquiry'
link = '/clients'
```

---

## TWO MODES: Admin fills out vs Client fills out

### Mode: Admin fills out (default)
- Admin opens `/onboard` in the app
- Fills out the form on behalf of the client
- Submits — creates everything immediately
- On success: shows "Client added ✓" with button to open in Quote Calculator

### Mode: Client fills out (send link)
- Admin clicks "Send Onboarding Link" from Dashboard or Clients page
- Shows a modal asking for just client's name + phone
- System sends SMS: "Hi {name}, please fill out your Brightly booking form here: {app_url}/onboard?ref={token}"
- Client opens link, fills out the form themselves
- Submits — creates everything automatically
- On success: shows the thank you page ("We'll be in touch within 24 hours")

The form is IDENTICAL in both modes. The only difference is who fills it out.

---

## WHAT TO DO WITH EXISTING FORMS/BUTTONS

### Dashboard buttons
- "Send SMS Quote Link" → keep button, change onClick to navigate('/onboard')
- "New Inquiry" → keep button, change onClick to navigate('/onboard')
- "Quick Actions" → all clean type buttons → navigate('/onboard?type={cleanType}')

### Properties page
- "Add Property" button → navigate('/onboard')
- PropertiesPage: KEEP AS IS — just remove the AddPropertyModal and use onboard route instead

### Clients page
- "Send Request" button → opens a mini modal asking for name+phone, then sends SMS link
- "Add Client" button → navigate('/onboard')

### Remove / retire these:
- `src/pages/ResidentialQuotePage.tsx` — RETIRE (replace with /onboard)
- `src/pages/AirbnbQuotePage.tsx` — RETIRE (replace with /onboard)
- `src/pages/QuoteRequestFormPage.tsx` — RETIRE if it exists
- `AddPropertyModal` component if separate file — RETIRE
- Any `NewInquiryModal` — RETIRE

DO NOT delete ResidentialQuotePage and AirbnbQuotePage immediately — first make sure /onboard works, then retire them. Comment them out of the router and redirect to /onboard.

---

## CLIENT PORTAL FIXES (do alongside this)

The client portal at `/client/:token` must show ALL clients.

### Fix: ClientsPage.tsx
The clients list must query:
1. `profiles` WHERE role = 'client' OR role IN ('client')
2. For each client, also show if they came in via `quote_requests`

Ensure Lynn Robertson and Alexandra appear.

### Fix: ClientDetailPage (when you click a client)
Must show:
- Contact info (name, phone, email)
- **Properties** tab — all properties linked to this client (from `properties` WHERE client_name = client's name OR from `client_properties` WHERE client_id = client's profile ID)
- **Jobs** tab — all jobs WHERE client_name = client's name OR property_id in their properties
- **Quotes** tab — all quote_requests WHERE phone = client's phone

---

## LYNN ROBERTSON — CRITICAL DATA FIX

There is already a migration file at:
`supabase/migrations/20260407030000_seed_live_clients.sql`

This will be applied by Supabase. Do NOT delete it.

Additionally, in ClientsPage.tsx — add a fallback query:
If a client appears in `quote_requests` with status = 'accepted' or 'client_accepted' but has NO matching profile by phone — show them in the clients list anyway, pulled from quote_requests.

This ensures Lynn and Alexandra always appear even if their profiles weren't auto-created.

---

## STYLING
- Dark mode default
- Background: #0A0F0E
- Primary CTA: #FEDB00 yellow with #0C463D dark green text
- Step indicator at top (dots or numbered pills)
- Each step scrolls to top on next/back
- Mobile-first (390px)
- Brightly logo at top of form when used as public link

---

## COMMIT & REPORT
1. Fix all TypeScript errors (run build)
2. Commit: "feat: single onboarding form — replaces all separate forms, auto-creates client+property"
3. Save ONBOARDING_REPORT.md
4. Run: openclaw system event --text 'Claude Code done: Brightly single onboarding form complete' --mode now
