import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email + password sign-in.
 *
 * - OWNER_EMAIL gates which email is even allowed to attempt
 * - Supabase verifies the password (never reaches our code)
 * - On success the SSR client writes session cookies via setAll
 * - First-sign-in seeds default categories (idempotent)
 */
export async function POST(request: NextRequest) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "Server misconfigured: OWNER_EMAIL not set" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  // Owner gate: rejected before ever calling Supabase.
  if (email !== ownerEmail) {
    return NextResponse.json(
      { error: "This email isn't authorized to sign in." },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user) {
    // Generic message — never leak whether the email exists vs the password is wrong.
    return NextResponse.json(
      { error: "Wrong email or password." },
      { status: 401 }
    );
  }

  // First-sign-in seed (idempotent — the SQL function checks `if not exists`).
  await supabase.rpc("seed_default_categories", { p_user_id: data.user.id });

  return NextResponse.json({ ok: true });
}
