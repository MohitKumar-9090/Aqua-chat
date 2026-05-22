import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { api, setCurrentPresence } from '../api.js';

export const useAuth = () => {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setFirebaseUser(user);
      setError('');

      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const pendingPhoneProfile = JSON.parse(localStorage.getItem('pendingPhoneProfile') || 'null');
        const { user: synced } = await api.sync({
          name: pendingPhoneProfile?.name || user.displayName,
          displayName: pendingPhoneProfile?.name || user.displayName,
          username: pendingPhoneProfile?.username,
          phone: pendingPhoneProfile?.phone || user.phoneNumber,
          phoneNumber: pendingPhoneProfile?.phone || user.phoneNumber,
          email: pendingPhoneProfile?.email || user.email,
          profilePicture: user.photoURL,
          photoURL: user.photoURL
        });
        localStorage.removeItem('pendingPhoneProfile');
        setProfile(synced);
        setCurrentPresence(user.uid);
      } catch (err) {
        setError(err.message || 'Could not load your profile.');
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

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,
      setProfile,
      loading,
      error,
      logout: () => signOut(auth)
    }),
    [firebaseUser, profile, loading, error]
  );

  return value;
};
