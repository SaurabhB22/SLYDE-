self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "SLYDE screening alert",
      body: event.data ? event.data.text() : "A screening alert was received."
    };
  }

  const title = data.title || "SLYDE screening alert";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Open SLYDE to review the screening result.",
      tag: data.tag || "slyde-screening-alert",
      data: { url: data.url || "/" },
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      requireInteraction: true
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }

    await self.clients.openWindow(target);
  })());
});
