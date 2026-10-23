
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

function validToken(actual, expected) {
  if (
    typeof actual !== 'string' ||
    typeof expected !== 'string' ||
    !expected
  ) {
    return false;
  }

  const a = Buffer.from(actual);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (process.env.ENABLE_TEST_SUBSCRIPTIONS !== 'true') {
    return res.status(503).json({
      error: 'Test reporting is disabled',
    });
  }

  if (
    !validToken(
      req.headers['x-test-subscription-token'],
      process.env.SUBSCRIPTION_TEST_TOKEN
    )
  ) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      error: 'Server configuration incomplete',
    });
  }

  try {
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const observations = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('mortgage_rate_history')
        .select(
          'lender,scenario_key,product_name,ltv_percent,' +
          'rate_percent,product_fee_gbp,observed_at,id'
        )
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      observations.push(...(data || []));

      if (!data || data.length < pageSize) break;

      if (offset >= 49500) {
        return res.status(413).json({
          error: 'History exceeds reporting limit',
        });
      }
    }

    const grouped = new Map();

    for (const row of observations) {
      const key = JSON.stringify([
        row.lender,
        row.scenario_key,
        row.product_name,
        Number(row.ltv_percent),
      ]);

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const changes = [];
    let insufficientHistory = 0;

    for (const rows of grouped.values()) {
      rows.sort(
        (a, b) =>
          new Date(a.observed_at) - new Date(b.observed_at) ||
          a.id - b.id
      );

      if (rows.length < 2) {
        insufficientHistory++;
        continue;
      }

      for (let i = 1; i < rows.length; i++) {
        const previous = rows[i - 1];
        const current = rows[i];

        const rateChanged =
          Number(previous.rate_percent) !==
          Number(current.rate_percent);

        const feeChanged =
          previous.product_fee_gbp == null ||
          current.product_fee_gbp == null
            ? previous.product_fee_gbp !== current.product_fee_gbp
            : Number(previous.product_fee_gbp) !==
              Number(current.product_fee_gbp);

        if (!rateChanged && !feeChanged) continue;

        changes.push({
          lender: current.lender,
          scenario_key: current.scenario_key,
          product_name: current.product_name,
          ltv_percent: current.ltv_percent,
          observed_at: current.observed_at,
          status:
            rateChanged && feeChanged
              ? 'rate_and_fee_changed'
              : rateChanged
                ? 'rate_changed'
                : 'fee_changed',
          old_rate: previous.rate_percent,
          new_rate: current.rate_percent,
          old_fee: previous.product_fee_gbp,
          new_fee: current.product_fee_gbp,
        });
      }
    }

    return res.status(200).json({
      mode: 'read_only_dry_run',
      emails_sent: 0,
      historical_observations: observations.length,
      unique_products: grouped.size,
      products_without_comparison_history: insufficientHistory,
      confirmed_changes: changes.length,
      changes,
    });
  } catch (error) {
    console.error(
      'Rate-change report failed:',
      error.code || error.name || 'unknown'
    );

    return res.status(500).json({
      error: 'Could not generate rate-change report',
    });
  }
}

