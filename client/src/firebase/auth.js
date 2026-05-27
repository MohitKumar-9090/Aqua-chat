import {
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
  indexedDBLocalPersistence
} from 'firebase/auth';
import { auth } from './app.js';

export let googleProvider = null;

if (auth) {
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('profile');
  googleProvider.addScope('email');
  googleProvider.setCustomParameters({
    prompt: 'select_account',
    access_type: 'offline'
  });

  if (typeof window !== 'undefined' && !window.__firebaseAuthPersistenceSet) {
    window.__firebaseAuthPersistenceSet = true;
    setPersistence(auth, indexedDBLocalPersistence).catch((err) => {
      console.warn('Could not set persistence:', err.message);
    });
  }

  getRedirectResult(auth).catch((err) => {
    console.error('Redirect result error:', err.message);
  });
}

export const emailLogin = (email, password) =>
  signInWithEmailAndPassword(auth, email.trim(), password);

export const emailSignup = async ({ email, password, displayName }) => {
  const name = displayName?.trim();
  if (!name) throw new Error('Name is required for signup.');

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name) await updateProfile(credential.user, { displayName });
  return credential;
};

export const changePassword = (user, password) => updatePassword(user, password);

export const googleLogin = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
      await signInWithRedirect(auth, googleProvider);
      return { redirecting: true };
    }
    if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Popup request cancelled. Please try again.');
    }
    if (error.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your internet connection.');
    }
    if (error.code === 'auth/invalid-credential') {
      throw new Error('Invalid Google credentials. Please try again or use another method.');
    }
    throw new Error(`Sign-in failed: ${error.message}`);
  }
};

export const createRecaptcha = () => {
  if (window.recaptchaVerifier) return window.recaptchaVerifier;

  window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    'expired-callback': () => {
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
  if (displayName) await updateProfile(credential.user, { displayName });
  return credential;
};
