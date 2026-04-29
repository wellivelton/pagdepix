/* PagDepix Service Worker — Web Push Notifications */

/* -------------------------------------------------- */
/* TOKEN STORE — persiste JWT para pushsubscriptionchange */
/* -------------------------------------------------- */
const AUTH_CACHE = 'pagdepix-auth-v1';
const AUTH_KEY = '/sw-token';

async function saveToken(token) {
  const cache = await caches.open(AUTH_CACHE);
  await cache.put(AUTH_KEY, new Response(token, { headers: { 'Content-Type': 'text/plain' } }));
}

async function getToken() {
  try {
    const cache = await caches.open(AUTH_CACHE);
    const res = await cache.match(AUTH_KEY);
    return res ? res.text() : null;
  } catch {
    return null;
  }
}

// Página envia token após login/subscribe
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_TOKEN' && event.data.token) {
    saveToken(event.data.token);
  }
});

/* -------------------------------------------------- */
/* LIFECYCLE                                          */
/* -------------------------------------------------- */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* -------------------------------------------------- */
/* PUSH — recebe notificação do servidor              */
/* -------------------------------------------------- */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'PagDepix', body: event.data.text(), url: '/' };
  }

  const { title = 'PagDepix', body = '', icon, badge, url = '/', tag } = data;

  const options = {
    body,
    icon: icon || '/android-chrome-192x192.png',
    badge: badge || '/favicon-32x32.png',
    data: { url },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    // Tag por tipo: nova notificação do mesmo tipo substitui a anterior
    // (evita acúmulo de banners quando o dispositivo estava offline)
    tag: tag || 'pagdepix-notification',
    renotify: !!tag, // vibra novamente mesmo que a tag já exista
    actions: [
      { action: 'open', title: 'Ver detalhes' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* -------------------------------------------------- */
/* NOTIFICATION CLICK — redireciona ao clicar         */
/* -------------------------------------------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

/* -------------------------------------------------- */
/* PUSH SUBSCRIPTION CHANGE — re-subscribe automático */
/* -------------------------------------------------- */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      }),
      getToken(),
    ]).then(([sub, token]) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      return fetch('/api/push/subscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
            auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
          },
        }),
      });
    })
  );
});
