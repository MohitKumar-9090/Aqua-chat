import { onDisconnect, onValue, ref as dbRef, serverTimestamp, set } from 'firebase/database';
import { realtimeDb } from '../firebase.js';

const connectedRef = () => dbRef(realtimeDb, '.info/connected');
const presenceRef = (uid) => dbRef(realtimeDb, `presence/${uid}`);

let activeUid = null;
let connectedUnsubscribe = null;

const offlinePayload = () => ({
  online: false,
  isOnline: false,
  lastSeen: serverTimestamp()
});

const onlinePayload = () => ({
  online: true,
  isOnline: true,
  lastSeen: serverTimestamp()
});

/**
 * Firebase RTDB presence (https://firebase.google.com/docs/firestore/solutions/presence)
 * Waits for `.info/connected` before writing and registering onDisconnect.
 */
export const startPresenceSession = (uid) => {
  if (!realtimeDb || !uid) return () => {};

  if (activeUid && activeUid !== uid) {
    stopPresenceSession(activeUid);
  }
  activeUid = uid;

  connectedUnsubscribe?.();
  connectedUnsubscribe = onValue(connectedRef(), (snap) => {
    if (snap.val() !== true) return;

    const ref = presenceRef(uid);
    set(ref, onlinePayload()).catch((error) => {
      console.error('Presence online write failed:', error);
    });

    onDisconnect(ref)
      .set(offlinePayload())
      .catch((error) => {
        console.error('Presence onDisconnect registration failed:', error);
      });
  });

  return () => stopPresenceSession(uid);
};

/** Explicit offline (logout, account switch). */
export const stopPresenceSession = async (uid) => {
  connectedUnsubscribe?.();
  connectedUnsubscribe = null;

  if (uid && realtimeDb) {
    try {
      await set(presenceRef(uid), offlinePayload());
    } catch (error) {
      console.error('Presence offline write failed:', error);
    }
  }

  if (activeUid === uid) activeUid = null;
};

/** Heartbeat while app is focused (updates lastSeen, keeps online). */
export const touchPresence = async (uid) => {
  if (!realtimeDb || !uid || activeUid !== uid) return;
  try {
    await set(presenceRef(uid), onlinePayload());
  } catch (error) {
    console.error('Presence touch failed:', error);
  }
};

export const getActivePresenceUid = () => activeUid;
