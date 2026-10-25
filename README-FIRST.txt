GOYAL MORTGAGES — VERIFIED REGISTRATION (PRE-LAUNCH)

FILES:
  src.js                          -> replace project root src.js
  style.css                       -> replace project root style.css
  api/customer-register-verified.js -> add as NEW API route

WHAT IT DOES:
  1. Customer requests Supabase passwordless verification link.
  2. After clicking link, customer returns to the site and fills mortgage form.
  3. Backend verifies Supabase bearer token using getUser, including email confirmation.
  4. Backend saves through existing register_test_mortgage_customer RPC, status pending.
  5. Existing private /api/customer-register route is NOT changed.

REQUIRED SERVER ENVIRONMENT (not VITE_):
  SUPABASE_URL = your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY = existing private secret key
  SUPABASE_PUBLISHABLE_KEY = your Supabase publishable key (server-side)
  ENABLE_VERIFIED_REGISTRATIONS = true (ONLY in isolated development/Preview testing when ready)

SECURITY / LAUNCH BLOCKERS:
  - Feature gate is OFF by default. Do not enable on Production yet.
  - Existing Supabase built-in email sender has limits; test with eligible addresses.
  - Before public launch: production SMTP, bot protection/CAPTCHA, IP/account rate limiting,
    abuse monitoring, a real privacy notice and retention policy, separate marketing opt-in,
    legal/compliance approval, and correct FCA/Ingard disclosures.
  - Existing Supabase auth project is shared with Admin. Confirm OTP links do not disturb
    admin sessions; use a separate Auth project if you require stronger isolation.
  - Verify RPC function grants and RLS, and test duplicate emails and error cases.
  - Do not paste secrets into the browser or commit .env files.
  - Never enable automatic alerts until permissions and notification controls are ready.

TEST LOCALLY FIRST, THEN ON FEATURE-BRANCH PREVIEW. DO NOT DEPLOY PRODUCTION.
