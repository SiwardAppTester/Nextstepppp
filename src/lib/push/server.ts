import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Web Push helper. Reads VAPID keys from env on first use, then
 * delegates to the `web-push` library. The keys MUST be stable — regenerating
 * invalidates every existing push_subscriptions row.
 *
 * Env vars (set in .env.local for dev, Vercel project settings for prod):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — public half, also embedded in the client
 *   VAPID_PRIVATE_KEY             — private half, server-only
 *   VAPID_SUBJECT                 — "mailto:..." or "https://..." identifying
 *                                   the app to push services (Google/Mozilla)
 *
 * Generate keys once:  npx web-push generate-vapid-keys
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "";

let configured = false;
function configure() {
  if (configured) return;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    throw new Error(
      "VAPID env vars missing — set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT"
    );
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Path to open when the user clicks the notification. Default: "/". */
  url?: string;
  /** Optional tag — notifications sharing a tag collapse to one. */
  tag?: string;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Send a push payload to every subscription this user has registered.
 * Auto-prunes subscriptions that come back 404 or 410 (the user revoked or
 * the subscription expired browser-side).
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; pruned: number }> {
  configure();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", userId);

  const rows = (subs ?? []) as SubscriptionRow[];
  if (rows.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  let sent = 0;
  let failed = 0;
  let pruned = 0;

  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        failed++;
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
          pruned++;
        }
      }
    })
  );

  return { sent, failed, pruned };
}
