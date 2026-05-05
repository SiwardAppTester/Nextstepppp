import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // The owner gate. Rejected before ever calling Supabase.
  if (email !== ownerEmail) {
    return NextResponse.json(
      { error: "This email isn't authorized to sign in." },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const origin = request.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
