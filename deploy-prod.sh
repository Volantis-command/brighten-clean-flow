#!/usr/bin/env bash
# Reliable production deploy for Brightly — builds LOCALLY, uploads the finished
# result, and skips Vercel's remote builder (which was hanging on 16 Jul 2026).
#
# Usage:  ./deploy-prod.sh
# Run it from the repo root on the branch you want to ship.
set -euo pipefail

# --- Correct production Supabase project (ueomxjsqvmbjfufjauhe) ---
export VITE_SUPABASE_URL='https://ueomxjsqvmbjfufjauhe.supabase.co'
export VITE_SUPABASE_PROJECT_ID='ueomxjsqvmbjfufjauhe'
export VITE_SUPABASE_PUBLISHABLE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlb214anNxdm1iamZ1ZmphdWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDQ0NjUsImV4cCI6MjA5MjU4MDQ2NX0.HEt5QGm1Sk4BMiwo0yi89PcN1NIZ5hWNBdZJCy3KU-c'

echo "==> Building locally (this is the part Vercel keeps hanging on)…"
npm run build

echo "==> Sanity check: correct database baked in?"
grep -rlq 'ueomxjsqvmbjfufjauhe' dist/assets/*.js || { echo "ABORT: ueomx not in build"; exit 1; }
if grep -rlq 'mkknrxoqturkmpcmhvtt' dist/assets/*.js; then echo "ABORT: dead project (mkkn) leaked into build"; exit 1; fi

echo "==> Packaging prebuilt output…"
rm -rf .vercel/output
mkdir -p .vercel/output/static
cp -R dist/. .vercel/output/static/
cat > .vercel/output/config.json <<'JSON'
{ "version": 3, "routes": [ { "src": "/edge/(.*)", "dest": "https://ueomxjsqvmbjfufjauhe.supabase.co/functions/v1/$1" }, { "handle": "filesystem" }, { "src": "/.*", "dest": "/index.html" } ] }
JSON

echo "==> Uploading prebuilt build straight to PRODUCTION…"
vercel deploy --prebuilt --prod --yes

echo "==> Done. Verify: https://app.brightly.cleaning"
