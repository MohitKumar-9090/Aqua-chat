import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  Shield,
  Sun,
  UserRound,
  Users,
  X
} from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';
import { changePassword, reauthenticateUser } from '../../firebase.js';

const pages = {
  main: 'Settings',
  account: 'Account',
  profile: 'Profile',
  theme: 'Theme',
  security: 'Security',
  password: 'Change Password',
  blocked: 'Blocked Users',
  privacy: 'Status Privacy'
};

const cleanId = (uid) => String(uid || '').trim();

function Row({ icon: Icon, title, subtitle, tone = 'default', onClick, children }) {
  const toneClass = tone === 'danger' ? 'text-rose-600' : 'text-cyan-950';
  return (
    <button
      type="button"
      onClick={onClick}
      className="settings-row flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition duration-200 hover:bg-aqua-50/70 active:scale-[0.99]"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-aqua-50 text-cyan-700'}`}>
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-black ${toneClass}`}>{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{subtitle}</span>}
      </span>
      {children || <ChevronRight size={18} className="shrink-0 text-slate-400" />}
    </button>
  );
}

function Field({ label, value, onChange, multiline = false, placeholder = '', type = 'text' }) {
  const Input = multiline ? 'textarea' : 'input';
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={multiline ? 3 : undefined}
        type={multiline ? undefined : type}
        placeholder={placeholder}
        className="settings-input w-full rounded-xl border border-aqua-100/70 bg-white px-4 py-3 text-sm text-cyan-950 outline-none transition focus:border-cyan-300"
      />
    </label>
  );
}

function buildConnectionList(profile, chats, users, fetchedUsers) {
  const meId = cleanId(profile?._id || profile?.uid);
  const ids = new Set((profile?.connections || []).map(cleanId).filter(Boolean));
  const byId = new Map();

  [...(users || []), ...(fetchedUsers || [])].forEach((user) => {
    const id = cleanId(user?._id || user?.uid);
    if (id && id !== meId) byId.set(id, user);
  });

  (chats || []).forEach((chat) => {
    if (chat?.type !== 'direct') return;
    (chat.participants || []).forEach((participant) => {
      const user = participant?.user;
      const id = cleanId(user?._id || user?.uid);
      if (id && id !== meId) {
        ids.add(id);
        byId.set(id, user);
      }
    });
    (chat.participantIds || []).forEach((id) => {
      const clean = cleanId(id);
      if (clean && clean !== meId) ids.add(clean);
    });
  });

  return [...ids].map((id) => byId.get(id) || { _id: id, displayName: 'AquaChat user', username: id.slice(0, 8) });
}

export default function ProfileSettings({ firebaseUser, profile, setProfile, chats = [], users = [], onClose, onLogout }) {
  const [page, setPage] = useState('main');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchedUsers, setFetchedUsers] = useState([]);
  const canChangePassword = firebaseUser?.providerData?.some((provider) => provider.providerId === 'password');

  const connectionIds = useMemo(() => (profile?.connections || []).map(cleanId).filter(Boolean), [profile?.connections]);
  const connections = useMemo(
    () => buildConnectionList(profile, chats, users, fetchedUsers),
    [profile, chats, users, fetchedUsers]
  );

  useEffect(() => {
    if (!connectionIds.length) {
      setFetchedUsers([]);
      return undefined;
    }
    let alive = true;
    api.usersByIds(connectionIds).then(({ users: rows }) => {
      if (alive) setFetchedUsers(rows || []);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [connectionIds.join('|')]);

  const saveUser = (user, note) => {
    setProfile((current) => ({ ...(current || {}), ...user }));
    setMessage(note);
  };

  const title = pages[page] || 'Settings';
  const showBack = page !== 'main';

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-cyan-950/35 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <section className="settings-panel flex h-[min(760px,100dvh)] w-full max-w-xl animate-slide-in flex-col overflow-hidden rounded-t-3xl border border-white/70 bg-white shadow-soft-xl sm:h-[720px] sm:rounded-3xl">
        <header className="settings-header flex shrink-0 items-center gap-2 border-b border-aqua-100/60 px-3 py-3">
          {showBack ? (
            <button type="button" onClick={() => { setPage(page === 'password' || page === 'blocked' || page === 'privacy' ? 'security' : 'main'); setMessage(''); }} className="rounded-full p-2 text-slate-600 hover:bg-aqua-50" title="Back">
              <ArrowLeft size={21} />
            </button>
          ) : (
            <Avatar user={profile} size="sm" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-black text-cyan-950">{title}</h2>
            <p className="truncate text-xs font-medium text-slate-500">{profile.email || firebaseUser?.email || 'AquaChat account'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-aqua-50" title="Close">
            <X size={21} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {page === 'main' && (
            <div className="space-y-1 animate-fade-in">
              <Row icon={Shield} title="Account" subtitle={profile.email || firebaseUser?.email || 'Email and ID'} onClick={() => setPage('account')} />
              <Row icon={UserRound} title="Profile" subtitle={profile.displayName || 'Edit name, photo and about'} onClick={() => setPage('profile')} />
              <Row icon={profile.settings?.theme === 'dark' ? Moon : Sun} title="Theme" subtitle={profile.settings?.theme === 'dark' ? 'Dark mode' : 'Light mode'} onClick={() => setPage('theme')} />
              <Row icon={Lock} title="Security" subtitle="Password, blocked users, status privacy" onClick={() => setPage('security')} />
              <Row icon={LogOut} title="Sign Out" subtitle="Log out from this device" tone="danger" onClick={onLogout}>
                <span />
              </Row>
            </div>
          )}

          {page === 'account' && <AccountPage profile={profile} firebaseUser={firebaseUser} />}

          {page === 'profile' && (
            <ProfilePage
              profile={profile}
              setSaving={setSaving}
              saving={saving}
              onSaved={saveUser}
              setMessage={setMessage}
            />
          )}

          {page === 'theme' && (
            <ThemePage
              theme={profile.settings?.theme || 'light'}
              onChange={async (theme) => {
                setSaving(true);
                setMessage('');
                setProfile((current) => ({
                  ...(current || {}),
                  settings: {
                    ...(current?.settings || {}),
                    theme
                  }
                }));
                try {
                  const { user } = await api.updateTheme(theme);
                  saveUser(user, 'Theme updated');
                } catch (error) {
                  setMessage(error.message || 'Could not update theme.');
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}

          {page === 'security' && (
            <div className="space-y-1 animate-fade-in">
              <Row icon={KeyRound} title="Change Password" subtitle={canChangePassword ? 'Update your login password' : 'Available for email/password accounts'} onClick={() => setPage('password')} />
              <Row icon={Users} title="Blocked Users" subtitle="Review and unblock contacts" onClick={() => setPage('blocked')} />
              <Row icon={Shield} title="Status Privacy" subtitle="Control who sees your status" onClick={() => setPage('privacy')} />
            </div>
          )}

          {page === 'password' && (
            <PasswordPage
              firebaseUser={firebaseUser}
              canChangePassword={canChangePassword}
              setMessage={setMessage}
            />
          )}

          {page === 'blocked' && <BlockedUsersPage uid={firebaseUser?.uid || profile._id} setMessage={setMessage} />}

          {page === 'privacy' && (
            <StatusPrivacyPage
              profile={profile}
              connections={connections}
              onSaved={saveUser}
              setMessage={setMessage}
            />
          )}
        </div>

        {message && (
          <p className="settings-message mx-4 mb-4 rounded-xl border border-aqua-100 bg-aqua-50 px-4 py-3 text-sm font-bold text-cyan-800">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}

function AccountPage({ profile, firebaseUser }) {
  const rows = [
    ['Gmail / email', profile.email || firebaseUser?.email || 'Not available'],
    ['Username / ID', profile.username ? `@${profile.username}` : firebaseUser?.uid || profile._id || 'Not available'],
    ['Display name', profile.displayName || firebaseUser?.displayName || 'AquaChat user']
  ];
  return (
    <div className="space-y-3 animate-fade-in">
      {rows.map(([label, value]) => (
        <div key={label} className="settings-card rounded-xl border border-aqua-100/70 bg-aqua-50/40 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 break-words text-sm font-bold text-cyan-950">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ProfilePage({ profile, saving, setSaving, onSaved, setMessage }) {
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    username: profile.username || '',
    bio: profile.bio || '',
    about: profile.about || profile.bio || '',
    photoURL: profile.photoURL || ''
  });
  const [previewUrl, setPreviewUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    setForm({
      displayName: profile.displayName || '',
      username: profile.username || '',
      bio: profile.bio || '',
      about: profile.about || profile.bio || '',
      photoURL: profile.photoURL || ''
    });
  }, [profile._id, profile.displayName, profile.username, profile.bio, profile.about, profile.photoURL]);

  useEffect(() => () => {
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const uploadPhoto = async (file) => {
    if (!file) return;
    setPhotoUploading(true);
    setMessage('');
    setUploadProgress(0);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    try {
      const { user } = await api.uploadProfilePhoto(file, { onProgress: setUploadProgress });
      setForm((current) => ({ ...current, photoURL: user.photoURL || '' }));
      onSaved(user, 'Profile photo updated');
    } catch (error) {
      setPreviewUrl('');
      setMessage(error.message || 'Could not upload profile photo.');
    } finally {
      setPhotoUploading(false);
      setUploadProgress(0);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const { user } = await api.updateProfile({
        name: form.displayName,
        username: form.username,
        bio: form.bio,
        about: form.about
      });
      onSaved(user, 'Profile saved');
    } catch (error) {
      setMessage(error.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || photoUploading;
  return (
    <form onSubmit={save} className="space-y-4 animate-fade-in">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-aqua-100/70 bg-aqua-50/40 p-5">
        <Avatar name={form.displayName} image={previewUrl || form.photoURL} size="xl" />
        {photoUploading && (
          <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-aqua-100">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${uploadProgress || 8}%` }} />
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => galleryRef.current?.click()} className="settings-action flex items-center gap-2 rounded-xl border border-aqua-100 bg-white px-4 py-2 text-sm font-bold text-cyan-900 disabled:opacity-50">
            <ImageIcon size={16} />
            Gallery
          </button>
          <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            <Camera size={16} />
            Camera
          </button>
        </div>
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
      </div>

      <Field label="Display name" value={form.displayName} onChange={(value) => setForm((current) => ({ ...current, displayName: value }))} />
      <Field label="Username" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} />
      <Field label="Bio" value={form.bio} onChange={(value) => setForm((current) => ({ ...current, bio: value }))} multiline />
      <Field label="About" value={form.about} onChange={(value) => setForm((current) => ({ ...current, about: value }))} multiline />
      <button disabled={busy} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-white shadow-soft transition hover:bg-cyan-600 disabled:opacity-50">
        {busy ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}

