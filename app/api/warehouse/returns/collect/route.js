import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getWarehouseApiContext } from '@/lib/warehouseAuth';
import {
  collectWarehouseReturn,
  formatWarehouseReturn,
  warehouseReturnStatusLabel,
} from '@/lib/warehouseReturnCollect';
import { serializeWarehouseTrackingOrderHydrated } from '@/lib/warehouseTracking';
import { buildReturnedProductsFromRestock } from '@/lib/warehouseReturnScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function lookupFrom(body = {}) {
  return String(
    body?.q
    || body?.awb
    || body?.tracking
    || body?.orderId
    || body?.order
    || '',
  ).trim();
}

/**
 * POST /api/warehouse/returns/collect
 * Warehouse Flutter app: scan returning product / EMX label.
 * - Sets dashboard status to RETURNED or RTO
 * - Shows "Return collected" in app
 * - Restocks product (+ variant) inventory once
 *
 * Body: { q | awb | orderId, type?: "RETURNED" | "RTO", notes?, restock?, force?, itemIndexes? }
 */
export async function POST(request) {
  try {
    const context = await getWarehouseApiContext(request);
    if (!context?.storeId) {
      return NextResponse.json({
        error: 'Unauthorized',
        hint: 'Send x-warehouse-key or Authorization: Bearer <Firebase ID token>',
      }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const q = lookupFrom(body);
    const orderId = String(body?.orderId || body?.id || '').trim();
    if (!q && !orderId) {
      return NextResponse.json(
        { error: 'q, awb, or orderId is required' },
        { status: 400 },
      );
    }

    const itemIndexes = Array.isArray(body?.itemIndexes)
      ? body.itemIndexes.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : null;

    await dbConnect();

    const result = await collectWarehouseReturn({
      storeId: context.storeId,
      orderId,
      q,
      type: body?.type || body?.status || body?.outcome || '',
      notes: String(body?.notes || '').trim(),
      force: Boolean(body?.force),
      restock: body?.restock === false ? false : true,
      itemIndexes,
      actor: context.actor,
    });

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        error: result.error,
        q: q || orderId,
      }, { status: result.status || 400 });
    }

    const order = await serializeWarehouseTrackingOrderHydrated(result.order);
    const stockRestock = result.stockRestock || {
      restocked: false,
      skipped: true,
      reason: 'unknown',
      lines: [],
      productCount: 0,
      unitCount: 0,
    };
    const returnedProducts = buildReturnedProductsFromRestock(stockRestock, result.order);

    return NextResponse.json({
      success: true,
      message: 'Return collected',
      appMessage: 'Return collected',
      alreadyCollected: Boolean(result.alreadyCollected),
      statusChanged: Boolean(result.statusChanged),
      previousStatus: result.previousStatus || null,
      status: result.status,
      statusLabel: warehouseReturnStatusLabel(result.status),
      returnCollected: formatWarehouseReturn(result.order),
      returnedProducts,
      stockRestock,
      order,
    });
  } catch (error) {
    console.error('[warehouse/returns/collect POST]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to collect return' },
      { status: 500 },
    );
  }
}
