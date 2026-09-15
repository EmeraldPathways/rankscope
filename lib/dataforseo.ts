import { requireOwner, runtimeEnv } from "./google-integrations";

type DataForSeoTask = {
  status_code?: number;
  status_message?: string;
  result?: unknown[];
};

type DataForSeoResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: DataForSeoTask[];
};

export function requireSeoOwner(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const env = runtimeEnv();
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    return Response.json(
      { error: "DataForSEO credentials are not configured." },
      { status: 503 },
    );
  }
  return null;
}

export function cleanDomain(value: string) {
  const raw = value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const domain = raw.split("/")[0]?.toLowerCase() || "";
  if (!domain || !domain.includes(".") || !/^[a-z0-9.-]+$/i.test(domain)) {
    throw new Error("Enter a valid public domain.");
  }
  return domain;
}

export async function dataForSeo(path: string, task: Record<string, unknown>) {
  const env = runtimeEnv();
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    throw new Error("DataForSEO credentials are not configured.");
  }
  const response = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`)}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify([task]),
  });
  const payload = (await response.json()) as DataForSeoResponse;
  const apiTask = payload.tasks?.[0];
  if (!response.ok || (payload.status_code && payload.status_code >= 40000)) {
    throw new Error(payload.status_message || "SEO data provider request failed.");
  }
  if (!apiTask || (apiTask.status_code && apiTask.status_code >= 40000)) {
    throw new Error(apiTask?.status_message || "SEO data provider returned no result.");
  }
  return apiTask.result || [];
}

export function firstObject(value: unknown[]): Record<string, unknown> {
  const first = value[0];
  return first && typeof first === "object" ? (first as Record<string, unknown>) : {};
}

export function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
}

export function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
