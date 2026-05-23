/** Run work after first paint without blocking startup. */
export const scheduleIdle = (task, { timeout = 2500 } = {}) => {
  if (typeof window === 'undefined') {
    task();
    return () => {};
  }
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(() => task(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, Math.min(timeout, 800));
  return () => window.clearTimeout(id);
};
