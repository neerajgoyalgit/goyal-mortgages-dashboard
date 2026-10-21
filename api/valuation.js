
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const uprn = String(req.query.uprn || "").trim();

  if (!/^\d{1,12}$/.test(uprn)) {
    return res.status(400).json({ error: "Invalid UPRN." });
  }

  const apiKey = process.env.CHIMNIE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Chimnie API key is not configured."
    });
  }

  try {
    const url = new URL(
      `https://api.chimnie.com/residential/uprn/${uprn}`
    );

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error("Chimnie API status:", response.status);

      return res.status(response.status === 404 ? 404 : 502).json({
        error: response.status === 404
          ? "Property valuation not found."
          : "Unable to retrieve property valuation."
      });
    }

    const data = await response.json();

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json(data);

  } catch (error) {
    console.error("Chimnie request failed:", error.message);

    return res.status(502).json({
      error: "Property valuation service unavailable."
    });
  }
}

