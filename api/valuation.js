
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const uprn = String(req.query.uprn || "").trim();

  if (!/^\d{1,12}$/.test(uprn)) {
    return res.status(400).json({
      error: "Invalid UPRN"
    });
  }

  const apiKey = process.env.CHIMNIE_API_KEY?.trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "CHIMNIE_API_KEY is not configured"
    });
  }

  try {
    const url = new URL(
      `https://api.chimnie.com/residential/uprn/${uprn}`
    );

    // Temporary authentication test using Chimnie's
    // documented query-parameter method.
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error("Chimnie API status:", response.status);

      return res.status(502).json({
        error: "Chimnie request failed",
        upstreamStatus: response.status
      });
    }

    const data = await response.json();

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json(data);

  } catch (error) {
    console.error("Chimnie request failed:", error.message);

    return res.status(502).json({
      error: "Property valuation service unavailable"
    });
  }
}

