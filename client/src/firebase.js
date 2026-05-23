import { getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithPhoneNumber,
  updatePassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
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
  firestore = getFirestore(app);
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
  
  // Enable persistent login sessions
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.warn('Could not set persistence:', err.message);
  });

  // Handle redirect result from Google Sign-In
  getRedirectResult(auth).catch(err => {
    console.error('Redirect result error:', err.message);
  });

} catch (error) {
  console.error('Firebase initialization failed:', error.message);
  initError = error.message;
}

export const emailLogin = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);

export const emailSignup = async ({ email, password, displayName }) => {
  const name = displayName?.trim();
  if (!name) throw new Error('Name is required for signup.');

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }
  return credential;
};

export const changePassword = (user, password) => updatePassword(user, password);

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

export const createRecaptcha = () => {
  if (window.recaptchaVerifier) return window.recaptchaVerifier;

  window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: (token) => {
      // reCAPTCHA solved
    },
    'expired-callback': () => {
      // reCAPTCHA expired
      window.recaptchaVerifier = null;
    }
  });

  return window.recaptchaVerifier;
};

export const phoneLogin = (phoneNumber) => {
  const verifier = createRecaptcha();
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
};

export const completePhoneLogin = async (confirmation, otp, displayName) => {
  const credential = await confirmation.confirm(otp);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
};

/**
 * Monitor auth state with custom callback
 * Useful for global auth state management
 */
export const subscribeToAuthState = (callback) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};
