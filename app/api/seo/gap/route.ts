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
  const params = new URL(request.url).searchParams;
  let site: string;
  let competitor: string;
  try {
    site = cleanDomain(params.get("site") || "");
    competitor = cleanDomain(params.get("competitor") || "");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid domain." }, { status: 400 });
  }
  if (site === competitor) return Response.json({ error: "Enter two different domains." }, { status: 400 });
  try {
    const result = await dataForSeo("dataforseo_labs/google/domain_intersection/live", {
      target1: competitor,
      target2: site,
      intersections: false,
      location_name: "Ireland",
      language_code: "en",
      item_types: ["organic"],
      limit: 50,
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
    });
    const root = firstObject(result);
    const items = objectArray(root.items).map((item) => {
      const keywordData = (item.keyword_data || {}) as Record<string, unknown>;
      const info = (keywordData.keyword_info || {}) as Record<string, unknown>;
      const properties = (item.keyword_properties || {}) as Record<string, unknown>;
      const intent = (keywordData.search_intent_info || {}) as Record<string, unknown>;
      const serp = (item.first_domain_serp_element || item.serp_element || {}) as Record<string, unknown>;
      return {
        keyword: stringValue(keywordData.keyword || item.keyword),
        intent: stringValue(intent.main_intent, "informational"),
        volume: numberValue(info.search_volume),
        difficulty: numberValue(properties.keyword_difficulty),
        cpc: numberValue(info.cpc),
        competitorPosition: numberValue(serp.rank_group || serp.rank_absolute),
      };
    }).filter((item) => item.keyword);
    return Response.json({ source: "DataForSEO", site, competitor, items, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "private, max-age=900" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Keyword gap analysis failed." }, { status: 502 });
  }
}
