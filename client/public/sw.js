const CACHE_VERSION = 'aquachat-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png'
];

const cacheShell = async () => {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
};

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION && key.startsWith('aquachat-'))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const fresh = fetch(request)
    .then((response) => {
      if (response?.ok && request.method === 'GET') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fresh;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isApi = url.pathname.startsWith('/api/');
  const isHashedAsset = url.pathname.startsWith('/assets/');

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response?.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', response.clone()));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/offline.html')))
    );
    return;
  }

  if (!isSameOrigin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isApi) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error('offline');
      })
    );
    return;
  }

  if (isHashedAsset || request.destination === 'script' || request.destination === 'style' || request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response?.ok) {
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(async () => caches.match(request))
  );
});

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || {};
  const title = data.title || 'AquaChat';
  const body = data.body || 'You have a new message.';
  const icon = data.icon || '/icon-192.png';
  const url = data.url || '/';
  const isCall = data.type === 'call' || data.callType;

  const options = {
    body,
    icon,
    badge: data.badge || icon,
    tag: data.tag || `aquachat-notification-${data.chatId || 'general'}`,
    renotify: true,
    vibrate: data.vibrate || [200, 100, 200],
    requireInteraction: isCall,
    data: { url }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
        return existing;
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'aquachat-background-sync') {
    event.waitUntil(Promise.resolve());
  }
});
