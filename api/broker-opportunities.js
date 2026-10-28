import { createClient } from '@supabase/supabase-js';

const send = (res, status, body) => res.status(status).json(body);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return send(res, 400, { error: 'Invalid page.' });
    const lenderFilter = String(req.query.lender_filter || 'all');
    if (!['same', 'other', 'all'].includes(lenderFilter)) return send(res, 400, { error: 'Invalid lender filter.' });
    const from = (page - 1) * 20;
    let query = db.from('broker_rate_review_candidates')
      .select('broker_client_id,client_name,booked_lender,booked_product_name,booked_rate_percent,mortgage_amount_gbp,client_ltv_percent,application_status,expected_completion_date,candidate_rate_id,candidate_lender,candidate_product_name,candidate_rate_percent,candidate_product_fee_gbp,candidate_max_ltv_percent,product_status,verified_at,observed_at,same_lender,rate_reduction_percentage_points,review_priority,review_status', { count: 'exact' })
      .order('review_priority', { ascending: true })
      .order('candidate_rate_percent', { ascending: true })
      .range(from, from + 19);
    if (lenderFilter !== 'all') query = query.eq('same_lender', lenderFilter === 'same');
    const { data, error, count } = await query;
    if (error) throw error;
    return send(res, 200, { candidates: data || [], page, total: count || 0, has_more: from + (data || []).length < (count || 0), informational_only: true, lender_filter: lenderFilter });
  } catch (error) {
    console.error('Broker opportunity API error:', error?.code || error?.name);
    return send(res, 500, { error: 'Unable to load rate review candidates.' });
  }
}
