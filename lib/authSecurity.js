import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import AuthSecurity from '@/models/AuthSecurity';
import { getCachedData, setCachedData, deleteCacheKey } from '@/lib/cache';

export const AUTH_LOCK = {
  maxFailedAttempts: 5,
  lockMinutes: 15,
};

export const SESSION_IDLE_MS = Number(process.env.AUTH_SESSION_IDLE_MS || 30 * 60 * 1000); // 30 min
export const SESSION_MAX_MS = Number(process.env.AUTH_SESSION_MAX_MS || 7 * 24 * 60 * 60 * 1000); // 7 days

export function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

export function hashSecret(value = '') {
  const salt = process.env.AUTH_TOKEN_PEPPER || process.env.NEXTAUTH_SECRET || 'store1920-auth';
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

export function generateOtpCode(length = 6) {
  const max = 10 ** length;
  const num = crypto.randomInt(0, max);
  return String(num).padStart(length, '0');
}

export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export async function getOrCreateSecurity(key, keyType = 'email') {
  await connectDB();
  const normalized = keyType === 'email' ? normalizeEmail(key) : String(key);
  let doc = await AuthSecurity.findOne({ key: normalized });
  if (!doc && keyType === 'phone') {
    doc = await AuthSecurity.findOne({ key: `phone:${normalized}` });
    if (doc) return doc;
  }
  if (!doc) {
    try {
      doc = await AuthSecurity.create({ key: normalized, keyType });
    } catch (error) {
      if (keyType !== 'phone') throw error;
      doc = await AuthSecurity.create({ key: `phone:${normalized}`, keyType: 'uid' });
    }
  }
  return doc;
}

export async function isAccountLocked(emailOrKey, keyType = 'email') {
  const doc = await getOrCreateSecurity(emailOrKey, keyType);
  if (doc.lockedUntil && doc.lockedUntil.getTime() > Date.now()) {
    return {
      locked: true,
      lockedUntil: doc.lockedUntil,
      retryAfterSeconds: Math.ceil((doc.lockedUntil.getTime() - Date.now()) / 1000),
      failedAttempts: doc.failedAttempts,
    };
  }
  if (doc.lockedUntil && doc.lockedUntil.getTime() <= Date.now()) {
    doc.lockedUntil = null;
    doc.failedAttempts = 0;
    await doc.save();
  }
  return { locked: false, failedAttempts: doc.failedAttempts || 0 };
}

export async function recordFailedLogin(emailOrKey, keyType = 'email') {
  const doc = await getOrCreateSecurity(emailOrKey, keyType);
  doc.failedAttempts = (doc.failedAttempts || 0) + 1;
  doc.lastFailedAt = new Date();
  if (doc.failedAttempts >= AUTH_LOCK.maxFailedAttempts) {
    doc.lockedUntil = new Date(Date.now() + AUTH_LOCK.lockMinutes * 60 * 1000);
  }
  await doc.save();
  return {
    failedAttempts: doc.failedAttempts,
    locked: Boolean(doc.lockedUntil && doc.lockedUntil > new Date()),
    lockedUntil: doc.lockedUntil,
  };
}

export function formatLockError(lock = {}) {
  const minutes = Math.max(1, Math.ceil(Number(lock.retryAfterSeconds || 0) / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export async function clearAccountLock(emailOrKey, keyType = 'email') {
  const doc = await getOrCreateSecurity(emailOrKey, keyType);
  doc.failedAttempts = 0;
  doc.lockedUntil = null;
  await doc.save();
  return doc;
}

export async function recordSuccessfulLogin(emailOrKey, keyType = 'email') {
  const doc = await getOrCreateSecurity(emailOrKey, keyType);
  doc.failedAttempts = 0;
  doc.lockedUntil = null;
  doc.lastSuccessAt = new Date();
  await doc.save();
  return doc;
}

const MATH_CAPTCHA_TTL_MS = 10 * 60 * 1000; // 10 minutes

function normalizeMathCaptchaAnswer(answer) {
  const trimmed = String(answer ?? '').trim();
  if (!trimmed) return '';
  // Accept "11", " 11 ", "011" as the same numeric answer.
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) return String(asNumber);
  return trimmed;
}

/**
 * Math CAPTCHA with a signed challenge id (no shared memory required).
 * In-memory cache alone fails under Next.js multi-instance / HMR because
 * create and verify often run in different processes.
 */
export function createMathCaptcha() {
  const a = crypto.randomInt(1, 9);
  const b = crypto.randomInt(1, 9);
  const answerHash = hashSecret(normalizeMathCaptchaAnswer(a + b));
  const payload = Buffer.from(
    JSON.stringify({ h: answerHash, e: Date.now() + MATH_CAPTCHA_TTL_MS }),
  ).toString('base64url');
  const sig = hashSecret(payload).slice(0, 32);
  return {
    challengeId: `${payload}.${sig}`,
    question: `What is ${a} + ${b}?`,
    provider: 'math',
  };
}

export function verifyMathCaptcha(challengeId, answer) {
  const raw = String(challengeId || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return false;

  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig || hashSecret(payload).slice(0, 32) !== sig) return false;

  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (!data?.h || !data?.e || Date.now() > Number(data.e)) return false;

  // Best-effort one-time use when this process still has the entry.
  const usedKey = `captcha:used:${raw}`;
  if (getCachedData(usedKey)) return false;

  const ok = data.h === hashSecret(normalizeMathCaptchaAnswer(answer));
  if (ok) {
    setCachedData(usedKey, true, Math.ceil(MATH_CAPTCHA_TTL_MS / 1000));
  }
  return ok;
}

export async function verifyGoogleRecaptcha(token, remoteip) {
  const secret = process.env.RECAPTCHA_SECRET_KEY || process.env.GOOGLE_RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: false, skipped: true, reason: 'not_configured' };
  // No token → fall through to math CAPTCHA (UI may only show math).
  if (!token) return { ok: false, skipped: true, reason: 'missing_token' };

  const body = new URLSearchParams({
    secret,
    response: String(token),
  });
  if (remoteip) body.set('remoteip', remoteip);

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: Boolean(data.success), score: data.score, skipped: false };
}

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || '';
}

export function parseDeviceLabel(userAgent = '') {
  const ua = String(userAgent || '');
  if (/iPhone|iPad/i.test(ua)) return 'iOS device';
  if (/Android/i.test(ua)) return 'Android device';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS|Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Web browser';
}
