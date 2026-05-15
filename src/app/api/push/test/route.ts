import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push/server";

/**
 * Fires a "hello world" notification to every subscription this user has.
 * Used by the "Send test push" button in /settings. If env vars aren't
 * configured, surfaces a clear error string instead of 500ing silently.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(supabase, user.id, {
      title: "Test from Nextsteppp",
      body: "If you can see this, Web Push is wired up correctly.",
      url: "/",
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to send";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
