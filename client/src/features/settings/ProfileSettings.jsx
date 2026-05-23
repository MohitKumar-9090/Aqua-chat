import { useEffect, useRef, useState } from 'react';
import { Camera, ImageIcon, KeyRound, X } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';
import { changePassword } from '../../firebase.js';

export default function ProfileSettings({ firebaseUser, profile, setProfile, onClose }) {
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    username: profile.username || '',
    bio: profile.bio || '',
    photoURL: profile.photoURL || ''
  });
  const [previewUrl, setPreviewUrl] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const canChangePassword = firebaseUser?.providerData?.some((provider) => provider.providerId === 'password');

  useEffect(() => {
    setForm({
      displayName: profile.displayName || '',
      username: profile.username || '',
      bio: profile.bio || '',
      photoURL: profile.photoURL || ''
    });
  }, [profile]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    setMessage('');
    setUploadProgress(0);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    try {
      const { user } = await api.uploadProfilePhoto(file, {
        onProgress: setUploadProgress
      });
      setProfile(user);
      setForm((current) => ({ ...current, photoURL: user.photoURL || '' }));
      setMessage('Profile picture updated');
    } catch (error) {
      setMessage(error.message);
      setPreviewUrl('');
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { user } = await api.updateProfile({
        name: form.displayName,
        username: form.username,
        profilePic: form.photoURL,
        bio: form.bio
      });
      setProfile(user);

      if (password && canChangePassword) {
        await changePassword(firebaseUser, password);
        setPassword('');
      }

      setMessage('Profile saved');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const displayPhoto = previewUrl || form.photoURL;

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-gradient-to-tr from-cyan-950/40 to-aqua-950/20 p-3 backdrop-blur-sm sm:place-items-center">
      <form onSubmit={saveProfile} className="w-full max-w-md animate-pop rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft-lg backdrop-blur-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-black text-cyan-950">Profile</h2>
          <button type="button" onClick={onClose} className="rounded-2xl p-2 text-slate-500 transition duration-200 hover:bg-aqua-100/60">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="rounded-full bg-gradient-to-tr from-cyan-500 via-aqua-400 to-emerald-400 p-[3px] shadow-lg">
            <Avatar name={form.displayName} image={displayPhoto} size="xl" />
          </div>
          {busy && uploadProgress > 0 && (
            <div className="w-full max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-aqua-100">
                <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-2 rounded-2xl border border-aqua-200 bg-white px-4 py-2.5 text-sm font-bold text-cyan-900 shadow-sm disabled:opacity-50"
            >
              <ImageIcon size={16} />
              Gallery
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 px-4 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
            >
              <Camera size={16} />
              Camera
            </button>
          </div>
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => uploadPhoto(event.target.files?.[0])}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(event) => uploadPhoto(event.target.files?.[0])}
          />
        </div>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Name</span>
          <input value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm outline-none transition focus:border-aqua-300/80" />
        </label>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Username</span>
          <input value={form.username} onChange={(event) => updateField('username', event.target.value)} className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm outline-none transition focus:border-aqua-300/80" />
        </label>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Bio</span>
          <textarea value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm outline-none transition focus:border-aqua-300/80" />
        </label>

        <label className="mb-4 block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-950">
            <KeyRound size={15} />
            New password
          </span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            disabled={!canChangePassword}
            placeholder={canChangePassword ? 'Optional' : 'Not available for Google or phone login'}
            className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm outline-none disabled:bg-slate-50/60"
          />
        </label>

        <button disabled={busy} className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 px-4 py-3 font-bold text-white shadow-lg disabled:opacity-50">
          {busy ? 'Saving...' : 'Save changes'}
        </button>

        {message && <p className="mt-4 rounded-2xl border border-aqua-200/60 bg-aqua-100/60 px-4 py-3 text-sm font-bold text-cyan-800">{message}</p>}
      </form>
    </div>
  );
}
