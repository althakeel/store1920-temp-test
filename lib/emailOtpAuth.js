import { getAuth } from '@/lib/firebase-admin';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import AuthOtp from '@/models/AuthOtp';
import { issueOtp, verifyOtp, consumeOtpById } from '@/lib/authOtp';
import {
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  verifyMathCaptcha,
  verifyGoogleRecaptcha,
  getClientIp,
  normalizeEmail,
  formatLockError,
  clearAccountLock,
} from '@/lib/authSecurity';
import { sendMail } from '@/lib/email';
import { linkGuestOrdersToUser } from '@/lib/linkGuestOrders';
import { buildLoginOtpEmailHtml } from '@/lib/transactionalEmailLayout';
import { getFirebaseAdminUserMessage } from '@/lib/firebaseAdminErrors';

const OTP_PURPOSE = 'email_login';
const RESEND_COOLDOWN_MS = 45 * 1000;

function maskEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 2) return value;
  return `${value.slice(0, 2)}***${value.slice(at)}`;
}

async function upsertMongoUser(uid, { email, name } = {}) {
  const $set = { firebaseUid: uid };
  if (email) $set.email = email;
  if (name) $set.name = name;
  await User.findOneAndUpdate(
    { _id: uid },
    { $set, $setOnInsert: { _id: uid, cart: {} } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

async function resolveOrCreateEmailUser({ email, name }) {
  const adminAuth = getAuth();
  let firebaseUser = null;
  try {
    firebaseUser = await adminAuth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  await connectDB();
  const mongoUser = await User.findOne({ email }).lean();

  if (firebaseUser) {
    await upsertMongoUser(firebaseUser.uid, {
      email,
      name: name || firebaseUser.displayName || mongoUser?.name,
    });
    return {
      uid: firebaseUser.uid,
      isNewUser: false,
      email,
      name: firebaseUser.displayName || mongoUser?.name || name || 'Customer',
    };
  }

  if (mongoUser?._id) {
    try {
      await adminAuth.createUser({
        uid: String(mongoUser._id),
        email,
        emailVerified: true,
        displayName: name || mongoUser.name || 'Customer',
      });
    } catch (error) {
      if (error?.code !== 'auth/email-already-exists' && error?.code !== 'auth/uid-already-exists') {
        throw error;
      }
    }
    await upsertMongoUser(mongoUser._id, { email, name: name || mongoUser.name });
    return {
      uid: String(mongoUser._id),
      isNewUser: false,
      email,
      name: name || mongoUser.name || 'Customer',
    };
  }

  const created = await adminAuth.createUser({
    email,
    emailVerified: true,
    displayName: name || 'Customer',
  });
  await upsertMongoUser(created.uid, { email, name: name || 'Customer' });
  return {
    uid: created.uid,
    isNewUser: true,
    email,
    name: name || 'Customer',
  };
}

export async function sendEmailLoginOtp({ email, name, captchaChallengeId, captchaAnswer, recaptchaToken, request }) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { ok: false, status: 400, error: 'Enter a valid email address.' };
  }

  const lock = await isAccountLocked(normalized, 'email');
  if (lock.locked) {
    return {
      ok: false,
      status: 423,
      error: formatLockError(lock),
      retryAfterSeconds: lock.retryAfterSeconds,
    };
  }

  await connectDB();
  const recentValid = await AuthOtp.findOne({
    key: normalized,
    purpose: OTP_PURPOSE,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!recentValid) {
    const google = await verifyGoogleRecaptcha(recaptchaToken, getClientIp(request));
    let captchaOk = google.ok;
    if (!captchaOk) {
      if (!google.skipped && recaptchaToken) {
        return { ok: false, status: 400, error: 'CAPTCHA verification failed' };
      }
      captchaOk = verifyMathCaptcha(captchaChallengeId, captchaAnswer);
    }
    if (!captchaOk) {
      return { ok: false, status: 400, error: 'CAPTCHA verification failed. Please try again.' };
    }
  }

  const recent = await AuthOtp.findOne({ key: normalized, purpose: OTP_PURPOSE }).sort({ createdAt: -1 }).lean();
  if (recent?.createdAt && Date.now() - new Date(recent.createdAt).getTime() < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil(
      (RESEND_COOLDOWN_MS - (Date.now() - new Date(recent.createdAt).getTime())) / 1000,
    );
    return {
      ok: false,
      status: 429,
      error: `Please wait ${retryAfterSeconds}s before requesting another code.`,
      retryAfterSeconds,
    };
  }

  const { code, ttlSeconds } = await issueOtp(normalized, OTP_PURPOSE, { length: 6 });
  await sendMail({
    to: normalized,
    subject: 'Your Store1920 login code',
    html: buildLoginOtpEmailHtml({
      code,
      minutes: Math.max(1, Math.round(ttlSeconds / 60)),
      name,
    }),
    fromType: 'transactional',
  });

  return {
    ok: true,
    ttlSeconds,
    maskedEmail: maskEmail(normalized),
    message: `We sent a code to ${maskEmail(normalized)}.`,
    name: name || '',
  };
}

export async function verifyEmailLoginOtp({ email, code, name }) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { ok: false, status: 400, error: 'Enter a valid email address.' };
  }

  const lock = await isAccountLocked(normalized, 'email');
  if (lock.locked) {
    return {
      ok: false,
      status: 423,
      error: formatLockError(lock),
      retryAfterSeconds: lock.retryAfterSeconds,
    };
  }

  const verified = await verifyOtp(normalized, OTP_PURPOSE, code, { consume: false });
  if (!verified.ok) {
    const fail = await recordFailedLogin(normalized, 'email');
    return { ok: false, status: 400, error: verified.error || 'Invalid code', locked: fail.locked };
  }

  let account;
  let customToken;
  try {
    account = await resolveOrCreateEmailUser({
      email: normalized,
      name: String(name || '').trim(),
    });
    customToken = await getAuth().createCustomToken(account.uid, {
      email: normalized,
      loginMethod: 'email_otp',
    });
  } catch (error) {
    await clearAccountLock(normalized, 'email');
    return {
      ok: false,
      status: 503,
      error: getFirebaseAdminUserMessage(error),
    };
  }

  await consumeOtpById(verified.otpId);
  await recordSuccessfulLogin(normalized, 'email');
  await recordSuccessfulLogin(account.uid, 'uid');
  await linkGuestOrdersToUser(account.uid, { email: normalized }).catch(() => ({ count: 0 }));

  return {
    ok: true,
    customToken,
    isNewUser: account.isNewUser,
    email: account.email,
    name: account.name,
  };
}
