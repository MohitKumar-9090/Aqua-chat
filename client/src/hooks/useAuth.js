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

export const useAuth = () => {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const lastUidRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);

  const presenceUid =
    firebaseUser?.uid && !needsEmailVerification ? firebaseUser.uid : null;
  usePresenceSession(presenceUid);

  // Try to restore from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(SESSION_STORAGE_KEY);
      if (cached) {
        const session = JSON.parse(cached);
        if (Date.now() - session.timestamp < CACHE_DURATION) {
          // Restore from cache if still valid
          console.log('Restoring session from cache');
        }
      }
    } catch (err) {
      console.warn('Could not restore session:', err.message);
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
      setLoading(true);
      setFirebaseUser(user);
      setError('');

      if (!user) {
        if (lastUidRef.current) {
          stopPresenceSession(lastUidRef.current).catch(console.error);
          lastUidRef.current = null;
        }
        setProfile(null);
        setNeedsEmailVerification(false);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        setLoading(false);
        return;
      }

      if (isPasswordProvider(user) && !user.emailVerified) {
        setNeedsEmailVerification(true);
        setProfile(null);
        setLoading(false);
        return;
      }

      setNeedsEmailVerification(false);
      lastUidRef.current = user.uid;

      try {
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
        
        // Store session info
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
          uid: user.uid,
          timestamp: Date.now(),
          email: user.email,
          displayName: user.displayName
        }));
        
        // Store profile info for quick recovery
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(synced));
        
        setProfile(synced);
        primeUserCache(synced);
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(synced));
      } catch (err) {
        const message = err.message || 'Could not load your profile.';
        setError(message);
        
        // Provide a fallback profile from cache if available
        try {
          const cachedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
          if (cachedProfile) {
            const profile = JSON.parse(cachedProfile);
            if (profile._id === user.uid) {
              setProfile(profile);
              return;
            }
            localStorage.removeItem(PROFILE_STORAGE_KEY);
          }
        } catch (cacheErr) {
          // Cache read failed, continue with error
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
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(user));
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
