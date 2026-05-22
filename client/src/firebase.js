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
  signInWithPhoneNumber,
  updatePassword,
  updateProfile
} from 'firebase/auth';
import { firebaseConfig, validateClientEnv } from './config/env.js';

validateClientEnv();
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

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

export const googleLogin = () => signInWithPopup(auth, googleProvider);

export const createRecaptcha = () => {
  if (window.recaptchaVerifier) return window.recaptchaVerifier;

  window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible'
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
