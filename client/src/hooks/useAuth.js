import { useEffect, useMemo, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, isPasswordProvider } from '../firebase.js';
import { api, primeUserCache } from '../api.js';
import { stopPresenceSession } from '../services/presence.js';
import { usePresenceSession } from './usePresenceSession.js';

const SESSION_STORAGE_KEY = 'aquachat_session';
const PROFILE_STORAGE_KEY = 'aquachat_profile';
const PENDING_SIGNUP_KEY = 'pendingSignupProfile';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const pruneProfileForStorage = (profile) => {
  if (!profile) return null;
  return {
    _id: profile._id,
    uid: profile.uid,
    firebaseUid: profile.firebaseUid,
    displayName: profile.displayName,
    name: profile.name,
    username: profile.username,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    phone: profile.phone,
    photoURL: profile.photoURL,
    profilePic: profile.profilePic,
    profilePicture: profile.profilePicture,
    bio: profile.bio,
    isOnline: profile.isOnline,
    lastSeen: profile.lastSeen
  };
};

const cleanOldCacheKeys = () => {
  try {
    const allowedKeys = [
      SESSION_STORAGE_KEY,
      PROFILE_STORAGE_KEY,
      PENDING_SIGNUP_KEY,
      'aquachat_status_viewed',
      'aquachat_install_dismissed'
    ];

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;

      const isAppKey = allowedKeys.includes(key);
      const isFirebaseKey = key.startsWith('firebase:');

      if (!isAppKey && !isFirebaseKey) {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn('Cache cleanup failed:', err.message);
  }
};

export const useAuth = () => {
  const lastUidRef = useRef(null);
  const [error, setError] = useState('');
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  // Synchronous recovery from localStorage for instant boot
  const getInitialSession = () => {
    try {
      const cached = localStorage.getItem(SESSION_STORAGE_KEY);
      if (cached) {
        const session = JSON.parse(cached);
        if (Date.now() - session.timestamp < CACHE_DURATION) {
          return session;
        }
      }
    } catch (err) {
      console.warn('Could not read session cache:', err.message);
    }
    return null;
  };

  const getInitialProfile = () => {
    try {
      const cached = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (cached) {
        const profile = JSON.parse(cached);
        const session = getInitialSession();
        if (session && profile._id === session.uid) {
          return profile;
        }
      }
    } catch (err) {
      console.warn('Could not read profile cache:', err.message);
    }
    return null;
  };

  const initialSession = getInitialSession();
  const initialProfile = getInitialProfile();

  const [firebaseUser, setFirebaseUser] = useState(() => initialSession ? {
    uid: initialSession.uid,
    email: initialSession.email,
    displayName: initialSession.displayName,
    emailVerified: true
  } : null);

  const [profile, setProfile] = useState(() => initialProfile);
  const [loading, setLoading] = useState(() => !initialSession);

  const profileRef = useRef(initialProfile);
  profileRef.current = profile;

  const presenceUid =
    firebaseUser?.uid && !needsEmailVerification ? firebaseUser.uid : null;
  usePresenceSession(presenceUid);

  // Clean stale keys and set initial refs
  useEffect(() => {
    cleanOldCacheKeys();
    if (initialSession?.uid) {
      lastUidRef.current = initialSession.uid;
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    getRedirectResult(auth).catch((err) => {
      if (err.code !== 'auth/no-auth-event') {
        setError(err.message || 'Google sign-in redirect failed.');
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setError('');

      if (!user) {
        if (lastUidRef.current) {
          stopPresenceSession(lastUidRef.current).catch(console.error);
          lastUidRef.current = null;
        }
        setFirebaseUser(null);
        setProfile(null);
        setNeedsEmailVerification(false);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        setLoading(false);
        return;
      }

      // Prevent repeated rehydration if user is already hydrated and active
      if (user.uid === lastUidRef.current && profileRef.current) {
        setFirebaseUser(user);
        setLoading(false);
        return;
      }

      setFirebaseUser(user);
      setLoading(true);
      setNeedsEmailVerification(isPasswordProvider(user) && !user.emailVerified);

      if (isPasswordProvider(user) && !user.emailVerified) {
        setProfile(null);
        setLoading(false);
        return;
      }

      lastUidRef.current = user.uid;

      try {
        // Hydrate from localStorage first to avoid flashes
        const cachedProfileRaw = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (cachedProfileRaw) {
          const cachedProfile = JSON.parse(cachedProfileRaw);
          if (cachedProfile._id === user.uid) {
            setProfile(cachedProfile);
            setLoading(false);
          }
        }

        const pendingSignup = JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) || 'null');
        const { user: synced } = await api.sync({
          name: pendingSignup?.name || user.displayName,
          displayName: pendingSignup?.name || user.displayName,
          username: pendingSignup?.username,
          email: pendingSignup?.email || user.email,
          profilePicture: user.photoURL,
          photoURL: user.photoURL
        });
        localStorage.removeItem(PENDING_SIGNUP_KEY);

        const pruned = pruneProfileForStorage(synced);

        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          uid: user.uid,
          timestamp: Date.now(),
          email: user.email,
          displayName: user.displayName
        }));

        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(pruned));

        setProfile(synced);
        primeUserCache(synced);
      } catch (err) {
        const message = err.message || 'Could not load your profile.';
        setError(message);

        // Fallback to cache
        try {
          const cachedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
          if (cachedProfile) {
            const fallbackProfile = JSON.parse(cachedProfile);
            if (fallbackProfile._id === user.uid) {
              setProfile(fallbackProfile);
              return;
            }
          }
        } catch (cacheErr) {
          // ignore
        }

        setProfile({
          _id: user.uid,
          firebaseUid: user.uid,
          displayName: user.displayName || user.email || user.phoneNumber || 'AquaChat user',
          username: '',
          email: user.email || '',
          phoneNumber: user.phoneNumber || '',
          photoURL: user.photoURL || '',
          bio: '',
          isOnline: true,
          lastSeen: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || needsEmailVerification) return undefined;
    return api.subscribeUser(uid, (user) => {
      if (!user) return;
      primeUserCache(user);
      setProfile((current) => ({ ...current, ...user }));
      const pruned = pruneProfileForStorage(user);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(pruned));
    });
  }, [firebaseUser?.uid, needsEmailVerification]);

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,
      setProfile,
      loading,
      error,
      needsEmailVerification,
      logout: async () => {
        const uid = auth?.currentUser?.uid || profile?._id;
        if (uid) await stopPresenceSession(uid);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        auth && signOut(auth);
      }
    }),
    [firebaseUser, profile, loading, error, needsEmailVerification]
  );

  return value;
};
