// Direct Google OAuth 2.0. We don't use the `googleapis` SDK because we make
// exactly two calls per account per ~minute; raw fetch keeps the bundle small.
//
// Scope: gmail.metadata is the minimum needed to read users.labels.get and
// pull the messagesUnread field on the INBOX label. No subjects, no bodies.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const SCOPES = ["https://www.googleapis.com/auth/gmail.metadata"].join(" ");

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even on re-consent
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenExchangeResult = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  scope: string;
  token_type: "Bearer";
};

export async function exchangeCode(code: string): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as TokenExchangeResult & { refresh_token?: string };
  if (!json.refresh_token) {
    // prompt=consent should guarantee it, but if Google ever omits it we want a clear error
    throw new Error("Google did not return a refresh_token (re-consent required)");
  }
  return json as TokenExchangeResult;
}

export type RefreshResult = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
};

export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as RefreshResult;
}

export async function revokeToken(token: string): Promise<void> {
  // Best-effort: revoking the refresh_token also invalidates derived access tokens.
  // We don't throw on failure — if Google has already revoked it, our DB delete still proceeds.
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => {});
}

// Pulls the email address + stable Google user id for the just-authorized account.
// We use it as the unique key in gmail_accounts so a user can't connect the same
// inbox twice (we update the existing row instead).
export async function fetchGoogleProfile(accessToken: string): Promise<{
  email: string;
  googleUserId: string;
}> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { emailAddress: string; historyId: string };
  return { email: json.emailAddress, googleUserId: json.emailAddress };
  // Note: Gmail's users.getProfile returns the email as the canonical id; we
  // use it as google_user_id since changing primary email isn't really a thing.
}
