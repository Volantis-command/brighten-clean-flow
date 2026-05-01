# Brightly App — Context for Claude Code

## Who's working on this

**BJ Parker** (Brendan Parker) — owner, based on the Gold Coast, Australia. Runs 5 businesses. Not a developer — he's the operator. Needs direct, concise communication. Prefers bullet points, action-oriented responses, ruthless prioritisation. Hates sycophancy and filler words.

When suggesting changes, always flag risk level and cognitive load impact. BJ has high risk tolerance but zero patience for waffle.

## What this is

**Brightly Cleaning** is an Airbnb/short-term rental turnover cleaning company. This app (`app.brightly.cleaning`) handles:

- Client quote intake → quote building → SMS → acceptance → job scheduling
- Admin dashboard: scheduling, quoting, clients, staff, timesheets, invoicing
- Cleaner portal: my jobs, clock in/out, photos, completion forms
- Head cleaner QC audits
- Xero invoice integration
- Twilio SMS for all client/cleaner comms
- Guesty iCal sync for Airbnb bookings

## Tech stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (Postgres + Auth + Edge Functions + Storage)
- **Deploy**: Vercel (frontend, auto-deploys on push to main) + Supabase CLI (migrations + edge functions, manual)
- **Repo**: GitHub `Volantis-command/brighten-clean-flow`
- **SMS**: Twilio via Supabase edge functions
- **Invoicing**: Xero (OAuth)

## CRITICAL: NOT using Lovable anymore

**Lovable is gone. Do not mention it. Do not suggest "paste this into Lovable".**

The workflow is:
1. Claude Code edits files directly
2. `git push` → Vercel auto-deploys frontend in ~60s
3. Migrations: `supabase db push` (CLI, manual)
4. Edge functions: `supabase functions deploy <name>` (CLI, manual)

## Supabase project

- **Production project ref**: `ueomxjsqvmbjfufjauhe` (Sydney)
- **URL**: `https://ueomxjsqvmbjfufjauhe.supabase.co`
- **SQL editor**: supabase.com → Brightly App project → SQL Editor
- BJ also has a separate Supabase org with project `yutfaddliozeaksfpzpr` — **NOT the app. Don't touch it.**

## Deploy checklist (every change)

| What changed | How to deploy |
|---|---|
| Frontend (src/) | `git push` — Vercel picks it up automatically |
| Migration (supabase/migrations/) | `supabase db push` in Terminal |
| Edge function (supabase/functions/) | `supabase functions deploy <function-name>` in Terminal |

**Migration drift gotcha:** if `supabase db push` complains about unknown remote migrations, use `supabase migration repair --status reverted <migration-id>` to clear them. Never use `--status applied` without running the migration first.

## Known bugs (deferred)

- `supabase/functions/ai-chat/index.ts` line 128: hardcoded Lovable AI gateway URL — needs to be an env var
- Client portal auth uses localStorage (spoofable) — should migrate to Supabase phone OTP
- Bank details stored plaintext in `staff_onboarding` — move to Stripe Connect or Wise
- CORS set to `*` on ~16 edge functions — should restrict to app.brightly.cleaning
- Green text on Clients page still too light — grep `text-green-600|text-green-700|text-green-800` and replace with `text-green-400`

## Important files

- `src/App.tsx` — all routes
- `src/pages/QuoteIntakePage.tsx` — client quote form entry
- `src/pages/QuoteViewPage.tsx` — client accepts quote (main flow)
- `src/components/pricing/NewQuoteCalculator.tsx` — admin quote builder
- `src/lib/pricingCalculator.ts` — all pricing logic
- `src/lib/serviceTypes.ts` — service types, default hours, consumables, photo fee
- `src/lib/recurringJobHelper.ts` — creates child jobs for weekly/fortnightly/monthly
- `src/integrations/supabase/client.ts` — Supabase client init
- `supabase/functions/create-booking-from-quote/index.ts` — all client booking flows route through here
- `supabase/functions/send-quote-link-sms/index.ts` — quote SMS sender
- `supabase/migrations/` — applied via `supabase db push`

## Brand / design

- **Brightly green**: `#4ADE80` (green-400) — primary
- **Yellow accent**: `#FEDB00`
- Dark theme for client-facing pages (Tesla-style glass cards)
- Light theme for admin dashboard

## Working style

- Always flag **risk level** (low/medium/high) on any significant change
- Prioritise ruthlessly — if 3 bugs exist, say which one matters most
- Don't ask 5 clarifying questions — make reasonable assumptions and go
- Say "I don't know" when you don't know
- Bullet points over paragraphs, bold key points
- No emojis unless BJ uses them
- **Never mention Lovable**
