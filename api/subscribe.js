import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const ALLOWED_LENDERS = new Set(['Halifax', 'Nationwide']);
const ALLOWED_PURPOSES = new Set(['purchase', 'remortgage']);

function equalSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  // This endpoint is deliberately NOT a public signup endpoint.
  // It remains disabled until a private test token and explicit flag are configured.
  if (process.env.ENABLE_TEST_SUBSCRIPTIONS !== 'true') {
    return json(res, 503, { error: 'Test subscriptions are disabled' });
  }
  if (!equalSecret(req.headers['x-test-subscription-token'], process.env.SUBSCRIPTION_TEST_TOKEN)) {
    return json(res, 401, { error: 'Unauthorised' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, { error: 'Server configuration incomplete' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(res, 400, { error: 'Expected a JSON object' });
  }

  const { email, lenders, mortgage_purposes } = body;
  if (typeof email !== 'string' || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return json(res, 400, { error: 'Valid email required' });
  }
  if (!Array.isArray(lenders) || !lenders.length ||
      lenders.length > 2 || !lenders.every(v => typeof v === 'string' && ALLOWED_LENDERS.has(v))) {
    return json(res, 400, { error: 'Choose Halifax and/or Nationwide' });
  }
  if (!Array.isArray(mortgage_purposes) || !mortgage_purposes.length ||
      mortgage_purposes.length > 2 ||
      !mortgage_purposes.every(v => typeof v === 'string' && ALLOWED_PURPOSES.has(v))) {
    return json(res, 400, { error: 'Choose purchase and/or remortgage' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Test-only pending record. No consent is presumed and no alerts are sent.
  const { error } = await supabase.from('mortgage_alert_subscriptions').insert({
    email: email.trim().toLowerCase(),
    lenders: [...new Set(lenders)],
    mortgage_purposes: [...new Set(mortgage_purposes)],
    status: 'pending',
    consent_given_at: null,
    consent_source: 'private_api_test',
  });
  if (error?.code === '23505') return json(res, 409, { error: 'Test email already registered' });
  if (error) {
    console.error('Subscription insert failed:', error.code || 'unknown');
    return json(res, 500, { error: 'Could not save test subscription' });
  }
  return json(res, 201, { success: true, status: 'pending', message: 'Test registration saved; no alerts enabled' });
}
