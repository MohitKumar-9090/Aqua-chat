import { useRef, useState } from 'react';
import { Camera, KeyRound, X } from 'lucide-react';
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
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const canChangePassword = firebaseUser?.providerData?.some((provider) => provider.providerId === 'password');

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const uploaded = await api.upload(file);
      updateField('photoURL', uploaded.url);
      const { user } = await api.updateProfile({ profilePic: uploaded.url });
      setProfile(user);
      setForm((current) => ({ ...current, photoURL: user.photoURL || uploaded.url }));
      setMessage('Profile picture updated');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
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

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-gradient-to-tr from-cyan-950/40 to-aqua-950/20 p-3 backdrop-blur-sm sm:place-items-center">
      <form onSubmit={saveProfile} className="w-full max-w-md animate-pop rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft-lg backdrop-blur-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-black text-cyan-950">Profile</h2>
          <button type="button" onClick={onClose} className="rounded-2xl p-2 text-slate-500 transition duration-200 hover:bg-aqua-100/60">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <Avatar name={form.displayName} image={form.photoURL} size="xl" />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-100 to-rose-50 px-4 py-2.5 text-sm font-bold text-rose-600 transition duration-200 hover:bg-gradient-to-r hover:from-rose-200 hover:to-rose-100">
              <Camera size={16} />
              Change
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
          </div>
        </div>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Name</span>
          <input value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" />
        </label>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Username</span>
          <input value={form.username} onChange={(event) => updateField('username', event.target.value)} className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" />
        </label>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Bio</span>
          <textarea value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" />
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
            className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft disabled:bg-slate-50/60 disabled:text-slate-400"
          />
        </label>

        <button disabled={busy} className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 px-4 py-3 font-bold text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-50 disabled:shadow-none">
          {busy ? 'Saving...' : 'Save changes'}
        </button>

        {message && <p className="mt-4 rounded-2xl bg-aqua-100/60 border border-aqua-200/60 px-4 py-3 text-sm font-bold text-cyan-800">{message}</p>}
      </form>
    </div>
  );
}
