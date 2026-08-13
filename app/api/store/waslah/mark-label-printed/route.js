import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  buildLabelDownloadedMongoUpdate,
  getStatusAfterLabelDownload,
  isWaslahLabelReadyOrder,
} from '@/lib/waslahReceipts';

export const dynamic = 'force-dynamic';

/**
 * POST /api/store/waslah/mark-label-printed
 * Body: { orderIds: string[] }
 *
 * Marks EMX labels as downloaded, increments download count, and moves eligible
 * orders to Waiting for Pickup.
 */
export async function POST(request) {
  try {
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

    const printableOrders = orders.filter(isWaslahLabelReadyOrder);
    if (!printableOrders.length) {
      return Response.json(
        { error: 'None of the selected orders have a label ready to mark as printed' },
        { status: 400 },
      );
    }

    const printedAt = new Date();
    const updatedOrders = [];

    for (const order of printableOrders) {
      const previousStatus = String(order.status || '').toUpperCase();
      const nextStatus = getStatusAfterLabelDownload(order);
      const saved = await Order.findByIdAndUpdate(
        order._id,
        buildLabelDownloadedMongoUpdate(order, printedAt),
        { new: true },
      ).lean();
      if (saved) updatedOrders.push(saved);

      if (nextStatus && nextStatus !== previousStatus) {
        try {
          const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
          await notifyCustomerOfOrderStatusChange(saved || order, nextStatus, {
            previousStatus,
            source: 'waslah_label_download',
          });
        } catch (emailError) {
          console.error('[mark-label-printed] customer email failed', emailError?.message || emailError);
        }
      }
    }

    return Response.json({
      success: true,
      markedCount: printableOrders.length,
      labelPrintedAt: printedAt.toISOString(),
      status: 'WAITING_FOR_PICKUP',
      orderIds: printableOrders.map((order) => String(order._id)),
      orders: updatedOrders.map((order) => ({
        _id: order._id,
        status: order.status,
        waslah: {
          labelPrintedAt: order.waslah?.labelPrintedAt || printedAt,
          labelDownloadCount: Number(order.waslah?.labelDownloadCount) || 0,
        },
      })),
    });
  } catch (error) {
    console.error('[store/waslah/mark-label-printed]', error);
    return Response.json(
      { error: error?.message || 'Failed to mark labels as printed' },
      { status: 500 },
    );
  }
}
