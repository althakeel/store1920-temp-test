import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ContactMessage from '@/models/ContactMessage';
import { verifyStoreSeller } from '@/lib/storeSellerAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await verifyStoreSeller(request);
  if (auth.error) return auth.error;

  try {
    await connectDB();
    const messages = await ContactMessage.find({
      $or: [{ storeId: auth.storeId }, { storeId: null }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return NextResponse.json({
      messages: messages.map((row) => ({
        name: row.name,
        email: row.email,
        message: row.message,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    console.error('[store/contact-messages]', error);
    return NextResponse.json({ error: 'Failed to load contact messages' }, { status: 500 });
  }
}
