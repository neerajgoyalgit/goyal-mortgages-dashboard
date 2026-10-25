# Goyal Mortgages — Adviser-only rate review candidates

This is a full project snapshot based on the prior Booked Clients update, with an added private GET `/api/broker-opportunities` route and Admin list of potential rate improvements.

## Deploy safely

1. Back up your current project and merge these files into your feature branch. Keep your existing `.env` files locally; do not commit them.
2. Run `npm install -D vite@7.3.7` (this archive's package lock was generated before your local security upgrade), then `npm audit` and `npm run build`.
3. Commit to the feature branch and use Vercel Preview; do not push to production until tested.
4. Sign in as a dashboard admin, open Booked Clients and scroll to **Potential rate improvements**.

## Security and caveats

The endpoint checks a valid Supabase user token and membership in `dashboard_admins` before using the server-only service-role key. No direct browser read of private tables. The view `public.broker_rate_review_candidates` must already exist in your Supabase project (created in Step 4A).

Matches are **rate-only preliminary candidates**. They are not verified rebooking offers. Product eligibility, product period, rate type, fees, lender-specific rules, and mortgage application stage must be checked manually. The UI does not send emails or rebook mortgages. The test client remains in your database until you remove it.
