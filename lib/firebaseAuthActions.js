import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider, appleProvider, waitForAuthReady, ensureLocalAuthPersistence } from './firebase';

let activeAuthOperation = null;

const AUTH_LOCK_WAIT_MS = 60000;
const POPUP_TIMEOUT_MS = 45000;

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(timeoutMessage);
      error.code = 'auth/timeout';
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function runWithAuthLock(operation) {
  if (activeAuthOperation) {
    try {
      await withTimeout(
        activeAuthOperation,
        AUTH_LOCK_WAIT_MS,
        'Previous sign-in timed out'
      );
    } catch {
      // Start a fresh attempt even if the prior one hung.
    }

    if (activeAuthOperation) {
      activeAuthOperation = null;
    }
  }

  const current = (async () => {
    await ensureLocalAuthPersistence();
    await waitForAuthReady();
    return operation();
  })();

  activeAuthOperation = current;

  try {
    return await current;
  } finally {
    if (activeAuthOperation === current) {
      activeAuthOperation = null;
    }
  }
}

export async function signInWithGooglePopup() {
  return runWithAuthLock(() =>
    withTimeout(
      signInWithPopup(auth, googleProvider),
      POPUP_TIMEOUT_MS,
      'Google sign-in timed out. Allow pop-ups, complete the Google window, or try again.'
    )
  );
}

export async function signInWithFacebookPopup() {
  return runWithAuthLock(() =>
    withTimeout(
      signInWithPopup(auth, facebookProvider),
      POPUP_TIMEOUT_MS,
      'Facebook sign-in timed out. Allow pop-ups, complete the Facebook window, or try again.'
    )
  );
}

export async function signInWithApplePopup() {
  return runWithAuthLock(() =>
    withTimeout(
      signInWithPopup(auth, appleProvider),
      POPUP_TIMEOUT_MS,
      'Apple sign-in timed out. Allow pop-ups, complete the Apple window, or try again.'
    )
  );
}

export async function signInWithGoogleRedirect() {
  return runWithAuthLock(() => signInWithRedirect(auth, googleProvider));
}

export async function consumeGoogleRedirectResult() {
  await waitForAuthReady();
  return getRedirectResult(auth);
}

export async function signInWithGoogleCredential(credential) {
  const firebaseCredential = GoogleAuthProvider.credential(credential);
  return runWithAuthLock(() => signInWithCredential(auth, firebaseCredential));
}

export async function signInWithEmail(email, password) {
  return runWithAuthLock(() => signInWithEmailAndPassword(auth, email, password));
}

export function getAuthErrorMessage(err, fallback = 'Sign in failed. Please try again.') {
  const code = err?.code || '';
  const msg = String(err?.message || '').toLowerCase();
  const raw = String(err?.message || '').trim();

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Sign-in cancelled. Please try again.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Pop-up blocked. Allow pop-ups for this site, or use email sign-in.';
  }
  if (code === 'auth/timeout' || msg.includes('timed out')) {
    return 'Social sign-in timed out. Allow pop-ups, finish the provider window, or use email sign-in.';
  }
  if (code === 'auth/network-request-failed') return 'Network error. Please check your connection.';
  if (code === 'auth/user-not-found') return 'No account found with this email or username.';
  if (code === 'auth/wrong-password') {
    return 'Invalid email/username or password.';
  }
  if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
  if (code === 'auth/email-already-in-use') return 'This email is already registered. Please sign in.';
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Use 8+ characters with upper, lower, number, and special character.';
  }
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait and try again.';
  if (code === 'auth/operation-not-allowed') {
    return 'Apple/Google/Facebook sign-in is not enabled in Firebase yet. Enable the provider under Authentication → Sign-in method.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized in Firebase. Add store1920.com and localhost under Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Popup sign-in is not supported here. Please try another sign-in method.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with the same email using a different sign-in method. Sign in with Google/email first.';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'This social account is already linked to another user.';
  }
  if (
    code === 'auth/internal-error'
    || code === 'auth/invalid-credential'
    || msg.includes('invalid oauth')
    || msg.includes('invalid client')
    || msg.includes('invalid_client')
  ) {
    // Apple web usually fails here when Services ID / Team ID / Key ID / .p8 are wrong
    // or Return URL is not set to the Firebase auth handler.
    return 'Apple sign-in is not configured correctly. In Apple Developer set Return URL to https://store1920-7d673.firebaseapp.com/__/auth/handler, then paste Services ID, Team ID, Key ID and .p8 key into Firebase → Authentication → Apple.';
  }
  if (msg.includes('internal assertion failed') || msg.includes('pending promise')) {
    return 'Sign-in was interrupted. Please wait a moment and try again.';
  }
  if (msg.includes('you do not have seller access')) {
    return 'You do not have seller access';
  }
  if (msg.includes('store access check failed temporarily')) {
    return 'Store access check failed temporarily. Please try again.';
  }

  // Prefer Firebase's own message when present (helps debug provider setup).
  if (raw && !msg.includes('firebase')) {
    return raw;
  }
  if (code) {
    return `${fallback} (${code})`;
  }
  return fallback;
}
