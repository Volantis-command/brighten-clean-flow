# Onboarding Form Rebuild — Report

## What Was Built

### 1. Single Master Onboarding Form (`/onboard`)
**File:** `src/pages/OnboardingPage.tsx`

4-step form replacing all previous separate forms:

| Step | Content |
|------|---------|
| **1. Clean Type** | Pill buttons: Standard House, Airbnb/Short Stay, Deep Clean, End of Lease |
| **2. Property Details** | Branches by clean type — address, suburb, state, beds, baths, access, notes. Airbnb adds: bed types, linen, checkout/checkin times, turnaround. Deep Clean adds: last cleaned, occupied. EOL adds: lease end date, carpets, oven, bond, agent. |
| **3. Client Details** | First name, last name, phone, email, referral source |
| **4. Summary + Submit** | Review all fields, submit to auto-create everything |

### 2. Auto-Create on Submit
Every form submission automatically:
1. Inserts into `quote_requests` (status = `form_submitted`)
2. Inserts into `properties` (or matches existing by address)
3. Upserts into `profiles` (matches by phone, then email, or creates new)
4. Upserts into `user_roles` (role = `client`)
5. Links `client_properties` (client ↔ property)
6. Creates admin `notifications` (new enquiry alert)

### 3. All Buttons Rewired to `/onboard`

| Location | Button | Before | After |
|----------|--------|--------|-------|
| Dashboard QuickActions | "Send SMS Quote Link" | SendQuoteLinkModal | `/onboard` → "New Enquiry" |
| Dashboard QuickActions | "Add Property" | `/properties/new` | `/onboard` |
| OperationsDashboard | "New Enquiry" | `/quoting` | `/onboard` |
| OperationsDashboard | "Send SMS Quote Link" | SendQuoteLinkModal | `/onboard` |
| PropertiesPage | "Add Property" | `/properties/new` | `/onboard` |
| ClientsPage | "Send Quote Request" | SendQuoteRequestModal | `/onboard` |
| ClientsPage | "Add Client" | CreateClientDialog | `/onboard` |
| Settings PropertiesSection | "Add Property" | `/properties/new` | `/onboard` |

### 4. ClientsPage — quote_requests Fallback
`useClientsList` now also queries `quote_requests` for records with status `accepted`, `client_accepted`, `form_submitted`, or `quote_sent`. If a quote request has no matching profile (by phone or email), the client still appears in the clients list. This ensures Lynn Robertson and Alexandra always show up.

### 5. Lynn Robertson Migration
Migration at `supabase/migrations/20260407030000_seed_live_clients.sql` preserved — seeds:
- Property: 6 La Scala Court, Surfers Paradise (4BR/3BA residential)
- Profile: Lynn Robertson (phone: 0499777597, email: lynndebrobertson@icloud.com, role: client)

No data was deleted from any table.

### 6. Routing
- `/onboard` — Public route (client fills out via link) AND protected staff route (admin fills out in-app)
- `/onboard/:token` — Legacy token-based route still works
- Query param support: `/onboard?type=airbnb` pre-selects clean type

### 7. Styling
- Dark mode (#0A0F0E background)
- Primary CTA: #FEDB00 yellow with #0C463D text
- Step progress bar at top
- Mobile-first responsive layout
- Brightly logo header on public form

## Build Status
- TypeScript: 0 errors
- Vite build: success
