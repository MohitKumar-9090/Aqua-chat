const requiredFirebaseEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || import.meta.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || import.meta.env.REACT_APP_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || import.meta.env.REACT_APP_FIREBASE_DATABASE_URL,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || import.meta.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || import.meta.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID
};
const derivedDatabaseURL = requiredFirebaseEnv.projectId ? `https://${requiredFirebaseEnv.projectId}-default-rtdb.firebaseio.com` : '';
const derivedStorageBucket = requiredFirebaseEnv.projectId ? `${requiredFirebaseEnv.projectId}.appspot.com` : '';

const mask = (value = '') => {
  if (!value) return 'missing';
  if (value.length <= 8) return 'loaded';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const invalidValue = (value) => !value || /(^\s|\s$|,$|^['"]|['"]$)/.test(value);

export const firebaseConfig = {
  apiKey: requiredFirebaseEnv.apiKey,
  authDomain: requiredFirebaseEnv.authDomain,
  projectId: requiredFirebaseEnv.projectId,
  appId: requiredFirebaseEnv.appId,
  databaseURL: requiredFirebaseEnv.databaseURL || derivedDatabaseURL,
  storageBucket: requiredFirebaseEnv.storageBucket || derivedStorageBucket,
  messagingSenderId: requiredFirebaseEnv.messagingSenderId
};

export const validateClientEnv = () => {
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId', 'databaseURL', 'storageBucket'];
  const missing = requiredKeys
    .map((key) => [key, firebaseConfig[key]])
    .filter(([, value]) => invalidValue(value))
    .map(([key]) => key);

  console.log('Firebase env check', {
    apiKey: mask(firebaseConfig.apiKey),
    authDomain: firebaseConfig.authDomain || 'missing',
    projectId: firebaseConfig.projectId || 'missing',
    appId: mask(firebaseConfig.appId),
    databaseURL: firebaseConfig.databaseURL || 'missing',
    storageBucket: firebaseConfig.storageBucket || 'missing'
  });

  if (missing.length) {
    throw new Error(`Invalid Firebase environment variables: ${missing.join(', ')}. Use KEY=value with no quotes, spaces, or commas.`);
  }
};
