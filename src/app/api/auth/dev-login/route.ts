import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * DEV-ONLY shortcut: sign the owner in without sending an email.
 *
 * 1. Admin API generates a magic-link token for OWNER_EMAIL (no email sent).
 * 2. We use the regular server client (with cookies) to call verifyOtp with that
 *    token_hash. supabase-js writes the session into cookies via the SSR
 *    cookie adapter — same end state as if the user had clicked an email link.
 * 3. Seed default categories (idempotent) on first sign-in.
 *
 * Hard-disabled in production. Service role key never leaves the server.
 */
export async function POST(_request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return NextResponse.json({ error: "OWNER_EMAIL not set" }, { status: 500 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 }
    );
  }

  // 1) Generate the magic link (returns a one-time hashed_token; no email sent).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
  });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json(
      { error: linkError?.message ?? "Failed to generate link" },
      { status: 500 }
    );
  }

  // 2) Verify it using the cookie-aware server client. The session cookies
  //    get written to the response automatically by the SSR adapter.
  const supabase = await createClient();
  const { error: verifyError, data: verifyData } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  if (verifyError || !verifyData?.user) {
    return NextResponse.json(
      { error: verifyError?.message ?? "Could not verify token" },
      { status: 500 }
    );
  }

  // 3) First-sign-in seed (idempotent — the SQL function is `if not exists`).
  await supabase.rpc("seed_default_categories", { p_user_id: verifyData.user.id });

  return NextResponse.json({ ok: true });
}