function ThemePage({ theme, onChange }) {
  const options = [
    { id: 'light', title: 'Light Mode', icon: Sun },
    { id: 'dark', title: 'Dark Mode', icon: Moon }
  ];
  return (
    <div className="space-y-2 animate-fade-in">
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`settings-row flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition ${active ? 'border-cyan-300 bg-cyan-50' : 'border-aqua-100/70 bg-white hover:bg-aqua-50/60'}`}
          >
            <Icon size={20} className="text-cyan-700" />
            <span className="flex-1 text-sm font-black text-cyan-950">{option.title}</span>
            {active && <Check size={20} className="text-cyan-600" />}
          </button>
        );
      })}
    </div>
  );
}

function PasswordPage({ firebaseUser, canChangePassword, setMessage }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (!canChangePassword) return;
    setSaving(true);
    setMessage('');
    try {
      await reauthenticateUser(firebaseUser, currentPassword);
      await changePassword(firebaseUser, password);
      setCurrentPassword('');
      setPassword('');
      setMessage('Password changed');
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setMessage('Invalid current password. Please try again.');
      } else if (error.code === 'auth/weak-password') {
        setMessage('New password must be at least 6 characters.');
      } else {
        setMessage(error.message || 'Could not change password.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 animate-fade-in">
      {!canChangePassword && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Password changes are available only for email/password accounts.</p>
      )}
      <Field label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" />
      <Field label="New password" value={password} onChange={setPassword} type="password" />
      <button disabled={!canChangePassword || saving || !currentPassword || password.length < 6} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
        {saving ? 'Updating...' : 'Update Password'}
      </button>
    </form>
  );
}

