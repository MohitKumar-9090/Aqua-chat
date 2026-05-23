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
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {});
        return registration;
      })
      .catch((error) => {
        console.error(`Service worker registration failed: ${error.message}`);
        swRegistrationPromise = null;
        return null;
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
