importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// 1. Firebase Initialization
// Parse query parameters passed during registration for environment flexibility.
const params = new URL(self.location).searchParams;
const apiKey = params.get('apiKey');
const authDomain = params.get('authDomain');
const projectId = params.get('projectId');
const storageBucket = params.get('storageBucket');
const messagingSenderId = params.get('messagingSenderId');
const appId = params.get('appId');

const firebaseConfig = {
  apiKey: apiKey || "AIzaSyDGCdrg1EJtQcs5OXTTjjzV8VOpLo2ujI0",
  authDomain: authDomain || "you-me-96515.firebaseapp.com",
  projectId: projectId || "you-me-96515",
  storageBucket: storageBucket || "you-me-96515.appspot.com",
  messagingSenderId: messagingSenderId || "72121838071",
  appId: appId || "1:72121838071:web:5ad8d9017d4816ba0926f2"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
} catch (error) {
  console.error('[SW] Firebase messaging initialization failed:', error);
}

// 2. PWA Caching / Offline logic (merged from sw.js to prevent scope loss)
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

// 3. FCM Push Notifications
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (err) {
    console.warn('[SW] Push payload not JSON, falling back to text:', event.data?.text());
    data = { body: event.data?.text() || 'You have a new message.' };
  }

  const notification = data.notification || {};
  const fcmOptions = data.fcmOptions || {};
  
  const title = notification.title || data.title || 'AquaChat';
  const body = notification.body || data.body || 'You have a new message.';
  const icon = notification.icon || data.icon || '/icon-192.png';
  const image = notification.image || data.image || null;
  const url = fcmOptions.link || data.url || '/';
  const isCall = data.type === 'call' || data.callType || notification.tag?.includes('call');
  
  const options = {
    body,
    icon,
    image,
    badge: '/icon-192.png',
    tag: notification.tag || data.tag || `aquachat-${data.chatId || 'general'}`,
    renotify: true,
    vibrate: isCall ? [200, 100, 200, 100, 200] : [200, 100, 200],
    requireInteraction: isCall,
    data: { url, chatId: data.chatId, callId: data.callId, type: data.type },
    actions: isCall ? [
      {
        action: 'accept',
        title: 'Accept',
        icon: '/icon-192.png'
      },
      {
        action: 'reject',
        title: 'Reject',
        icon: '/icon-192.png'
      }
    ] : []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 4. Notification Click handler with inline PostMessage to keep WebRTC alive
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const action = event.action;
  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || '/';
  const chatId = notificationData.chatId || '';
  const callId = notificationData.callId || '';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find matching client by origin
      const matchingClient = windowClients.find((client) => {
        return new URL(client.url).origin === self.location.origin;
      });
      
      if (matchingClient) {
        matchingClient.focus();
        matchingClient.postMessage({
          type: 'NOTIFICATION_CLICK',
          chatId,
          callId,
          action,
          targetUrl
        });
        return matchingClient;
      } else {
        // Fallback: Open new window if app is not open
        let finalUrl = targetUrl;
        if (action === 'accept' || action === 'reject') {
          finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'action=' + action;
        }
        return clients.openWindow(finalUrl);
      }
    })
  );
});

// 5. Message listener
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 6. Background Sync (keep Android SW active)
self.addEventListener('sync', (event) => {
  if (event.tag === 'aquachat-background-sync') {
    event.waitUntil(Promise.resolve());
  }
});
