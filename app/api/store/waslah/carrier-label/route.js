import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { printWaslahReceipt, isWaslahConfigured } from '@/lib/waslah';
import { extractWaslahPrintReceiptUrl, isWaslahLabelReadyOrder, buildLabelDownloadedMongoUpdate, getStatusAfterLabelDownload } from '@/lib/waslahReceipts';
import { extractEmxCarrierLabelPdf, mergeEmxCarrierLabelPdfs } from '@/lib/waslahEmxLabelPdf';
import { uploadToS3 } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_BULK_LABELS = 25;

async function authenticateSeller(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const storeId = await authSeller(decodedToken.uid);
  if (!storeId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { storeId: String(storeId) };
}

async function markOrderLabelDownloaded(order, emxPdf) {
  const orderId = String(order?._id || '').trim();
  if (!orderId) return order;

  const printedAt = new Date();
  const previousStatus = String(order.status || '').toUpperCase();
  const nextStatus = getStatusAfterLabelDownload(order);
  const update = buildLabelDownloadedMongoUpdate(order, printedAt);

  try {
    const tracking = String(
      order.waslah?.emxTrackingNumber
      || order.waslah?.trackingNumber
      || order.trackingId
      || orderId,
    ).replace(/[^\w-]/g, '').slice(0, 40);
    const uploaded = await uploadToS3({
      buffer: emxPdf,
      fileName: `emx-carrier-${tracking}-${Date.now()}.pdf`,
      folder: 'uploads',
      contentType: 'application/pdf',
    });
    if (uploaded?.url) {
      update.$set['waslah.labelUrl'] = uploaded.url;
    }
  } catch (persistError) {
    console.warn('[store/waslah/carrier-label] S3 persist failed:', persistError?.message);
  }

  const saved = await Order.findByIdAndUpdate(orderId, update, { new: true }).lean();

  if (nextStatus && nextStatus !== previousStatus) {
    try {
      const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
      await notifyCustomerOfOrderStatusChange(saved || order, nextStatus, {
        previousStatus,
        source: 'waslah_label_download',
      });
    } catch (emailError) {
      console.error('[store/waslah/carrier-label] customer email failed', emailError?.message || emailError);
    }
  }

  return saved || order;
}

/**
 * Same logic used by single-order Download Carrier Label and multi-select download.
 */
async function buildEmxCarrierLabelPdfForOrder(order, { persist = true } = {}) {
  const orderId = String(order?._id || '').trim();
  const waslahOrderId = String(order?.waslah?.orderId || '').trim();
  let sourceUrl = String(order?.waslah?.labelUrl || '').trim();
  const alreadyEmxOnly = /store1920-images|\/uploads\/emx-carrier-/i.test(sourceUrl);

  if (waslahOrderId && !alreadyEmxOnly) {
    try {
      const printResult = await printWaslahReceipt([waslahOrderId], {
        withLabel: true,
        carrierLabelOnly: true,
      });
      sourceUrl = extractWaslahPrintReceiptUrl(printResult, { preferCarrierLabel: true })
        || printResult?.url
        || sourceUrl;
    } catch (printError) {
      if (!sourceUrl) throw printError;
    }
  }

  if (!sourceUrl) {
    const err = new Error('No EMX carrier label is available for this order yet');
    err.status = 404;
    throw err;
  }

  const sourceResponse = await fetch(sourceUrl);
  if (!sourceResponse.ok) {
    const err = new Error(`Failed to download label PDF (HTTP ${sourceResponse.status})`);
    err.status = 502;
    throw err;
  }

  const combinedPdf = Buffer.from(await sourceResponse.arrayBuffer());
  const emxPdf = alreadyEmxOnly
    ? combinedPdf
    : await extractEmxCarrierLabelPdf(combinedPdf);

  if (persist && orderId) {
    await markOrderLabelDownloaded(order, emxPdf);
  }

  return emxPdf;
}

function pdfResponse(buffer, filename) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * GET /api/store/waslah/carrier-label?orderId=...
 * Returns EMX-only carrier label PDF (Waslah receipt page removed).
 */
export async function GET(request) {
  try {
    if (!isWaslahConfigured()) {
      return NextResponse.json(
        { error: 'Waslah is not configured. Set WASLAH_API_TOKEN in .env' },
        { status: 503 },
      );
    }

    const auth = await authenticateSeller(request);
    if (auth.error) return auth.error;

    const orderId = String(new URL(request.url).searchParams.get('orderId') || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    await dbConnect();
    const order = await Order.findOne({ _id: orderId, storeId: auth.storeId }).lean();
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const emxPdf = await buildEmxCarrierLabelPdfForOrder(order);
    const trackingName = String(
      order.waslah?.emxTrackingNumber
      || order.waslah?.trackingNumber
      || order.trackingId
      || orderId,
    ).replace(/[^\w-]/g, '');

    return pdfResponse(emxPdf, `emx-carrier-label-${trackingName}.pdf`);
  } catch (error) {
    console.error('[store/waslah/carrier-label]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to download EMX carrier label' },
      { status: error?.status >= 400 && error.status < 600 ? error.status : 500 },
    );
  }
}

/**
 * POST /api/store/waslah/carrier-label
 * Body: { orderIds: string[] }
 * Same EMX-only labels as the single-order Download Carrier Label button, merged into one PDF.
 */
export async function POST(request) {
  try {
    if (!isWaslahConfigured()) {
      return NextResponse.json(
        { error: 'Waslah is not configured. Set WASLAH_API_TOKEN in .env' },
        { status: 503 },
      );
    }

    const auth = await authenticateSeller(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const orderIds = [...new Set(
      (Array.isArray(body?.orderIds) ? body.orderIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )];

    if (!orderIds.length) {
      return NextResponse.json({ error: 'orderIds is required' }, { status: 400 });
    }
    if (orderIds.length > MAX_BULK_LABELS) {
      return NextResponse.json(
        { error: `Select at most ${MAX_BULK_LABELS} orders to download labels` },
        { status: 400 },
      );
    }

    await dbConnect();
    const orders = await Order.find({
      _id: { $in: orderIds },
      storeId: auth.storeId,
    }).lean();

    const byId = new Map(orders.map((order) => [String(order._id), order]));
    const ordered = orderIds.map((id) => byId.get(id)).filter(Boolean);
    const labelReady = ordered.filter(isWaslahLabelReadyOrder);

    if (!labelReady.length) {
      return NextResponse.json(
        { error: 'None of the selected orders have been sent to EMX yet' },
        { status: 400 },
      );
    }

    const emxBuffers = [];
    const errors = [];

    for (const order of labelReady) {
      try {
        emxBuffers.push(await buildEmxCarrierLabelPdfForOrder(order));
      } catch (orderError) {
        errors.push(`${order._id}: ${orderError?.message || 'label failed'}`);
      }
    }

    if (!emxBuffers.length) {
      return NextResponse.json(
        {
          error: 'Could not download EMX carrier labels for the selected orders',
          detail: errors.slice(0, 5),
        },
        { status: 502 },
      );
    }

    const merged = emxBuffers.length === 1
      ? emxBuffers[0]
      : await mergeEmxCarrierLabelPdfs(emxBuffers);

    return pdfResponse(
      merged,
      `emx-carrier-labels-${emxBuffers.length}-${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  } catch (error) {
    console.error('[store/waslah/carrier-label POST]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to download EMX carrier labels' },
      { status: 500 },
    );
  }
}
