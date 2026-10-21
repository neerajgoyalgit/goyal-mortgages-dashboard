
export default async function handler(req, res) {
  // Allow GET requests only
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // Validate UPRN
  const uprn = String(req.query.uprn || "").trim();

  if (!/^\d{1,12}$/.test(uprn)) {
    return res.status(400).json({
      error: "Please provide a valid UPRN."
    });
  }

  // Read Chimnie API key securely from Vercel
  const apiKey = process.env.CHIMNIE_API_KEY?.trim();

  if (!apiKey) {
    console.error("CHIMNIE_API_KEY is missing");

    return res.status(500).json({
      error: "Chimnie API is not configured."
    });
  }

  try {
    // Chimnie residential property endpoint
    const url = new URL(
      `https://api.chimnie.com/residential/uprn/${uprn}`
    );

    // Use Chimnie's recommended Bearer authentication
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(15000)
    });

    // Handle upstream API errors
    if (!response.ok) {
      console.error(
        "Chimnie API returned status:",
        response.status
      );

      return res.status(502).json({
        error: "Unable to retrieve property valuation.",
        upstreamStatus: response.status
      });
    }

    // Parse Chimnie response
    const data = await response.json();

    // Prevent caching of property data
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json(data);

  } catch (error) {
    console.error(
      "Chimnie valuation request failed:",
      error.message
    );

    return res.status(502).json({
      error: "Property valuation service unavailable."
    });
  }
}

