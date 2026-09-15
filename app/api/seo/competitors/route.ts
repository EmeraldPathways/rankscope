import {
  cleanDomain,
  dataForSeo,
  firstObject,
  numberValue,
  objectArray,
  requireSeoOwner,
  stringValue,
} from "../../../../lib/dataforseo";

export async function GET(request: Request) {
  const denied = requireSeoOwner(request);
  if (denied) return denied;
  let target: string;
  try { target = cleanDomain(new URL(request.url).searchParams.get("domain") || ""); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid domain." }, { status: 400 }); }
  try {
    const result = await dataForSeo("dataforseo_labs/google/competitors_domain/live", {
      target,
      location_name: "Ireland",
      language_code: "en",
      exclude_top_domains: true,
      limit: 25,
    });
    const root = firstObject(result);
    const items = objectArray(root.items).map((item) => {
      const metrics = ((item.full_domain_metrics || {}) as Record<string, unknown>).organic as Record<string, unknown> || {};
      return {
        domain: stringValue(item.domain),
        intersections: numberValue(item.intersections),
        traffic: numberValue(metrics.etv),
        keywords: numberValue(metrics.count),
        averagePosition: numberValue(item.avg_position),
      };
    }).filter((item) => item.domain);
    return Response.json({ source: "DataForSEO", target, items, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "private, max-age=900" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Competitor research failed." }, { status: 502 });
  }
}
