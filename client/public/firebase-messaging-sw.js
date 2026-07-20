importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js');

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
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId
};

let messaging = null;
try {
  if (!apiKey || !projectId || !messagingSenderId || !appId) {
    throw new Error('Missing Firebase service-worker configuration.');
  }
  firebase.initializeApp(firebaseConfig);
  messaging = firebase.messaging();
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
    Promise.all([
      // Enable navigation preload for faster page loads after background
      self.registration.navigationPreload?.enable?.().catch(() => {}),
      // Purge old caches
      caches.keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== CACHE_VERSION && key.startsWith('aquachat-'))
              .map((key) => caches.delete(key))
          )
        ),
    ]).then(() => self.clients.claim())
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

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const fresh = await fetch(request);
    if (fresh?.ok && request.method === 'GET') {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (error) {
    throw error;
  }
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

  if (isHashedAsset) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'image') {
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
const handlePushNotification = (payload) => {
  const data = payload.data || payload || {};
  const notification = payload.notification || data.notification || {};
  const fcmOptions = payload.fcmOptions || data.fcmOptions || {};

  const title = notification.title || data.senderName || data.title || payload.title || 'AquaChat';
  const body = notification.body || data.messagePreview || data.body || payload.body || 'You have a new message.';
  const icon = notification.icon || data.icon || '/icon-192.png';
  const image = notification.image || data.image || null;
  const isCall = data.type === 'call' || data.callType || notification.tag?.includes('call');

  const chatId = data.chatId || '';
  const receiverId = data.receiverId || '';
  const callId = data.callId || '';
  const type = data.type || '';

  // Custom deep-linking path
  const url = fcmOptions.link || data.url || (chatId ? `/?chat=${chatId}` : '/');

  const options = {
    body,
    icon,
    image,
    badge: '/icon-192.png',
    tag: notification.tag || data.tag || `aquachat-${chatId || 'general'}`,
    renotify: true,
    vibrate: isCall ? [200, 100, 200, 100, 200] : [200, 100, 200],
    requireInteraction: isCall,
    data: { url, chatId, callId, receiverId, type },
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

  return self.registration.showNotification(title, options);
};

// Historical raw-push handler retained as a comment for rollback reference.
/*
 * Disabled duplicate raw-push handler. Firebase Messaging owns the push event;
 * onBackgroundMessage below is the single background delivery path.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json() || {};
  } catch (err) {
    console.warn('[SW] Push payload not JSON, falling back to text:', event.data.text());
    payload = { body: event.data.text() || 'You have a new message.' };
  }

  // Check if app is visible in foreground — skip notification if so (App.jsx handles it)
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const hasFocusedClient = windowClients.some((client) => {
        return client.visibilityState === 'visible' && new URL(client.url).origin === self.location.origin;
      });
      if (hasFocusedClient) {
        // Forward to focused client for in-app handling instead of system notification
        windowClients.forEach((client) => {
          if (client.visibilityState === 'visible') {
            client.postMessage({ type: 'PUSH_FOREGROUND', payload });
          }
        });
        return;
      }
      return handlePushNotification(payload);
    })
  );
});
*/

// Configure Firebase Background Message Handler for FCM compatibility
try {
  if (messaging) {
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW] onBackgroundMessage received payload:', payload);
      return handlePushNotification(payload);
    });
  }
} catch (error) {
  console.error('[SW] Failed to register onBackgroundMessage:', error);
}

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
  // Keepalive ping from app to prevent Android from killing the SW
  if (event.data?.type === 'KEEPALIVE') {
    event.source?.postMessage?.({ type: 'KEEPALIVE_ACK' });
  }
});

// 6. Background Sync (keep Android SW active)
self.addEventListener('sync', (event) => {
  if (event.tag === 'aquachat-background-sync') {
    event.waitUntil(Promise.resolve());
  }
});

// 7. Periodic background sync for Android PWA keepalive
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'aquachat-keepalive') {
    event.waitUntil(Promise.resolve());
  }
});
