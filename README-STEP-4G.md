# Step 4G — Secure Resend delivery test

This first incremental update adds `api/broker-test-email.js` only. It does **not** enable automated alerts or scheduled scanning.

## Setup

In Vercel Preview environment variables, configure `RESEND_API_KEY`, `RATE_ALERT_TO_EMAIL`, and `RATE_ALERT_FROM_EMAIL` (the latter must be an authorised Resend sender). Redeploy Preview after changes. Never use a `VITE_` prefix for secrets.

## Install

Copy `api/broker-test-email.js` into your existing dashboard's `api/` directory, and copy this README to project root. Do not replace existing `src.js` or any other files.

```sh
npm run build
node --check api/broker-test-email.js
git add api/broker-test-email.js README-STEP-4G.md
git commit -m "Add admin-protected Resend test email endpoint"
git push origin feature/booked-clients
```

## Trigger one test from your logged-in Preview site

Open your browser's Developer Tools Console **while logged in to the dashboard**, then run the snippet below after reviewing it. This reads the Supabase access token already held in browser localStorage and sends it only to your own site's `/api/broker-test-email` endpoint. Do not paste your access token anywhere else.

```js
const storageKey = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
const session = storageKey && JSON.parse(localStorage.getItem(storageKey));
if (!session?.access_token) throw new Error('No logged-in Supabase session found.');
const result = await fetch('/api/broker-test-email', {
  method: 'POST',
  headers: { Authorization: `Bearer ${session.access_token}` }
});
console.log(result.status, await result.json());
```

Expected response: HTTP 200 and `sent: true` (provider accepted the email, not proof of inbox delivery). Verify it arrives at the configured address.

If Resend rejects the test, check that the sender is authorised and that the recipient is allowed under your Resend account's test-mode restrictions.

## Next phase

Once delivery is confirmed, integrate notifications with newly saved opportunities, use an atomic claim/outbox to avoid repeat alerts and handle retries, then add scheduled scanning. Do not send customer PII in alert emails.
