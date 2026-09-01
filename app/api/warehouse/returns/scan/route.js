import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { getWarehouseApiContext } from '@/lib/warehouseAuth';
import {
  collectWarehouseReturnScan,
  formatWarehouseReturnScanResponse,
  lookupWarehouseReturnScan,
} from '@/lib/warehouseReturnScan';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function lookupFrom(body = {}) {
  return String(
    body?.q
    || body?.awb
    || body?.tracking
    || body?.orderId
    || body?.order
    || body?.scan
    || '',
  ).trim();
}

function parseItemIndexes(body = {}) {
  if (!Array.isArray(body?.itemIndexes)) return null;
  return body.itemIndexes.map((value) => Number(value)).filter((value) => Number.isFinite(value));
}

/**
 * GET /api/warehouse/returns/scan?q=<scan>
 * Preview return scan — order, product ids, current status, whether collect is allowed.
 */
export async function GET(request) {
  try {
    const context = await getWarehouseApiContext(request);
    if (!context?.storeId) {
      return NextResponse.json({
        error: 'Unauthorized',
        hint: 'Send x-warehouse-key or Authorization: Bearer <Firebase ID token>',
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = String(
      searchParams.get('q')
      || searchParams.get('awb')
      || searchParams.get('tracking')
      || searchParams.get('order')
      || searchParams.get('orderId')
      || '',
    ).trim();
    const orderId = String(searchParams.get('orderId') || searchParams.get('id') || '').trim();

    if (!q && !orderId) {
      return NextResponse.json({ error: 'q or orderId is required' }, { status: 400 });
    }

    await dbConnect();
    const result = await lookupWarehouseReturnScan({
      storeId: context.storeId,
      q,
      orderId,
    });

    return NextResponse.json(
      formatWarehouseReturnScanResponse(result),
      { status: result.ok ? 200 : (result.status || 400) },
    );
  } catch (error) {
    console.error('[warehouse/returns/scan GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to look up return scan' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/warehouse/returns/scan
 *
 * Warehouse scanner app — return product scan.
 *
 * Lookup (preview):
 *   { "q": "<scan>", "action": "lookup" }
 *
 * Collect (status → RETURNED + stock restock):
 *   { "q": "<scan>", "action": "collect", "type": "RETURNED" }
 *
 * `action` omitted + `confirm: true` also collects.
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
        { error: 'q, awb, scan, or orderId is required' },
        { status: 400 },
      );
    }

    const action = String(body?.action || '').trim().toLowerCase();
    const shouldCollect = action === 'collect'
      || action === 'confirm'
      || body?.confirm === true;

    await dbConnect();

    const result = shouldCollect
      ? await collectWarehouseReturnScan({
        storeId: context.storeId,
        orderId,
        q,
        type: body?.type || body?.status || body?.outcome || 'RETURNED',
        notes: String(body?.notes || '').trim(),
        force: Boolean(body?.force),
        restock: body?.restock === false ? false : true,
        itemIndexes: parseItemIndexes(body),
        actor: context.actor,
      })
      : await lookupWarehouseReturnScan({
        storeId: context.storeId,
        orderId,
        q,
      });

    return NextResponse.json(
      formatWarehouseReturnScanResponse(result),
      { status: result.ok ? 200 : (result.status || 400) },
    );
  } catch (error) {
    console.error('[warehouse/returns/scan POST]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process return scan' },
      { status: 500 },
    );
  }
}
