import fs from 'fs';
import path from 'path';
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
  formatLockError,
  clearAccountLock,
} from '@/lib/authSecurity';
import { getFirebaseAdminUserMessage } from '@/lib/firebaseAdminErrors';
import { sendStore1920OtpMessage, normalizePhoneForWaba } from '@/lib/whatsapp/elasticWaba';
import { getPhoneVariants } from '@/lib/orderIdentity';
import { linkGuestOrdersToUser } from '@/lib/linkGuestOrders';

const OTP_PURPOSE = 'whatsapp_login';
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

function readDotEnvValue(name) {
  const fromProcess = String(process.env[name] || '').trim();
  if (fromProcess) return fromProcess;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const match = raw.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return String(match?.[1] || '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
}

export function getWhatsAppOtpLength() {
  return Math.min(8, Math.max(4, Number(readDotEnvValue('AUTH_WHATSAPP_OTP_LENGTH') || 4)));
}

export function resolveWhatsAppLoginPhone(phone, phoneCode = '+971') {
  const digits = normalizePhoneForWaba(phone, phoneCode);
  if (!digits) return null;
  return {
    digits,
    e164: `+${digits}`,
    variants: getPhoneVariants(digits, phoneCode),
  };
}

function maskPhone(digits) {
  const value = String(digits || '');
  if (value.length < 6) return value;
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

async function findMongoUserByPhone(variants) {
  if (!variants?.length) return null;
  return User.findOne({ phone: { $in: variants } }).lean();
}

async function upsertMongoUser(uid, { phone, name, email } = {}) {
  const $set = { firebaseUid: uid };
  if (phone) $set.phone = phone;
  if (name) $set.name = name;
  if (email) $set.email = email;

  await User.findOneAndUpdate(
    { _id: uid },
    {
      $set,
      $setOnInsert: { _id: uid, cart: {} },
    },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

async function resolveOrCreateWhatsAppUser({ e164, digits, name }) {
  const adminAuth = getAuth();
  let firebaseUser = null;

  try {
    firebaseUser = await adminAuth.getUserByPhoneNumber(e164);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const variants = getPhoneVariants(e164);
  const mongoUser = await findMongoUserByPhone(variants);

  if (firebaseUser) {
    await upsertMongoUser(firebaseUser.uid, {
      phone: digits,
      name: name || firebaseUser.displayName || mongoUser?.name,
      email: firebaseUser.email || mongoUser?.email,
    });
    return {
      uid: firebaseUser.uid,
      isNewUser: false,
      email: firebaseUser.email || mongoUser?.email || '',
      name: firebaseUser.displayName || mongoUser?.name || name || 'Customer',
    };
  }

  if (mongoUser?._id) {
    try {
      await adminAuth.updateUser(mongoUser._id, {
        phoneNumber: e164,
        ...(name ? { displayName: name } : {}),
      });
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        await adminAuth.createUser({
          uid: String(mongoUser._id),
          phoneNumber: e164,
          displayName: name || mongoUser.name || 'Customer',
          ...(mongoUser.email ? { email: mongoUser.email } : {}),
        });
      } else if (error?.code === 'auth/phone-number-already-exists') {
        const existing = await adminAuth.getUserByPhoneNumber(e164);
        await upsertMongoUser(existing.uid, {
          phone: digits,
          name: name || existing.displayName || mongoUser.name,
          email: existing.email || mongoUser.email,
        });
        return {
          uid: existing.uid,
          isNewUser: false,
          email: existing.email || mongoUser.email || '',
          name: existing.displayName || mongoUser.name || name || 'Customer',
        };
      } else {
        console.warn('[whatsapp-otp] could not attach phone to existing user', error?.code || error?.message);
      }
    }

    await upsertMongoUser(mongoUser._id, {
      phone: digits,
      name: name || mongoUser.name,
      email: mongoUser.email,
    });

    return {
      uid: String(mongoUser._id),
      isNewUser: false,
      email: mongoUser.email || '',
      name: name || mongoUser.name || 'Customer',
    };
  }

  const created = await adminAuth.createUser({
    phoneNumber: e164,
    displayName: name || 'Customer',
  });

  await upsertMongoUser(created.uid, {
    phone: digits,
    name: name || created.displayName || 'Customer',
  });

  return {
    uid: created.uid,
    isNewUser: true,
    email: '',
    name: name || 'Customer',
  };
}

export async function sendWhatsAppLoginOtp({ phone, phoneCode, name, captchaChallengeId, captchaAnswer, recaptchaToken, request }) {
  const resolved = resolveWhatsAppLoginPhone(phone, phoneCode);
  if (!resolved) {
    return { ok: false, status: 400, error: 'Enter a valid UAE mobile number.' };
  }

  const lock = await isAccountLocked(resolved.digits, 'phone');
  if (lock.locked) {
    return {
      ok: false,
      status: 423,
      error: formatLockError(lock),
      retryAfterSeconds: lock.retryAfterSeconds,
    };
  }

  await connectDB();
  const recentValidOtp = await AuthOtp.findOne({
    key: resolved.digits,
    purpose: OTP_PURPOSE,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!recentValidOtp) {
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

  const recent = await AuthOtp.findOne({
    key: resolved.digits,
    purpose: OTP_PURPOSE,
  }).sort({ createdAt: -1 }).lean();

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

  const recentCount = await AuthOtp.countDocuments({
    key: resolved.digits,
    purpose: OTP_PURPOSE,
    createdAt: { $gt: new Date(Date.now() - SEND_WINDOW_MS) },
  });
  if (recentCount >= MAX_SENDS_PER_WINDOW) {
    return { ok: false, status: 429, error: 'Too many codes sent. Try again in 15 minutes.' };
  }

  const otpLength = getWhatsAppOtpLength();
  const { code, ttlSeconds } = await issueOtp(resolved.digits, OTP_PURPOSE, { length: otpLength });
  const otpToken = readDotEnvValue('WABA_TOKEN_OTP');

  if (!otpToken && !readDotEnvValue('WABA_API_TOKEN')) {
    return { ok: false, status: 503, error: 'WhatsApp OTP token is not configured. Set WABA_TOKEN_OTP in .env.' };
  }

  if (!otpToken) {
    console.warn('[whatsapp-otp] WABA_TOKEN_OTP is empty; using WABA_API_TOKEN. Elastic may queue OTP without delivering it.');
  } else {
    console.log('[whatsapp-otp] sending', {
      to: maskPhone(resolved.digits),
      codeLength: code.length,
      usedOtpToken: true,
    });
  }

  const sent = await sendStore1920OtpMessage({
    to: resolved.digits,
    code,
    token: otpToken || undefined,
  });

  if (sent?.skipped) {
    return {
      ok: false,
      status: 503,
      error: sent.reason || 'WhatsApp OTP is not configured.',
    };
  }

  return {
    ok: true,
    ttlSeconds,
    maskedPhone: maskPhone(resolved.digits),
    message: `We sent a WhatsApp code to ${maskPhone(resolved.digits)}.`,
    name: name || '',
  };
}

export async function verifyWhatsAppLoginOtp({ phone, phoneCode, code, name }) {
  const resolved = resolveWhatsAppLoginPhone(phone, phoneCode);
  if (!resolved) {
    return { ok: false, status: 400, error: 'Enter a valid UAE mobile number.' };
  }

  const lock = await isAccountLocked(resolved.digits, 'phone');
  if (lock.locked) {
    return {
      ok: false,
      status: 423,
      error: formatLockError(lock),
      retryAfterSeconds: lock.retryAfterSeconds,
    };
  }

  const verified = await verifyOtp(resolved.digits, OTP_PURPOSE, code, { consume: false });
  if (!verified.ok) {
    const fail = await recordFailedLogin(resolved.digits, 'phone');
    return {
      ok: false,
      status: 400,
      error: verified.error || 'Invalid code',
      locked: fail.locked,
    };
  }

  await connectDB();
  let account;
  let customToken;
  try {
    account = await resolveOrCreateWhatsAppUser({
      e164: resolved.e164,
      digits: resolved.digits,
      name: String(name || '').trim(),
    });

    customToken = await getAuth().createCustomToken(account.uid, {
      phone: resolved.e164,
      loginMethod: 'whatsapp_otp',
    });
  } catch (error) {
    await clearAccountLock(resolved.digits, 'phone');
    return {
      ok: false,
      status: 503,
      error: getFirebaseAdminUserMessage(error),
    };
  }

  await consumeOtpById(verified.otpId);

  await recordSuccessfulLogin(resolved.digits, 'phone');
  await recordSuccessfulLogin(account.uid, 'uid');

  const linkResult = await linkGuestOrdersToUser(account.uid, {
    email: account.email,
    phone: resolved.digits,
    phones: resolved.variants,
  }).catch(() => ({ linked: false, count: 0 }));

  await upsertMongoUser(account.uid, {
    phone: resolved.digits,
    name: account.name,
    email: account.email,
  });

  return {
    ok: true,
    customToken,
    isNewUser: account.isNewUser,
    email: account.email || '',
    name: account.name || '',
    phone: resolved.e164,
    linkedOrderCount: linkResult?.count || 0,
  };
}
