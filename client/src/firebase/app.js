import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { firebaseConfig, validateClientEnv } from './config.js';

export let auth = null;
export let firestore = null;
export let realtimeDb = null;
export let storage = null;
export let initError = null;

try {
  validateClientEnv();
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);
  realtimeDb = getDatabase(app);
  storage = getStorage(app);
} catch (error) {
  console.error('Firebase initialization failed:', error.message);
  initError = error.message;
}
