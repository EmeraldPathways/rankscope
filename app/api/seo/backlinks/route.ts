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
    const [summaryResult, domainsResult] = await Promise.all([
      dataForSeo("backlinks/summary/live", { target, include_subdomains: true }),
      dataForSeo("backlinks/referring_domains/live", { target, include_subdomains: true, limit: 25, order_by: ["rank,desc"] }),
    ]);
    const summary = firstObject(summaryResult);
    const domainsRoot = firstObject(domainsResult);
    const domains = objectArray(domainsRoot.items).map((item) => ({
      domain: stringValue(item.domain),
      rank: numberValue(item.rank),
      backlinks: numberValue(item.backlinks),
      dofollow: numberValue(item.dofollow),
      firstSeen: stringValue(item.first_seen),
    })).filter((item) => item.domain);
    return Response.json({
      source: "DataForSEO",
      target,
      fetchedAt: new Date().toISOString(),
      summary: {
        rank: numberValue(summary.rank),
        backlinks: numberValue(summary.backlinks),
        referringDomains: numberValue(summary.referring_domains),
        referringPages: numberValue(summary.referring_pages),
        brokenBacklinks: numberValue(summary.broken_backlinks),
      },
      domains,
    }, { headers: { "cache-control": "private, max-age=900" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backlink research failed." }, { status: 502 });
  }
}
