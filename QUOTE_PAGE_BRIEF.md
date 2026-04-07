# Brightly — Stunning Visual Quote Page

## THE GOAL
When a client receives a quote SMS and clicks the link, they land on a world-class visual quote page.
This is the #1 sales moment. It must be stunning, trustworthy, and frictionless.

## ROUTE
`/quote/:token` — fully public, no auth required
Token comes from `quotes.quote_token` (UUID, already in DB)

---

## PAGE DESIGN — Dark, Futuristic, Premium

### Colours:
- Background: #0A0F0E (near black)
- Primary accent: #FEDB00 (yellow)
- Dark green: #0C463D
- Glass cards: rgba(255,255,255,0.05) with border rgba(255,255,255,0.1)
- Glow effect: drop-shadow with #FEDB00/20

### Fonts:
- Headings: Nunito, extrabold
- Body: clean, readable

### Layout (mobile-first, 390px, also great on desktop):

```
┌──────────────────────────┐
│  🌿 Brightly             │
│  ─────────────────────   │
│  "Your Quote is Ready"   │
│  Hi [First Name] 👋      │
│                          │
│  ┌──────────────────┐    │
│  │ GLASS PRICE CARD │    │
│  │                  │    │
│  │  Standard Clean  │    │
│  │  [Address]       │    │
│  │                  │    │
│  │   $280.00        │    │
│  │   inc GST        │    │
│  │                  │    │
│  │   ~3 hrs  4BR/3BA│    │
│  └──────────────────┘    │
│                          │
│  ✨ What's Included      │
│  ✓ Kitchen               │
│  ✓ All Bathrooms         │
│  ✓ 4 Bedrooms            │
│  ✓ Vacuuming & Mopping   │
│  ✓ Wipe-down all surfaces│
│  ✓ Bin emptying          │
│                          │
│  🛡 Fully Insured        │
│  ✓ Police Checked Staff  │
│  ⭐ 5-Star Quality       │
│                          │
│  [✓ Accept this quote ]  ← solid green, large
│  [💬 I have a question]  ← yellow/amber outline
│  [✗ No thanks         ]  ← red outline, smaller
│                          │
│  Questions? 0418 878 707 │
└──────────────────────────┘
```

### Visual effects:
- Price card: glassmorphism — backdrop-filter: blur(10px), semi-transparent border, subtle yellow glow
- Animated entrance: fade-in + slight scale-up on load (framer-motion or CSS)
- Accept button: pulsing green glow on hover
- Checkmarks in "What's Included": staggered fade-in animation
- Brightly logo at top in #FEDB00

---

## DATA TO DISPLAY

Query `quotes` table by `quote_token`:
- `client_name` (first name for greeting)
- `clean_type` (service badge)
- `property_address` / `property_name`
- `bedrooms`, `bathrooms`
- `sell_price_inc_gst` (THE price — this is what they see)
- `estimated_hours`
- `notes` (if any — shown as "Special notes from your request")
- `status` (to handle already-accepted/declined states)
- `quote_request_id` or `lead_id` (for linking back)

DO NOT show: cost price, GP%, margins — never to clients.

### What's Included — by clean type:
**Standard Clean:** Kitchen, All bathrooms, [X] bedrooms, Vacuuming & mopping, Surface wipe-downs, Bin emptying, Mirrors & glass
**Deep Clean:** Everything in Standard + Inside oven, Inside fridge, Window sills, Skirting boards, Light switches & door handles, Inside cupboards
**End of Lease:** Everything in Deep Clean + Wall spot cleaning, Carpet steam clean (if selected), Full garage if applicable, Bond clean standard
**Airbnb Turnover:** Fresh linen made up, Towel folds, Bathroom stock replenishment, Kitchen reset, Rubbish removal, Property inspection check

---

## THREE BUTTON FLOWS

### 1. ✓ ACCEPT (green button)
On click:
1. Show loading state on button
2. Update `quotes` SET status = 'accepted', accepted_at = now() WHERE quote_token = token
3. Update `quote_requests` SET status = 'accepted', accepted_at = now() WHERE id = quote.lead_id (if exists), also match by phone
4. Upsert client into `profiles` (full_name, phone, email, role='client')
5. Insert into `user_roles` (user_id, role='client')
6. Upsert property into `properties` (property_name, address, client_name, bedrooms, bathrooms)
7. Link in `client_properties`
8. Create notification for admin: "Quote accepted — [name] — [address]"
9. Send SMS to BJ (0418878707): "✅ Quote accepted! [name] — [address] — [clean type] — $[price]"
10. Show success screen:
    - Big green tick animation
    - "Booking confirmed! 🎉"
    - "We'll be in touch within 24 hours to confirm your clean date."
    - "Questions? Call 0418 878 707"
    - Clean Brightly branding

