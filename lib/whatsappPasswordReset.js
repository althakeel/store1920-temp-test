import { getAuth } from '@/lib/firebase-admin';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import AuthOtp from '@/models/AuthOtp';
import { issueOtp, verifyOtp } from '@/lib/authOtp';
import { sendStore1920OtpMessage } from '@/lib/whatsapp/elasticWaba';
import { getWhatsAppOtpLength, resolveWhatsAppLoginPhone } from '@/lib/whatsappOtpAuth';

const RESET_PURPOSE = 'password_reset';
const GENERIC_SEND_MESSAGE = 'If an account exists for that number, a WhatsApp code has been sent.';
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

function readDotEnvValue(name) {
  return String(process.env[name] || '').trim();
}

async function findMongoUserByPhone(variants) {
  if (!variants?.length) return null;
  await connectDB();
  return User.findOne({ phone: { $in: variants } }).lean();
}

async function findFirebaseUserForPhone(resolved) {
  try {
    return await getAuth().getUserByPhoneNumber(resolved.e164);
  } catch (error) {
    if (error?.code && error.code !== 'auth/user-not-found') throw error;
  }

  const mongo = await findMongoUserByPhone(resolved.variants);
  const uid = String(mongo?.firebaseUid || mongo?._id || '').trim();
  if (!uid) return null;

  try {
    return await getAuth().getUser(uid);
  } catch {
    return null;
  }
}

export async function sendWhatsAppPasswordReset({ phone, phoneCode }) {
  const resolved = resolveWhatsAppLoginPhone(phone, phoneCode);
  if (!resolved) {
    return { ok: false, status: 400, error: 'Enter a valid UAE mobile number.' };
  }

  await connectDB();
  const recent = await AuthOtp.findOne({
    key: resolved.digits,
    purpose: RESET_PURPOSE,
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
    purpose: RESET_PURPOSE,
    createdAt: { $gt: new Date(Date.now() - SEND_WINDOW_MS) },
  });
  if (recentCount >= MAX_SENDS_PER_WINDOW) {
    return { ok: false, status: 429, error: 'Too many codes sent. Try again in 15 minutes.' };
  }

  let user = null;
  try {
    user = await findFirebaseUserForPhone(resolved);
  } catch (error) {
    console.error('[whatsapp-password-reset] lookup failed', error);
    return { ok: false, status: 500, error: 'Could not send the reset code right now. Please try again.' };
  }

  if (!user) {
    return { ok: true, message: GENERIC_SEND_MESSAGE };
  }

  const otpToken = readDotEnvValue('WABA_TOKEN_OTP');
  if (!otpToken && !readDotEnvValue('WABA_API_TOKEN')) {
    return { ok: false, status: 503, error: 'WhatsApp OTP is not configured.' };
  }

  const { code, ttlSeconds } = await issueOtp(resolved.digits, RESET_PURPOSE, {
    length: getWhatsAppOtpLength(),
  });
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
    message: GENERIC_SEND_MESSAGE,
  };
}

export async function confirmWhatsAppPasswordReset({ phone, phoneCode, code }) {
  const resolved = resolveWhatsAppLoginPhone(phone, phoneCode);
  if (!resolved) {
    return { ok: false, status: 400, error: 'Enter a valid UAE mobile number.' };
  }

  let user = null;
  try {
    user = await findFirebaseUserForPhone(resolved);
  } catch (error) {
    console.error('[whatsapp-password-reset] confirm lookup failed', error);
    return { ok: false, status: 500, error: 'Could not reset password right now. Please try again.' };
  }

  if (!user) {
    return { ok: false, status: 400, error: 'Invalid or expired code' };
  }

  const verified = await verifyOtp(resolved.digits, RESET_PURPOSE, code);
  if (!verified.ok) {
    return { ok: false, status: 400, error: verified.error || 'Invalid code' };
  }

  return { ok: true, uid: user.uid };
}
