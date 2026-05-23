import { useState } from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import { sendPasswordReset } from '../../firebase.js';
import { isValidEmail, mapAuthError } from '../../utils/authErrors.js';
import AuthAlert from './AuthAlert.jsx';

export default function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSuccess(`Password reset link sent to ${email.trim()}`);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-cyan-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-pop rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft-xl backdrop-blur-md">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-black text-cyan-950">Reset password</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-aqua-50 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm leading-6 text-slate-500">
          Enter your email and we&apos;ll send you a secure link to reset your password.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoFocus
              className="w-full rounded-2xl border border-aqua-100/60 bg-white px-11 py-3 text-sm outline-none transition focus:border-cyan-300 focus:shadow-inner-soft"
            />
            <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-500" />
          </div>

          {error && <AuthAlert type="error" message={error} onDismiss={() => setError('')} />}
          {success && <AuthAlert type="success" message={success} onDismiss={() => setSuccess('')} />}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-200/50 transition hover:shadow-cyan-300/70 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  );
}