### 2. 💬 MORE INFO (yellow button)
On click:
1. Expand an inline message panel (don't navigate away):
   - Textarea: "What would you like to know?"
   - Send button (yellow)
2. On send:
   - Insert into `quote_messages` table (create if not exists):
     `{ quote_id, client_name, client_phone, message, direction: 'inbound', created_at }`
   - Create notification for admin: "Client question — [name]: [message]"
   - Send SMS to BJ (0418878707): "💬 Question from [name]: [message]"
   - Show: "Thanks! We'll get back to you shortly."

Migration for quote_messages table:
```sql
CREATE TABLE IF NOT EXISTS public.quote_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes(id),
  quote_token TEXT,
  client_name TEXT,
  client_phone TEXT,
  message TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound', -- 'inbound' = client, 'outbound' = admin reply
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quote_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert quote messages" ON public.quote_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view quote messages" ON public.quote_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
```

### 3. ✗ DECLINE (red outline button)
On click:
1. Show confirm step: "Are you sure? We'd hate to lose you." with Confirm/Go Back
2. On confirm:
   - Update `quotes` SET status = 'declined'
   - Update `quote_requests` SET status = 'declined'
   - Create admin notification: "Quote declined — [name]"
   - Send SMS to BJ (0418878707): "❌ Quote declined — [name] — [address]"
   - Show message:
     - "No worries at all, [name]."
     - "If you change your mind, just call us on 0418 878 707."
     - "We hope to work with you in the future. 🌿"

---

## STATES TO HANDLE

### Already accepted:
Show: "✅ This quote has already been accepted. We'll see you soon!"

### Already declined:
Show: "This quote is no longer active. Call 0418 878 707 if you'd like a new quote."

### Expired / not found:
Show: "This quote link has expired or is invalid. Call 0418 878 707."

### Loading:
Full-page skeleton with Brightly logo and spinner

---

## ADMIN SIDE — Sending the Quote Link

### Update `sendQuoteMutation` in NewQuoteCalculator.tsx:
Current SMS text: just price in plain text
New SMS text:
```
Hi [first_name]! Your Brightly quote is ready 🌿

[clean_type] at [address]

Tap to view your quote, accept or ask us anything:
[app_url]/quote/[quote_token]

Questions? Call 0418 878 707
```

### Ensure quote_token is generated:
In `saveMutation`, when saving quote, generate a token:
```js
quote_token: crypto.randomUUID()
```
Add column if not exists:
```sql
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS quote_token UUID DEFAULT gen_random_uuid() UNIQUE;
```

### SendQuoteModal.tsx:
Update the SMS to use the new format with the /quote/:token link.

### Quote status tracking in admin:
In SavedQuotesList and the pipeline, show these statuses:
- 📤 Sent (quote_sent)
- 👁 Viewed (quote_viewed — set when client opens the page)
- ✅ Accepted
- 💬 Question received
- ❌ Declined

Add `quote_viewed_at` column:
```sql
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS quote_viewed_at TIMESTAMPTZ;
```
Set it when the /quote/:token page loads (fire-and-forget update).

---

## FILE TO CREATE
`src/pages/QuoteViewPage.tsx` — the public quote page
Add route in App.tsx: `<Route path="/quote/:token" element={<QuoteViewPage />} />`

---

## IMPORTANT
- This page is fully public — no auth check, no redirect to login
- Works on mobile (clients will open it on their phone)
- No GP%, no cost price, no margin information ever
- The accept flow must be rock solid — test all 3 paths
- Run full build before committing

---

## COMMIT
1. Run build, fix all TypeScript errors
2. Commit: "feat: stunning visual quote page /quote/:token with accept/decline/more-info flow"
3. Save QUOTE_PAGE_REPORT.md
4. Run: openclaw system event --text 'Claude Code done: Visual quote page complete' --mode now
