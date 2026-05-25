import { useEffect, useRef } from 'react';
import { forceRtdbOnline } from '../firebase.js';

/**
 * Handles the PWA/browser lifecycle for keeping Firebase listeners alive:
 *
 * 1. visibilitychange → When tab becomes visible again, force RTDB reconnect
 *    and run a data refresh callback. This eliminates the "delayed bulk sync"
 *    that happens when Android/Chrome suspends the tab's network connections.
 *
 * 2. online event → When network is restored, force RTDB reconnect.
 *    Firestore auto-reconnects, but RTDB needs an explicit goOnline().
 *
 * 3. focus event → Same as visibilitychange for desktop tab switching.
 *
 * The hook is intentionally lightweight — it doesn't resubscribe listeners
 * (Firestore persistence handles that). It only kicks the RTDB socket.
 */
export function useBackgroundResume(onResume) {
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  // Track when we went to background to decide if a refresh is needed
  const backgroundAtRef = useRef(null);

  useEffect(() => {
    const STALE_THRESHOLD_MS = 3_000; // 3 seconds — if backgrounded longer, refresh

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        backgroundAtRef.current = Date.now();
        return;
      }

      // Visible again
      const elapsed = backgroundAtRef.current
        ? Date.now() - backgroundAtRef.current
        : Infinity;
      backgroundAtRef.current = null;

      // Always kick RTDB connection — it's cheap and instant
      forceRtdbOnline();

      // Only refresh data if we were backgrounded long enough for listeners to go stale
      if (elapsed > STALE_THRESHOLD_MS) {
        onResumeRef.current?.();
      }
    };

    const handleOnline = () => {
      forceRtdbOnline();
      onResumeRef.current?.();
    };

    const handleFocus = () => {
      // Desktop tab focus — RTDB reconnect only (no full refresh unless stale)
      forceRtdbOnline();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);
}
