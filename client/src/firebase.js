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
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  updateProfile,
  setPersistence,
  indexedDBLocalPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { firebaseConfig, validateClientEnv } from './config/env.js';

export let auth = null;
export let firestore = null;
export let realtimeDb = null;
export let storage = null;
export let googleProvider = null;
export let initError = null;

try {
  validateClientEnv();
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
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
  
  // Enable persistent login sessions with a guard to ensure initialized only once
  if (typeof window !== 'undefined' && !window.__firebaseAuthPersistenceSet) {
    window.__firebaseAuthPersistenceSet = true;
    setPersistence(auth, indexedDBLocalPersistence).catch(err => {
      console.warn('Could not set persistence:', err.message);
    });
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
  await sendEmailVerification(credential.user, getAuthActionSettings());
  await signOut(auth);
  return { email: email.trim(), displayName: name };
};

export const resendVerificationEmail = async (user) => {
  if (!user) throw new Error('Sign in to resend verification email.');
  await sendEmailVerification(user, getAuthActionSettings());
};

export const sendPasswordReset = (email) =>
  sendPasswordResetEmail(auth, email.trim(), getAuthActionSettings());

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

