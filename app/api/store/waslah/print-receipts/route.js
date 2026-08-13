import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { printWaslahReceipt, isWaslahConfigured } from '@/lib/waslah';
import {
  extractWaslahPrintReceiptUrl,
  getWaslahOrderIdsFromOrders,
  isWaslahLabelReadyOrder,
  buildLabelDownloadedMongoUpdate,
} from '@/lib/waslahReceipts';
import { extractEmxCarrierLabelPdf, mergeEmxCarrierLabelPdfs } from '@/lib/waslahEmxLabelPdf';

export const dynamic = 'force-dynamic';

/**
 * POST /api/store/waslah/print-receipts
 * Body: { orderIds: string[] }
 *
 * Generates EMX carrier label PDF(s) only (Waslah receipt pages removed).
 * Prints each Waslah order separately, then merges EMX pages — bulk Waslah PDFs
 * often put all receipts first, which breaks simple even/odd page stripping.
 */
export async function POST(request) {
  try {
    if (!isWaslahConfigured()) {
      return Response.json(
        { error: 'Waslah is not configured. Set WASLAH_API_TOKEN in .env' },
        { status: 503 },
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const orderIds = (Array.isArray(body?.orderIds) ? body.orderIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);

    if (!orderIds.length) {
      return Response.json({ error: 'orderIds is required' }, { status: 400 });
    }

    await dbConnect();

    const orders = await Order.find({
      _id: { $in: orderIds },
      storeId: String(storeId),
    }).lean();

    if (!orders.length) {
      return Response.json({ error: 'No matching orders found' }, { status: 404 });
    }

    const labelReadyOrders = orders.filter(isWaslahLabelReadyOrder);
    const waslahOrderIds = getWaslahOrderIdsFromOrders(labelReadyOrders);

    if (!waslahOrderIds.length) {
      return Response.json(
        { error: 'None of the selected orders have an EMX shipment yet. Send to EMX first.' },
        { status: 400 },
      );
    }

    const emxPdfBuffers = [];
    const errors = [];

    for (const waslahOrderId of waslahOrderIds) {
      try {
        const printResult = await printWaslahReceipt([waslahOrderId], {
          withLabel: true,
          carrierLabelOnly: true,
        });
        const pdfUrl = extractWaslahPrintReceiptUrl(printResult, { preferCarrierLabel: true });
        if (!pdfUrl) {
          errors.push(`${waslahOrderId}: no label URL`);
          continue;
        }

        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          errors.push(`${waslahOrderId}: download HTTP ${pdfResponse.status}`);
          continue;
        }

        const combinedPdf = Buffer.from(await pdfResponse.arrayBuffer());
        const emxOnlyPdf = await extractEmxCarrierLabelPdf(combinedPdf);
        emxPdfBuffers.push(emxOnlyPdf);
      } catch (orderError) {
        errors.push(`${waslahOrderId}: ${orderError?.message || 'print failed'}`);
      }
    }

    if (!emxPdfBuffers.length) {
      return Response.json(
        {
          error: 'Could not build EMX carrier labels for the selected orders',
          detail: errors.slice(0, 5),
        },
        { status: 502 },
      );
    }

    const emxOnlyPdf = emxPdfBuffers.length === 1
      ? emxPdfBuffers[0]
      : await mergeEmxCarrierLabelPdfs(emxPdfBuffers);

    const filename = `emx-carrier-labels-${emxPdfBuffers.length}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const printedAt = new Date();

    await Promise.all(labelReadyOrders.map((order) => (
      Order.findByIdAndUpdate(order._id, buildLabelDownloadedMongoUpdate(order, printedAt))
    )));

    return new Response(emxOnlyPdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(emxOnlyPdf.length),
        'Cache-Control': 'no-store',
        ...(errors.length ? { 'X-Waslah-Label-Warnings': String(errors.length) } : {}),
      },
    });
  } catch (error) {
    console.error('[store/waslah/print-receipts]', error);
    return Response.json(
      { error: error?.message || 'Failed to generate receipt PDF' },
      { status: 500 },
    );
  }
}
