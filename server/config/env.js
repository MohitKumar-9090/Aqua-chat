const requiredServerEnv = [
  'MONGODB_URI',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

const cleanValue = (value = '') => value.trim().replace(/,$/, '').replace(/^['"]|['"]$/g, '');

export const normalizeEnv = () => {
  requiredServerEnv.forEach((key) => {
    if (typeof process.env[key] === 'string') {
      process.env[key] = cleanValue(process.env[key]);
    }
  });
};

export const validateServerEnv = () => {
  normalizeEnv();
  const missing = requiredServerEnv.filter((key) => !process.env[key] || process.env[key].startsWith('YOUR_'));

  if (missing.length) {
    throw new Error(`Missing backend environment variables: ${missing.join(', ')}`);
  }

  if (!process.env.MONGODB_URI.includes('.mongodb.net/')) {
    console.warn('MONGODB_URI does not look like a MongoDB Atlas URI.');
  }

  if (/\.mongodb\.net\/(\?|$)/.test(process.env.MONGODB_URI)) {
    throw new Error('MONGODB_URI must include a database name, for example mongodb+srv://user:pass@cluster.mongodb.net/aquachat?retryWrites=true&w=majority');
  }

  if (/[<>"\s,]/.test(process.env.MONGODB_URI)) {
    throw new Error('MONGODB_URI contains invalid characters such as spaces, quotes, commas, or angle brackets.');
  }

  console.log('Backend env loaded', {
    mongo: Boolean(process.env.MONGODB_URI),
    cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
    firebaseAdmin: Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL)
  });
};

export const getFirebasePrivateKey = () => process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