function BlockedUsersPage({ uid, setMessage }) {
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!uid) return undefined;
    return api.subscribeBlockedUsers(uid, setRows);
  }, [uid]);

  const unblock = async (id) => {
    setBusyId(id);
    setMessage('');
    try {
      await api.unblockUser(id);
      setMessage('User unblocked');
    } catch (error) {
      setMessage(error.message || 'Could not unblock user.');
    } finally {
      setBusyId('');
    }
  };

  if (!rows.length) {
    return <p className="rounded-xl bg-aqua-50 px-4 py-8 text-center text-sm font-bold text-slate-500 animate-fade-in">No blocked users</p>;
  }

  return (
    <div className="space-y-2 animate-fade-in">
      {rows.map((row) => (
        <div key={row._id} className="settings-row flex items-center gap-3 rounded-xl border border-aqua-100/70 bg-white p-3">
          <Avatar user={row.user} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-cyan-950">{row.user?.displayName || 'AquaChat user'}</p>
            <p className="truncate text-xs text-slate-500">@{row.user?.username || row._id}</p>
          </div>
          <button type="button" disabled={busyId === row._id} onClick={() => unblock(row._id)} className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}

function StatusPrivacyPage({ profile, connections, onSaved, setMessage }) {
  const privacy = profile.settings?.statusPrivacy || { mode: 'everyone', selectedIds: [] };
  const [mode, setMode] = useState(privacy.mode || 'everyone');
  const [selectedIds, setSelectedIds] = useState(() => new Set(privacy.selectedIds || []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(privacy.mode || 'everyone');
    setSelectedIds(new Set(privacy.selectedIds || []));
  }, [privacy.mode, (privacy.selectedIds || []).join('|')]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const { user } = await api.updateStatusPrivacy({ mode, selectedIds: [...selectedIds] });
      onSaved(user, 'Status privacy updated');
    } catch (error) {
      setMessage(error.message || 'Could not update status privacy.');
    } finally {
      setSaving(false);
    }
  };

  const options = [
    ['everyone', 'Everyone'],
    ['connections', 'Connections Only'],
    ['selected', 'Selected Connections']
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-2">
        {options.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMode(id)} className={`settings-row flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${mode === id ? 'border-cyan-300 bg-cyan-50' : 'border-aqua-100/70 bg-white'}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full border ${mode === id ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300'}`}>
              {mode === id && <Check size={14} />}
            </span>
            <span className="text-sm font-black text-cyan-950">{label}</span>
          </button>
        ))}
      </div>

      {mode === 'selected' && (
        <div className="space-y-2">
          {connections.length ? connections.map((user) => {
            const id = cleanId(user._id || user.uid);
            const checked = selectedIds.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
                className="settings-row flex w-full items-center gap-3 rounded-xl border border-aqua-100/70 bg-white p-3 text-left"
              >
                <Avatar user={user} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-cyan-950">{user.displayName || 'AquaChat user'}</span>
                  <span className="block truncate text-xs text-slate-500">@{user.username || id}</span>
                </span>
                <span className={`grid h-6 w-6 place-items-center rounded-full border ${checked ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300'}`}>
                  {checked && <Check size={15} />}
                </span>
              </button>
            );
          }) : (
            <p className="rounded-xl bg-aqua-50 px-4 py-6 text-center text-sm font-bold text-slate-500">No connections available</p>
          )}
        </div>
      )}

      <button type="button" disabled={saving || (mode === 'selected' && selectedIds.size === 0)} onClick={save} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Privacy'}
      </button>
    </div>
  );
}
