# Step 4E — Same-lender review queue (Preview)

This update enhances the private Opportunities queue with a same-lender-first filter, separate other-lender alternatives, and an explicit **manual review** label. It does not scrape Halifax, verify offers, persist alerts, email clients, or rebook mortgages.

## Install

1. Back up your current `~/Documents/goyal-mortgages-dashboard` project. Extract this ZIP and copy **its contents** over that project's files (do not nest the extracted folder).
2. On branch `feature/booked-clients`, run `npm install -D vite@7.3.7`, `npm audit`, `npm run build`, `git status`.
3. Confirm no secrets or `.env` are staged. Commit and push to the feature branch. Test the Vercel Preview in Admin > Booked Clients.
4. Test `Same lender`, `Other lenders`, and `All` tabs. Your current Halifax test booking may show zero matches because the sampled Nationwide fixed rate is higher than the booked Halifax rate. This is expected.

## Limitations

The Supabase view is a *preliminary* rate-only candidate feed. It currently infers product rate type from lender product names, and the existing feed is unverified. It cannot confirm product availability, client eligibility, lender rebooking rules, total costs, or suitability. No automated rebooking, emails, or adviser notifications are enabled. Future intermediary feeds should carry structured rate type and verified eligibility data.
