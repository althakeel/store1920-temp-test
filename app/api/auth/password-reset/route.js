import { NextResponse } from 'next/server';
import {
  normalizeEmail,
  generateToken,
  verifyMathCaptcha,
  verifyGoogleRecaptcha,
  getClientIp,
} from '@/lib/authSecurity';
import {
  issueOtp,
  verifyOtp,
  issuePasswordResetToken,
  consumePasswordResetToken,
} from '@/lib/authOtp';
import { sendMail } from '@/lib/email';
import { getAuth } from '@/lib/firebase-admin';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { buildLoginOtpEmailHtml } from '@/lib/transactionalEmailLayout';

export const dynamic = 'force-dynamic';

async function findFirebaseUserForEmail(email) {
  try {
    return await getAuth().getUserByEmail(email);
  } catch (error) {
    if (error?.code && error.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  await connectDB();
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mongo = await User.findOne({
    email: { $regex: `^${escaped}$`, $options: 'i' },
  }).lean();
  const uid = String(mongo?.firebaseUid || mongo?._id || '').trim();
  if (!uid) return null;

  try {
    return await getAuth().getUser(uid);
  } catch {
    return null;
  }
}

/**
 * Request password reset — emails the same OTP layout as login, or sends WhatsApp OTP.
 * Always returns a generic success message to avoid account enumeration.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const channel = String(body.channel || 'email').trim().toLowerCase();

    const google = await verifyGoogleRecaptcha(body.recaptchaToken, getClientIp(request));
    let captchaOk = google.ok;
    if (!captchaOk) {
      if (!google.skipped && body.recaptchaToken) {
        return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 });
      }
      captchaOk = verifyMathCaptcha(body.captchaChallengeId, body.captchaAnswer);
    }
    if (!captchaOk) {
      return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 });
    }

    if (channel === 'whatsapp') {
      const { sendWhatsAppPasswordReset } = await import('@/lib/whatsappPasswordReset');
      const result = await sendWhatsAppPasswordReset({
        phone: body.phone,
        phoneCode: body.phoneCode,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      }
      return NextResponse.json({
        ok: true,
        message: result.message || 'If an account exists for that number, a WhatsApp code has been sent.',
      });
    }

    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const generic = {
      ok: true,
      message: 'If an account exists for that email, a reset code has been sent. Check inbox and spam.',
    };

    let userRecord = null;
    try {
      userRecord = await findFirebaseUserForEmail(email);
    } catch (error) {
      console.error('[password-reset] lookup failed', error);
      return NextResponse.json({
        error: 'Could not send the reset code right now. Please try again.',
      }, { status: 500 });
    }

    if (!userRecord) {
      return NextResponse.json(generic);
    }

    const resetToken = generateToken(32);
    await issuePasswordResetToken(email, resetToken);
    const { code, ttlSeconds } = await issueOtp(email, 'password_reset', { length: 6 });
    const minutes = Math.max(1, Math.round((ttlSeconds || 600) / 60));

    try {
      await sendMail({
        to: email,
        subject: 'Your Store1920 password reset code',
        html: buildLoginOtpEmailHtml({
          code,
          minutes,
          name: userRecord.displayName || '',
          title: 'Reset your password',
          intro: 'Use this one-time code in the app to set a new password. Do not share it with anyone.',
          preheader: `Your Store1920 reset code expires in ${minutes} minutes.`,
        }),
        fromType: 'transactional',
      });
    } catch (mailErr) {
      console.error('[password-reset] email failed', mailErr);
      return NextResponse.json({
        ok: false,
        error: 'We could not send the reset email right now. Please try again in a few minutes, or contact support@store1920.com.',
      }, { status: 502 });
    }

    return NextResponse.json(generic);
  } catch (error) {
    console.error('[password-reset]', error);
    return NextResponse.json({ error: 'Could not process reset request' }, { status: 500 });
  }
}

/**
 * Confirm reset with token or OTP + set new password via Admin SDK.
 * Body: { email, newPassword, resetToken? , otp? }
 */
export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const channel = String(body.channel || 'email').trim().toLowerCase();
    const newPassword = String(body.newPassword || '');
    const { validatePasswordStrength } = await import('@/lib/passwordPolicy');
    const policy = validatePasswordStrength(newPassword);
    if (!policy.ok) {
      return NextResponse.json({ error: policy.message }, { status: 400 });
    }

    if (channel === 'whatsapp') {
      const { confirmWhatsAppPasswordReset } = await import('@/lib/whatsappPasswordReset');
      const confirmed = await confirmWhatsAppPasswordReset({
        phone: body.phone,
        phoneCode: body.phoneCode,
        code: body.otp,
      });
      if (!confirmed.ok) {
        return NextResponse.json({ error: confirmed.error }, { status: confirmed.status || 400 });
      }
      await getAuth().updateUser(confirmed.uid, { password: newPassword });
      try {
        await getAuth().revokeRefreshTokens(confirmed.uid);
      } catch {
        // non-fatal
      }
      return NextResponse.json({ ok: true, message: 'Password updated. Please sign in.' });
    }

    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    let uid = null;
    if (body.resetToken) {
      const consumed = await consumePasswordResetToken(email, body.resetToken);
      if (!consumed.ok) {
        return NextResponse.json({ error: consumed.error }, { status: 400 });
      }
      try {
        const userRecord = await findFirebaseUserForEmail(email);
        uid = userRecord?.uid || null;
      } catch {
        uid = null;
      }
      if (!uid) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
    } else if (body.otp) {
      const verified = await verifyOtp(email, 'password_reset', body.otp);
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }
      try {
        const userRecord = await findFirebaseUserForEmail(email);
        uid = userRecord?.uid || null;
      } catch {
        uid = null;
      }
      if (!uid) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'resetToken or otp required' }, { status: 400 });
    }

    await getAuth().updateUser(uid, { password: newPassword });
    try {
      await getAuth().revokeRefreshTokens(uid);
    } catch {
      // non-fatal
    }

    return NextResponse.json({ ok: true, message: 'Password updated. Please sign in.' });
  } catch (error) {
    console.error('[password-reset confirm]', error);
    return NextResponse.json({ error: 'Could not reset password' }, { status: 500 });
  }
}
