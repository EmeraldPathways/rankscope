import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { workspaceSnapshots } from "../../../../db/schema";
import { requireOwner } from "../../../../lib/google-integrations";

type RankEntry = { domain: string; keyword: string; position: number | null; url: string; checkedAt: string; source: "live" | "demo" };

function workspaceKey(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normaliseDomain(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].slice(0, 255) : "";
}

function normaliseKeyword(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const domain = normaliseDomain(params.get("domain"));
  const keyword = normaliseKeyword(params.get("keyword")).toLowerCase();
  try {
    const db = await getDb();
    const [row] = await db.select().from(workspaceSnapshots).where(eq(workspaceSnapshots.workspaceKey, key)).limit(1);
    const payload = row ? parsePayload(row.payload) : {};
    const history = Array.isArray(payload.rankHistory) ? payload.rankHistory : [];
    const entries = history.filter((entry): entry is RankEntry => Boolean(entry && typeof entry === "object" && normaliseDomain((entry as RankEntry).domain) === domain && normaliseKeyword((entry as RankEntry).keyword).toLowerCase() === keyword));
    return Response.json({ source: "D1", previous: entries.length ? entries[entries.length - 1].position : null, history: entries }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Rank history is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });
  try {
    const body = await request.json() as { domain?: unknown; keyword?: unknown; position?: unknown; url?: unknown; checkedAt?: unknown; source?: unknown };
    const domain = normaliseDomain(body.domain);
    const keyword = normaliseKeyword(body.keyword);
    if (!domain || !keyword) return Response.json({ error: "Domain and keyword are required." }, { status: 400 });
    const position = typeof body.position === "number" && Number.isFinite(body.position) ? Math.max(1, Math.round(body.position)) : null;
    const entry: RankEntry = {
      domain,
      keyword,
      position,
      url: typeof body.url === "string" ? body.url.slice(0, 2000) : "",
      checkedAt: typeof body.checkedAt === "string" ? body.checkedAt : new Date().toISOString(),
      source: body.source === "live" ? "live" : "demo",
    };
    const db = await getDb();
    const [existing] = await db.select().from(workspaceSnapshots).where(eq(workspaceSnapshots.workspaceKey, key)).limit(1);
    const previous = existing ? parsePayload(existing.payload) : {};
    const history = Array.isArray(previous.rankHistory) ? previous.rankHistory : [];
    const matching = history.filter((item): item is RankEntry => Boolean(item && typeof item === "object" && normaliseDomain((item as RankEntry).domain) === domain && normaliseKeyword((item as RankEntry).keyword).toLowerCase() === keyword.toLowerCase()));
    const nextHistory = [...history, entry].slice(-500);
    const snapshot = {
      domain: typeof previous.domain === "string" && previous.domain ? previous.domain : domain,
      keywords: Array.isArray(previous.keywords) ? previous.keywords.slice(0, 500) : [],
      competitors: Array.isArray(previous.competitors) ? previous.competitors.slice(0, 100) : [],
      backlinks: previous.backlinks && typeof previous.backlinks === "object" ? previous.backlinks : {},
      refDomains: Array.isArray(previous.refDomains) ? previous.refDomains.slice(0, 500) : [],
      google: previous.google && typeof previous.google === "object" ? previous.google : {},
      rankHistory: nextHistory,
    };
    const now = new Date().toISOString();
    await db.insert(workspaceSnapshots).values({ workspaceKey: key, domain: snapshot.domain, payload: JSON.stringify(snapshot), updatedAt: now }).onConflictDoUpdate({ target: workspaceSnapshots.workspaceKey, set: { domain: snapshot.domain, payload: JSON.stringify(snapshot), updatedAt: now } });
    return Response.json({ source: "D1", previous: matching.length ? matching[matching.length - 1].position : null, entry, updatedAt: now }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Rank history could not be saved." }, { status: 503 });
  }
}
