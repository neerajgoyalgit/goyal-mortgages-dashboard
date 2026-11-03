import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const send = (res, status, data) => res.status(status).json(data);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !secret || !publicKey) return send(res, 503, { error: 'Server configuration incomplete.' });
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token) return send(res, 401, { error: 'Admin sign-in required.' });
  try {
    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user?.id || !user.email_confirmed_at) return send(res, 401, { error: 'Verified sign-in required.' });
    const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: admin, error: adminError } = await db.from('dashboard_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return send(res, 403, { error: 'Administrator access required.' });

    // Admin-only, explicit one-off Resend delivery test. No client data is sent.
    if (req.method === 'POST' && req.body?.action === 'test_email') {
      const { RESEND_API_KEY: resendKey, RATE_ALERT_TO_EMAIL: recipient,
        RATE_ALERT_FROM_EMAIL: sender } = process.env;
      if (!resendKey || !recipient || !sender) return send(res, 503, { error: 'Email configuration incomplete.' });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: sender,
          to: [recipient],
          subject: 'Goyal Mortgages — Test notification',
          text: 'Your Goyal Mortgages adviser notification email integration is working. This is a test only; no mortgage opportunity has been detected.'
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Resend test failed:', response.status, result?.name || 'provider_error');
        return send(res, 502, { error: 'Email provider rejected the test.', provider_status: response.status,
          provider_message: typeof result?.message === 'string' ? result.message.slice(0, 250) : undefined });
      }
      return send(res, 200, { sent: true, email_id: result.id || null,
        message: 'Test email accepted by Resend; check inbox and spam.' });
    }
    // Temporary Step 4K: explicitly invoked by a signed-in dashboard administrator.
    // Creates only isolated TEST_ONLY rows; never writes to mortgage_rates.
    if (req.method === 'POST' && req.body?.action === 'test_live_notification') {
      if (req.body?.confirmation !== 'RUN_STEP_4K_ONE_EMAIL') {
        return send(res, 400, { error: 'Explicit test confirmation required.' });
      }
      const { RESEND_API_KEY: resendKey, RATE_ALERT_TO_EMAIL: recipient,
        RATE_ALERT_FROM_EMAIL: sender } = process.env;
      if (!resendKey || !recipient || !sender) return send(res, 503, { error: 'Email configuration incomplete.' });
      let testClientId = null;
      let testOpportunityId = null;
      let result = null;
      let cleanupError = null;
      try {
        const marker = `STEP4K_TEST_ONLY_${randomUUID()}`;
        const { data: testClient, error: clientError } = await db.from('broker_clients').insert({
          client_name: marker, lender: 'TEST_ONLY', booked_product_name: 'TEST_ONLY fixed',
          booked_rate_percent: 5.5, mortgage_amount_gbp: 150000,
          property_value_gbp: 250000, mortgage_purpose: 'purchase',
          rate_type: 'fixed', initial_period_months: 24,
          application_status: 'submitted', monitoring_enabled: false,
          notes: 'STEP4K TEST_ONLY; temporary; no real borrower or lender'
        }).select('id').single();
        if (clientError) throw clientError;
        testClientId = testClient.id;
        const { data: opportunity, error: opportunityError } = await db.from('broker_rate_opportunities').insert({
          broker_client_id: testClientId, candidate_lender: 'TEST_ONLY',
          candidate_product_name: 'STEP4K TEST_ONLY fixed (not a real product)',
          candidate_rate_percent: 4.5, booked_rate_percent_at_detection: 5.5,
          same_lender: true, priority: 'review', status: 'new',
          eligibility_verified: false, fee_reviewed: false,
          opportunity_fingerprint: `step4k:${randomUUID()}`,
          adviser_notes: 'STEP4K TEST_ONLY: temporary integration test; not actionable'
        }).select('id').single();
        if (opportunityError) throw opportunityError;
        testOpportunityId = opportunity.id;
        const token1 = randomUUID();
        const { data: firstClaim, error: firstClaimError } = await db.rpc('broker_claim_rate_notification', {
          p_id: testOpportunityId, p_token: token1
        });
        if (firstClaimError) throw firstClaimError;
        if (!firstClaim) throw new Error('First notification claim was not granted');
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: sender, to: [recipient],
            subject: 'Goyal Mortgages — STEP 4K TEST ONLY',
            text: 'STEP 4K TEST ONLY. This is a fictional mortgage opportunity used to validate adviser notifications. No real product or client is involved. No action required.'
          })
        });
        const provider = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`Resend rejected test email (HTTP ${response.status})`);
        const { data: finalized, error: finalizeError } = await db.rpc('broker_finish_rate_notification', {
          p_id: testOpportunityId, p_token: token1, p_sent: true
        });
        if (finalizeError) throw finalizeError;
        if (!finalized) throw new Error('Could not finalize accepted email in database');
        const { data: notificationRow, error: readError } = await db.from('broker_rate_opportunities')
          .select('adviser_notified_at').eq('id', testOpportunityId).single();
        if (readError) throw readError;
        const { data: secondClaim, error: secondClaimError } = await db.rpc('broker_claim_rate_notification', {
          p_id: testOpportunityId, p_token: randomUUID()
        });
        if (secondClaimError) throw secondClaimError;
        result = { provider_accepted: true, provider_email_id: provider?.id || null,
          notification_recorded: Boolean(notificationRow?.adviser_notified_at),
          duplicate_claim_blocked: !secondClaim, email_attempts: 1 };
      } catch (error) {
        result = { error: error?.message || 'Test failed', provider_acceptance_unknown: true };
      } finally {
        // Delete only rows created by this invocation, in FK-safe order.
        if (testOpportunityId) {
          const { error } = await db.from('broker_rate_opportunities').delete().eq('id', testOpportunityId);
          if (error) cleanupError = 'Opportunity cleanup failed';
        }
        if (testClientId) {
          const { error } = await db.from('broker_clients').delete().eq('id', testClientId);
          if (error) cleanupError = cleanupError || 'Test client cleanup failed';
        }
      }
      return send(res, result?.error || cleanupError ? 500 : 200, {
        test: 'step4k', ...result, cleanup_ok: !cleanupError,
        cleanup_error: cleanupError, test_client_id: cleanupError ? testClientId : undefined,
        test_opportunity_id: cleanupError ? testOpportunityId : undefined,
        note: 'Resend acceptance does not guarantee inbox delivery.'
      });
    }
    if (req.method === 'POST' && req.body?.action !== undefined && req.body?.action !== 'scan') {
      return send(res, 400, { error: 'Unknown action.' });
    }

    if (req.method === 'GET') {
      const { data, error } = await db.from('broker_rate_opportunities')
        .select('id,broker_client_id,candidate_lender,candidate_product_name,candidate_rate_percent,candidate_product_fee_gbp,booked_rate_percent_at_detection,same_lender,priority,status,first_detected_at,last_detected_at,adviser_notes')
        .order('first_detected_at', { ascending: false }).limit(100);
      if (error) throw error;
      return send(res, 200, { opportunities: data || [], informational_only: true });
    }

    if (req.method === 'PATCH') {
      const { id, status, adviser_notes } = req.body || {};
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
          !['new', 'reviewing', 'switch_requested', 'rebooked', 'not_suitable', 'dismissed'].includes(status) ||
          (adviser_notes !== undefined && (typeof adviser_notes !== 'string' || adviser_notes.length > 2000))) {
        return send(res, 400, { error: 'Invalid review update.' });
      }
      const changes = { status, updated_at: new Date().toISOString() };
      if (adviser_notes !== undefined) changes.adviser_notes = adviser_notes;
      const { data, error } = await db.from('broker_rate_opportunities').update(changes).eq('id', id).select('id,status').maybeSingle();
      if (error) throw error;
      return data ? send(res, 200, { opportunity: data }) : send(res, 404, { error: 'Opportunity not found.' });
    }

    // Manual scan only. Only recent, product-reviewed candidates are persisted;
    // this is NOT lender eligibility verification or permission to switch.
    const { data: candidates, error: candidateError } = await db.from('broker_rate_review_candidates')
      .select('broker_client_id,booked_rate_percent,candidate_rate_id,candidate_lender,candidate_product_name,candidate_rate_percent,candidate_product_fee_gbp,same_lender,review_status')
      .eq('review_status', 'product_review_required').limit(500);
    if (candidateError) throw candidateError;
    let inserted = 0;
    let alreadySeen = 0;
    let emailsSent = 0;
    let emailFailures = 0;
    let emailClaimedElsewhere = 0;
    const opportunityIds = new Set();
    for (const item of candidates || []) {
      const fingerprint = `v1:${item.candidate_rate_id}:${item.candidate_rate_percent}:${item.candidate_product_fee_gbp ?? 'none'}`;
      const record = {
        broker_client_id: item.broker_client_id,
        candidate_rate_id: item.candidate_rate_id,
        candidate_lender: item.candidate_lender,
        candidate_product_name: item.candidate_product_name,
        candidate_rate_percent: item.candidate_rate_percent,
        candidate_product_fee_gbp: item.candidate_product_fee_gbp,
        booked_rate_percent_at_detection: item.booked_rate_percent,
        same_lender: item.same_lender,
        priority: item.same_lender ? 'high' : 'review',
        status: 'new',
        eligibility_verified: false,
        fee_reviewed: false,
        opportunity_fingerprint: fingerprint
      };
      const { data: saved, error } = await db.from('broker_rate_opportunities').insert(record).select('id').single();
      if (error?.code === '23505') {
        alreadySeen++;
        // Retry only an opportunity still present in today's eligible candidate view.
        const { data: existing, error: lookupError } = await db.from('broker_rate_opportunities')
          .select('id').eq('broker_client_id', item.broker_client_id)
          .eq('opportunity_fingerprint', fingerprint).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.id) opportunityIds.add(existing.id);
        continue;
      }
      if (error) throw error;
      inserted++;
      opportunityIds.add(saved.id);
    }

    const { RESEND_API_KEY: resendKey, RATE_ALERT_TO_EMAIL: recipient,
      RATE_ALERT_FROM_EMAIL: sender } = process.env;
    // Only send alerts for currently eligible, newly saved or unnotified records.
    for (const id of opportunityIds) {
      const claimToken = randomUUID();
      const { data: claimed, error: claimError } = await db.rpc('broker_claim_rate_notification', {
        p_id: id, p_token: claimToken
      });
      if (claimError) throw claimError;
      if (!claimed) { emailClaimedElsewhere++; continue; }
      let sent = false;
      try {
        if (!resendKey || !recipient || !sender) throw new Error('Email configuration incomplete');
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: sender, to: [recipient],
            subject: 'Goyal Mortgages — New adviser rate review opportunity',
            text: 'A potential mortgage rate improvement is ready for adviser review in your private Goyal Mortgages dashboard. Eligibility, availability and fees remain unverified. No client action has been taken.'
          })
        });
        if (!response.ok) throw new Error(`Email provider status ${response.status}`);
        sent = true;
      } catch (emailError) {
        emailFailures++;
        console.error('Opportunity email delivery failed:', emailError?.message || 'error');
      }
      // If the provider accepted the email but this DB update fails, retry can
      // produce a duplicate. Exactly-once delivery cannot be guaranteed here.
      const { data: finalized, error: finishError } = await db.rpc('broker_finish_rate_notification', {
        p_id: id, p_token: claimToken, p_sent: sent
      });
      if (finishError || !finalized) {
        console.error('Notification claim finalization failed:', finishError?.code || 'claim_expired');
        if (sent) emailFailures++;
      } else if (sent) {
        emailsSent++;
      }
    }
    return send(res, 200, { scanned: (candidates || []).length, inserted, already_seen: alreadySeen, emails_sent: emailsSent, email_failures: emailFailures, email_already_claimed_or_notified: emailClaimedElsewhere, automatic_rebookings: 0 });
  } catch (error) {
    console.error('Broker saved opportunities API error:', error?.code || error?.name);
    return send(res, 500, { error: 'Unable to process adviser opportunities.' });
  }
}
