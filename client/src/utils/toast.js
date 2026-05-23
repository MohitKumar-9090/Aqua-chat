/**
 * Toast Notification System
 * Manages toast notifications globally
 */

let toastId = 0;
const toastListeners = [];

export const toastConfig = {
  position: 'bottom',
  duration: 3000,
  maxToasts: 3
};

export const toast = (message, type = 'info', duration = toastConfig.duration) => {
  const id = ++toastId;
  const toastItem = {
    id,
    message,
    type, // 'success', 'error', 'info', 'warning'
    duration,
    createdAt: Date.now()
  };

  toastListeners.forEach(listener => listener({ action: 'add', toast: toastItem }));

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
};

export const removeToast = (id) => {
  toastListeners.forEach(listener => listener({ action: 'remove', id }));
};

export const subscribeToasts = (listener) => {
  toastListeners.push(listener);
  return () => {
    const index = toastListeners.indexOf(listener);
    if (index > -1) toastListeners.splice(index, 1);
  };
};

// Convenience methods
export const success = (message, duration) => toast(message, 'success', duration);
export const error = (message, duration) => toast(message, 'error', duration);
export const warning = (message, duration) => toast(message, 'warning', duration);
export const info = (message, duration) => toast(message, 'info', duration);

// Long-duration info
export const notify = (message) => toast(message, 'info', 5000);
