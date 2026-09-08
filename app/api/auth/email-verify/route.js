import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/firebase-admin';
import { issueOtp, verifyOtp } from '@/lib/authOtp';
import { getOrCreateSecurity, normalizeEmail } from '@/lib/authSecurity';
import { sendMail } from '@/lib/email';
import { getCustomerSiteUrl, normalizePublicSiteUrl } from '@/lib/appUrl';

export const dynamic = 'force-dynamic';

async function requireUser(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    return await getAuth().verifyIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

/** Send email verification OTP + Firebase verification email */
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = normalizeEmail(decoded.email);
    if (!email) {
      return NextResponse.json({ error: 'No email on account' }, { status: 400 });
    }

    const { code, expiresAt } = await issueOtp(email, 'email_verify');
    try {
      await sendMail({
        to: email,
        subject: 'Verify your Store1920 email',
        html: `<p>Your verification code is <strong>${code}</strong>.</p><p>Expires at ${expiresAt.toISOString()}.</p>`,
        fromType: 'transactional',
      });
    } catch (e) {
      console.error('[email-verify] mail', e);
    }

    try {
      const origin = normalizePublicSiteUrl(
        process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || getCustomerSiteUrl()
      );
      await getAuth().generateEmailVerificationLink(email, {
        url: `${origin.replace(/\/$/, '')}/dashboard/security`,
      });
    } catch (e) {
      console.warn('[email-verify] firebase link', e?.message || e);
    }

    return NextResponse.json({ ok: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('[email-verify]', error);
    return NextResponse.json({ error: 'Could not send verification' }, { status: 500 });
  }
}

/** Confirm email OTP */
export async function PUT(request) {
  try {
    const decoded = await requireUser(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(decoded.email);
    const result = await verifyOtp(email, 'email_verify', body.code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await getAuth().updateUser(decoded.uid, { emailVerified: true });
    const sec = await getOrCreateSecurity(email, 'email');
    sec.emailVerifiedAt = new Date();
    await sec.save();
    const uidSec = await getOrCreateSecurity(decoded.uid, 'uid');
    uidSec.emailVerifiedAt = new Date();
    await uidSec.save();

    return NextResponse.json({ ok: true, emailVerified: true });
  } catch (error) {
    console.error('[email-verify confirm]', error);
    return NextResponse.json({ error: 'Could not verify email' }, { status: 500 });
  }
}
