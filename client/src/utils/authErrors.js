const AUTH_MESSAGES = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Try again or reset it.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'This email is already registered. Try signing in.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection and retry.',
  'auth/popup-blocked': 'Popup blocked. Redirecting to Google sign-in…',
  'auth/popup-closed-by-user': 'Sign-in cancelled. Please try again.',
  'auth/cancelled-popup-request': 'Sign-in cancelled. Please try again.',
  'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.',
  'auth/invalid-action-code': 'This link has expired. Request a new verification email.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/missing-email': 'Email is required.',
  'auth/requires-recent-login': 'Please sign in again to continue.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method.'
};

export const mapAuthError = (err) => {
  if (!err) return 'Something went wrong. Please try again.';
  const code = err.code || '';
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];

  const message = err.message || '';
  if (/password/i.test(message) && /invalid|wrong/i.test(message)) return AUTH_MESSAGES['auth/wrong-password'];
  if (/email/i.test(message) && /already/i.test(message)) return AUTH_MESSAGES['auth/email-already-in-use'];

  return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '') || 'Authentication failed.';
};

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
