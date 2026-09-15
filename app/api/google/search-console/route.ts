import {
  getGoogleAccessToken,
  requireOwner,
  runtimeEnv,
} from "../../../../lib/google-integrations";

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;

  const siteUrl = runtimeEnv().GSC_SITE_URL;
  if (!siteUrl) {
    return Response.json({ error: "Search Console site URL is not configured." }, { status: 503 });
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 28);
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["query"],
        rowLimit: 25,
      }),
    });
    const payload = (await response.json()) as {
      rows?: Array<{ keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message || "Search Console request failed.");
    const rows = (payload.rows || []).map((row) => ({
      query: row.keys?.[0] || "",
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }));
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const weightedPosition = impressions
      ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions
      : 0;
    return Response.json({
      source: "Google Search Console",
      period: "28 days",
      fetchedAt: new Date().toISOString(),
      summary: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: weightedPosition },
      rows,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Search Console request failed." }, { status: 502 });
  }
}
