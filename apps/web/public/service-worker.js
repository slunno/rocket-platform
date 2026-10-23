self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? 'Você tem uma nova atividade no Rocket.' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Rocket', {
      body: payload.body || 'Você tem uma nova atividade.',
      tag: payload.tag || 'rocket-activity',
      data: { url: payload.url || '/atividade' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let targetUrl = new URL('/atividade', self.location.origin).href;
  try {
    const candidate = new URL(event.notification.data?.url || '/atividade', self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate.href;
  } catch {
    targetUrl = new URL('/atividade', self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
