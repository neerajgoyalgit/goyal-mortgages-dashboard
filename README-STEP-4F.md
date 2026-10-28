# Step 4F — Saved adviser review queue

- New private `/api/broker-saved-opportunities` endpoint: GET saved opportunities, POST manual scan, PATCH review status.
- All actions require verified Supabase authentication and dashboard-admin membership; privileged credentials stay server-side.
- Scan persists **only** candidates with `review_status=product_review_required`, not all preliminary comparisons. Even these require human suitability, fee and lender-criteria checks.
- Deduplication uses existing unique constraint on `(broker_client_id, opportunity_fingerprint)`. Repeated scans do not reset previously reviewed statuses.
- No scheduler, emails, automatic product switches or client communications.
- The current Nationwide products are `unverified`, so **zero saved opportunities is expected**.
- To test, deploy Preview, open Admin > Booked Clients, then use Saved adviser review queue > Scan for new opportunities.
- Existing API and preliminary comparison section remain unchanged.
