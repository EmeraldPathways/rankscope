import {
  getGoogleAccessToken,
  requireOwner,
  runtimeEnv,
} from "../../../../lib/google-integrations";

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;

  const propertyId = runtimeEnv().GA4_PROPERTY_ID;
  if (!propertyId) {
    return Response.json({ error: "GA4 property ID is not configured." }, { status: 503 });
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }],
        metricAggregations: ["TOTAL"],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 25,
      }),
    });
    const payload = (await response.json()) as {
      rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
      totals?: Array<{ metricValues?: Array<{ value?: string }> }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message || "Analytics request failed.");
    const numeric = (value?: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
    const rows = (payload.rows || []).map((row) => ({
      page: row.dimensionValues?.[0]?.value || "/",
      sessions: numeric(row.metricValues?.[0]?.value),
      engagedSessions: numeric(row.metricValues?.[1]?.value),
      keyEvents: numeric(row.metricValues?.[2]?.value),
    }));
    const total = payload.totals?.[0]?.metricValues || [];
    const sessions = numeric(total[0]?.value) || rows.reduce((sum, row) => sum + row.sessions, 0);
    const engagedSessions = numeric(total[1]?.value) || rows.reduce((sum, row) => sum + row.engagedSessions, 0);
    const keyEvents = numeric(total[2]?.value) || rows.reduce((sum, row) => sum + row.keyEvents, 0);
    return Response.json({
      source: "Google Analytics 4",
      period: "28 days",
      fetchedAt: new Date().toISOString(),
      summary: { sessions, engagedSessions, engagementRate: sessions ? engagedSessions / sessions : 0, keyEvents },
      rows,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Analytics request failed." }, { status: 502 });
  }
}
