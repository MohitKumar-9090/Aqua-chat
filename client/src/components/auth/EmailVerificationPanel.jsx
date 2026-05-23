import { useState } from 'react';
import { Loader2, MailCheck, RefreshCw } from 'lucide-react';
import { auth, emailLogin, refreshAuthUser, resendVerificationEmail, signOut } from '../../firebase.js';
import { mapAuthError } from '../../utils/authErrors.js';
import AuthAlert from './AuthAlert.jsx';

export default function EmailVerificationPanel({
  email,
  password = '',
  onVerified,
  onBackToLogin
}) {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const startCooldown = () => {
    setResendCooldown(60);
    const interval = window.setInterval(() => {
      setResendCooldown((value) => {
        if (value <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (auth.currentUser) {
        await resendVerificationEmail(auth.currentUser);
      } else if (password) {
        const credential = await emailLogin(email, password);
        await resendVerificationEmail(credential.user);
        await signOut(auth);
      } else {
        throw new Error('Sign in again to resend the verification email.');
      }
      setSuccess('Verification email sent. Check your inbox and spam folder.');
      startCooldown();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const checkVerified = async () => {
    setChecking(true);
    setError('');
    setSuccess('');
    try {
      let user = auth.currentUser;
      if (!user && password) {
        const credential = await emailLogin(email, password);
        user = credential.user;
      }
      if (!user) throw new Error('Sign in again to check verification status.');

      const refreshed = await refreshAuthUser(user);
      if (!refreshed?.emailVerified) {
        setError('Email not verified yet. Open the link in your inbox, then tap “I’ve verified”.');
        return;
      }
      setSuccess('Email verified! Welcome to AquaChat.');
      onVerified?.(refreshed);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/85 p-6 shadow-soft-xl backdrop-blur-md sm:p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-cyan-100 to-aqua-100">
          <MailCheck className="h-8 w-8 text-cyan-600" />
        </div>
        <h2 className="text-2xl font-black text-cyan-950">Verify your email</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          We sent a verification link to
          <span className="mt-1 block font-bold text-cyan-800">{email}</span>
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-aqua-100/60 bg-aqua-50/50 px-4 py-3 text-xs leading-5 text-slate-600">
        Open the email on this device and tap <strong>Verify email</strong>. Links expire after 24 hours.
      </div>

      {error && <div className="mb-3"><AuthAlert type="error" message={error} onDismiss={() => setError('')} /></div>}
      {success && <div className="mb-3"><AuthAlert type="success" message={success} onDismiss={() => setSuccess('')} /></div>}

      <div className="space-y-3">
        <button
          type="button"
          onClick={checkVerified}
          disabled={checking}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-200/50 transition disabled:opacity-60"
        >
          {checking ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {checking ? 'Checking…' : "I've verified my email"}
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={busy || resendCooldown > 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-aqua-200/60 bg-white py-3 text-sm font-bold text-cyan-800 transition hover:bg-aqua-50 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
        </button>

        <button
          type="button"
          onClick={onBackToLogin}
          className="w-full py-2 text-sm font-semibold text-slate-500 transition hover:text-cyan-700"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}
