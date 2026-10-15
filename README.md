# Goyal Mortgages rate dashboard

Vite + Supabase public rate comparison and authenticated admin dashboard.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and add your **publishable** Supabase key (never a service role key).
3. Apply `supabase-setup.sql` in the existing `goyal-mortgages` project's SQL Editor after reviewing it.
4. Create your admin user in Supabase Authentication and add its UUID to `dashboard_admins` via the Supabase SQL Editor. Do not allow public signup for admins.
5. `npm run dev`; for Vercel configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then deploy the repository.

The dashboard uses only the existing `mortgage_rates` and `mortgage_rate_history` tables, plus the new `dashboard_admins` allowlist. The public user has SELECT-only access to current rates; admin insert access requires an authenticated, allowlisted user. No service key is exposed in the browser.

**Important:** Rate observations are not a verified live feed. Do not launch publicly before checking FCA/appointed representative status, required disclosures, permission to republish lender data, product accuracy, APRC/full costs and privacy policy. Admin inserts currently do not automatically write a history record; integrate the existing ingestion/history workflow before relying on history for manually added rates.
