import { NextResponse } from 'next/server';
import authSeller from '@/middlewares/authSeller';
import connectDB from '@/lib/mongodb';
import { getAuth } from '@/lib/firebase-admin';
import { findOrderByTrackingIdentifier } from '@/lib/orderTrackingLookup';
import { batchPopulateOrderUsers } from '@/lib/storeOrderUsers';
import { formatWarehousePacking } from '@/lib/warehouseOrderPacking';
import { formatWarehouseReturn } from '@/lib/warehouseReturnCollect';
import { syncWaslahStatusForOrder } from '@/lib/waslahOrderStatusSync';
import { getOrderLineProduct } from '@/lib/orderDisplay';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getCustomerSiteUrl } from '@/lib/appUrl';

function ensureAbsoluteHttpsUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === '/placeholder.png') return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
  const base = String(getCustomerSiteUrl() || 'https://www.store1920.com').replace(/\/+$/, '');
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value.replace(/^\//, '')}`;
}

/** Attach a ready-to-use absolute thumbnail on each line (skips leading videos). */
function withLineItemImages(order) {
  if (!order) return order;
  const orderItems = (order.orderItems || []).map((item) => {
    const product = getOrderLineProduct(item);
    const thumbnail = ensureAbsoluteHttpsUrl(
      getProductThumbnailUrl(product, { fallback: item?.image || '' }),
    );
    if (!thumbnail) return item;
    return { ...item, image: thumbnail };
  });
  return { ...order, orderItems };
}

/**
 * GET /api/store/orders/lookup?q=
 * Seller-scoped order lookup by AWB, Waslah tracking/order ID, Mongo _id, or shortOrderNumber.
 */
export async function GET(request) {
  try {
    await connectDB();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'not authorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get('q') || '').trim();
    if (!q) {
      return NextResponse.json({ error: 'Missing lookup query (q)' }, { status: 400 });
    }

    const order = await findOrderByTrackingIdentifier(q);
    if (!order || order.deletedAt) {
      return NextResponse.json({ error: 'Order not found', q }, { status: 404 });
    }
    if (String(order.storeId) !== String(storeId)) {
      return NextResponse.json(
        {
          error: 'Order found but belongs to another store for this login',
          q,
          code: 'WRONG_STORE',
        },
        { status: 404 },
      );
    }

    await batchPopulateOrderUsers([order], { getAuth });

    let liveOrder = order;
    const includeWaslah = searchParams.get('withWaslah') === 'true';
    if (includeWaslah) {
      try {
        const timeoutMs = Number(process.env.WASLAH_TRACKING_TIMEOUT_MS || 8000);
        const synced = await Promise.race([
          syncWaslahStatusForOrder(order, { persist: true, force: true }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Waslah tracking timeout')), timeoutMs);
          }),
        ]);
        if (synced?.order) liveOrder = synced.order;
      } catch (error) {
        console.warn('[ORDER LOOKUP] Waslah live tracking skipped:', error?.message || error);
      }
    }

    const enriched = withLineItemImages(liveOrder);

    return NextResponse.json({
      order: {
        ...enriched,
        warehousePacking: formatWarehousePacking(enriched),
        warehouseReturn: formatWarehouseReturn(enriched),
      },
    });
  } catch (error) {
    console.error('[ORDER LOOKUP API ERROR]', error);
    return NextResponse.json(
      { error: error.code || error.message || 'Lookup failed' },
      { status: 400 },
    );
  }
}
