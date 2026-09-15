import {
  normalisePublicUrl,
  runtimeEnv,
} from "../../../lib/google-integrations";

type LighthouseAudit = {
  title?: string;
  description?: string;
  displayValue?: string;
  numericValue?: number;
  score?: number | null;
};

type PageSpeedPayload = {
  error?: { message?: string };
  lighthouseResult?: {
    fetchTime?: string;
    finalDisplayedUrl?: string;
    categories?: Record<string, { score?: number }>;
    audits?: Record<string, LighthouseAudit>;
  };
};

const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 25_000;

function demoFallback(target: URL, notice: string) {
  return Response.json(
    {
      source: "Demo fallback",
      fallback: true,
      notice,
      strategy: "mobile",
      url: target.toString(),
      fetchedAt: new Date().toISOString(),
      scores: { performance: 78, accessibility: 91, bestPractices: 86, seo: 94 },
      metrics: { lcp: "2.4 s", cls: "0.08", tbt: "210 ms" },
      opportunities: [
        { id: "image-delivery", title: "Serve images in next-gen formats", detail: "Convert large images to WebP or AVIF to reduce transfer size.", score: 62 },
        { id: "render-blocking", title: "Eliminate render-blocking resources", detail: "Defer non-critical styles and scripts until after first paint.", score: 71 },
        { id: "unused-javascript", title: "Reduce unused JavaScript", detail: "Remove code that is not needed on the initial mobile view.", score: 76 },
      ],
    },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}

function errorResponse(message: string, status: number, requestId: string) {
  return Response.json(
    { error: message, requestId },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

function retryableStatus(status: number) {
  return status === 429 || status >= 500;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function score(value?: number) {
  return typeof value === "number" ? Math.round(value * 100) : null;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const key = runtimeEnv().GOOGLE_PAGESPEED_API_KEY;
  let target: URL;
  try {
    const input = new URL(request.url).searchParams.get("url") || "";
    target = normalisePublicUrl(input);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Invalid website URL.",
      400,
      requestId,
    );
  }

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", target.toString());
  if (key) endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("strategy", "mobile");
  ["performance", "accessibility", "best-practices", "seo"].forEach((category) =>
    endpoint.searchParams.append("category", category),
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const responseText = await response.text();
      let payload: PageSpeedPayload = {};
      try {
        payload = JSON.parse(responseText) as PageSpeedPayload;
      } catch {
        console.error("PageSpeed returned a non-JSON response", {
          requestId,
          attempt,
          status: response.status,
        });
      }

      if (!response.ok || !payload.lighthouseResult) {
        const upstreamMessage = payload.error?.message || "";
        const quotaExhausted = response.status === 429 || /quota|rate limit/i.test(upstreamMessage);
        if (quotaExhausted) {
          console.warn("PageSpeed quota unavailable; returning a labelled demo fallback", { requestId, status: response.status });
          return demoFallback(target, "Google PageSpeed quota is unavailable. Add GOOGLE_PAGESPEED_API_KEY for live audits.");
        }
        if (retryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
          await wait(350 * attempt);
          continue;
        }

        console.error("PageSpeed upstream request failed", {
          requestId,
          attempt,
          status: response.status,
          message: payload.error?.message,
        });
        return errorResponse(
          upstreamMessage || `Google PageSpeed returned HTTP ${response.status}.`,
          response.status >= 400 ? response.status : 502,
          requestId,
        );
      }

      const result = payload.lighthouseResult;
      const audits = result.audits || {};
      const opportunities = Object.entries(audits)
        .filter(([, audit]) => typeof audit.score === "number" && audit.score < 0.9)
        .sort((a, b) => (a[1].score ?? 1) - (b[1].score ?? 1))
        .slice(0, 5)
        .map(([id, audit]) => ({
          id,
          title: audit.title || id,
          detail: audit.displayValue || audit.description?.split("[")[0]?.trim() || "Review this audit.",
          score: score(audit.score ?? undefined),
        }));

      return Response.json(
        {
          source: "Google PageSpeed Insights",
          strategy: "mobile",
          url: result.finalDisplayedUrl || target.toString(),
          fetchedAt: result.fetchTime || new Date().toISOString(),
          scores: {
            performance: score(result.categories?.performance?.score),
            accessibility: score(result.categories?.accessibility?.score),
            bestPractices: score(result.categories?.["best-practices"]?.score),
            seo: score(result.categories?.seo?.score),
          },
          metrics: {
            lcp: audits["largest-contentful-paint"]?.displayValue || "Unavailable",
            cls: audits["cumulative-layout-shift"]?.displayValue || "Unavailable",
            tbt: audits["total-blocking-time"]?.displayValue || "Unavailable",
          },
          opportunities,
        },
        { headers: { "cache-control": "public, max-age=300, s-maxage=3600" } },
      );
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      console.error("PageSpeed request could not be completed", {
        requestId,
        attempt,
        reason: isTimeout ? "timeout" : error instanceof Error ? error.message : "unknown",
      });
      if (attempt < MAX_ATTEMPTS) {
        await wait(350 * attempt);
        continue;
      }

      return errorResponse(
        isTimeout
          ? "Google PageSpeed timed out. Please try again."
          : "Unable to reach Google PageSpeed Insights. Please try again.",
        502,
        requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return errorResponse("Unable to reach Google PageSpeed Insights. Please try again.", 502, requestId);
}
