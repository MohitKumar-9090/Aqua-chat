import admin from 'firebase-admin';
import { getFirebasePrivateKey, normalizeEnv } from './env.js';

normalizeEnv();
const privateKey = getFirebasePrivateKey();

if (!admin.apps.length) {
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    console.warn('Firebase Admin credentials are missing. Authenticated routes will fail until server/.env is configured.');
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      });
      console.log('Firebase Admin initialized');
    } catch (error) {
      console.error(`Firebase Admin initialization failed: ${error.message}`);
    }
  }
}

export const firebaseAdmin = admin;
