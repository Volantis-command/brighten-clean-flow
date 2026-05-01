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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **brighten-clean-flow** (6610 symbols, 9706 relationships, 100 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/brighten-clean-flow/context` | Codebase overview, check index freshness |
| `gitnexus://repo/brighten-clean-flow/clusters` | All functional areas |
| `gitnexus://repo/brighten-clean-flow/processes` | All execution flows |
| `gitnexus://repo/brighten-clean-flow/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
