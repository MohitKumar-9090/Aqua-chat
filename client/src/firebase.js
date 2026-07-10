import { getApps, initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getDatabase, goOffline as rtdbGoOffline, goOnline as rtdbGoOnline } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import {
  applyActionCode,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updatePassword,
  updateProfile,
  setPersistence,
  indexedDBLocalPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential,
  onAuthStateChanged
} from 'firebase/auth';
import { firebaseConfig, validateClientEnv } from './config/env.js';

export let auth = null;
export let firestore = null;
export let realtimeDb = null;
export let storage = null;
export let googleProvider = null;
export let initError = null;
export let authPersistenceReady = Promise.resolve();
export let authReadyPromise = Promise.resolve();

try {
  validateClientEnv();
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  let resolveAuthReady;
  authReadyPromise = new Promise((resolve) => {
    resolveAuthReady = resolve;
  });
  const unsub = onAuthStateChanged(auth, (user) => {
    resolveAuthReady(user);
    unsub();
  });

  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '')) {
    firestore = initializeFirestore(app, {});
  } else {
    firestore = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  }
  realtimeDb = getDatabase(app);
  storage = getStorage(app);
  
  // Configure Google Auth Provider with proper scopes
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('profile');
  googleProvider.addScope('email');
  googleProvider.setCustomParameters({
    prompt: 'select_account', // Force account selection
    access_type: 'offline'
  });
  
  // Enable persistent login sessions once and expose the promise so the app
  // waits for persisted auth hydration before rendering protected screens.
  if (typeof window !== 'undefined') {
    if (!window.__firebaseAuthPersistencePromise) {
      window.__firebaseAuthPersistencePromise = setPersistence(auth, indexedDBLocalPersistence).catch(err => {
        console.warn('Could not set persistence:', err.message);
      });
    }
    authPersistenceReady = window.__firebaseAuthPersistencePromise;
  }

} catch (error) {
  console.error('Firebase initialization failed:', error.message);
  initError = error.message;
}

export const getAuthActionSettings = () => ({
  url: window.location.origin,
  handleCodeInApp: true
});

export const emailLogin = (email, password) =>
  signInWithEmailAndPassword(auth, email.trim(), password);

export const emailSignup = async ({ email, password, displayName }) => {
  const name = displayName?.trim();
  if (!name) throw new Error('Name is required for signup.');

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name) await updateProfile(credential.user, { displayName: name });
  
  const serverUrl = import.meta.env.VITE_SERVER_URL || '';
  const response = await fetch(`${serverUrl}/api/auth/send-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email.trim(),
      redirectUrl: window.location.origin,
      firstName: name
    })
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Verification request did not reach the server. Please check your deployment configuration.'
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error || 'Failed to send verification email.');
    if (data.code) err.code = data.code;
    throw err;
  }

  await signOut(auth);
  return { email: email.trim(), displayName: name };
};

export const resendVerificationEmail = async (user) => {
  if (!user) throw new Error('Sign in to resend verification email.');
  const serverUrl = import.meta.env.VITE_SERVER_URL || '';
  const response = await fetch(`${serverUrl}/api/auth/send-verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: user.email,
      redirectUrl: window.location.origin,
      firstName: user.displayName || undefined
    })
  });

  const contentType2 = response.headers.get('content-type') || '';
  if (!contentType2.includes('application/json')) {
    throw new Error(
      'Verification request did not reach the server. Please check your deployment configuration.'
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error || 'Failed to send verification email.');
    if (data.code) err.code = data.code;
    throw err;
  }
};

export const sendPasswordReset = async (email) => {
  const serverUrl = import.meta.env.VITE_SERVER_URL || '';
  const response = await fetch(`${serverUrl}/api/auth/send-password-reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email.trim(),
      redirectUrl: window.location.origin
    })
  });

  // Guard: if the response is HTML instead of JSON, the request hit the
  // SPA fallback (Vercel/Vite) and never reached the real backend.
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Password reset request did not reach the server. Please check your deployment configuration.'
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.error || 'Failed to send password reset email.');
    if (data.code) err.code = data.code;
    throw err;
  }

  // Even on 200, verify the backend confirmed success
  if (!data.success && !data.ok) {
    throw new Error(data.error || 'Server returned an unexpected response.');
  }
};

export const refreshAuthUser = async (user) => {
  if (!user) return null;
  await user.reload();
  return auth.currentUser;
};

export const verifyEmailWithCode = (oobCode) => applyActionCode(auth, oobCode);

export const isPasswordProvider = (user) =>
  user?.providerData?.some((provider) => provider.providerId === 'password') ?? false;

export { signOut };

/** Force RTDB to reconnect immediately (used on visibility resume). */
export const forceRtdbOnline = () => {
  if (realtimeDb) rtdbGoOnline(realtimeDb);
};

/** Hint RTDB to go offline (used on background). */
export const hintRtdbOffline = () => {
  if (realtimeDb) rtdbGoOffline(realtimeDb);
};

export const changePassword = (user, password) => updatePassword(user, password);

export const reauthenticateUser = async (user, currentPassword) => {
  if (!user || !user.email || !currentPassword) throw new Error('Missing reauthentication credentials.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  return reauthenticateWithCredential(user, credential);
};

/**
 * Google Sign-In with popup and redirect fallback
 * Handles popup blocked scenario by falling back to redirect
 */
export const googleLogin = async () => {
  try {
    // Try popup first
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    // Handle specific error cases
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
      console.warn('Popup blocked or closed, attempting redirect...');
      try {
        // Fallback to redirect method
        await signInWithRedirect(auth, googleProvider);
        // The result will be handled by getRedirectResult in init
        return { redirecting: true };
      } catch (redirectError) {
        throw new Error(`Google Sign-In failed: ${redirectError.message}`);
      }
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Popup request cancelled. Please try again.');
    } else if (error.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your internet connection.');
    } else if (error.code === 'auth/invalid-credential') {
      throw new Error('Invalid Google credentials. Please try again or use another method.');
    } else {
      throw new Error(`Sign-in failed: ${error.message}`);
    }
  }
};
