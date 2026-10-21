// Restricted Chimnie pilot. Before allowing more UPRNs, add a durable
// server-side quota and cache (for example, a managed Redis store).
const PILOT_UPRNS = new Set(['10094371142']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uprn = typeof req.query.uprn === 'string' ? req.query.uprn.trim() : '';
  if (!/^\d{1,12}$/.test(uprn)) {
    return res.status(400).json({ error: 'Invalid UPRN' });
  }
  if (!PILOT_UPRNS.has(uprn)) {
    return res.status(403).json({
      error: 'Automated valuation is currently available for selected pilot properties only.'
    });
  }

  const apiKey = process.env.CHIMNIE_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'Valuation service is not configured' });
  }

  try {
    const url = new URL(`https://api.chimnie.com/residential/uprn/${uprn}`);
    url.searchParams.set('fields', 'property.value.sale.property_value');

    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error('Chimnie API status:', response.status);
      return res.status(502).json({ error: 'Valuation temporarily unavailable' });
    }

    const data = await response.json();
    const propertyValue = Number(data?.property?.value?.sale?.property_value);
    if (!Number.isFinite(propertyValue) || propertyValue <= 0) {
      return res.status(502).json({ error: 'No valid valuation returned' });
    }

    // Cache at Vercel's CDN. Browsers do not retain the response.
    // CDN caching reduces repeat calls but does not guarantee one paid request.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
    return res.status(200).json({
      id: uprn,
      property: { value: { sale: { property_value: propertyValue } } }
    });
  } catch (error) {
    console.error('Chimnie valuation request failed:', error?.message);
    return res.status(502).json({ error: 'Valuation temporarily unavailable' });
  }
}
