# Goyal Mortgages — Booked Clients update

This is a **source-only replacement project**, excluding the original ZIP’s .env files, .git, node_modules, .vercel, caches, backups and local datasets.

## Changes
- New private API: `api/broker-clients.js` (GET paginated, POST create, PATCH edit).
- `src.js`: new Booked Clients admin form and list, kept separate from website registrations.
- `style.css`: responsive form and list styles.
- Existing project source and dependencies retained.

## Apply
1. Back up your current repository. Copy these files into your existing `goyal-mortgages-dashboard` working directory, keeping its existing `.env.local` private and unchanged.
2. Run `npm ci` and `npm run build`.
3. Commit only the source changes to a feature branch and test a Vercel Preview deployment.
4. Sign in as an existing admin, open Admin and add a **dummy** booked mortgage. Test editing and page reload.
5. After verification, merge to `main`. Do not put real client details in the test record.

## Prerequisites
- The previously created Supabase tables `public.broker_clients` and `public.broker_rate_opportunities`.
- Existing Vercel server-side `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` variables. Never expose the service-role key to the browser.
- An authenticated user in `dashboard_admins`.

## Not yet implemented
- Rate matching, eligibility checks, adviser email alerts and automated monitoring.
- Data protection, retention, compliance review and production readiness.

## Important
The new API uses the server-side service role after verifying the user's access token and membership in `dashboard_admins`. New tables have RLS enabled with no anon/authenticated grants.
