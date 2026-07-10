import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary';
import emailService from './services/emailService.js';

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

console.log("Server Starting...");
console.log("Firebase Mode Enabled");
console.log("MongoDB Removed Successfully");

// ─── Cloudinary configuration ───────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  console.log(`Cloudinary configured: ${process.env.CLOUDINARY_CLOUD_NAME}`);
} else {
  console.warn('Cloudinary env vars missing — delete endpoint will not work.');
}

// ─── Firebase Admin (lazy, for auth verification) ────────────────────
let firebaseAdmin = null;

const getFirebaseAdmin = async () => {
  if (firebaseAdmin) return firebaseAdmin;
  const admin = await import('firebase-admin');
  if (!admin.default.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.default.initializeApp({
          credential: admin.default.credential.cert(serviceAccount)
        });
        console.log('[FirebaseAdmin] Initialized successfully using FIREBASE_SERVICE_ACCOUNT_JSON.');
      } catch (err) {
        console.error('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
        throw err;
      }
    } else {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        admin.default.initializeApp({
          credential: admin.default.credential.cert({ projectId, clientEmail, privateKey })
        });
        console.log('[FirebaseAdmin] Initialized successfully using project credentials.');
      } else {
        admin.default.initializeApp();
        console.log('[FirebaseAdmin] Initialized successfully using default credentials.');
      }
    }
  }
  firebaseAdmin = admin.default;
  return firebaseAdmin;
};

/**
 * Middleware: verify Firebase ID token from Authorization header.
 */
const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }
  try {
    const admin = await getFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (err) {
    console.warn('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid auth token.' });
  }
};

// ─── Routes ──────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send('AquaChat Firebase Backend Running');
});

/**
 * POST /api/auth/send-verification
 * Body: { email: string, redirectUrl?: string, firstName?: string }
 */
app.post('/api/auth/send-verification', async (req, res) => {
  const { email, redirectUrl, firstName } = req.body;

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.', code: 'auth/invalid-email' });
  }

  try {
    const admin = await getFirebaseAdmin();
    
    // 1. Verify user exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email.trim());
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, error: 'No user registered with this email address.', code: 'auth/user-not-found' });
      }
      console.error('[Auth] Error getting user by email:', err);
      return res.status(500).json({ success: false, error: err.message || 'Error checking user registration.', code: err.code || 'auth/internal-error' });
    }

    // 2. Generate Firebase Auth verification action link
    const defaultUrl = `https://${process.env.FIREBASE_PROJECT_ID || 'you-me-96515'}.firebaseapp.com`;
    const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || defaultUrl;
    const actionSettings = {
      url: redirectUrl || frontendUrl,
      handleCodeInApp: true
    };
    
    let verificationLink;
    try {
      verificationLink = await admin.auth().generateEmailVerificationLink(email.trim(), actionSettings);
    } catch (err) {
      console.error('[Auth] Error generating verification link:', err);
      return res.status(500).json({ success: false, error: `Firebase Admin failed to generate verification link: ${err.message}`, code: err.code || 'auth/link-generation-failed' });
    }

    // 3. Extract/format first name
    let parsedFirstName = firstName?.trim();
    if (!parsedFirstName && userRecord.displayName) {
      parsedFirstName = userRecord.displayName.trim().split(' ')[0];
    }
    if (!parsedFirstName) {
      parsedFirstName = 'there';
    }

    // 4. Send email using Resend
    try {
      await emailService.sendVerificationEmail(email.trim(), verificationLink, parsedFirstName);
    } catch (err) {
      console.error('[Auth] Resend service failed to deliver email:', err);
      return res.status(500).json({ success: false, error: `Email delivery failed: ${err.message}`, code: 'auth/email-delivery-failed' });
    }

    res.json({ success: true, ok: true, message: 'Verification email sent successfully.' });
  } catch (err) {
    console.error('[Auth] Unexpected error in send-verification:', err);
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack);
    res.status(500).json({ success: false, error: err.message || 'Could not send verification email.', code: err.code || 'auth/internal-error' });
  }
});

/**
 * POST /api/auth/send-password-reset
 * Body: { email: string, redirectUrl?: string, firstName?: string }
 */
app.post('/api/auth/send-password-reset', async (req, res) => {
  const { email, redirectUrl, firstName } = req.body;

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.', code: 'auth/invalid-email' });
  }

  try {
    const admin = await getFirebaseAdmin();

    // 1. Verify user exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email.trim());
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({ success: false, error: 'No user registered with this email address.', code: 'auth/user-not-found' });
      }
      console.error('[Auth] Error getting user by email:', err);
      return res.status(500).json({ success: false, error: err.message || 'Error checking user registration.', code: err.code || 'auth/internal-error' });
    }

    // 2. Generate Firebase Auth password reset action link
    const defaultUrl = `https://${process.env.FIREBASE_PROJECT_ID || 'you-me-96515'}.firebaseapp.com`;
    const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || defaultUrl;
    const actionSettings = {
      url: redirectUrl || frontendUrl,
      handleCodeInApp: true
    };

    let resetLink;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email.trim(), actionSettings);
    } catch (err) {
      console.error('[Auth] Error generating password reset link:', err);
      return res.status(500).json({ success: false, error: `Firebase Admin failed to generate password reset link: ${err.message}`, code: err.code || 'auth/link-generation-failed' });
    }

    // 3. Extract/format first name
    let parsedFirstName = firstName?.trim();
    if (!parsedFirstName && userRecord.displayName) {
      parsedFirstName = userRecord.displayName.trim().split(' ')[0];
    }
    if (!parsedFirstName) {
      parsedFirstName = 'there';
    }

    // 4. Send email using Resend
    try {
      await emailService.sendPasswordResetEmail(email.trim(), resetLink, parsedFirstName);
    } catch (err) {
      console.error('[Auth] Resend service failed to deliver email:', err);
      return res.status(500).json({ success: false, error: `Email delivery failed: ${err.message}`, code: 'auth/email-delivery-failed' });
    }

    res.json({ success: true, ok: true, message: 'Password reset email sent successfully.' });
  } catch (err) {
    console.error('[Auth] Unexpected error in send-password-reset:', err);
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    console.error('Error Stack:', err.stack);
    res.status(500).json({ success: false, error: err.message || 'Could not send password reset email.', code: err.code || 'auth/internal-error' });
  }
});


/**
 * POST /api/cloudinary/delete
 * Body: { publicId: string, resourceType?: 'image' | 'video' | 'raw' }
 * Requires valid Firebase ID token in Authorization header.
 */
app.post('/api/cloudinary/delete', verifyAuth, async (req, res) => {
  const { publicId, resourceType = 'image' } = req.body;

  if (!publicId || typeof publicId !== 'string') {
    return res.status(400).json({ error: 'Missing publicId.' });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true
    });
    console.log(`[Cloudinary] Deleted ${resourceType}/${publicId}: ${result.result}`);
    res.json({ ok: true, result: result.result });
  } catch (err) {
    console.error('[Cloudinary] Delete failed:', err.message);
    res.status(500).json({ error: 'Could not delete media.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
