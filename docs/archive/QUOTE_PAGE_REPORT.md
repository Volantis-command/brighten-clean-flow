# Visual Quote Page — Build Report

## What Was Built

A stunning, dark-themed visual quote page at `/quote-view/:token` — the #1 client-facing sales moment in the app.

## Route
- **URL:** `/quote-view/:token` (fully public, no auth)
- **Token:** Uses `quotes.quote_token` (UUID) — already in DB

## Design
- **Theme:** Dark futuristic premium (#0A0F0E background)
- **Glassmorphism price card** with yellow glow, backdrop blur, shimmer overlay
- **Animated checkmarks** — staggered fade-in with SVG stroke animation
- **Brightly yellow (#FEDB00)** accent throughout
- **Mobile-first** (390px optimised, responsive to desktop)
- **Nunito** font for headings

## Three Button Flows

### 1. Accept (Green)
- Updates `quotes` status → `accepted` with timestamp
- Updates linked `quote_requests` status
- Creates a job in `jobs` table
- Sends admin notification + SMS via edge function
- Shows animated green tick success screen

### 2. More Info (Yellow)
- Expands inline message panel (no navigation)
- Inserts into `quote_messages` table
- Sends admin notification + SMS via `quote_question` handler
- Shows "Thanks! We'll get back to you shortly" confirmation

### 3. Decline (Red)
- Shows confirmation step: "Are you sure? We'd hate to lose you."
- Updates `quotes` status → `declined`
- Updates linked `quote_requests`
- Sends admin notification + SMS
- Shows graceful decline message

## Edge Cases Handled
- **Already accepted** → "This quote has already been accepted. We'll see you soon!"
- **Already declined** → "This quote is no longer active."
- **Not found / expired** → "Quote link expired or invalid."
- **Loading** → Branded skeleton with Brightly logo + spinner

## Files Modified

| File | Change |
|------|--------|
| `src/pages/QuoteViewPage.tsx` | Complete rewrite — stunning dark glassmorphism quote page |
| `src/components/pricing/SendQuoteModal.tsx` | SMS now sends link to visual quote page instead of plain text |
| `src/components/pricing/SavedQuotesList.tsx` | Added viewed/question status badges |
| `supabase/functions/send-quote-notification/index.ts` | Added `send_quote_link_sms` + `quote_question` handlers |

## SMS Format (New)
```
Hi [name]! Your Brightly quote is ready 🌿

[clean_type] at [address]

Tap to view your quote, accept or ask us anything:
https://app.brightly.cleaning/quote-view/[token]

Questions? Call 0418 878 707
```

## Admin Status Tracking (SavedQuotesList)
- 📤 Sent (quote_sent)
- 👁 Viewed (quote_viewed — set when client opens page)
- ✅ Accepted
- 💬 Question received
- ❌ Declined

## Database Columns Used
- `quotes.quote_token` (existing UUID)
- `quotes.quote_viewed_at` (fire-and-forget on page load)
- `quotes.quote_accepted_at`, `quotes.quote_declined_at`
- `quote_messages` table (for client questions)

## SQL Migrations Needed
```sql
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS quote_viewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.quote_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes(id),
  quote_token TEXT,
  client_name TEXT,
  client_phone TEXT,
  message TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quote_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert quote messages" ON public.quote_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view quote messages" ON public.quote_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
```

## Build Status
- TypeScript: 0 errors
- Vite build: Success (3.21s)
