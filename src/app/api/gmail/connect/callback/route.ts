import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, fetchGoogleProfile } from "@/lib/gmail/oauth";
import { encrypt } from "@/lib/gmail/crypto";
import { syncAccount, type GmailAccountRow } from "@/lib/gmail/sync";
import { syncCalendarForAccount } from "@/lib/google-calendar/sync";
import { hasCalendarScope } from "@/lib/gmail/oauth";

const STATE_COOKIE = "gmail_oauth_state";

function failRedirect(reason: string) {
  const url = new URL("/settings", "http://localhost"); // base replaced by NextResponse.redirect
  url.searchParams.set("gmail", "error");
  url.searchParams.set("reason", reason);
  return url;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const errorParam = params.get("error");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (errorParam) {
    const u = failRedirect(errorParam);
    return NextResponse.redirect(new URL(u.pathname + u.search, request.url));
  }
  if (!code || !state || !stateCookie || state !== stateCookie) {
    const u = failRedirect("invalid_state");
    return NextResponse.redirect(new URL(u.pathname + u.search, request.url));
  }

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Upsert: same Google account re-connecting just updates tokens.
    const { data: row, error } = await supabase
      .from("gmail_accounts")
      .upsert(
        {
          user_id: user.id,
          email: profile.email,
          google_user_id: profile.googleUserId,
          encrypted_refresh_token: encrypt(tokens.refresh_token),
          encrypted_access_token: encrypt(tokens.access_token),
          access_token_expires_at: expiresAt,
          granted_scopes: tokens.scope,
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,google_user_id" }
      )
      .select(
        "id, email, encrypted_refresh_token, encrypted_access_token, access_token_expires_at, unread_count, last_synced_at"
      )
      .single();

    if (error || !row) {
      const u = failRedirect("db_error");
      return NextResponse.redirect(new URL(u.pathname + u.search, request.url));
    }

    // First sync now so the sidebar shows the count immediately.
    await syncAccount(supabase, row as GmailAccountRow);

    // If the user granted calendar.readonly, pull their events too. We
    // await so the calendar page is populated by the time they navigate
    // there post-redirect.
    if (hasCalendarScope(tokens.scope)) {
      await syncCalendarForAccount(supabase, {
        id: row.id,
        user_id: user.id,
        email: profile.email,
        encrypted_refresh_token: encrypt(tokens.refresh_token),
        encrypted_access_token: encrypt(tokens.access_token),
        access_token_expires_at: expiresAt,
        granted_scopes: tokens.scope,
      });
    }

    const ok = new URL("/settings", request.url);
    ok.searchParams.set("gmail", "connected");
    ok.searchParams.set("email", profile.email);
    return NextResponse.redirect(ok);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const u = failRedirect(encodeURIComponent(msg).slice(0, 200));
    return NextResponse.redirect(new URL(u.pathname + u.search, request.url));
  }
}
