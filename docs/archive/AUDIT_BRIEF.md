# Brightly App — Full Audit Brief

## Business Context
Brightly Cleaning — Gold Coast QLD. Two distinct client types with completely different flows:

### RESIDENTIAL / STANDARD CLEAN (House Clean, Deep Clean, End of Lease, Bond Clean, Post-Reno)
- Client fills residential quote form → quote via SMS → replies YES → gets /book?lead=ID link → picks date/time → admin schedules
- Quote calculator: Standard Clean pre-selected when lead is residential
- SMS booking link IS sent after quote acceptance

### AIRBNB / SHORT-STAY TURNOVER
- Client fills Airbnb quote form → quote via SMS → replies YES → admin calls to confirm (NO self-service booking link)
- Quote calculator: Airbnb pre-selected when lead is Airbnb
- SMS booking link NOT sent — admin follows up manually

---

## AUDIT TASKS

### 1. CLEAN TYPE FLOW INTEGRITY
- normaliseLegacyServiceType() in src/lib/serviceTypes.ts — correctly maps ALL variants? ("House Clean", "Standard House Clean", "Airbnb", "Airbnb / Short-Stay Turnover", "airbnb", "short-stay", "Short Stay", "standard_clean" etc.)
- NewQuoteCalculator.tsx — when opened from pipeline card with a lead, correctly pre-selects clean type from the lead?
- twilio-inbound-sms edge function — isManualFollowUp check catches ALL Airbnb variants? Correctly sends/blocks booking link?
- BookingPage.tsx — loads lead data correctly, shows date picker for all types
- QuotingPage.tsx — correctly pre-populates from both quote_requests AND leads tables

### 2. NEW ENQUIRY → QUOTE FLOW
When admin clicks pipeline card in "new_enquiry":
- Opens QuotingPage at TOP of screen (scrollTo 0,0)
- Pre-fills: client name, phone, address, clean type, bedrooms/bathrooms from lead form submission
- After saving quote → lead moves to "quote_sent" pipeline stage
- SMS sent to client with quote details and price

### 3. SMS MESSAGE AUDIT
Check every SMS sent across the app:
- All SMS URLs use app.brightly.cleaning (NOT brightly.cleaning or localhost)
- Residential quote acceptance: sends /book?lead=ID link
- Airbnb quote acceptance: NO booking link, admin follows up manually
- No SMS during house clean progress (only tracker link when clean starts)
- All templates professional and on-brand

Check ALL files in supabase/functions/ that send SMS.

### 4. PIPELINE CARD AUDIT — OperationsDashboard.tsx
Wire up ALL missing onClick handlers:
- new_enquiry "Send Quote" → navigate to /quoting?lead=ID&clean_type=TYPE, scroll to top
- quote_sent "Follow Up" → send follow-up SMS to client
- quote_sent "Mark Accepted" → update status to accepted in DB
- accepted "Schedule Clean" → open ScheduleCleanModal
- accepted "Assign Cleaner" → open AssignCleanerModal or navigate
- All cards scroll to top when opened
- All cards show correct clean_type badge

### 5. FORM → DATABASE FIELD MAPPING
Verify quote form submissions correctly save to DB:
- ResidentialQuotePage.tsx → quote_requests table
- AirbnbQuotePage.tsx → quote_requests table
- clean_type saved correctly for both forms
- address, first_name, last_name, phone, email, bedrooms, bathrooms all correct

### 6. QUOTE CALCULATOR DEFAULTS
NewQuoteCalculator.tsx:
- Airbnb clean: show property_name, bed_types fields
- Standard/House Clean: show bedroom/bathroom/living area fields
- Hours default correctly per clean type
- Pricing matches official Brightly rates:
  House Clean no linen: 1b1b $135-170 | 2b1b $170-205 | 2b2b $205-245 | 3b2b $245-280 | 4b2b $280-350 | 4b3b $315-390 | 5b+ Call us
  House Clean with linen: 1b1b $175-215 | 2b1b $250-285 | 2b2b $290-325 | 3b2b $360-395 | 4b2b $435-505 | 4b3b $475-545 | 5b+ Call us
  Deep Clean no linen: 1b1b $190-245 | 2b1b $245-295 | 2b2b $295-350 | 3b2b $350-405 | 4b2b $405-515 | 4b3b $460-570 | 5b+ Call us
  End of Lease: 1b1b $220-285 | 2b1b $285-350 | 2b2b $350-415 | 3b2b $415-485 | 4b2b $485-615 | 4b3b $550-680 | 5b+ Call us
  Extras: Oven +$40 | Fridge +$35 | Windows +$25 | Garage +$60 | Balcony +$40
  Cleaner cost = $45/hr | Client charge = $70/hr inc GST | GP default = 32%

### 7. VISUAL CONSISTENCY
- All pages: dark theme (#0A0F0E bg, #FEDB00 yellow CTAs, #0C463D dark green text on buttons)
- No white backgrounds
- All form inputs: dark bg, light text, gold focus border
- Mobile: no horizontal scroll, fits 390px

### 8. AIRBNB MULTI-PROPERTY
In AirbnbQuotePage.tsx: if bucket = "4-10" or "10+", show "We'll call you" + admin alert notification. No standard quote shown.

---

## CONSTRAINTS (never violate)
- NEVER show GP%, cost breakdown or margin to clients
- No recurring cleans feature
- Client records never hard-deleted
- All timestamps AEST (Australia/Brisbane)
- Revenue/GP data admin-only only
- Brightly onboarding locked until director_approved = true

## DELIVERABLES
1. Fix ALL bugs and discrepancies found
2. Wire up all missing pipeline button onClick handlers
3. Clean type flows correctly end-to-end for BOTH residential and Airbnb
4. Commit: "audit: full flow integrity fix — clean types, SMS, pipeline, forms"
5. Run: openclaw system event --text 'Claude Code done: Brightly full audit complete' --mode now
