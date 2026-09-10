import { NextResponse } from 'next/server';
import { sendEmailLoginOtp, verifyEmailLoginOtp } from '@/lib/emailOtpAuth';
import { getFirebaseAdminUserMessage } from '@/lib/firebaseAdminErrors';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendEmailLoginOtp({
      email: body.email,
      name: body.name,
      captchaChallengeId: body.captchaChallengeId,
      captchaAnswer: body.captchaAnswer,
      recaptchaToken: body.recaptchaToken,
      request,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, retryAfterSeconds: result.retryAfterSeconds },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      ttlSeconds: result.ttlSeconds,
      maskedEmail: result.maskedEmail,
      message: result.message,
    });
  } catch (error) {
    console.error('[auth/email-otp send]', error);
    return NextResponse.json(
      { error: error.message || 'Could not send email code' },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await verifyEmailLoginOtp({
      email: body.email,
      code: body.code,
      name: body.name,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, locked: result.locked },
        { status: result.status || 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      customToken: result.customToken,
      isNewUser: result.isNewUser,
      email: result.email,
      name: result.name,
    });
  } catch (error) {
    console.error('[auth/email-otp verify]', error);
    return NextResponse.json(
      { error: getFirebaseAdminUserMessage(error) },
      { status: 500 },
    );
  }
}
