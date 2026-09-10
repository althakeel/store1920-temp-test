import { NextResponse } from 'next/server';
import { sendWhatsAppLoginOtp, verifyWhatsAppLoginOtp } from '@/lib/whatsappOtpAuth';
import { getFirebaseAdminUserMessage } from '@/lib/firebaseAdminErrors';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendWhatsAppLoginOtp({
      phone: body.phone,
      phoneCode: body.phoneCode || body.countryCode || '+971',
      name: body.name,
      captchaChallengeId: body.captchaChallengeId,
      captchaAnswer: body.captchaAnswer,
      recaptchaToken: body.recaptchaToken,
      request,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        { status: result.status || 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      ttlSeconds: result.ttlSeconds,
      maskedPhone: result.maskedPhone,
      message: result.message,
    });
  } catch (error) {
    console.error('[auth/whatsapp-otp send]', error);
    return NextResponse.json(
      { error: error.message || 'Could not send WhatsApp code' },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await verifyWhatsAppLoginOtp({
      phone: body.phone,
      phoneCode: body.phoneCode || body.countryCode || '+971',
      code: body.code,
      name: body.name,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          locked: result.locked,
          retryAfterSeconds: result.retryAfterSeconds,
        },
        { status: result.status || 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      customToken: result.customToken,
      isNewUser: result.isNewUser,
      email: result.email,
      name: result.name,
      phone: result.phone,
      linkedOrderCount: result.linkedOrderCount,
    });
  } catch (error) {
    console.error('[auth/whatsapp-otp verify]', error);
    return NextResponse.json(
      { error: getFirebaseAdminUserMessage(error) },
      { status: 500 },
    );
  }
}
