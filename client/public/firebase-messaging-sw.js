importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || import.meta.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || import.meta.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || import.meta.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || import.meta.env.REACT_APP_FIREBASE_APP_ID
});

const messaging = firebase.messaging();

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
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
    data: { url },
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const action = event.action;
  const targetUrl = event.notification.data?.url || '/';
  
  if (action === 'accept') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        const existing = windows.find((client) => client.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.navigate(targetUrl + '&action=accept');
          return existing;
        }
        return clients.openWindow(targetUrl + '&action=accept');
      })
    );
  } else if (action === 'reject') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        const existing = windows.find((client) => client.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.navigate(targetUrl + '&action=reject');
          return existing;
        }
        return clients.openWindow(targetUrl + '&action=reject');
      })
    );
  } else {
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
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
