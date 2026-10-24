
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const ALLOWED_LENDERS = new Set(['Halifax', 'Nationwide']);
const ALLOWED_PURPOSES = new Set(['purchase', 'remortgage']);
const ALLOWED_DIRECTIONS = new Set(['decrease', 'increase', 'both']);

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function validToken(actual, expected) {
  if (typeof actual !== 'string' || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validDate(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function validAmount(value) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 999999999999.99 &&
    Number.isInteger(Math.round(value * 100));
}

export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') {
    return reply(res, 405, { error: 'Method not allowed' });
  }

  if (process.env.ENABLE_TEST_SUBSCRIPTIONS !== 'true') {
    return reply(res, 503, {
      error: 'Private registrations are disabled'
    });
  }

  if (!validToken(
    req.headers['x-test-subscription-token'],
    process.env.SUBSCRIPTION_TEST_TOKEN
  )) {
    return reply(res, 401, { error: 'Unauthorised' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return reply(res, 503, {
      error: 'Server configuration incomplete'
    });
  }

  const b = req.body;

  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    return reply(res, 400, { error: 'Expected JSON object' });
  }

  const email = typeof b.email === 'string'
    ? b.email.trim().toLowerCase() : '';

  const firstName = typeof b.first_name === 'string'
    ? b.first_name.trim() : '';

  const surname = typeof b.surname === 'string'
    ? b.surname.trim() : null;

  const phone = typeof b.phone === 'string'
    ? b.phone.trim() : null;

  if (!email || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(res, 400, { error: 'Invalid email address' });
  }

  if (!firstName || firstName.length > 100 ||
      (surname !== null && (!surname || surname.length > 100))) {
    return reply(res, 400, { error: 'Invalid customer name' });
  }

  if (phone !== null &&
      (phone.length < 7 || phone.length > 30 ||
       !/^\+?[\d ()-]+$/.test(phone))) {
    return reply(res, 400, { error: 'Invalid phone number' });
  }

  if (!ALLOWED_PURPOSES.has(b.mortgage_purpose)) {
    return reply(res, 400, { error: 'Invalid mortgage purpose' });
  }

  if (!Array.isArray(b.lenders) ||
      b.lenders.length < 1 || b.lenders.length > 2 ||
      !b.lenders.every(x => ALLOWED_LENDERS.has(x))) {
    return reply(res, 400, { error: 'Invalid lenders' });
  }

  if (!validDate(b.mortgage_date)) {
    return reply(res, 400, { error: 'Invalid mortgage date' });
  }

  if (!validAmount(b.property_value_gbp) ||
      !validAmount(b.mortgage_amount_gbp) ||
      b.mortgage_amount_gbp > b.property_value_gbp) {
    return reply(res, 400, {
      error: 'Invalid property value or mortgage amount'
    });
  }

  const direction = b.alert_direction ?? 'decrease';

  if (!ALLOWED_DIRECTIONS.has(direction)) {
    return reply(res, 400, { error: 'Invalid alert direction' });
  }

  const products = b.product_types ?? [];

  if (!Array.isArray(products) ||
      products.length > 10 ||
      !products.every(x =>
        typeof x === 'string' &&
        x.length >= 1 && x.length <= 100)) {
    return reply(res, 400, { error: 'Invalid product preferences' });
  }

  const payload = {
    email,
    first_name: firstName,
    surname,
    phone,
    mortgage_purpose: b.mortgage_purpose,
    lenders: [...new Set(b.lenders)],
    mortgage_date: b.mortgage_date,
    mortgage_date_type: b.mortgage_purpose === 'remortgage'
      ? 'deal_expiry'
      : 'expected_purchase',
    property_value_gbp: b.property_value_gbp,
    mortgage_amount_gbp: b.mortgage_amount_gbp,
    alert_direction: direction,
    product_types: [...new Set(products)]
  };

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  try {
    const { data, error } = await supabase.rpc(
      'register_test_mortgage_customer',
      { p_data: payload }
    );

    if (error?.code === '23505') {
      return reply(res, 409, {
        error: 'Email already registered'
      });
    }

    if (error) {
      console.error('Registration failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      return reply(res, 500, {
        error: 'Could not save registration'
      });
    }

    return reply(res, 201, {
      success: true,
      registration_id: data,
      status: 'pending',
      message: 'Test registration saved. No emails sent.'
    });
  } catch (error) {
    console.error('Registration request failed:', error?.name);
    return reply(res, 500, {
      error: 'Could not save registration'
    });
  }
}
