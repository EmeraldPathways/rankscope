import { normalisePublicUrl } from "../../../lib/google-integrations";

type Check = {
  category: string;
  title: string;
  detail: string;
  passed: boolean;
  impact: "High" | "Medium" | "Low";
};

const MAX_HTML_BYTES = 2_000_000;

function firstMatch(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function plainText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  let target: URL;

  try {
    const input = new URL(request.url).searchParams.get("url") || "";
    target = normalisePublicUrl(input);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Enter a valid public URL.", requestId },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const keyword = (new URL(request.url).searchParams.get("keyword") || "").trim().toLowerCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "RankScopeBot/1.0 (+SEO on-page analysis)",
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: `The page returned HTTP ${response.status}.`, requestId },
        { status: 502, headers: { "cache-control": "no-store" } },
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return Response.json(
        { error: "The supplied URL did not return an HTML page.", requestId },
        { status: 415, headers: { "cache-control": "no-store" } },
      );
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = firstMatch(html, /<meta(?=[^>]*\bname=["']description["'])[^>]*\bcontent=["']([^"']*)["'][^>]*>/i);
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => plainText(match[1]));
    const h2Count = [...html.matchAll(/<h2\b[^>]*>/gi)].length;
    const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    const imagesWithAlt = images.filter((image) => /\balt=["'][^"']+["']/i.test(image)).length;
    const links = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
    const internalLinks = links.filter((href) => href.startsWith("/") || href.includes(target.hostname)).length;
    const externalLinks = Math.max(0, links.length - internalLinks);
    const canonical = firstMatch(html, /<link(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
    const robots = firstMatch(html, /<meta(?=[^>]*\bname=["']robots["'])[^>]*\bcontent=["']([^"']*)["'][^>]*>/i);
    const hasViewport = /<meta(?=[^>]*\bname=["']viewport["'])[^>]*>/i.test(html);
    const text = plainText(html);
    const words = text ? text.split(/\s+/).length : 0;
    const keywordUses = keyword ? text.toLowerCase().split(keyword).length - 1 : 0;
    const keywordInTitle = keyword ? title.toLowerCase().includes(keyword) : false;

    const checks: Check[] = [
      { category: "Content", title: "Write a focused title", detail: title ? `${title.length} characters` : "No title was found", passed: title.length >= 30 && title.length <= 65, impact: "High" },
      { category: "Content", title: "Optimise the meta description", detail: description ? `${description.length} characters` : "No description was found", passed: description.length >= 100 && description.length <= 165, impact: "High" },
      { category: "Structure", title: "Use one descriptive H1", detail: `${h1s.length} H1 heading${h1s.length === 1 ? "" : "s"} found`, passed: h1s.length === 1, impact: "High" },
      { category: "SEO", title: "Add a canonical URL", detail: canonical || "No canonical link was found", passed: Boolean(canonical), impact: "Medium" },
      { category: "Mobile", title: "Declare a mobile viewport", detail: hasViewport ? "Responsive viewport detected" : "Viewport metadata is missing", passed: hasViewport, impact: "High" },
      { category: "Accessibility", title: "Describe page images", detail: `${imagesWithAlt} of ${images.length} images have alt text`, passed: images.length === 0 || imagesWithAlt === images.length, impact: "Medium" },
      { category: "Content", title: "Provide useful page depth", detail: `${words.toLocaleString()} visible words`, passed: words >= 300, impact: "Medium" },
      { category: "Keywords", title: "Use the target keyword in the title", detail: keyword ? (keywordInTitle ? "Target keyword found" : "Target keyword missing") : "Add a target keyword for this check", passed: !keyword || keywordInTitle, impact: "High" },
      { category: "Keywords", title: "Use the target keyword naturally", detail: keyword ? `${keywordUses} visible mentions` : "Add a target keyword for this check", passed: !keyword || keywordUses >= 1, impact: "Medium" },
      { category: "Security", title: "Serve the page over HTTPS", detail: target.protocol === "https:" ? "Secure URL" : "HTTP URL", passed: target.protocol === "https:", impact: "Medium" },
    ];

    const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
    return Response.json(
      {
        source: "Live page HTML",
        requestId,
        analysedAt: new Date().toISOString(),
        url: response.url || target.toString(),
        score,
        title,
        description,
        h1s,
        metrics: { words, h2Count, images: images.length, imagesWithAlt, internalLinks, externalLinks, keywordUses },
        technical: { canonical, robots: robots || "Not specified", hasViewport },
        checks,
      },
      { headers: { "cache-control": "public, max-age=120, s-maxage=600" } },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("On-page analysis failed", {
      requestId,
      url: target.hostname,
      reason: timedOut ? "timeout" : error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: timedOut ? "The page took too long to respond." : "The page could not be fetched for analysis.", requestId },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
