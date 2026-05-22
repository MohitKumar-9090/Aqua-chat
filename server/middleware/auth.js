import { firebaseAdmin } from '../config/firebase.js';
import User from '../models/User.js';
import { asyncHandler, createError } from '../utils/asyncHandler.js';

const usernameFromDecoded = (decoded) =>
  `${decoded.email?.split('@')[0] || decoded.name || decoded.phone_number || 'user'}${decoded.uid.slice(0, 6)}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);

const profileFromFirebase = (decoded) => ({
  displayName: decoded.name || decoded.email?.split('@')[0] || decoded.phone_number || 'New Friend',
  username: usernameFromDecoded(decoded),
  email: decoded.email?.trim().toLowerCase(),
  phoneNumber: decoded.phone_number?.trim(),
  photoURL: decoded.picture || '',
  lastSeen: new Date()
});

const compact = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw createError(401, 'Missing Firebase ID token');
  }

  if (!firebaseAdmin.apps.length) {
    throw createError(500, 'Firebase Admin is not configured');
  }

  const decoded = await firebaseAdmin.auth().verifyIdToken(token);
  req.firebaseUser = decoded;
  const firebaseProfile = profileFromFirebase(decoded);
  req.user = await User.findOneAndUpdate(
    { firebaseUid: decoded.uid },
    {
      $setOnInsert: firebaseProfile,
      $set: compact({
        email: firebaseProfile.email,
        phoneNumber: firebaseProfile.phoneNumber,
        photoURL: firebaseProfile.photoURL,
        lastSeen: new Date()
      })
    },
    { upsert: true, new: true }
  );

  next();
});

export const ensureChatMember = (chat, userId) => {
  return chat.participants.some((participant) => participant.user.toString() === userId.toString());
};

export const ensureChatAdmin = (chat, userId) => {
  return chat.participants.some(
    (participant) => participant.user.toString() === userId.toString() && participant.role === 'admin'
  );
};
