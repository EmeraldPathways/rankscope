import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { workspaceSnapshots } from "../../../../db/schema";
import { requireOwner } from "../../../../lib/google-integrations";

const MAX_PAYLOAD_BYTES = 400_000;

function workspaceKey(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Workspace storage is unavailable.";
  if (message.includes("no such table") || message.includes("workspace_snapshots")) {
    return "Workspace storage is not ready yet. Publish the latest version so the database migration can be applied.";
  }
  return message;
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function arrayValue(value: unknown, limit: number) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });

  try {
    const db = await getDb();
    const [row] = await db.select().from(workspaceSnapshots).where(eq(workspaceSnapshots.workspaceKey, key)).limit(1);
    return Response.json({ source: "D1", snapshot: row ? parsePayload(row.payload) : null, updatedAt: row?.updatedAt || null }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("Workspace state load failed", { reason: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: routeError(error) }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
      return Response.json({ error: "Workspace snapshot is too large." }, { status: 413 });
    }
    const payload = JSON.parse(raw) as { domain?: unknown; keywords?: unknown; competitors?: unknown; backlinks?: unknown; refDomains?: unknown; google?: unknown; rankHistory?: unknown };
    const [existing] = await (await getDb()).select().from(workspaceSnapshots).where(eq(workspaceSnapshots.workspaceKey, key)).limit(1);
    const previous = existing ? parsePayload(existing.payload) : {};
    const domain = typeof payload.domain === "string" && payload.domain.trim() ? payload.domain.trim().slice(0, 255) : "northstar.io";
    const snapshot = {
      domain,
      keywords: Array.isArray(payload.keywords) ? payload.keywords.slice(0, 500) : arrayValue(previous.keywords, 500),
      competitors: Array.isArray(payload.competitors) ? payload.competitors.slice(0, 100) : arrayValue(previous.competitors, 100),
      backlinks: payload.backlinks && typeof payload.backlinks === "object" ? payload.backlinks : previous.backlinks && typeof previous.backlinks === "object" ? previous.backlinks : {},
      refDomains: Array.isArray(payload.refDomains) ? payload.refDomains.slice(0, 500) : arrayValue(previous.refDomains, 500),
      google: payload.google && typeof payload.google === "object" ? payload.google : previous.google || {},
      rankHistory: Array.isArray(payload.rankHistory) ? payload.rankHistory.slice(0, 500) : arrayValue(previous.rankHistory, 500),
    };
    const serialized = JSON.stringify(snapshot);
    const now = new Date().toISOString();
    const db = await getDb();
    await db.insert(workspaceSnapshots).values({ workspaceKey: key, domain, payload: serialized, updatedAt: now }).onConflictDoUpdate({
      target: workspaceSnapshots.workspaceKey,
      set: { domain, payload: serialized, updatedAt: now },
    });
    return Response.json({ source: "D1", snapshot, updatedAt: now }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("Workspace state save failed", { reason: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: routeError(error) }, { status: 503 });
  }
}
