import { createOAuthState } from "../../../../lib/google-oauth";
import { requireOwner, runtimeEnv, workspaceKey } from "../../../../lib/google-integrations";

const scopes = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { location } });
}

export async function GET(request: Request) {
  const denied = requireOwner(request);
  if (denied) return denied;
  const key = workspaceKey(request);
  const values = runtimeEnv();
  if (!key) return Response.json({ error: "Owner sign-in is required." }, { status: 401 });
  if (!values.GOOGLE_CLIENT_ID || !values.GOOGLE_CLIENT_SECRET) {
    return Response.json({ error: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Google." }, { status: 503 });
  }
  if (!values.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    return Response.json({ error: "Add GOOGLE_TOKEN_ENCRYPTION_KEY before connecting Google." }, { status: 503 });
  }
  const redirectUri = values.GOOGLE_OAUTH_REDIRECT_URI?.trim() || new URL("/api/google/callback", request.url).toString();
  const state = await createOAuthState(key, values.GOOGLE_TOKEN_ENCRYPTION_KEY);
  const params = new URLSearchParams({
    client_id: values.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopes.join(" "),
    state,
    login_hint: key,
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
