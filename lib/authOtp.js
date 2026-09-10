import connectDB from '@/lib/mongodb';
import AuthOtp from '@/models/AuthOtp';
import { generateOtpCode, hashSecret } from '@/lib/authSecurity';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

export async function issueOtp(key, purpose, { length = 6 } = {}) {
  await connectDB();
  const digits = Math.min(8, Math.max(4, Number(length) || 6));
  const code = generateOtpCode(digits);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await AuthOtp.deleteMany({ key: String(key), purpose, consumedAt: null });

  await AuthOtp.create({
    key: String(key),
    purpose,
    codeHash: hashSecret(code),
    expiresAt,
  });

  return { code, expiresAt, ttlSeconds: Math.floor(OTP_TTL_MS / 1000) };
}

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Persist a password-reset link token (survives serverless — unlike in-memory cache). */
export async function issuePasswordResetToken(email, token) {
  await connectDB();
  const key = String(email || '').trim().toLowerCase();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await AuthOtp.deleteMany({ key, purpose: 'password_reset_token', consumedAt: null });

  await AuthOtp.create({
    key,
    purpose: 'password_reset_token',
    codeHash: hashSecret(String(token || '')),
    expiresAt,
  });

  return { expiresAt, ttlSeconds: Math.floor(RESET_TOKEN_TTL_MS / 1000) };
}

export async function consumePasswordResetToken(email, token) {
  await connectDB();
  const key = String(email || '').trim().toLowerCase();
  const tokenHash = hashSecret(String(token || '').trim());

  const doc = await AuthOtp.findOne({
    key,
    purpose: 'password_reset_token',
    consumedAt: null,
    expiresAt: { $gt: new Date() },
    codeHash: tokenHash,
  }).sort({ createdAt: -1 });

  if (!doc) {
    return { ok: false, error: 'Invalid or expired reset token' };
  }

  doc.consumedAt = new Date();
  await doc.save();
  return { ok: true };
}

export async function verifyOtp(key, purpose, code, { consume = true } = {}) {
  await connectDB();
  const doc = await AuthOtp.findOne({
    key: String(key),
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!doc) {
    return { ok: false, error: 'Code expired or not found' };
  }

  doc.attempts = (doc.attempts || 0) + 1;
  if (doc.attempts > MAX_VERIFY_ATTEMPTS) {
    doc.consumedAt = new Date();
    await doc.save();
    return { ok: false, error: 'Too many invalid attempts' };
  }

  if (doc.codeHash !== hashSecret(String(code || '').trim())) {
    await doc.save();
    return { ok: false, error: 'Invalid code' };
  }

  if (consume) {
    doc.consumedAt = new Date();
    await doc.save();
  } else {
    doc.attempts = Math.max(0, (doc.attempts || 1) - 1);
    await doc.save();
  }
  return { ok: true, otpId: String(doc._id) };
}

export async function consumeOtpById(otpId) {
  if (!otpId) return;
  await connectDB();
  await AuthOtp.updateOne({ _id: otpId, consumedAt: null }, { $set: { consumedAt: new Date() } });
}
