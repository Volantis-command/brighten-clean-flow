# Brightly — Full Property Profile Forms

## WHAT WE'RE BUILDING
A comprehensive property profile for every property. Two variants:
1. **Residential** (Standard Clean / Deep Clean / End of Lease)
2. **Airbnb / Short Stay**

These profiles live in:
- The Properties tab (PropertiesPage.tsx)
- The Client portal under the client that owns/manages them

---

## PROPERTY PROFILE FIELDS

### Both types share:
- Property name / nickname (e.g. "Lynn's Home" or "Miami Beach Airbnb")
- Full address
- Suburb, State, Postcode
- Property type: House / Apartment / Townhouse / Unit / Villa
- Bedrooms (number)
- Bathrooms (number)
- **Bed configuration** (for each bedroom): bed type per room (King / Queen / Double / Single / Bunk)
- **Entry & Access:**
  - Access method: Key safe / Lockbox / Leave unlocked / Meet at property / Other
  - Key safe / lockbox code (masked, tap to reveal)
  - Alarm code (masked, tap to reveal)
  - Garage code (masked, tap to reveal)
  - Parking notes
- **Special instructions** (free text — pets, fragile areas, restricted rooms)
- **Product restrictions / allergies** (free text)
- **Room notes** (JSONB — one text field per room type: Kitchen, Living/Dining, Master Bedroom, Bedroom 2, Bedroom 3, Bathrooms, Laundry, Other)
- **Preferred cleaner** (dropdown from staff list — cleaner_1_id)
- **Pricing for this property:**
  - Locked sell price inc GST (numeric — what we always charge them)
  - Estimated hours (numeric)
  - Notes on pricing (optional)

### Airbnb only (additional fields):
- Linen provided by Brightly: Yes / No
  - If Yes: number of linen sets available
- Amenities restocking: Yes / No
  - If Yes: list of items to restock (text)
- Sofa beds: number (0-3)
- Key handover for guests (how guests access — separate from cleaner access)
- Guest WiFi password (for cleaner reference)

### Residential only (additional fields):
- Is property currently occupied? Yes / No
- Number of occupants (if occupied)

---

## DATA MODEL
All fields save to `properties` table. Add these columns via migration if they don't exist:
```sql
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS bed_config JSONB DEFAULT '[]';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS alarm_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS garage_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS parking_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS room_notes JSONB DEFAULT '{}';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS locked_price_inc_gst NUMERIC(10,2);
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,1);
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS pricing_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS linen_provided BOOLEAN DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS linen_sets INTEGER DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS amenities_restock BOOLEAN DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS amenities_list TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS sofa_beds INTEGER DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_access_notes TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS guest_wifi TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN DEFAULT false;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS occupant_count INTEGER DEFAULT 0;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client_email TEXT;
```

---

## PROPERTY PROFILE COMPONENT

### File: `src/components/properties/PropertyProfileForm.tsx`
A slide-over or full page form. Two modes: view (read-only, clean layout) and edit.

### Layout (Edit mode):
Tabbed sections for usability:
1. **Overview** — name, address, property type, beds/baths, bed config
2. **Access** — all codes/entry details (masked by default)
3. **Instructions** — special instructions, product restrictions, room notes
4. **Pricing** — locked price, hours, preferred cleaner
5. **Airbnb Extras** (only shown if property_type = 'airbnb') — linen, amenities, sofa beds, guest notes

### Layout (View mode — cleaner sees this):
- Property name + address prominent at top
- Access section: show access method, reveal codes on tap with warning icon
- Instructions: clear bullet list
- Pricing: HIDDEN from cleaners (admin only)
- Airbnb extras if applicable

### Add to PropertiesPage.tsx:
- Clicking a property card → opens PropertyProfileForm in view mode
- Edit button → switches to edit mode
- "Add Property" → opens PropertyProfileForm in create mode (blank)

---

## SEED LYNN AND ALEXANDRA'S PROPERTY PROFILES

Add to migration `20260407030000_seed_live_clients.sql` (already exists — APPEND to it, don't replace):

### Lynn Robertson
- Address: 6 La Scala Court Surfers Paradise QLD 4217
- Type: residential / house
- Bedrooms: 4, Bathrooms: 3
- Clean type: Standard Clean
- Client name: Lynn Robertson
- Phone: 0499777597, Email: lynndebrobertson@icloud.com

### Alexandra Cornish  
- Address: 286 The Esplanade Miami QLD 4220
- Type: airbnb
- Bedrooms: 1, Bathrooms: 1
- Clean type: Airbnb / Short-Stay Turnover
- Client name: Alexandra Cornish
- Phone: 0423890994, Email: alexandracornish@yahoo.com.au

SQL to append to migration:
```sql
-- Alexandra Cornish — 286 The Esplanade Miami (1BR/1BA Airbnb)
INSERT INTO public.properties (
  property_name, address, suburb, state, postcode,
  client_name, client_phone, client_email,
  bedrooms, bathrooms, property_type, status
)
SELECT
  '286 The Esplanade, Miami',
  '286 The Esplanade Miami',
  'Miami', 'QLD', '4220',
  'Alexandra Cornish', '0423890994', 'alexandracornish@yahoo.com.au',
  1, 1, 'airbnb', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.properties
  WHERE client_name = 'Alexandra Cornish'
  AND address ILIKE '%Esplanade%'
);

-- Ensure Alexandra exists as a profile
INSERT INTO public.profiles (id, full_name, phone, email, role)
SELECT
  gen_random_uuid(),
  'Alexandra Cornish',
  '0423890994',
  'alexandracornish@yahoo.com.au',
  'client'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE phone = '0423890994'
);

-- Link both to client_properties (after profiles exist)
INSERT INTO public.client_properties (client_id, property_id, property_address)
SELECT p.id, pr.id, pr.address
FROM public.profiles p, public.properties pr
WHERE p.phone = '0499777597' AND pr.address ILIKE '%La Scala%'
AND NOT EXISTS (
  SELECT 1 FROM public.client_properties cp
  WHERE cp.client_id = p.id AND cp.property_id = pr.id
);

INSERT INTO public.client_properties (client_id, property_id, property_address)
SELECT p.id, pr.id, pr.address
FROM public.profiles p, public.properties pr
WHERE p.phone = '0423890994' AND pr.address ILIKE '%Esplanade%'
AND NOT EXISTS (
  SELECT 1 FROM public.client_properties cp
  WHERE cp.client_id = p.id AND cp.property_id = pr.id
);
```

---

## CLIENT PORTAL — Properties Tab Fix

In `src/pages/ClientPortalPage.tsx` (or equivalent):
The Properties tab must query:
```
FROM properties WHERE client_id = profile.id
OR client_name = profile.full_name  
OR client_phone = profile.phone
```
This ensures Lynn and Alexandra's properties always show in their portals.

Each property card in the portal shows:
- Property name + address
- Bed/bath count
- Last clean date (from jobs table)
- Next scheduled clean (from jobs table)
- "View Details" button → read-only property profile

---

## STYLING
- Dark mode, #0A0F0E bg, #FEDB00 yellow accents, #0C463D dark green
- Masked codes: show ●●●● with an eye icon to reveal
- Tab navigation within the form
- Save button: yellow with dark green text
- Mobile-first, 390px

---

## COMMIT
1. Fix TypeScript errors
2. Commit: "feat: full property profile forms — residential + airbnb, seed Lynn + Alexandra"
3. Save PROPERTY_PROFILE_REPORT.md
4. Run: openclaw system event --text 'Claude Code done: Property profiles complete' --mode now
