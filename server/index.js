import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Serve APK files from downloads directory
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// ─── Utilities ───────────────────────────────────────────────────────

/**
 * Format bytes to human-readable size string
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
};

/**
 * Get APK file information
 */
const getApkInfo = () => {
  try {
    const apkPath = path.join(__dirname, 'downloads', 'AquaChat.apk');
    const stats = fs.statSync(apkPath);
    return {
      name: 'AquaChat',
      version: 'v1.0.0',
      size: formatFileSize(stats.size),
      sizeBytes: stats.size,
      available: true
    };
  } catch (error) {
    console.warn('[APK] File not found:', error.message);
    return {
      name: 'AquaChat',
      version: 'v1.0.0',
      size: 'unavailable',
      available: false
    };
  }
};

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
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      admin.default.initializeApp({
        credential: admin.default.credential.cert({ projectId, clientEmail, privateKey })
      });
    } else {
      admin.default.initializeApp();
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
 * GET /api/apk-info
 * Returns current APK metadata including file size
 * No authentication required
 */
app.get('/api/apk-info', (req, res) => {
  const apkInfo = getApkInfo();
  res.json(apkInfo);
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
