
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const postcode = String(req.query.postcode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

  // Phase 2 initially supports E16 postcodes only.
  if (!/^E16[0-9][A-Z]{2}$/.test(postcode)) {
    return res.status(400).json({
      error: "Please enter a valid E16 postcode."
    });
  }

  const apiKey = process.env.IDEAL_POSTCODES_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Address lookup is not configured."
    });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const url = new URL(
      `https://api.ideal-postcodes.co.uk/v1/postcodes/${postcode}`
    );

    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Address provider is temporarily unavailable."
      });
    }

    const data = await response.json();

    const addresses = (data.result || []).map((item) => ({
      address: [
        item.line_1,
        item.line_2,
        item.line_3,
        item.post_town,
        item.postcode
      ].filter(Boolean).join(", "),
      uprn: item.uprn || null,
      line_1: item.line_1 || ""
    }));

    return res.status(200).json({
      postcode,
      count: addresses.length,
      addresses
    });
  } catch (error) {
    console.error("Address lookup failed:", error.message);

    return res.status(502).json({
      error: "Unable to retrieve addresses. Please try again."
    });
  }
}

