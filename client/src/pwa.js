import { getApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { firebaseConfig } from './config/env.js';

const isProd = import.meta.env.PROD;

let deferredInstallPrompt = null;
const installListeners = new Set();

const notifyInstallListeners = () => {
  installListeners.forEach((listener) => {
    try {
      listener(deferredInstallPrompt);
    } catch (error) {
      console.error('PWA install listener error:', error);
    }
  });
};

/** Capture before React mounts — call from main.jsx immediately. */
export const captureInstallPrompt = (event) => {
  if (!event) return;
  event.preventDefault();
  deferredInstallPrompt = event;
  notifyInstallListeners();
};

export const subscribeInstallPrompt = (listener) => {
  installListeners.add(listener);
  listener(deferredInstallPrompt);
  return () => installListeners.delete(listener);
};

export const getDeferredInstallPrompt = () => deferredInstallPrompt;

export const clearDeferredInstallPrompt = () => {
  deferredInstallPrompt = null;
  notifyInstallListeners();
};

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isAndroid = () => /android/i.test(navigator.userAgent || '');

export const isSecureContext = () => window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';

export const isPwaDisplayMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

let swRegistrationPromise = null;

export const registerServiceWorker = () => {
  if (!isProd) {
    swRegistrationPromise = navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      regs?.forEach((registration) => registration.unregister());
      return null;
    });
    return swRegistrationPromise;
  }

  if (!('serviceWorker' in navigator)) {
    swRegistrationPromise = Promise.resolve(null);
    return swRegistrationPromise;
  }

  if (!swRegistrationPromise) {
    const params = new URLSearchParams();
    if (firebaseConfig) {
      if (firebaseConfig.apiKey) params.append('apiKey', firebaseConfig.apiKey);
      if (firebaseConfig.authDomain) params.append('authDomain', firebaseConfig.authDomain);
      if (firebaseConfig.projectId) params.append('projectId', firebaseConfig.projectId);
      if (firebaseConfig.storageBucket) params.append('storageBucket', firebaseConfig.storageBucket);
      if (firebaseConfig.messagingSenderId) params.append('messagingSenderId', firebaseConfig.messagingSenderId);
      if (firebaseConfig.appId) params.append('appId', firebaseConfig.appId);
    }
    const queryString = params.toString();
    const swUrl = queryString ? `/firebase-messaging-sw.js?${queryString}` : '/firebase-messaging-sw.js';

    swRegistrationPromise = navigator.serviceWorker
      .register(swUrl, { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {});
        return registration;
      })
      .catch((error) => {
        console.error(`Service worker registration failed: ${error.message}`);
        // Fallback to regular service worker if firebase-messaging-sw fails
        return navigator.serviceWorker
          .register('/sw.js', { scope: '/', updateViaCache: 'none' })
          .then((reg) => {
            reg.update().catch(() => {});
            return reg;
          })
          .catch((err) => {
            console.error(`Fallback service worker registration failed: ${err.message}`);
            return null;
          });
      });
  }

  return swRegistrationPromise;
};

export const waitForServiceWorker = async () => {
  if (!isProd || !('serviceWorker' in navigator)) return null;
  registerServiceWorker();
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
};

const getFirebaseMessaging = () => {
  if (!('serviceWorker' in navigator) || !getApps().length) return null;
  try {
    return getMessaging(getApp());
  } catch (error) {
    console.warn('Firebase messaging initialization failed:', error.message);
    return null;
  }
};

export const registerMessagingToken = async () => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null;
  const registration = await waitForServiceWorker();
  if (!registration) return null;
  const messaging = getFirebaseMessaging();
  if (!messaging) return null;
  const vapidKey = import.meta.env.VITE_FIREBASE_MESSAGING_VAPID_KEY || import.meta.env.REACT_APP_FIREBASE_MESSAGING_VAPID_KEY;
  try {
    return await getToken(messaging, { serviceWorkerRegistration: registration, vapidKey });
  } catch (error) {
    console.warn('FCM token registration failed:', error.message);
    return null;
  }
};

export const onForegroundMessage = (callback) => {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
};

export const showSystemNotification = async ({ title, body, icon, tag, url, requireInteraction = false, vibrate = [200, 100, 200] }) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = {
    body,
    icon: icon || '/icon-192.png',
    badge: icon || '/icon-192.png',
    tag: tag || 'aquachat-notification',
    renotify: true,
    vibrate,
    requireInteraction,
    data: { url: url || '/' }
  };

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.showNotification) {
      registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch (error) {
    console.error('Notification display failed:', error.message);
  }
};

export const hasActiveServiceWorker = () =>
  Boolean(isProd && 'serviceWorker' in navigator && navigator.serviceWorker?.controller);

export const isDesktopChromium = () => {
  const ua = navigator.userAgent || '';
  return /Chrome|Edg|Chromium/i.test(ua) && !/Mobile|Android|iPhone|iPad/i.test(ua);
};

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
};

export const registerBackgroundSync = async () => {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  if (!('sync' in registration)) return false;
  await registration.sync.register('aquachat-background-sync');
  return true;
};

export const getInstallInstructions = () => {
  if (isIos()) {
    return 'Tap Share, then "Add to Home Screen" to install AquaChat.';
  }
  if (isAndroid()) {
    return 'Tap the menu (⋮) and choose "Install app" or "Add to Home screen".';
  }
  return 'Use the browser menu to install AquaChat or add it to your home screen.';
};

export const promptInstall = async () => {
  if (!deferredInstallPrompt) return { outcome: 'unavailable' };
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    clearDeferredInstallPrompt();
  }
  return choice;
};
