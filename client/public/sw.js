const CACHE_VERSION = 'aquachat-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/shortcut-chat.svg',
  '/shortcut-people.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || fresh;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || caches.match('/offline.html'))
    );
    return;
  }

  if (request.destination === 'image' || request.destination === 'style' || request.destination === 'script' || url.pathname.startsWith('/assets/')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || {};
  const title = data.title || 'AquaChat';
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/app-icon.svg',
    badge: '/app-icon.svg',
    data: { url: data.url || '/' }
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
        return;
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'aquachat-background-sync') {
    event.waitUntil(self.registration.showNotification('AquaChat is back online', {
      body: 'Your app is ready to sync fresh conversations.',
      icon: '/app-icon.svg',
      badge: '/app-icon.svg'
    }));
  }
});
