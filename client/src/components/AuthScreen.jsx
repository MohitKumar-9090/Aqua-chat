
import { useState } from 'react';
import { Mail, Phone, Eye, EyeOff, User, Lock, UserPlus } from 'lucide-react';
import { completePhoneLogin, emailLogin, emailSignup, googleLogin, phoneLogin } from '../firebase.js';
import { error as showError, success as showSuccess } from '../utils/toast.js';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const [phoneUsername, setPhoneUsername] = useState('');
  const [phoneEmail, setPhoneEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submitEmail = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (!email.trim()) throw new Error('Email is required.');
      if (!password) throw new Error('Password is required.');
      if (mode === 'signup') {
        if (!name.trim()) throw new Error('Name is required.');
        if (!username.trim()) throw new Error('Username is required.');
        localStorage.setItem('pendingPhoneProfile', JSON.stringify({ name: name.trim(), username: username.trim(), email: email.trim() }));
        await emailSignup({ email, password, displayName: name });
      } else {
        await emailLogin(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (!phoneName.trim()) throw new Error('Name is required for phone login.');
      if (!phoneUsername.trim()) throw new Error('Username is required for phone login.');
      if (!phone.trim()) throw new Error('Phone number is required for phone login.');

      if (!confirmation) {
        localStorage.setItem(
          'pendingPhoneProfile',
          JSON.stringify({
            name: phoneName.trim(),
            username: phoneUsername.trim(),
            phone: phone.trim(),
            email: phoneEmail.trim()
          })
        );
        const result = await phoneLogin(phone);
        setConfirmation(result);
      } else {
        await completePhoneLogin(confirmation, otp, phoneName.trim());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-3 py-4 sm:px-4 bg-gradient-to-br from-aqua-25 via-white to-aqua-50">
      <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-6 sm:p-8 shadow-soft-lg backdrop-blur-sm">
        {/* Logo & Subtitle */}
        <div className="mb-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-cyan-950 mb-1 tracking-tight">AquaChat</h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">Stay connected. Stay informed.</p>
        </div>

        {/* Tab Buttons */}
        <div className="mb-6 flex rounded-2xl bg-aqua-100/40 border border-aqua-200/50 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-2xl py-2 sm:py-2.5 text-xs sm:text-base font-bold transition duration-200 ${mode === 'login' ? 'bg-white text-cyan-950 shadow' : 'text-slate-500'}`}
          >
            <User className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Login</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 rounded-2xl py-2 sm:py-2.5 text-xs sm:text-base font-bold transition duration-200 ${mode === 'signup' ? 'bg-white text-cyan-950 shadow' : 'text-slate-500'}`}
          >
            <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Sign up</span>
          </button>
        </div>

        {/* Email Form */}
        <form onSubmit={submitEmail} className="space-y-3 sm:space-y-4 mb-6">
          {mode === 'signup' && (
            <>
              <div className="relative">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full name"
                  required
                  className="w-full rounded-2xl border border-aqua-100/60 bg-white px-10 sm:px-12 py-2.5 sm:py-3 text-sm sm:text-base placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft"
                />
                <User className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-aqua-400 w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="relative">
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Username"
                  required
                  className="w-full rounded-2xl border border-aqua-100/60 bg-white px-10 sm:px-12 py-2.5 sm:py-3 text-sm sm:text-base placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft"
                />
                <User className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-aqua-400 w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </>
          )}
          <div className="relative">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="Email"
              required
              className="w-full rounded-2xl border border-aqua-100/60 bg-white px-10 sm:px-12 py-2.5 sm:py-3 text-sm sm:text-base placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft"
            />
            <Mail className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-aqua-400 w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              required
              className="w-full rounded-2xl border border-aqua-100/60 bg-white px-10 sm:px-12 py-2.5 sm:py-3 text-sm sm:text-base placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft"
            />
            <Lock className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-aqua-400 w-4 h-4 sm:w-5 sm:h-5" />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-aqua-400 hover:text-cyan-500 transition"
            >
              {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span />
            <a href="#" className="text-xs sm:text-sm font-medium text-cyan-500 hover:underline">Forgot password?</a>
          </div>
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 sm:gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 px-4 py-2.5 sm:py-3.5 font-bold text-white text-sm sm:text-base shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-60 disabled:shadow-none"
          >
            <Mail size={16} className="sm:w-5 sm:h-5" />
            {mode === 'signup' ? 'Create account' : 'Login'}
          </button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-aqua-200/50" />
          <span className="text-xs font-bold text-slate-400">OR</span>
          <div className="h-px flex-1 bg-aqua-200/50" />
        </div>

        {/* Google Button */}
        <button
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const result = await googleLogin();
              if (!result?.redirecting) {
                // Popup succeeded
              } else {
                // Redirect in progress
              }
            } catch (err) {
              const message = err.message || 'Google Sign-In failed. Please try again.';
              setError(message);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 sm:gap-3 rounded-2xl border border-aqua-200/50 bg-white px-4 py-2.5 sm:py-3.5 font-bold text-slate-700 text-sm sm:text-base transition duration-200 hover:bg-aqua-50/60 disabled:opacity-60 disabled:cursor-not-allowed mb-2"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-4 h-4 sm:w-5 sm:h-5" />
          Continue with Google
        </button>

        {/* Phone OTP Form (only for signup) */}
        {mode === 'signup' && (
          <form onSubmit={submitPhone} className="space-y-2 sm:space-y-4 rounded-2xl bg-gradient-to-br from-aqua-100/40 to-cyan-100/30 border border-aqua-200/40 p-3 sm:p-5 mt-4">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-cyan-950">
              <Phone size={14} className="sm:w-4 sm:h-4 text-cyan-600" />
              Phone OTP
            </div>
            <input
              value={phoneName}
              onChange={(event) => setPhoneName(event.target.value)}
              placeholder="Full name"
              required
              className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-cyan-300 focus:shadow-inner-soft"
            />
            <input
              value={phoneUsername}
              onChange={(event) => setPhoneUsername(event.target.value)}
              placeholder="Username"
              required
              className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-cyan-300 focus:shadow-inner-soft"
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 010 0000"
              required
              className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-cyan-300 focus:shadow-inner-soft"
            />
            <input
              value={phoneEmail}
              onChange={(event) => setPhoneEmail(event.target.value)}
              type="email"
              placeholder="Email (optional)"
              className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-cyan-300 focus:shadow-inner-soft"
            />
            {confirmation && (
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="OTP code"
                required
                className="w-full rounded-2xl border border-white/70 bg-white/90 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-cyan-300 focus:shadow-inner-soft"
              />
            )}
            <button
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-700 px-4 py-2 sm:py-2.5 font-bold text-white text-xs sm:text-sm transition duration-200 hover:from-cyan-700 hover:to-cyan-800 disabled:opacity-60"
            >
              {confirmation ? 'Verify OTP' : 'Send OTP'}
            </button>
          </form>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-6 rounded-2xl bg-gradient-to-r from-rose-100/60 to-rose-50/60 border border-rose-200/50 px-4 py-3">
            <p className="text-xs sm:text-sm font-medium text-rose-700">{error}</p>
          </div>
        )}
      </section>
    </main>
  );
}
