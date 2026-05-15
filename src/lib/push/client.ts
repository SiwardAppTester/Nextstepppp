/**
 * Browser-side Web Push helpers. All functions are safe to call from React
 * client components; they no-op or return clear error strings when the
 * browser doesn't support push or the user hasn't granted permission.
 *
 * Flow on enable:
 *   1. Check feature support (serviceWorker + PushManager).
 *   2. Request Notification permission.
 *   3. Register /sw.js and wait for it to become active.
 *   4. Call pushManager.subscribe with the VAPID public key.
 *   5. POST the subscription to /api/push/subscribe so the server can later
 *      send notifications to this device.
 */

export type PushStatus =
  | "unsupported"
  | "denied"
  | "unsubscribed"
  | "subscribed"
  | "not-configured";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsubscribed";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return "not-configured";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "unsubscribed";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Push isn't supported in this browser." };
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return {
      ok: false,
      error:
        "VAPID public key not configured. Run `npx web-push generate-vapid-keys` and add the keys to .env.local.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Permission denied for notifications." };
  }

  // Force a clean slate: unregister every existing SW for this origin and
  // unsubscribe any lingering subscription. In dev, hot reloads can leave
  // a stale SW running an old sw.js; you only see push failures once an
  // actual push arrives, by which point debugging is painful. Easier to
  // always start fresh here.
  const existingRegs = await navigator.serviceWorker.getRegistrations();
  for (const reg of existingRegs) {
    const oldSub = await reg.pushManager.getSubscription();
    if (oldSub) await oldSub.unsubscribe();
    await reg.unregister();
  }

  // Register the fresh SW. updateViaCache: "none" tells the browser to
  // always fetch sw.js bytes from the network on register/update, never
  // from the HTTP cache — necessary so dev edits to public/sw.js actually
  // ship to the user.
  await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  const reg = await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: error ?? "Couldn't save subscription on the server." };
  }
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!("serviceWorker" in navigator)) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };

  // Tell the server first, then unsubscribe locally. If the server call
  // fails the row stays — the next subscribe upsert will clean things up.
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
  return { ok: true };
}

export async function sendTestPush(): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const res = await fetch("/api/push/test", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    sent?: number;
    failed?: number;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: body.error ?? "Couldn't send test push." };
  if ((body.sent ?? 0) === 0) {
    return {
      ok: false,
      error: "No subscriptions found — enable push on this device first.",
    };
  }
  return { ok: true, sent: body.sent ?? 0 };
}

/**
 * VAPID public keys are URL-safe base64 strings; the Push API wants them as
 * a Uint8Array. Standard conversion: pad to a multiple of 4, swap URL-safe
 * chars, then base64-decode into bytes.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Allocate an explicit ArrayBuffer so the resulting Uint8Array is typed
  // as Uint8Array<ArrayBuffer> (not the wider ArrayBufferLike union). The
  // Push API's applicationServerKey rejects SharedArrayBuffer-backed views.
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
