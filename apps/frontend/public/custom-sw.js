/* Custom SW extensions for Web Push */
self.addEventListener("push", function (event) {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "Your lesson";
    const body = data.body || "Lesson is ready. Tap to open.";
    const tag = data.tag || undefined;
    const payload = data.data || {};
    const options = {
      body,
      tag,
      data: payload,
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback to raw text
    const text = event.data ? event.data.text() : "Lesson is ready";
    event.waitUntil(
      self.registration.showNotification("Your lesson", { body: text })
    );
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const id = event.notification?.data?.id;
  const url = id ? `/lessons/${id}` : "/lessons";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const c = client;
          if ("focus" in c) {
            c.navigate(url);
            return c.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
