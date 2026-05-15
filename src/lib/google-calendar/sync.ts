// Google Calendar → events table mirror.
//
// Sync strategy:
//   1. First sync (no syncToken): fetch the window [-30d, +90d] from primary.
//      Upsert each event. Save Google's nextSyncToken in
//      google_calendar_sync_state for the next run.
//   2. Subsequent syncs (have syncToken): incremental — Google returns only
//      events that changed (added / modified / cancelled) since the last token.
//      Apply the changes and store the new token. Cancelled events get deleted
//      from our table.
//   3. If Google returns 410 GONE, the syncToken expired (>~30 days unused).
//      Reset state and do a full sync next time.
//
// Single-user constraint: this app is for one user, and each account has very
// few events relative to API limits, so we don't batch / parallelize. Simple.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken, type GoogleAccountTokens } from "@/lib/gmail/tokens";
import { hasCalendarScope } from "@/lib/gmail/oauth";
import {
  CalendarApiError,
  listEvents,
  normalizeEventTimes,
  type GoogleCalendarEvent,
} from "./client";

const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 90;

const PRIMARY_CALENDAR_ID = "primary";

type GoogleAccountRow = GoogleAccountTokens & {
  user_id: string;
  email: string;
  granted_scopes: string | null;
};

export async function syncCalendarForAccount(
  supabase: SupabaseClient,
  account: GoogleAccountRow
): Promise<{ ok: true; upserted: number; deleted: number } | { ok: false; error: string }> {
  if (!hasCalendarScope(account.granted_scopes)) {
    return { ok: false, error: "calendar scope not granted — reconnect this account" };
  }

  try {
    const accessToken = await getValidAccessToken(supabase, account);

    // Load existing sync state (token from a previous run, if any).
    const { data: state } = await supabase
      .from("google_calendar_sync_state")
      .select("sync_token")
      .eq("account_id", account.id)
      .eq("calendar_id", PRIMARY_CALENDAR_ID)
      .maybeSingle();

    const collected: GoogleCalendarEvent[] = [];
    let nextSyncToken: string | undefined;
    let pageToken: string | undefined;
    let didFullSync = false;

    try {
      do {
        const page = state?.sync_token
          ? await listEvents(accessToken, PRIMARY_CALENDAR_ID, {
              mode: "incremental",
              syncToken: state.sync_token,
              pageToken,
            })
          : await listEvents(accessToken, PRIMARY_CALENDAR_ID, {
              mode: "window",
              timeMin: new Date(Date.now() - WINDOW_PAST_DAYS * 86400000).toISOString(),
              timeMax: new Date(Date.now() + WINDOW_FUTURE_DAYS * 86400000).toISOString(),
              pageToken,
            });

        collected.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
        if (!pageToken && page.nextSyncToken) nextSyncToken = page.nextSyncToken;
        if (!state?.sync_token) didFullSync = true;
      } while (pageToken);
    } catch (e) {
      // 410 → our syncToken is stale. Clear it and bail; the next run will
      // do a full window fetch. We treat this as a non-error outcome since
      // it's expected after long idle periods.
      if (e instanceof CalendarApiError && e.status === 410) {
        await supabase
          .from("google_calendar_sync_state")
          .upsert(
            {
              account_id: account.id,
              calendar_id: PRIMARY_CALENDAR_ID,
              sync_token: null,
              last_synced_at: new Date().toISOString(),
              last_sync_error: "syncToken expired — will full-sync next run",
            },
            { onConflict: "account_id,calendar_id" }
          );
        return { ok: true, upserted: 0, deleted: 0 };
      }
      throw e;
    }

    // Apply changes to our events table.
    let upserted = 0;
    let deleted = 0;
    const now = new Date().toISOString();
    // Track the first DB error so we surface it instead of silently no-op'ing.
    // Without this, a misconfigured unique index or RLS denial would leave
    // the calendar empty and last_sync_error null — which is what bit us in
    // the original 0017 migration (partial index incompatible with upsert).
    let firstDbError: string | null = null;

    for (const g of collected) {
      if (g.status === "cancelled") {
        const { error: delErr } = await supabase
          .from("events")
          .delete()
          .eq("external_account_id", account.id)
          .eq("external_calendar_id", PRIMARY_CALENDAR_ID)
          .eq("external_id", g.id);
        if (delErr) firstDbError ??= `delete: ${delErr.message}`;
        else deleted++;
        continue;
      }

      const times = normalizeEventTimes(g);
      if (!times) continue; // event with no start/end is unusable

      const { error: upErr } = await supabase.from("events").upsert(
        {
          user_id: account.user_id,
          title: g.summary || "(no title)",
          description: g.description ?? null,
          location: g.location ?? null,
          start_at: times.start_at,
          end_at: times.end_at,
          all_day: times.all_day,
          external_source: "google",
          external_account_id: account.id,
          external_calendar_id: PRIMARY_CALENDAR_ID,
          external_id: g.id,
          external_etag: g.etag ?? null,
          external_html_link: g.htmlLink ?? null,
          last_synced_at: now,
        },
        { onConflict: "external_account_id,external_calendar_id,external_id" }
      );
      if (upErr) firstDbError ??= `upsert: ${upErr.message}`;
      else upserted++;
    }

    if (firstDbError) {
      await supabase
        .from("google_calendar_sync_state")
        .upsert(
          {
            account_id: account.id,
            calendar_id: PRIMARY_CALENDAR_ID,
            last_synced_at: now,
            last_sync_error: firstDbError.slice(0, 500),
          },
          { onConflict: "account_id,calendar_id" }
        );
      return { ok: false, error: firstDbError };
    }

    // On a full window sync, prune events that fell outside the window or
    // were deleted between syncs. Incremental syncs already see cancellations
    // via the status='cancelled' path above.
    if (didFullSync) {
      const seenIds = collected.filter((g) => g.status !== "cancelled").map((g) => g.id);
      let q = supabase
        .from("events")
        .delete()
        .eq("external_account_id", account.id)
        .eq("external_calendar_id", PRIMARY_CALENDAR_ID);
      if (seenIds.length > 0) {
        q = q.not("external_id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`);
      }
      await q;
    }

    // Persist new sync token (only set if we drained all pages).
    await supabase.from("google_calendar_sync_state").upsert(
      {
        account_id: account.id,
        calendar_id: PRIMARY_CALENDAR_ID,
        sync_token: nextSyncToken ?? state?.sync_token ?? null,
        last_synced_at: now,
        last_sync_error: null,
      },
      { onConflict: "account_id,calendar_id" }
    );

    return { ok: true, upserted, deleted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("google_calendar_sync_state")
      .upsert(
        {
          account_id: account.id,
          calendar_id: PRIMARY_CALENDAR_ID,
          last_synced_at: new Date().toISOString(),
          last_sync_error: msg.slice(0, 500),
        },
        { onConflict: "account_id,calendar_id" }
      );
    return { ok: false, error: msg };
  }
}

// Sync every account that (a) has the calendar scope and (b) hasn't synced
// recently. Mirror of syncStaleAccounts in gmail/sync.ts. RLS-scoped, safe
// to fire-and-forget from the layout.
export async function syncStaleCalendars(
  supabase: SupabaseClient,
  maxAgeMs = 5 * 60_000
): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const { data: accounts } = await supabase
    .from("gmail_accounts")
    .select(
      "id, user_id, email, encrypted_refresh_token, encrypted_access_token, access_token_expires_at, granted_scopes"
    );

  if (!accounts || accounts.length === 0) return;

  // Filter to those that need a sync. We need the join with sync_state to
  // know last_synced_at — do it in two steps to keep RLS simple.
  const { data: states } = await supabase
    .from("google_calendar_sync_state")
    .select("account_id, last_synced_at")
    .eq("calendar_id", PRIMARY_CALENDAR_ID);

  const lastByAccount = new Map(
    (states ?? []).map((s) => [s.account_id as string, s.last_synced_at as string | null])
  );

  for (const acc of accounts as GoogleAccountRow[]) {
    if (!hasCalendarScope(acc.granted_scopes)) continue;
    const last = lastByAccount.get(acc.id);
    if (last && last >= cutoff) continue;
    await syncCalendarForAccount(supabase, acc);
  }
}
