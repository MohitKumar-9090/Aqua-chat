import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, User, UserPlus } from 'lucide-react';
import { emailLogin, emailSignup, googleLogin, verifyEmailWithCode } from '../firebase.js';
import { mapAuthError, isValidEmail } from '../utils/authErrors.js';
import { success as toastSuccess } from '../utils/toast.js';
import AuthAlert from './auth/AuthAlert.jsx';
import EmailVerificationPanel from './auth/EmailVerificationPanel.jsx';
import ForgotPasswordModal from './auth/ForgotPasswordModal.jsx';

const PENDING_SIGNUP_KEY = 'pendingSignupProfile';

export default function AuthScreen() {
  const [view, setView] = useState('login');
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [alert, setAlert] = useState({ type: 'error', message: '' });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const clearAlert = () => setAlert({ type: 'error', message: '' });
  const showError = (message) => setAlert({ type: 'error', message });
  const showInfo = (message) => setAlert({ type: 'info', message });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get('oobCode');
    const mode = params.get('mode');
    if (!oobCode || mode !== 'verifyEmail') return;

    (async () => {
      setBusy(true);
      try {
        await verifyEmailWithCode(oobCode);
        window.history.replaceState({}, '', window.location.pathname);
        toastSuccess('Email verified! You can sign in now.');
        setView('login');
        setMode('login');
        showInfo('Email verified successfully. Sign in to continue.');
      } catch (err) {
        showError(mapAuthError(err));
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const switchMode = (next) => {
    setMode(next);
    clearAlert();
  };

  const submitEmail = async (event) => {
    event.preventDefault();
    setBusy(true);
    clearAlert();

    try {
      if (!isValidEmail(email)) throw Object.assign(new Error('Invalid email'), { code: 'auth/invalid-email' });
      if (!password || password.length < 6) throw Object.assign(new Error('Weak password'), { code: 'auth/weak-password' });

      if (mode === 'signup') {
        if (!name.trim()) throw new Error('Name is required.');
        if (!username.trim()) throw new Error('Username is required.');

        localStorage.setItem(
          PENDING_SIGNUP_KEY,
          JSON.stringify({ name: name.trim(), username: username.trim(), email: email.trim() })
        );

        await emailSignup({ email, password, displayName: name });
        setVerifyEmail(email.trim());
        setVerifyPassword(password);
        setView('verify');
        showInfo('Account created! Check your email for the verification link.');
      } else {
        const credential = await emailLogin(email, password);
        if (!credential.user.emailVerified) {
          setVerifyEmail(email.trim());
          setVerifyPassword(password);
          setView('verify');
          showInfo('Please verify your email before continuing.');
        }
      }
    } catch (err) {
      showError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitGoogle = async () => {
    setBusy(true);
    clearAlert();
    try {
      const result = await googleLogin();
      if (result?.redirecting) showInfo('Redirecting to Google sign-in…');
    } catch (err) {
      showError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (view === 'verify') {
    return (
      <main className="grid min-h-dvh place-items-center px-3 py-6 sm:px-4 bg-gradient-to-br from-aqua-25 via-white to-aqua-50">
        <EmailVerificationPanel
          email={verifyEmail}
          password={verifyPassword}
          onVerified={() => window.location.reload()}
          onBackToLogin={() => {
            setView('login');
            setMode('login');
            clearAlert();
          }}
        />
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-3 py-6 sm:px-4 bg-gradient-to-br from-aqua-25 via-white to-aqua-50">
      <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/85 p-6 shadow-soft-xl backdrop-blur-md sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-aqua-400 text-2xl font-black text-white shadow-lg shadow-cyan-200/40">
            A
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-cyan-950 tracking-tight">AquaChat</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">Stay connected. Stay informed.</p>
        </div>

        <div className="mb-5 flex rounded-2xl border border-aqua-200/50 bg-aqua-100/40 p-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
              mode === 'login' ? 'bg-white text-cyan-950 shadow-sm' : 'text-slate-500'
            }`}
          >
            <User className="h-4 w-4" />
            Login
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
              mode === 'signup' ? 'bg-white text-cyan-950 shadow-sm' : 'text-slate-500'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Sign up
          </button>
        </div>

        <form onSubmit={submitEmail} className="space-y-3">
          {mode === 'signup' && (
            <>
              <div className="relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  required
                  autoComplete="name"
                  className="w-full rounded-2xl border border-aqua-100/60 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
              <div className="relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  required
                  autoComplete="username"
                  className="w-full rounded-2xl border border-aqua-100/60 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </div>
            </>
          )}

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email address"
              required
              autoComplete="email"
              className="w-full rounded-2xl border border-aqua-100/60 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full rounded-2xl border border-aqua-100/60 bg-white py-3 pl-11 pr-12 text-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-cyan-500 transition hover:bg-aqua-50"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {mode === 'login' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-semibold text-cyan-600 transition hover:text-cyan-800 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          {alert.message && (
            <AuthAlert type={alert.type} message={alert.message} onDismiss={clearAlert} />
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-200/50 transition hover:shadow-cyan-300/70 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-4 w-4" />}
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-aqua-200/60" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">or</span>
          <div className="h-px flex-1 bg-aqua-200/60" />
        </div>

        <button
          type="button"
          onClick={submitGoogle}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-aqua-200/60 bg-white py-3 text-sm font-bold text-slate-700 transition hover:bg-aqua-50/80 disabled:opacity-60"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="" className="h-5 w-5" />
          Continue with Google
        </button>
      </section>

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </main>
  );
}
