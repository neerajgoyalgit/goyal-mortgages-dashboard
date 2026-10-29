import { createClient } from '@supabase/supabase-js';

const respond = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { error: 'Method not allowed.' });
  }
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    RESEND_API_KEY: resendKey, RATE_ALERT_TO_EMAIL: recipient,
    RATE_ALERT_FROM_EMAIL: sender } = process.env;
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !publicKey || !resendKey || !recipient || !sender)
    return respond(res, 503, { error: 'Missing server configuration.' });
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token) return respond(res, 401, { error: 'Admin sign-in required.' });
  try {
    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user?.id || !user.email_confirmed_at) return respond(res, 401, { error: 'Verified sign-in required.' });
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: admin, error: adminError } = await db.from('dashboard_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return respond(res, 403, { error: 'Administrator access required.' });

    // One-off delivery test. Never accept recipient, sender, or message content from the request.
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
      console.error('Resend test delivery failed', response.status, result?.name || 'provider_error');
      return respond(res, 502, { error: 'Email provider rejected the test.', provider_status: response.status,
        provider_message: typeof result?.message === 'string' ? result.message.slice(0, 250) : undefined });
    }
    return respond(res, 200, { sent: true, email_id: result.id || null, message: 'Test email accepted by Resend; check inbox and spam.' });
  } catch (error) {
    console.error('Broker test email error', error?.name || 'unknown');
    return respond(res, 500, { error: 'Unable to send test email.' });
  }
}
