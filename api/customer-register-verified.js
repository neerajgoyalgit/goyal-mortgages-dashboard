import { createClient } from '@supabase/supabase-js';

const allowedLenders = new Set(['Halifax', 'Nationwide']);
const allowedPurposes = new Set(['purchase', 'remortgage']);
const allowedDirections = new Set(['decrease', 'increase', 'both']);
const allowedProducts = new Set(['Fixed', 'Tracker']);
const send = (res, code, body) => res.status(code).setHeader('Cache-Control', 'no-store').json(body);
const validDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x + 'T00:00:00Z')) && new Date(x + 'T00:00:00Z').toISOString().slice(0, 10) === x;
const validAmount = x => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 999999999999.99 && Math.abs(x * 100 - Math.round(x * 100)) < 0.00001;

export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (process.env.ENABLE_VERIFIED_REGISTRATIONS !== 'true') return send(res, 503, { error: 'Registration is not enabled' });
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PUBLISHABLE_KEY) return send(res, 503, { error: 'Server configuration incomplete' });
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) return send(res, 401, { error: 'Please sign in with a verified email first' });
  try {
  const publicClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } = {}, error: authError } = await publicClient.auth.getUser(match[1]);
  if (authError || !user?.id || !user.email || !user.email_confirmed_at) return send(res, 401, { error: 'Verified email required' });

  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { error: 'Expected JSON object' });
  const firstName = typeof b.first_name === 'string' ? b.first_name.trim() : '';
  const surname = typeof b.surname === 'string' ? b.surname.trim() : '';
  const phone = typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : null;
  if (!firstName || firstName.length > 100 || !surname || surname.length > 100) return send(res, 400, { error: 'Invalid name' });
  if (phone && (phone.length < 7 || phone.length > 30 || !/^\+?[\d ()-]+$/.test(phone))) return send(res, 400, { error: 'Invalid phone number' });
  if (!allowedPurposes.has(b.mortgage_purpose) || !validDate(b.mortgage_date)) return send(res, 400, { error: 'Invalid mortgage details' });
  if (!Array.isArray(b.lenders) || b.lenders.length < 1 || b.lenders.length > 2 || !b.lenders.every(x => allowedLenders.has(x))) return send(res, 400, { error: 'Invalid lenders' });
  if (!validAmount(b.property_value_gbp) || !validAmount(b.mortgage_amount_gbp) || b.mortgage_amount_gbp > b.property_value_gbp) return send(res, 400, { error: 'Invalid mortgage amounts' });
  if (!allowedDirections.has(b.alert_direction)) return send(res, 400, { error: 'Invalid alert direction' });
  if (!Array.isArray(b.product_types) || b.product_types.length > 2 || !b.product_types.every(x => allowedProducts.has(x))) return send(res, 400, { error: 'Invalid product types' });
  if (b.privacy_acknowledged !== true) return send(res, 400, { error: 'Privacy acknowledgement required' });

  const payload = {
    // Identity must come from Supabase Auth, never from submitted form fields.
    auth_user_id: user.id,
    email: user.email.trim().toLowerCase(),
    first_name: firstName, surname, phone,
    mortgage_purpose: b.mortgage_purpose, lenders: [...new Set(b.lenders)],
    mortgage_date: b.mortgage_date,
    mortgage_date_type: b.mortgage_purpose === 'remortgage' ? 'deal_expiry' : 'expected_purchase',
    property_value_gbp: b.property_value_gbp, mortgage_amount_gbp: b.mortgage_amount_gbp,
    alert_direction: b.alert_direction, product_types: [...new Set(b.product_types)]
  };
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await service.rpc('register_test_mortgage_customer_v2', { p_data: payload });
    if (error) {
      console.error('Verified registration V2 error code:', error.code);
      if (error.code === '23505') return send(res, 409, { error: 'This email is already registered. Please try signing in again.' });
      return send(res, 500, { error: 'Could not save registration' });
    }
    if (!data?.registration_id || typeof data.created !== 'boolean') return send(res, 500, { error: 'Unexpected registration response' });
    return send(res, data.created ? 201 : 200, {
      success: true, registration_id: data.registration_id, status: 'pending',
      existing: !data.created,
      message: data.created ? 'Registration saved. Mortgage alerts are not yet active.' : 'Your existing registration was found. Mortgage alerts are not yet active.'
    });
  } catch (error) {
    console.error('Verified registration V2 exception:', error?.name);
    return send(res, 500, { error: 'Could not save registration' });
  }
}
