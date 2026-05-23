import { useEffect } from 'react';
import { startPresenceSession, touchPresence } from '../services/presence.js';

/**
 * Keeps the signed-in user's RTDB presence in sync (connect / disconnect / visibility).
 */
export function usePresenceSession(uid) {
  useEffect(() => {
    if (!uid) return undefined;
    return startPresenceSession(uid);
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        touchPresence(uid).catch(console.error);
      }
    };

    const onFocus = () => touchPresence(uid).catch(console.error);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [uid]);
}
