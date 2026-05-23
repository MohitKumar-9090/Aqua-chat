import { onAuthStateChanged } from 'firebase/auth';
import { onDisconnect, onValue, ref as dbRef, serverTimestamp, set } from 'firebase/database';
import { auth, realtimeDb } from '../firebase.js';

const connectedRef = () => dbRef(realtimeDb, '.info/connected');
const presenceRef = (uid) => dbRef(realtimeDb, `presence/${uid}`);

let activeUid = null;
let connectedUnsubscribe = null;
let authReadyUnsubscribe = null;

const offlinePayload = () => ({
  online: false,
  lastSeen: serverTimestamp()
});

const onlinePayload = () => ({
  online: true,
  lastSeen: serverTimestamp()
});

const assertAuthUid = (uid) => {
  const authUid = auth?.currentUser?.uid;
  if (!authUid) throw new Error('Auth not ready for presence.');
  if (authUid !== uid) throw new Error('Presence uid must match signed-in user.');
  return authUid;
};

const markOnline = async (uid) => {
  const ref = presenceRef(uid);
  await onDisconnect(ref).set(offlinePayload());
  await set(ref, onlinePayload());
};

/**
 * Firebase RTDB presence: .info/connected → onDisconnect(offline) → set(online).
 * https://firebase.google.com/docs/firestore/solutions/presence
 */
export const startPresenceSession = (uid) => {
  if (!realtimeDb || !uid) return () => {};

  if (activeUid === uid && connectedUnsubscribe) {
    return () => stopPresenceSession(uid);
  }

  if (activeUid && activeUid !== uid) {
    stopPresenceSession(activeUid);
  }

  activeUid = uid;
  connectedUnsubscribe?.();
  authReadyUnsubscribe?.();

  const beginConnectedListener = () => {
    connectedUnsubscribe = onValue(connectedRef(), (snap) => {
      if (snap.val() !== true) return;

      try {
        assertAuthUid(uid);
      } catch {
        return;
      }

      markOnline(uid).catch((error) => {
        console.error('Presence online setup failed:', error?.message || error);
      });
    });
  };

  if (auth?.currentUser?.uid === uid) {
    beginConnectedListener();
  } else {
    authReadyUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== uid) return;
      authReadyUnsubscribe?.();
      authReadyUnsubscribe = null;
      beginConnectedListener();
    });
  }

  return () => stopPresenceSession(uid);
};

/** Explicit offline (logout, account switch). */
export const stopPresenceSession = async (uid) => {
  connectedUnsubscribe?.();
  connectedUnsubscribe = null;
  authReadyUnsubscribe?.();
  authReadyUnsubscribe = null;

  if (uid && realtimeDb) {
    const ref = presenceRef(uid);
    try {
      await onDisconnect(ref).cancel();
    } catch {
      // No onDisconnect registered yet.
    }
    try {
      if (auth?.currentUser?.uid === uid) {
        await set(ref, offlinePayload());
      }
    } catch (error) {
      console.error('Presence offline write failed:', error);
    }
  }

  if (activeUid === uid) activeUid = null;
};

/** Refresh online + lastSeen when the tab becomes active again. */
export const touchPresence = async (uid) => {
  if (!realtimeDb || !uid || activeUid !== uid) return;
  try {
    assertAuthUid(uid);
    await set(presenceRef(uid), onlinePayload());
  } catch (error) {
    console.error('Presence touch failed:', error?.message || error);
  }
};

export const getActivePresenceUid = () => activeUid;
