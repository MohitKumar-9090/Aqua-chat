const AUTH_MESSAGES = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Try again or reset it.',
  'auth/invalid-credential': 'Invalid email or password.',
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
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
  'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method.',
  'auth/internal-error': 'An internal error occurred. Please try again.',
  'auth/credential-already-in-use': 'This credential is already linked to another account.',
  'auth/admin-restricted-operation': 'This operation is restricted. Contact support.',
  'auth/invalid-api-key': 'Application configuration error. Please contact support.',
  'auth/app-not-authorized': 'This app is not authorized to use Firebase Authentication.',
  'auth/missing-password': 'Please enter your password.',
};

/**
 * Try to extract a Firebase auth error code from the error message string.
 * Firebase errors typically have the format: "Firebase: Error (auth/some-code)."
 * or "Firebase: <description> (auth/some-code)."
 */
const extractCodeFromMessage = (message) => {
  if (!message) return null;
  const match = message.match(/\(auth\/([^)]+)\)/);
  return match ? `auth/${match[1]}` : null;
};

/**
 * Map a Firebase auth error to a user-friendly message.
 * Logs the full error to the console for debugging.
 */
export const mapAuthError = (err) => {
  if (!err) return 'Something went wrong. Please try again.';

  // Always log the full error for debugging during development
  console.error('Firebase Sign-In Error:', err);
  console.error('Firebase Error Code:', err?.code);
  console.error('Firebase Error Message:', err?.message);

  // 1. Direct code lookup (works when the original FirebaseError is preserved)
  const code = err.code || '';
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];

  // 2. Try extracting the code from the message string
  //    (handles cases where errors were re-wrapped, losing .code)
  const extractedCode = extractCodeFromMessage(err.message);
  if (extractedCode && AUTH_MESSAGES[extractedCode]) return AUTH_MESSAGES[extractedCode];

  // 3. Heuristic matching on message content
  const message = err.message || '';
  if (/password/i.test(message) && /invalid|wrong/i.test(message)) return AUTH_MESSAGES['auth/wrong-password'];
  if (/email/i.test(message) && /already/i.test(message)) return AUTH_MESSAGES['auth/email-already-in-use'];

  // 4. Clean up the Firebase message prefix/suffix for display
  const cleaned = message
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\(auth\/[^)]+\)\.?$/, '')
    .trim();

  // Guard: if cleaning left only "Error" or empty string, use a safe fallback
  if (!cleaned || /^error$/i.test(cleaned)) {
    return 'Sign-in failed. Please try again.';
  }

  return cleaned;
};

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
