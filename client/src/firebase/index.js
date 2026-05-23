export { auth, firestore, realtimeDb, storage, initError } from './app.js';
export {
  emailLogin,
  emailSignup,
  changePassword,
  googleLogin,
  createRecaptcha,
  phoneLogin,
  completePhoneLogin,
  googleProvider
} from './auth.js';
export { firebaseConfig, validateClientEnv } from './config.js';
