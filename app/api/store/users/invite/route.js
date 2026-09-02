
import { NextResponse } from "next/server";
import connectDB from '@/lib/mongodb';
import Store from '@/models/Store';
import StoreUser from '@/models/StoreUser';
import { getAuth } from '@/lib/firebase-admin';
import { randomBytes } from "crypto";
import { sendMail } from '@/lib/email';
import { getAppBaseUrl } from '@/lib/appUrl';

function buildInviteEmailHtml({ storeName, inviteUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 620px; width: 100%; margin: auto;">
      <h2 style="color: #ff6600;">Store1920 Store Invitation</h2>
      <p>Hello,</p>
      <p><b>${storeName}</b> has invited you to join their store team on <a href="https://store1920.com" style="color: #ff6600;">Store1920</a>.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteUrl}" style="background: #ff6600; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Accept Invitation</a>
      </p>
      <p>This link will expire in <b>7 days</b>. If you did not expect this invitation, you can ignore this email.</p>
      <hr style="margin: 32px 0;" />
      <p style="font-size: 13px; color: #888;">Sent by Store1920 Store Platform</p>
    </div>
  `;
}

export async function POST(request) {
  try {
    await connectDB();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const { email, permissions } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

    const store = await Store.findOne({ userId }).lean();
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const existing = await StoreUser.findOne({
      storeId: store._id.toString(),
      email: normalizedEmail,
    }).lean();

    if (existing?.status === 'approved') {
      return NextResponse.json({ error: 'This user is already a team member' }, { status: 400 });
    }

    const inviteToken = randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const sanitizedPermissions = permissions && typeof permissions === 'object' ? permissions : {};
    const isResend = existing && ['invited', 'pending'].includes(existing.status);
    const inviteUrl = `${getAppBaseUrl()}/store/invite/accept?token=${inviteToken}`;

    if (existing) {
      await StoreUser.updateOne(
        { _id: existing._id },
        {
          $set: {
            email: normalizedEmail,
            role: 'member',
            status: 'invited',
            invitedById: userId,
            inviteToken,
            inviteExpiry,
            permissions: sanitizedPermissions,
          },
        }
      );
    } else {
      await StoreUser.create({
        storeId: store._id.toString(),
        email: normalizedEmail,
        role: 'member',
        status: 'invited',
        invitedById: userId,
        inviteToken,
        inviteExpiry,
        permissions: sanitizedPermissions,
      });
    }

    const emailSubject = `You're invited to join ${store.name} on Store1920`;
    const emailHtml = buildInviteEmailHtml({ storeName: store.name, inviteUrl });

    try {
      await sendMail({
        to: normalizedEmail,
        subject: emailSubject,
        html: emailHtml,
        fromType: 'transactional',
        storeId: store._id.toString(),
        skipStoreSmtp: true,
      });

      return NextResponse.json({
        success: true,
        emailSent: true,
        message: isResend ? 'Invitation resent successfully' : 'Invitation sent successfully',
      });
    } catch (emailError) {
      console.error('[INVITE] Email delivery failed:', emailError);

      const reason = emailError?.message
        || emailError?.error?.message
        || emailError?.error
        || 'Email provider is not configured or rejected the message';

      return NextResponse.json({
        success: true,
        emailSent: false,
        message: 'Invitation saved, but the email was not delivered',
        warning: reason,
        inviteUrl,
      });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
