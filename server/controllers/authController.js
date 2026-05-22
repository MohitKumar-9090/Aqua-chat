import { asyncHandler } from '../utils/asyncHandler.js';
import { presentUser } from '../utils/userPresenter.js';

const compact = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));

const cleanUsername = (value) => value?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);

export const syncProfile = asyncHandler(async (req, res) => {
  const providerIds = req.firebaseUser.firebase?.sign_in_provider || '';
  const isPhoneUser = providerIds === 'phone';
  const bodyName = req.body.name || req.body.displayName;
  const bodyUsername = cleanUsername(req.body.username);
  const bodyPhone = req.body.phone || req.body.phoneNumber;
  const bodyPicture = req.body.profilePicture || req.body.photoURL;

  const updates = compact({
    displayName: bodyName || req.firebaseUser.name || req.user.displayName,
    username: bodyUsername || req.user.username,
    photoURL: bodyPicture || req.firebaseUser.picture || req.user.photoURL,
    email: (req.firebaseUser.email || req.body.email || req.user.email || '').trim().toLowerCase(),
    phoneNumber: (req.firebaseUser.phone_number || bodyPhone || req.user.phoneNumber || '').trim(),
    lastSeen: new Date()
  });

  if (isPhoneUser && bodyName) {
    updates.displayName = bodyName;
  }

  req.user.set(updates);
  try {
    await req.user.save();
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = 'Username is already taken';
    }
    throw error;
  }
  res.json({ user: presentUser(req.user), isNewUser: req.user.createdAt.getTime() === req.user.updatedAt.getTime() });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ user: presentUser(req.user) });
});
