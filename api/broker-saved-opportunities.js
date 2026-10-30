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
    for (const item of candidates || []) {
      // Product + observed rate + fee forms a stable, deduplicated event.
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
      const { error } = await db.from('broker_rate_opportunities').insert(record);
      if (error?.code === '23505') { alreadySeen++; continue; }
      if (error) throw error;
      inserted++;
    }
    return send(res, 200, { scanned: (candidates || []).length, inserted, already_seen: alreadySeen, emails_sent: 0, automatic_rebookings: 0 });
  } catch (error) {
    console.error('Broker saved opportunities API error:', error?.code || error?.name);
    return send(res, 500, { error: 'Unable to process adviser opportunities.' });
  }
}
