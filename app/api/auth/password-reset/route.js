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

export const dynamic = 'force-dynamic';

function siteOrigin(request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL
    || process.env.SITE_URL
    || request.headers.get('origin')
    || 'https://store1920.com'
  ).replace(/\/$/, '');
}

/**
 * Request password reset — emails a Firebase link + OTP (and our app link).
 * Always returns a generic success message to avoid email enumeration.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

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

    const generic = {
      ok: true,
      message: 'If an account exists for that email, a reset link has been sent. Check inbox and spam.',
    };

    let userRecord = null;
    try {
      userRecord = await getAuth().getUserByEmail(email);
    } catch {
      return NextResponse.json(generic);
    }

    const origin = siteOrigin(request);
    const resetToken = generateToken(32);
    await issuePasswordResetToken(email, resetToken);

    const { code, expiresAt } = await issueOtp(email, 'password_reset');

    let firebaseResetLink = '';
    try {
      firebaseResetLink = await getAuth().generatePasswordResetLink(email, {
        url: `${origin}/sign-in`,
      });
    } catch (e) {
      console.warn('[password-reset] Firebase link:', e?.message || e);
    }

    const appResetUrl = `${origin}/sign-in?resetToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
    const primaryLink = firebaseResetLink || appResetUrl;

    try {
      await sendMail({
        to: email,
        subject: 'Reset your Store1920 password',
        html: `
          <p>Hi${userRecord.displayName ? ` ${userRecord.displayName}` : ''},</p>
          <p>We received a request to reset your Store1920 password.</p>
          <p><a href="${primaryLink}" style="display:inline-block;padding:12px 20px;background:#1f2937;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a></p>
          <p>Or open this link:<br/><a href="${primaryLink}">${primaryLink}</a></p>
          ${firebaseResetLink && firebaseResetLink !== appResetUrl
            ? `<p>Prefer the in-app form? Use this link and the code below:<br/><a href="${appResetUrl}">${appResetUrl}</a></p>`
            : ''}
          <p>Or enter this one-time code in the app: <strong style="font-size:18px;letter-spacing:2px;">${code}</strong></p>
          <p>Code expires at ${expiresAt.toISOString()} (about 10 minutes). If you did not request this, you can ignore this email.</p>
        `,
        fromType: 'transactional',
        skipStoreSmtp: true,
      });
    } catch (mailErr) {
      console.error('[password-reset] email failed', mailErr);
      // Still return generic — but log so ops can see provider failures.
      // Do not claim success if we know delivery failed for a real account:
      // return a soft retry hint without confirming the email exists.
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
    const email = normalizeEmail(body.email);
    const newPassword = String(body.newPassword || '');
    const { validatePasswordStrength } = await import('@/lib/passwordPolicy');
    const policy = validatePasswordStrength(newPassword);
    if (!policy.ok) {
      return NextResponse.json({ error: policy.message }, { status: 400 });
    }
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
        const userRecord = await getAuth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }
    } else if (body.otp) {
      const verified = await verifyOtp(email, 'password_reset', body.otp);
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }
      try {
        const userRecord = await getAuth().getUserByEmail(email);
        uid = userRecord.uid;
      } catch {
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
