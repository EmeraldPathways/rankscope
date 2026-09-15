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
  const keyword = params.get("keyword")?.trim() || "";
  let domain: string;
  try { domain = cleanDomain(params.get("domain") || ""); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid domain." }, { status: 400 }); }
  if (keyword.length < 3 || keyword.length > 120) return Response.json({ error: "Enter a keyword containing 3–120 characters." }, { status: 400 });
  try {
    const result = await dataForSeo("serp/google/organic/live/regular", {
      keyword,
      target: `${domain}*`,
      location_name: "Ireland",
      language_code: "en",
      device: "mobile",
      depth: 30,
    });
    const root = firstObject(result);
    const items = objectArray(root.items);
    const match = items.find((item) => stringValue(item.url).includes(domain)) || items[0];
    return Response.json({
      source: "DataForSEO Live SERP",
      domain,
      keyword,
      checkedAt: new Date().toISOString(),
      position: match ? numberValue(match.rank_group || match.rank_absolute) || null : null,
      url: match ? stringValue(match.url) : "",
      title: match ? stringValue(match.title) : "",
      device: "mobile",
      location: "Ireland",
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Position check failed." }, { status: 502 });
  }
}
