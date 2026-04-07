# Property Profile — Build Report

## What Was Built

### 1. PropertyProfileForm Component
**File:** `src/components/properties/PropertyProfileForm.tsx`

Full property profile form with two modes (view/edit) and tabbed sections:
- **Overview** — name, address, suburb/state/postcode, property type (House/Apartment/Townhouse/Unit/Villa), client type (Residential/Airbnb), bedrooms, bathrooms, bed configuration per room, client details, occupied status (residential only)
- **Access** — access method dropdown, masked access/alarm/garage codes with eye-icon reveal, parking notes
- **Instructions** — special instructions, product restrictions/allergies, room-by-room notes (Kitchen, Living/Dining, Master Bedroom, Bedroom 2, Bedroom 3, Bathrooms, Laundry, Other)
- **Pricing** — locked sell price inc GST, estimated hours, pricing notes, preferred cleaner dropdown (admin only — hidden from cleaners)
- **Airbnb Extras** (conditional on airbnb type) — linen provided toggle + sets count, amenities restocking toggle + item list, sofa beds selector, guest key handover notes, guest WiFi password

### 2. PropertyProfilePage Enhancement
**File:** `src/pages/PropertyProfilePage.tsx`

- Replaced old basic DetailsTab with new PropertyProfileForm
- Default tab is now "Profile" (view mode) with Edit button for admins
- Kept existing Passport, SOP, and History tabs intact
- View/edit mode toggle via button

### 3. Database Migration (Appended)
**File:** `supabase/migrations/20260407030000_seed_live_clients.sql`

Added 17 new columns to `properties` table:
- `bed_config`, `garage_code`, `parking_notes`, `room_notes`
- `locked_price_inc_gst`, `estimated_hours`
- `linen_provided`, `linen_sets`, `amenities_restock`, `amenities_list`
- `sofa_beds`, `guest_access_notes`, `guest_wifi`
- `is_occupied`, `occupant_count`
- `client_id`, `client_email`

Seeded Alexandra Cornish property (286 The Esplanade Miami, 1BR/1BA Airbnb) and linked both Lynn Robertson and Alexandra to `client_properties`.

### 4. TypeScript Types Updated
**File:** `src/integrations/supabase/types.ts`

All 17 new columns added to properties Row, Insert, and Update types.

### 5. Client Portal Fix
**File:** `src/pages/ClientPortalPage.tsx`

Properties tab now queries via:
- `client_properties` link (existing)
- `client_id = profile.id` (new)
- `client_name = profile.full_name` (new)
- `client_phone = profile.phone` (new)

Results are deduplicated. Added bed/bath count display to property cards.

## Seed Data

| Client | Address | Type | Beds/Baths |
|--------|---------|------|------------|
| Lynn Robertson | 6 La Scala Court, Surfers Paradise QLD 4217 | Residential | 4/3 |
| Alexandra Cornish | 286 The Esplanade, Miami QLD 4220 | Airbnb | 1/1 |

## Styling
- Dark mode: `#0A0F0E` bg, `#FEDB00` yellow accents, `#0C463D` dark green
- Masked codes with eye-icon reveal
- Tab navigation within form
- Save button: yellow with dark green text
- Mobile-first responsive

## Build Status
- TypeScript: 0 errors
- Vite build: successful
