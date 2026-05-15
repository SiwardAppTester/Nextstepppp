// Access-token management for Google accounts stored in gmail_accounts.
// Despite living under /gmail/, this is shared by both the Gmail unread sync
// and the Google Calendar sync — they both authenticate against the same
// refresh token, just with different scopes granted at OAuth time.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import { refreshAccessToken } from "./oauth";

export type GoogleAccountTokens = {
  id: string;
  encrypted_refresh_token: string;
  encrypted_access_token: string | null;
  access_token_expires_at: string | null;
};

const ACCESS_TOKEN_LEEWAY_MS = 60_000; // refresh a minute before expiry

export async function getValidAccessToken(
  supabase: SupabaseClient,
  account: GoogleAccountTokens
): Promise<string> {
  const expiresAt = account.access_token_expires_at
    ? new Date(account.access_token_expires_at).getTime()
    : 0;
  const fresh =
    account.encrypted_access_token && expiresAt - ACCESS_TOKEN_LEEWAY_MS > Date.now();
  if (fresh) return decrypt(account.encrypted_access_token!);

  const refreshToken = decrypt(account.encrypted_refresh_token);
  const refreshed = await refreshAccessToken(refreshToken);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await supabase
    .from("gmail_accounts")
    .update({
      encrypted_access_token: encrypt(refreshed.access_token),
      access_token_expires_at: newExpiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return refreshed.access_token;
}
