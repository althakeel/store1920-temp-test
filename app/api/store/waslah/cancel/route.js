import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { cancelWaslahOrder, isWaslahConfigured } from '@/lib/waslah';
import {
  buildWaslahTrackingEvent,
  getWaslahCheckpointDisplay,
  mergeWaslahTrackingEvents,
  resolveStoreStatusAfterWaslahCancel,
} from '@/lib/waslahTracking';

export const dynamic = 'force-dynamic';

/**
 * POST /api/store/waslah/cancel
 * Cancels the Waslah/EMX shipment. Store order stays open so it can be reshipped.
 */
export async function POST(request) {
  try {
    if (!isWaslahConfigured()) {
      return NextResponse.json({ error: 'Waslah is not configured' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(authHeader.slice('Bearer '.length));
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const orderId = String(body?.orderId || '').trim();
    if (!/^[a-f\d]{24}$/i.test(orderId)) {
      return NextResponse.json({ error: 'A valid orderId is required' }, { status: 400 });
    }

    await dbConnect();
    const order = await Order.findOne({ _id: orderId, storeId: String(storeId) }).lean();
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const waslahOrderId = String(order.waslah?.orderId || '').trim();
    if (!waslahOrderId) {
      return NextResponse.json(
        { error: 'This order has no Waslah shipment to cancel' },
        { status: 400 },
      );
    }

    const trackingNumbers = [
      order.waslah?.emxTrackingNumber,
      order.waslah?.trackingNumber,
      order.trackingId,
      order.waslah?.waslahTrackingNumber,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const cancelResult = await cancelWaslahOrder(waslahOrderId, { trackingNumbers });
    const cancelledAt = new Date();
    const displayStatus = getWaslahCheckpointDisplay({
      subtag: 'Cancelled_001',
      subtagMessage: 'Cancelled',
      message: 'Shipment has been Cancelled',
    });
    const incomingEvent = buildWaslahTrackingEvent({
      subtag: 'Cancelled_001',
      subtagMessage: 'Cancelled',
      message: 'Shipment has been Cancelled',
      time: cancelledAt.toISOString(),
    });
    const events = mergeWaslahTrackingEvents(order.waslah?.events, [incomingEvent]);
    const previousAwb = String(order.waslah?.trackingNumber || order.trackingId || '').trim();
    const nextCancelCount = Number(order.waslah?.cancelCount || 0) + 1;
    const nextStoreStatus = resolveStoreStatusAfterWaslahCancel(order);

    const { buildStatusEmailUnset } = await import('@/lib/orderStatusCustomerNotify');

    const updatedOrder = await Order.findByIdAndUpdate(orderId, {
      $set: {
        status: nextStoreStatus,
        trackingId: null,
        trackingUrl: null,
        courier: order.courier || 'EMX',
        'waslah.orderId': null,
        'waslah.cartId': null,
        'waslah.trackingNumber': null,
        'waslah.labelUrl': null,
        'waslah.labelPrintedAt': null,
        'waslah.labelDownloadCount': 0,
        'waslah.processed': false,
        'waslah.processedAt': null,
        'waslah.pickupRequestedAt': null,
        'waslah.pickupDate': null,
        'waslah.pickupTime': null,
        'waslah.pickupVehicle': null,
        'waslah.reference': null,
        'waslah.unlinkedInWaslah': false,
        'waslah.carrierStatus': 'CANCELLED',
        'waslah.appStatus': 'CANCELLED',
        'waslah.currentStatus': displayStatus,
        'waslah.currentSubtag': 'Cancelled_001',
        'waslah.lastSubtag': 'Cancelled_001',
        'waslah.lastSubtagMessage': displayStatus,
        'waslah.lastEventAt': cancelledAt,
        'waslah.lastEventId': null,
        'waslah.events': events,
        'waslah.cancelledAt': cancelledAt,
        'waslah.cancelCount': nextCancelCount,
        'waslah.cancelledOrderId': waslahOrderId,
        'waslah.cancelledTrackingNumber': previousAwb || null,
        'waslah.shipmentOperationClaimId': null,
        'waslah.shipmentOperationLeaseExpiresAt': null,
      },
      $unset: buildStatusEmailUnset(),
    }, { new: true }).lean();

    try {
      const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
      await notifyCustomerOfOrderStatusChange(
        {
          ...updatedOrder,
          waslah: {
            ...(updatedOrder.waslah || {}),
            cancelledTrackingNumber: previousAwb || updatedOrder.waslah?.cancelledTrackingNumber || null,
          },
        },
        'SHIPMENT_CANCELLED',
        {
          previousStatus: order.status,
          source: 'waslah_cancel',
          force: true,
          actor: {
            uid: decodedToken.uid,
            name: decodedToken.name || decodedToken.email || 'Store staff',
            email: decodedToken.email || '',
          },
        },
      );
    } catch (emailError) {
      console.error('[store/waslah/cancel] customer email failed', emailError?.message || emailError);
    }

    const notFoundOnWaslah = cancelResult?.reason === 'waslah_order_not_found';
    return NextResponse.json({
      success: true,
      alreadyCancelled: Boolean(cancelResult.alreadyCancelled),
      message: notFoundOnWaslah
        ? 'Waslah no longer has this shipment (already removed or invalid id). Local link cleared — you can ship again with EMX.'
        : cancelResult.alreadyCancelled
          ? 'Waslah shipment was already cancelled. You can ship again with EMX.'
          : 'Waslah shipment cancelled. The store order is still open so you can ship again.',
      order: {
        _id: updatedOrder._id,
        status: updatedOrder.status,
        trackingId: updatedOrder.trackingId,
        trackingUrl: updatedOrder.trackingUrl,
        courier: updatedOrder.courier,
        updatedAt: updatedOrder.updatedAt,
        waslah: updatedOrder.waslah || {},
      },
    });
  } catch (error) {
    console.error('[store/waslah/cancel]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to cancel Waslah shipment' },
      { status: error?.status && error.status < 500 ? error.status : 502 },
    );
  }
}
