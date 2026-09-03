export const EMAIL_TRACKING_STORAGE_KEY = 'email_tracking_data';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function persistEmailTrackingToken(token, landingUrl = '') {
  if (typeof window === 'undefined') return;
  const value = String(token || '').trim();
  if (!value) return;

  const payload = {
    token: value,
    timestamp: Date.now(),
    landingUrl: String(landingUrl || ''),
  };

  localStorage.setItem(EMAIL_TRACKING_STORAGE_KEY, JSON.stringify(payload));
  sessionStorage.setItem('email_tracking_token', value);
}

export function getEmailTrackingToken() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(EMAIL_TRACKING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = String(parsed?.token || '').trim();
    const timestamp = Number(parsed?.timestamp || 0);
    if (!token || !timestamp) return null;
    if (Date.now() - timestamp > MAX_AGE_MS) {
      localStorage.removeItem(EMAIL_TRACKING_STORAGE_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}
