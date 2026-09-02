import { NextResponse } from 'next/server';
import {
  isAccountLocked,
  normalizeEmail,
  verifyMathCaptcha,
  verifyGoogleRecaptcha,
  getClientIp,
  AUTH_LOCK,
} from '@/lib/authSecurity';

export const dynamic = 'force-dynamic';

/**
 * Pre-login gate: CAPTCHA + lockout check before Firebase signIn.
 * POST { email, captchaChallengeId?, captchaAnswer?, recaptchaToken? }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const lock = await isAccountLocked(email, 'email');
    if (lock.locked) {
      return NextResponse.json(
        {
          error: 'Account temporarily locked due to too many failed login attempts.',
          locked: true,
          lockedUntil: lock.lockedUntil,
          retryAfterSeconds: lock.retryAfterSeconds,
        },
        { status: 423 },
      );
    }

    const google = await verifyGoogleRecaptcha(body.recaptchaToken, getClientIp(request));
    let captchaOk = google.ok;
    if (!captchaOk) {
      // Prefer math when Google is skipped or token missing; only hard-fail
      // Google when a token was sent and siteverify rejected it.
      if (!google.skipped && body.recaptchaToken) {
        return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 });
      }
      captchaOk = verifyMathCaptcha(body.captchaChallengeId, body.captchaAnswer);
    }

    if (!captchaOk) {
      return NextResponse.json({ error: 'CAPTCHA verification failed. Please try again.' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      failedAttempts: lock.failedAttempts || 0,
      remainingAttempts: Math.max(0, AUTH_LOCK.maxFailedAttempts - (lock.failedAttempts || 0)),
    });
  } catch (error) {
    console.error('[auth/pre-login]', error);
    return NextResponse.json({ error: 'Pre-login check failed' }, { status: 500 });
  }
}
