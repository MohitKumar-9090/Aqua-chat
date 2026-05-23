const isProd = import.meta.env.PROD;

export const registerServiceWorker = async () => {
  if (!isProd) {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    registrations?.forEach((registration) => registration.unregister());
    return null;
  }

  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
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

export const isPwaDisplayMode = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
