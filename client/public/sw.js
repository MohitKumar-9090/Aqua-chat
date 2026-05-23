const CACHE_VERSION = 'aquachat-v5';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/app-icon.svg',
  '/shortcut-chat.svg',
  '/shortcut-people.svg'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('Caching app shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('Install failed:', err))
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION && key.startsWith('aquachat-'))
            .map((key) => {
              console.log('Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Cache strategies
const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  
  const fresh = fetch(request)
    .then((response) => {
      // Only cache successful responses
      if (response && response.ok && request.method === 'GET') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((err) => {
      console.warn('Fetch failed for', request.url, err);
      return cached;
    });

  return cached || fresh;
};

// Network first strategy for API calls
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
};

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isExternal = url.origin !== self.location.origin;
  const isAPI = url.pathname.startsWith('/api/');
  const isAsset = request.destination === 'image' || 
                  request.destination === 'style' || 
                  request.destination === 'script' ||
                  url.pathname.startsWith('/assets/');

  // Navigation requests - always try network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || caches.match('/offline.html');
        })
    );
    return;
  }

  // API calls - network first with fallback
  if (isAPI && !isExternal) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets and external resources - stale while revalidate
  if (isAsset || isExternal) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default behavior for other requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const cache = caches.open(CACHE_VERSION);
          cache.then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(async () => await caches.match(request))
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  try {
    const data = event.data?.json?.() || {};
    const title = data.title || 'AquaChat';
    const options = {
      body: data.body || 'You have a new update.',
      icon: '/app-icon.svg',
      badge: '/app-icon.svg',
      tag: data.tag || 'aquachat-notification',
      data: { url: data.url || '/' },
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || []
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('Push notification error:', err);
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Try to find existing window with same origin
      const existing = windows.find((client) => client.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
        return existing;
      }
      // Open new window if none exists
      return clients.openWindow(targetUrl);
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed');
});

// Background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'aquachat-background-sync') {
    console.log('Background sync triggered');
    event.waitUntil(
      self.registration.showNotification('AquaChat is back online', {
        body: 'Your app is ready. Fresh conversations are loading.',
        icon: '/app-icon.svg',
        badge: '/app-icon.svg',
        tag: 'aquachat-sync'
      })
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'aquachat-periodic-sync') {
    console.log('Periodic sync triggered');
    event.waitUntil(
      // Sync data in background
      fetch('/api/sync', { method: 'POST' })
        .catch(err => console.log('Periodic sync failed:', err))
    );
  }
});
