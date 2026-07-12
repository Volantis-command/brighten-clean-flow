# Brightly Clean Flow

Brightly is the operating system for guest-ready cleaning: client intake, properties, booking ingestion, scheduling, cleaner execution, photo proof, QC, linen, invoicing and client visibility.

## Product promise

**Brightly Autopilot — Guest Ready, Guaranteed.** One booking becomes one canonical turnover, every turnover has an explainable readiness state, and exceptions are surfaced before check-in.

## Stack

- React 18, TypeScript and Vite
- TanStack Query
- Supabase Postgres, Auth and Edge Functions
- Tailwind and Radix UI
- Vitest and Playwright

## Local development

```bash
npm ci
npm run dev
```

The app fails safely when required environment values are absent. Keep local, staging and production Supabase project IDs distinct and verify the project before running any migration or data task.

## Quality gates

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

CI runs typechecking, unit tests, the production build and public responsive browser checks.

## Core scheduling model

- Hostaway and iCal source records are normalised into one property turnover.
- Hostaway turnover identity is `property + local checkout date`; all related reservation IDs are retained as source references.
- iCal suggestions remain linked through approval, date changes and cancellation.
- Operational dates use the property timezone, defaulting to `Australia/Brisbane`; stored timestamps remain UTC.
- Source replays must be idempotent and must not create new historical work.
- `source_turnover_key`, `source_external_refs` and `source_synced_at` explain why an automatic job exists.

## Roles and surfaces

- **Admin/founder:** Command Centre, schedule, customers, team and financials
- **Head cleaner:** operating command, schedule, QC, work and alerts
- **Cleaner:** today, assigned work, guided clean and profile
- **Client:** property readiness, proof, requests and invoices
- **Linen partner:** delivery workflow

## Database and edge functions

Migrations live in `supabase/migrations`. Edge functions live in `supabase/functions`; shared deterministic integration logic belongs in `supabase/functions/_shared` and must have unit fixtures.

Never edit an applied migration. Add a new forward migration and test a clean migration replay before deployment.

## Release checklist

1. Typecheck, unit tests, build and browser checks are green.
2. Migration has been tested against a clean database and a production-shaped backup.
3. Hostaway/iCal replay fixtures produce one correct turnover.
4. Key routes fit at 320, 375, 390 and 430px without horizontal scrolling.
5. A rollback plan and monitoring owner are recorded.

See [AUDIT_2026-07-12.md](./AUDIT_2026-07-12.md) for the audit evidence and implementation rationale.
