export const registerServiceWorker = () => {
  if (import.meta.env.DEV) {
    navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    return;
  }

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error(`Service worker registration failed: ${error.message}`);
    });
  });
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
