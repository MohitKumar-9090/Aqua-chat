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

export const registerServiceWorker = async () => {
  if (!isProd) {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    registrations?.forEach((registration) => registration.unregister());
    return null;
  }

  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none'
    });

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    await navigator.serviceWorker.ready;
    registration.update().catch(() => {});
    return registration;
  } catch (error) {
    console.error(`Service worker registration failed: ${error.message}`);
    return null;
  }
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
