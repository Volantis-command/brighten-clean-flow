# Lovable Cloud → Owned Supabase Migration

This folder contains the tooling for migrating Brightly off Lovable Cloud onto a Supabase project Brendan owns directly. Written 2026-04-24.

## Source & destination

| | Lovable Cloud (source) | Owned Supabase (destination) |
|---|---|---|
| Project ref | `mkknrxoqturkmpcmhvtt` | `ueomxjsqvmbjfufjauhe` |
| URL | `https://mkknrxoqturkmpcmhvtt.supabase.co` | `https://ueomxjsqvmbjfufjauhe.supabase.co` |
| Dashboard access | Lovable Cloud UI only | `supabase.com/dashboard` (Brendan's login) |
| Region | (Lovable-managed) | Oceania (Sydney), `ap-southeast-2` |
| Role in migration | READ-ONLY throughout | Receives data, eventually becomes production |

## Core principle

**Copy, never move.** Lovable Cloud is not touched destructively at any point. It keeps running throughout the migration and for 7 days after cutover as a rollback safety net. Only after 7 clean days on the new stack (and Brendan's explicit sign-off) is Lovable Cloud shut down.

## Day-by-day plan

### Day 1 — Export function (tonight, already complete)

**Output:** new edge function at `supabase/functions/export-all-data/` + entry in `supabase/config.toml`. Ships via PR. Once merged, Lovable Cloud auto-deploys it.

**Brendan's actions:**
1. Merge the PR (standard squash-and-merge flow).
2. Set one secret in Lovable Cloud's Edge Functions Secrets panel:
   - Name: `EXPORT_SHARED_SECRET`
   - Value: a strong random string (I'll provide, or use any password generator, 32+ characters)
3. Publish from Lovable if it doesn't auto-deploy (usually auto).

**Verify:** function appears in Lovable Cloud → Cloud → Edge functions list.

### Day 2 — Export data + apply schema + import

**Brendan's actions:** ~30 min, all via me walking him through.

1. Trigger the export — we run a single curl command. Returns a signed URL to a JSON dump.
2. Install Supabase CLI on laptop (one-time, ~2 min).
3. Log in to Supabase CLI (`supabase login`, opens browser, standard OAuth).
4. Link to the new project (`supabase link --project-ref ueomxjsqvmbjfufjauhe`).
5. Apply all 103 migrations to the new project (`supabase db push`).
6. Run the import script (`npm run migrate:import -- --dump-url <signed url>`).
7. Spot-check a few known clients in the new Supabase's Table Editor.

**Verify:** row counts match between source and destination (exported JSON has per-table counts; new Supabase shows same).

### Day 3 — Edge functions + secrets + Vercel wiring

**Brendan's actions:** ~60 min.

1. Re-enter Twilio / Xero / Google / any other integration secrets into the new Supabase's **Edge Functions → Secrets** panel. This is the single most time-consuming step for Brendan — it's manual paste-from-password-manager-into-Supabase-UI, one secret at a time. I'll provide the exact list of names to set.
2. Deploy all 42 existing edge functions to the new Supabase — I run `supabase functions deploy` in the worktree, Brendan just watches.
3. Set Vercel environment variables for the new Supabase URL + anon key. Brendan pastes into Vercel UI.
4. Trigger a Vercel rebuild. Preview URL now talks to new Supabase end-to-end.
5. Re-connect Xero OAuth via the Xero Settings page on the new stack (click "Connect Xero", approve, done).

**Verify:** open Vercel preview URL, sign in, walk through: view a client → view a property → see the data is correct.

### Day 4 — DNS cutover

**Brendan's actions:** ~2 hrs off-peak (e.g. Sunday night 10pm AEST).

1. Announce a 15-minute maintenance window if needed (with 6 cleaners that haven't onboarded yet, this is effectively a no-op — just Brendan).
2. Trigger one final delta export (captures anything written since Day 2).
3. Import delta rows into new Supabase.
4. In your DNS provider (wherever `brightly.cleaning` DNS is managed — probably Cloudflare or similar), change the CNAME for `app.brightly.cleaning` from Lovable's target → Vercel's target. I'll give the exact Vercel target.
5. Wait 5–15 min for DNS to propagate globally.
6. Smoke test: open `app.brightly.cleaning` on phone + laptop. Sign in. Walk through 3-4 screens.
7. If all good: done. Announce migration complete. Lovable Cloud remains alive for rollback.

**Verify:** everything on `app.brightly.cleaning` works as expected.

### Day 5 onward — stabilize

1. Apply RLS patch SQL in the new Supabase's SQL editor (you're in YOUR Supabase dashboard now, easy).
2. Enable GitHub CI on the repo (the ci-workflow-to-add.yml file is ready at repo root).
3. Remove the `lovable.dev` GitHub App so it stops being able to make commits.
4. Monitor for 7 days — any issues, cut DNS back to Lovable in 5 min.
5. After 7 clean days + Brendan's sign-off: delete the Lovable project, archive the Lovable Cloud data export as a final backup.

## The export function

See `../supabase/functions/export-all-data/index.ts`.

## The import script

See `./import-data.ts` (tonight: stub with interface definition; fills in when we have a real dump file to import).

## Things that can go wrong

| Scenario | Impact | Mitigation |
|---|---|---|
| Export function timeout | No dump produced | Re-run; pagination handles size |
| Signed URL expires before download | Can't access dump | Re-run export, URLs are ephemeral |
| Schema migration fails on a given file | Partial schema on new DB | Identify the failing migration, fix, resume. Lovable Cloud still live. |
| Import violates FK constraint | Some rows missing | Run in chunks; use `session_replication_role = 'replica'` to bypass triggers if needed |
| Auth user migration loses passwords | Staff must reset | Only Brendan has a password today; he resets once. Cleaners use SMS magic-link, no password impact. |
| DNS propagation stalls | Some users see old site briefly | Wait up to 60 min; set low TTL before cutover |
| Critical bug discovered post-cutover | App broken | Cut DNS back to Lovable in 5 min. Lovable DB has been untouched throughout. |

## Credentials / secrets the new Supabase needs

List generated from reading `supabase/functions/` folder + known integrations. Brendan enters these into the new Supabase's Edge Function Secrets panel (copy from 1Password or equivalent):

### Twilio
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` (Australian number)

### Xero
- `XERO_CLIENT_ID`
- `XERO_CLIENT_SECRET`
- `XERO_REDIRECT_URI` (will need updating to new Vercel URL post-cutover)

### Google (calendar + drive)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_SERVICE_ACCOUNT_JSON` (if used)

### Stripe (wired but not live)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Guesty / Hostaway (Hostaway is new)
- `HOSTAWAY_ACCOUNT_ID` (new, needed for 19-property client)
- `HOSTAWAY_CLIENT_SECRET`

### Migration
- `EXPORT_SHARED_SECRET` (temporary, delete after migration complete)
