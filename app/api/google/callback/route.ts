import { encryptRefreshToken, saveGoogleConnection, verifyOAuthState } from "../../../../lib/google-oauth";
import { requireOwner, runtimeEnv, workspaceKey } from "../../../../lib/google-integrations";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function page(title: string, message: string, status = 200) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · RankScope</title><style>body{font-family:system-ui,sans-serif;background:#f5f3ef;color:#263044;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}main{max-width:520px;background:#fff;border:1px solid #dedbd4;border-radius:16px;padding:32px;box-shadow:0 14px 40px #1b23321c}h1{font-size:24px;margin:0 0 12px}p{color:#687080;line-height:1.6;margin:0 0 24px}a{display:inline-block;background:#ff6b4a;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:700;font-size:14px}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/">Return to RankScope</a></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  const values = runtimeEnv();
  const query = new URL(request.url).searchParams;
  if (!key) return page("Owner sign-in required", "Return to RankScope and sign in as the workspace owner.", 401);
  if (query.get("error")) return page("Google connection cancelled", query.get("error_description") || "Google did not grant access.", 400);
  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return page("Google connection incomplete", "Google did not return an authorization code. Start the connection again.", 400);
  if (!values.GOOGLE_CLIENT_ID || !values.GOOGLE_CLIENT_SECRET || !values.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    return page("Google connection is not configured", "Add the Google client credentials and token encryption key in Sites runtime variables.", 503);
  }
  const validState = await verifyOAuthState(state, key, values.GOOGLE_TOKEN_ENCRYPTION_KEY);
  if (!validState) return page("Google connection expired", "The security check expired. Start the connection again.", 400);
  const redirectUri = values.GOOGLE_OAUTH_REDIRECT_URI?.trim() || new URL("/api/google/callback", request.url).toString();
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: values.GOOGLE_CLIENT_ID, client_secret: values.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const payload = await response.json() as { refresh_token?: string; scope?: string; error_description?: string };
    if (!response.ok) return page("Google token exchange failed", payload.error_description || "Google rejected the authorization code. Start again with the matching OAuth credentials.", 502);
    if (!payload.refresh_token) return page("No refresh token returned", "Google did not return a refresh token. Remove RankScope from your Google account's third-party connections, then connect again with offline access.", 400);
    const ciphertext = await encryptRefreshToken(payload.refresh_token, values.GOOGLE_TOKEN_ENCRYPTION_KEY);
    await saveGoogleConnection(key, ciphertext, payload.scope || "");
    return page("Google connected", "Search Console and Analytics credentials are now stored securely for this workspace.");
  } catch (error) {
    console.error("Google OAuth callback failed", { reason: error instanceof Error ? error.message : "unknown" });
    return page("Google connection failed", "RankScope could not complete the connection. Check the runtime variables and try again.", 502);
  }
}
