import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "./tokens";
import { getInboxUnreadCount } from "./client";

export type GmailAccountRow = {
  id: string;
  email: string;
  encrypted_refresh_token: string;
  encrypted_access_token: string | null;
  access_token_expires_at: string | null;
  unread_count: number;
  last_synced_at: string | null;
};

export async function syncAccount(
  supabase: SupabaseClient,
  account: GmailAccountRow
): Promise<{ ok: true; unread: number } | { ok: false; error: string }> {
  try {
    const accessToken = await getValidAccessToken(supabase, account);
    const unread = await getInboxUnreadCount(accessToken);
    await supabase
      .from("gmail_accounts")
      .update({
        unread_count: unread,
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    return { ok: true, unread };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("gmail_accounts")
      .update({
        last_sync_error: msg.slice(0, 500),
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    return { ok: false, error: msg };
  }
}

// Refresh any of the user's gmail accounts whose last_synced_at is older than
// maxAgeMs. Designed to be fired-and-forgotten from the app layout: it's RLS-
// scoped (user's own client), so it's safe to invoke without extra auth checks.
export async function syncStaleAccounts(
  supabase: SupabaseClient,
  maxAgeMs = 60_000
): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data: accounts } = await supabase
    .from("gmail_accounts")
    .select(
      "id, email, encrypted_refresh_token, encrypted_access_token, access_token_expires_at, unread_count, last_synced_at"
    )
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);

  if (!accounts || accounts.length === 0) return;

  // Sequential to keep Gmail rate-limit risk low; counts of accounts are tiny (<10)
  for (const acc of accounts as GmailAccountRow[]) {
    await syncAccount(supabase, acc);
  }
}
