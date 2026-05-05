import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback. Supabase redirects here after the user clicks the email link
 * with a `code` query param we exchange for a session. On first sign-in we seed
 * the owner's default categories (idempotent — the SQL function checks `if not exists`).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Owner gate at the auth layer too — if somehow a non-owner exchanged a code,
  // sign them out immediately.
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail && data.user.email?.toLowerCase() !== ownerEmail) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_authorized`);
  }

  // First-sign-in seed (idempotent). Errors here shouldn't block sign-in.
  await supabase.rpc("seed_default_categories", { p_user_id: data.user.id });

  return NextResponse.redirect(`${origin}${next}`);
}
