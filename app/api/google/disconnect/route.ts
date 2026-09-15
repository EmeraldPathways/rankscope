import { removeGoogleConnection } from "../../../../lib/google-oauth";
import { requireOwner, workspaceKey } from "../../../../lib/google-integrations";

export async function POST(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });
  try {
    await removeGoogleConnection(key);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Google connection storage is unavailable." }, { status: 503 });
  }
}
