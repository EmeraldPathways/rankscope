type RuntimeEnv = {
  RANKSCOPE_OWNER_EMAIL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GOOGLE_PAGESPEED_API_KEY?: string;
  GSC_SITE_URL?: string;
  GA4_PROPERTY_ID?: string;
  DATAFORSEO_LOGIN?: string;
  DATAFORSEO_PASSWORD?: string;
};

export function runtimeEnv(): RuntimeEnv {
  return process.env as RuntimeEnv;
}

export function requireOwner(request: Request): Response | null {
  const configuredOwner = runtimeEnv().RANKSCOPE_OWNER_EMAIL?.trim().toLowerCase();
  const signedInEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();

  if (!configuredOwner) {
    return Response.json(
      { error: "Owner access has not been configured." },
      { status: 503 },
    );
  }

  if (!signedInEmail || signedInEmail !== configuredOwner) {
    return Response.json(
      { error: "Owner sign-in is required for private analytics data." },
      { status: 401 },
    );
  }

  return null;
}

export function googleConnectorStatus() {
  const values = runtimeEnv();
  const oauth = Boolean(
    values.GOOGLE_CLIENT_ID &&
      values.GOOGLE_CLIENT_SECRET &&
      values.GOOGLE_REFRESH_TOKEN,
  );

  return {
    // Google supports low-volume PageSpeed requests without a key. A key is
    // still used automatically when configured for higher, steadier quotas.
    pageSpeed: true,
    searchConsole: oauth && Boolean(values.GSC_SITE_URL),
    analytics: oauth && Boolean(values.GA4_PROPERTY_ID),
    seoData: Boolean(values.DATAFORSEO_LOGIN && values.DATAFORSEO_PASSWORD),
  };
}

export async function getGoogleAccessToken(): Promise<string> {
  const values = runtimeEnv();
  if (
    !values.GOOGLE_CLIENT_ID ||
    !values.GOOGLE_CLIENT_SECRET ||
    !values.GOOGLE_REFRESH_TOKEN
  ) {
    throw new Error("Google OAuth credentials are incomplete.");
  }

  const body = new URLSearchParams({
    client_id: values.GOOGLE_CLIENT_ID,
    client_secret: values.GOOGLE_CLIENT_SECRET,
    refresh_token: values.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "Google OAuth refresh failed.");
  }

  return payload.access_token;
}

export function normalisePublicUrl(value: string): URL {
  const candidate = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  const url = new URL(candidate);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Enter a public HTTP or HTTPS website.");
  }

  const hostname = url.hostname.toLowerCase();
  const blockedName =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const blockedIpv4 = Boolean(
    ipv4 &&
      (() => {
        const parts = ipv4.slice(1).map(Number);
        return (
          parts.some((part) => part > 255) ||
          parts[0] === 0 ||
          parts[0] === 10 ||
          parts[0] === 127 ||
          (parts[0] === 169 && parts[1] === 254) ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168)
        );
      })(),
  );
  const blockedIpv6 = hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");

  if (blockedName || blockedIpv4 || blockedIpv6) {
    throw new Error("Private and local network addresses cannot be audited.");
  }

  url.hash = "";
  return url;
}
