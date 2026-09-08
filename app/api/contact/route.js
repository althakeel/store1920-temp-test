import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ContactMessage from '@/models/ContactMessage';
import { checkRateLimit, getClientIp } from '@/lib/apiSecurity';
import { resolvePublicStoreId } from '@/lib/emailMarketingLeads';
import { sendMail } from '@/lib/email';
import { STORE1920_SUPPORT_EMAIL } from '@/lib/storeContact';

export const dynamic = 'force-dynamic';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rate = checkRateLimit(`contact-form:${ip}`, 6, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(rate.waitTime || 60) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const message = String(body?.message || '').trim();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (name.length > 120 || email.length > 200 || message.length > 5000) {
      return NextResponse.json({ error: 'Message is too long.' }, { status: 400 });
    }

    await connectDB();
    const storeId = await resolvePublicStoreId();
    await ContactMessage.create({
      storeId: storeId || undefined,
      name,
      email,
      message,
    });

    try {
      await sendMail({
        to: STORE1920_SUPPORT_EMAIL,
        subject: `Contact form: ${name}`,
        html: `
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
        `,
        adminCopy: true,
        storeId,
      });
    } catch (emailError) {
      console.error('[contact] support email failed:', emailError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[contact] submit failed:', error);
    return NextResponse.json({ error: 'Could not send your message. Please try again.' }, { status: 500 });
  }
}
