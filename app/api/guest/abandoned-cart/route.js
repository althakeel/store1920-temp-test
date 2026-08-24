import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import AbandonedCart from '@/models/AbandonedCart';
import { scheduleAbandonedCartWhatsAppReminder, queueAbandonedCartWhatsAppDrain } from '@/lib/abandonedCheckoutWhatsAppReminder';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import {
  normalizeAbandonedCartItemFromClient,
  sumAbandonedCartItemsTotal,
} from '@/lib/abandonedCartLineItems';
import { cartRestoreTokenSetOnInsert } from '@/lib/abandonedCartRestore';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      items,
      guestEmail,
      guestPhone,
      guestName,
      guestPhoneCode,
      anonymousId: anonymousIdInput,
      sessionId,
    } = body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const email = guestEmail?.toLowerCase()?.trim() || null;
    const phone = guestPhone ? String(guestPhone).replace(/\D/g, '') : null;
    const anonymousId = String(anonymousIdInput || '').trim() || null;

    if (!email && !phone && !anonymousId) {
      return NextResponse.json(
        { error: 'Email, phone, or browser session required for guest cart tracking' },
        { status: 400 },
      );
    }

    await dbConnect();

    const productIds = items.map((it) => it.productId || it.id).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } })
      .select('_id storeId name price salePrice images image slug useProductsPath variants')
      .lean();

    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const grouped = new Map();
    for (const it of items) {
      const productId = String(it.productId || it.id);
      const prod = productMap.get(productId);
      if (!prod?.storeId) continue;

      const storeId = String(prod.storeId);
      if (!grouped.has(storeId)) grouped.set(storeId, []);

      grouped.get(storeId).push({
        ...normalizeAbandonedCartItemFromClient(it, prod),
        imageUrl: getProductThumbnailUrl(prod, { fallback: '' }) || '',
      });
    }

    if (grouped.size === 0) {
      return NextResponse.json(
        { error: 'No products with a valid store could be tracked', skipped: true },
        { status: 422 },
      );
    }

    const now = new Date();
    const phoneCode = guestPhoneCode?.trim() || '+971';

    for (const [storeId, storeItems] of grouped.entries()) {
      const orClauses = [];
      if (email) orClauses.push({ email });
      if (phone) orClauses.push({ phone });
      if (anonymousId) orClauses.push({ anonymousId });

      const filter = {
        storeId,
        status: { $ne: 'converted' },
        ...(orClauses.length ? { $or: orClauses } : {}),
      };

      const cartTotal = sumAbandonedCartItemsTotal({ items: storeItems }, productMap);

      await AbandonedCart.updateOne(
        filter,
        {
          $set: {
            storeId,
            userId: null,
            anonymousId,
            sessionId: sessionId ? String(sessionId).trim() : null,
            name: guestName?.trim() || null,
            email,
            phone,
            phoneCode,
            address: null,
            items: storeItems,
            cartTotal,
            currency: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED',
            lastSeenAt: now,
            source: 'guest-cart',
            status: 'active',
          },
          $setOnInsert: cartRestoreTokenSetOnInsert(),
        },
        { upsert: true },
      );

      if (phone) {
        await scheduleAbandonedCartWhatsAppReminder(
          { storeId, ...filter, status: 'active' },
          { now, phone },
        );
      }
    }

    queueAbandonedCartWhatsAppDrain();
    return NextResponse.json({ ok: true, message: 'Guest cart tracked' });
  } catch (error) {
    console.error('[guest-abandoned-cart] error:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
