// Service worker for Web Push notifications.
//
// Defensive against the most common silent-failure modes (null event.data,
// empty payload, malformed JSON). Also broadcasts every push event + every
// error back to open tabs as a postMessage so the page console can show
// what happened — SW's own console is in a separate DevTools window and
// hard to find.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage(message);
}

self.addEventListener("push", (event) => {
  let title = "Nextsteppp";
  let body = "You have a new notification.";
  let url = "/";
  let parseError = null;
  let hadData = !!event.data;

  try {
    if (event.data) {
      const data = event.data.json();
      if (data && typeof data === "object") {
        if (data.title) title = String(data.title);
        if (data.body) body = String(data.body);
        if (data.url) url = String(data.url);
      }
    }
  } catch (err) {
    parseError = String(err);
  }

  event.waitUntil(
    (async () => {
      await broadcast({
        type: "sw-debug",
        stage: "push-received",
        hadData,
        parseError,
        title,
        body,
        url,
      });

      try {
        await self.registration.showNotification(title, {
          body,
          data: { url },
          requireInteraction: false,
        });
        await broadcast({ type: "sw-debug", stage: "notification-shown", title });
      } catch (err) {
        await broadcast({
          type: "sw-debug",
          stage: "notification-failed",
          error: String(err),
        });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
