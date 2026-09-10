const SESSION_KEY = 'store1920_auth_session_id';
const MFA_OK_KEY = 'store1920_mfa_ok';
export const GOOGLE_ONE_TAP_DISMISS_KEY = 'googleOneTapDismissedAt';

/** Prevent Google One Tap from immediately re-signing the user in after logout. */
export function pauseGoogleOneTapPrompt() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GOOGLE_ONE_TAP_DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures.
  }
}

async function firebaseSignOut(auth) {
  const { signOut } = await import('firebase/auth');
  await signOut(auth);

  try {
    const { getCompatAuth } = await import('./firebase');
    const compatAuth = getCompatAuth();
    if (compatAuth?.currentUser) {
      await compatAuth.signOut();
    }
  } catch {
    // Compat auth may be unavailable; modular sign-out is enough for most flows.
  }
}

export function getStoredSessionId() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SESSION_KEY) || '';
}

export function setStoredSessionId(sessionId) {
  if (typeof window === 'undefined') return;
  if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
  else localStorage.removeItem(SESSION_KEY);
}

export function setMfaVerified(ok) {
  if (typeof window === 'undefined') return;
  if (ok) sessionStorage.setItem(MFA_OK_KEY, '1');
  else sessionStorage.removeItem(MFA_OK_KEY);
}

export function isMfaVerified() {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(MFA_OK_KEY) === '1';
}

export async function fetchCaptchaChallenge() {
  const res = await fetch('/api/auth/captcha');
  if (!res.ok) throw new Error('Could not load CAPTCHA');
  return res.json();
}

export async function runPreLogin({ email, captchaChallengeId, captchaAnswer, recaptchaToken }) {
  const res = await fetch('/api/auth/pre-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, captchaChallengeId, captchaAnswer, recaptchaToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Pre-login failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function reportLoginResult({ email, success, idToken, sessionId }) {
  const res = await fetch('/api/auth/login-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, success, idToken, sessionId }),
  });
  const data = await res.json().catch(() => ({}));
  if (success && data.sessionId) {
    setStoredSessionId(data.sessionId);
  }
  return { ok: res.ok, ...data };
}

export async function requestPasswordReset(payload) {
  const res = await fetch('/api/auth/password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Could not send reset code');
  }
  return data;
}

export async function requestEmailOtp(payload) {
  const res = await fetch('/api/auth/email-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Could not send email code');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function verifyEmailOtp(payload) {
  const res = await fetch('/api/auth/email-otp', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Could not verify email code');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function requestWhatsAppOtp(payload) {
  const res = await fetch('/api/auth/whatsapp-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Could not send WhatsApp code');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function verifyWhatsAppOtp(payload) {
  const res = await fetch('/api/auth/whatsapp-otp', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Could not verify WhatsApp code');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function confirmPasswordReset(payload) {
  const res = await fetch('/api/auth/password-reset', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Reset failed');
  return data;
}

/**
 * Revoke Firebase refresh tokens + server sessions (logout all devices).
 * Call while the user still has a valid ID token, then signOut locally.
 */
export async function revokeAllDevices({ idToken, keepCurrent = false } = {}) {
  const sessionId = getStoredSessionId();
  const res = await fetch('/api/auth/sessions', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      all: true,
      keepCurrent: Boolean(keepCurrent),
      sessionId: keepCurrent ? sessionId : undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Could not revoke sessions');
  }
  if (!keepCurrent) {
    setStoredSessionId('');
    setMfaVerified(false);
  }
  return data;
}

/** Sign out this browser; optionally revoke every device. */
export async function secureSignOut(auth, { allDevices = false } = {}) {
  pauseGoogleOneTapPrompt();

  try {
    const user = auth.currentUser;
    if (user && allDevices) {
      const idToken = await user.getIdToken();
      await revokeAllDevices({ idToken, keepCurrent: false });
    } else if (user) {
      const idToken = await user.getIdToken().catch(() => '');
      const sessionId = getStoredSessionId();
      if (idToken && sessionId) {
        await fetch('/api/auth/sessions', {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        }).catch(() => {});
      }
      setStoredSessionId('');
      setMfaVerified(false);
    }
  } catch {
    setStoredSessionId('');
    setMfaVerified(false);
  }

  await firebaseSignOut(auth);
}
