import {
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
  const keyword = new URL(request.url).searchParams.get("keyword")?.trim() || "";
  if (keyword.length < 3 || keyword.length > 120) {
    return Response.json({ error: "Enter a keyword containing 3–120 characters." }, { status: 400 });
  }
  try {
    const result = await dataForSeo("dataforseo_labs/google/keyword_suggestions/live", {
      keyword,
      location_name: "Ireland",
      language_code: "en",
      include_seed_keyword: true,
      include_serp_info: true,
      limit: 50,
    });
    const root = firstObject(result);
    const items = objectArray(root.items).map((item) => {
      const keywordData = (item.keyword_data || {}) as Record<string, unknown>;
      const info = (keywordData.keyword_info || {}) as Record<string, unknown>;
      const properties = (item.keyword_properties || {}) as Record<string, unknown>;
      const intent = (keywordData.search_intent_info || {}) as Record<string, unknown>;
      return {
        keyword: stringValue(keywordData.keyword || item.keyword),
        intent: stringValue(intent.main_intent, "informational"),
        volume: numberValue(info.search_volume),
        difficulty: numberValue(properties.keyword_difficulty),
        cpc: numberValue(info.cpc),
        competition: numberValue(info.competition),
      };
    }).filter((item) => item.keyword);
    return Response.json({ source: "DataForSEO", keyword, items, fetchedAt: new Date().toISOString() }, { headers: { "cache-control": "private, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Keyword research failed." }, { status: 502 });
  }
}
