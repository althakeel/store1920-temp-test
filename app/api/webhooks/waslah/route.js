import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  buildWaslahTrackingEvent,
  getWaslahCheckpointDisplay,
  mapWaslahTrackingToOrderStatus,
  mergeWaslahTrackingEvents,
  parseWaslahTrackingTimestamp,
  resolveWaslahOrderStatusTransition,
  shouldPropagateWaslahStatusToOrder,
} from '@/lib/waslahTracking';

export const dynamic = 'force-dynamic';

const TERMINAL_WASLAH_STATUSES = new Set(['DELIVERED', 'RTO', 'RETURN', 'RETURNED', 'CANCELLED']);

function secretsMatch(expected = '', provided = '') {
  const expectedBuffer = Buffer.from(String(expected));
  const providedBuffer = Buffer.from(String(provided));
  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}

function parseWaslahEventTime(event = {}, trackingStatus = {}, envelope = {}, body = {}) {
  const raw = event?.checkpoint_time
    || event?.date
    || event?.created_at
    || event?.timestamp
    || event?.updated_at
    || event?.timeStamp
    || event?.Time_Stamp
    || event?.event_time
    || event?.eventTime
    || trackingStatus?.checkpoint_time
    || trackingStatus?.timestamp
    || trackingStatus?.timeStamp
    || trackingStatus?.Time_Stamp
    || trackingStatus?.event_time
    || trackingStatus?.eventTime
    || envelope?.checkpoint_time
    || envelope?.timestamp
    || envelope?.timeStamp
    || envelope?.Time_Stamp
    || envelope?.event_time
    || envelope?.eventTime
    || body?.checkpoint_time
    || body?.timestamp
    || body?.timeStamp
    || body?.Time_Stamp
    || body?.event_time
    || body?.eventTime
    || '';
  const parsed = parseWaslahTrackingTimestamp(raw);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function readWebhookText(...values) {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) return text;
    }
    if (value && typeof value === 'object') {
      const text = value.descriptionEn || value.description || value.code;
      if (text) return String(text).trim();
    }
  }
  return '';
}

/**
 * POST /api/webhooks/waslah
 * Receives Waslah tracking updates (subtag events).
 *
 * Expected body shape (flexible):
 * {
 *   "reference": "ORDER_733862",
 *   "order_id": "69d49504b8b8c324619d4f8c",
 *   "tracking_number": "62007200700011",
 *   "subtag": "Delivered_001",
 *   "subtag_message": "Delivered",
 *   "message": "Delivered"
 * }
 */
export async function POST(request) {
  try {
    const secret = process.env.WASLAH_WEBHOOK_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      console.error('[webhooks/waslah] WASLAH_WEBHOOK_SECRET is required in production');
      return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
    }
    if (secret) {
      const header = request.headers.get('x-waslah-secret') || request.headers.get('authorization');
      const provided = String(header || '').replace(/^Bearer\s+/i, '').trim();
      if (!secretsMatch(secret, provided)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const envelope = body?.data && !Array.isArray(body.data) ? body.data : body;
    const trackingStatus = envelope?.tracking_status
      || envelope?.trackingStatus
      || body?.tracking_status
      || body?.trackingStatus
      || {};
    const rawEvent = envelope?.event || body?.event;
    const trackingStatusEvent = trackingStatus && typeof trackingStatus === 'object'
      ? trackingStatus
      : { status: trackingStatus, subtag_message: trackingStatus };
    const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : trackingStatusEvent;
    const subtag = readWebhookText(
      event?.subtag,
      event?.subTag,
      event?.tag,
      event?.sub_status,
      event?.subStatus,
      event?.SubStatus,
      event?.status_code,
      event?.statusCode,
      event?.status?.code,
      trackingStatusEvent?.subtag,
      trackingStatusEvent?.subTag,
      trackingStatusEvent?.tag,
      trackingStatusEvent?.sub_status,
      trackingStatusEvent?.subStatus,
      trackingStatusEvent?.SubStatus,
      trackingStatusEvent?.status_code,
      trackingStatusEvent?.statusCode,
      trackingStatusEvent?.status?.code,
      trackingStatusEvent?.status,
      envelope?.subtag,
      envelope?.subTag,
      envelope?.tag,
      envelope?.sub_status,
      envelope?.subStatus,
      envelope?.SubStatus,
      body?.subtag,
      body?.subTag,
      body?.tag,
      body?.sub_status,
      body?.subStatus,
      body?.SubStatus,
      event?.status,
      envelope?.Status,
      body?.Status,
    );
    const subtagMessage = readWebhookText(
      event?.subtag_message,
      event?.subtagMessage,
      event?.SubStatus,
      trackingStatusEvent?.subtag_message,
      trackingStatusEvent?.subtagMessage,
      trackingStatusEvent?.message,
      trackingStatusEvent?.Message,
      trackingStatusEvent?.SubStatus,
      envelope?.subtag_message,
      envelope?.subtagMessage,
      envelope?.SubStatus,
      body?.subtag_message,
      body?.subtagMessage,
      body?.SubStatus,
    );
    const reference = readWebhookText(
      envelope?.reference,
      envelope?.reference_number,
      envelope?.Reference_Number,
      body?.reference,
      body?.reference_number,
      body?.Reference_Number,
    );
    const waslahOrderId = String(
      envelope?.order_id
      || envelope?.orderId
      || body?.order_id
      || body?.orderId
      || '',
    ).trim();
    const trackingNumber = String(
      envelope?.tracking_number
      || envelope?.trackingNumber
      || envelope?.awb_number
      || envelope?.AWB_Number
      || body?.tracking_number
      || body?.trackingNumber
      || body?.awb_number
      || body?.AWB_Number
      || '',
    ).trim();
    const message = readWebhookText(
      event?.message,
      event?.Message,
      event?.remarks,
      event?.Remarks,
      event?.Status,
      trackingStatusEvent?.message,
      trackingStatusEvent?.Message,
      trackingStatusEvent?.remarks,
      trackingStatusEvent?.Remarks,
      trackingStatusEvent?.Status,
      trackingStatusEvent?.subtag_message,
      trackingStatusEvent?.subtagMessage,
      trackingStatusEvent?.status,
      envelope?.message,
      envelope?.Message,
      envelope?.remarks,
      envelope?.Remarks,
      envelope?.Status,
      body?.message,
      body?.Message,
      body?.remarks,
      body?.Remarks,
      body?.Status,
      subtagMessage,
    );
    const eventTime = parseWaslahEventTime(event, trackingStatusEvent, envelope, body);
    const eventId = String(
      event?.event_id
      || event?.eventId
      || event?._id
      || event?.id
      || trackingStatusEvent?.event_id
      || trackingStatusEvent?.eventId
      || trackingStatusEvent?._id
      || trackingStatusEvent?.id
      || envelope?.event_id
      || envelope?.eventId
      || body?.event_id
      || body?.eventId
      || '',
    ).trim();

    await dbConnect();

    if (!waslahOrderId && !trackingNumber && !reference) {
      return NextResponse.json({ ok: false, error: 'No lookup keys in webhook payload' }, { status: 400 });
    }

    let order = null;
    if (waslahOrderId) {
      order = await Order.findOne({ 'waslah.orderId': waslahOrderId }).lean();
    }
    if (!order && trackingNumber) {
      order = await Order.findOne({
        $or: [
          { trackingId: trackingNumber },
          { 'waslah.trackingNumber': trackingNumber },
        ],
      }).lean();
    }
    if (!order && reference) {
      order = await Order.findOne({ 'waslah.reference': reference }).lean();
    }
    if (!order && /^#?\d+$/.test(reference)) {
      order = await Order.findOne({ shortOrderNumber: Number(reference.replace(/^#/, '')) }).lean();
    }
    if (!order) {
      return NextResponse.json({ ok: true, matched: false });
    }

    const previousEventAt = order.waslah?.lastEventAt ? new Date(order.waslah.lastEventAt) : null;
    const isDuplicateEvent = Boolean(eventId && eventId === order.waslah?.lastEventId);
    const isOlderEvent = Boolean(
      eventTime
      && previousEventAt
      && !Number.isNaN(previousEventAt.getTime())
      && eventTime.getTime() <= previousEventAt.getTime(),
    );
    if (isDuplicateEvent || isOlderEvent) {
      return NextResponse.json({
        ok: true,
        matched: true,
        ignored: true,
        reason: isDuplicateEvent ? 'duplicate_event' : 'stale_event',
        orderId: String(order._id),
        status: order.status,
      });
    }

    const courierStatus = mapWaslahTrackingToOrderStatus({
      subtag,
      message,
      subtagMessage,
    });
    const currentStatus = String(order.status || '').toUpperCase();
    const nextStatus = resolveWaslahOrderStatusTransition(courierStatus, currentStatus);
    const wouldRegressTerminalStatus = Boolean(
      TERMINAL_WASLAH_STATUSES.has(currentStatus)
      && shouldPropagateWaslahStatusToOrder(courierStatus)
      && !nextStatus
      && courierStatus !== currentStatus
    );
    const displayStatus = getWaslahCheckpointDisplay({
      subtag,
      subtagMessage,
      message,
    });
    const incomingEvent = buildWaslahTrackingEvent({
      subtag,
      subtagMessage,
      message,
      time: eventTime ? eventTime.toISOString() : '',
    });
    const events = mergeWaslahTrackingEvents(order.waslah?.events, [incomingEvent]);

    const update = {
      'waslah.lastSubtag': subtag || order.waslah?.lastSubtag,
      'waslah.currentSubtag': subtag || order.waslah?.currentSubtag,
      'waslah.lastSubtagMessage': displayStatus || order.waslah?.lastSubtagMessage,
      'waslah.currentStatus': displayStatus || order.waslah?.currentStatus,
      'waslah.events': events,
    };
    if (courierStatus) {
      update['waslah.carrierStatus'] = courierStatus;
      update['waslah.appStatus'] = courierStatus;
    }
    if (eventTime) update['waslah.lastEventAt'] = eventTime;
    if (eventId) update['waslah.lastEventId'] = eventId;
    if (trackingNumber) {
      update.trackingId = trackingNumber;
      update['waslah.trackingNumber'] = trackingNumber;
    }
    if (nextStatus) {
      update.status = nextStatus;
    }

    const updateFilter = { _id: order._id };
    if (nextStatus) updateFilter.status = order.status;
    if (eventTime) {
      updateFilter.$or = [
        { 'waslah.lastEventAt': { $lt: eventTime } },
        { 'waslah.lastEventAt': null },
      ];
    }
    if (eventId) updateFilter['waslah.lastEventId'] = { $ne: eventId };

    const updatedOrder = await Order.findOneAndUpdate(updateFilter, { $set: update }, { new: true }).lean();
    if (!updatedOrder) {
      return NextResponse.json({
        ok: true,
        matched: true,
        ignored: true,
        reason: 'concurrent_or_stale_update',
        orderId: String(order._id),
        status: order.status,
      });
    }

    if (nextStatus && String(nextStatus).toUpperCase() !== String(order.status || '').toUpperCase()) {
      try {
        const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
        await notifyCustomerOfOrderStatusChange(updatedOrder, nextStatus, {
          previousStatus: order.status,
          source: 'waslah_webhook',
        });
      } catch (emailError) {
        console.error('[webhooks/waslah] customer status email failed', {
          orderId: String(order._id),
          status: nextStatus,
          error: emailError?.message || emailError,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      matched: true,
      orderId: String(order._id),
      status: updatedOrder.status || nextStatus || order.status,
      carrierStatus: courierStatus || updatedOrder.waslah?.carrierStatus || null,
      orderStatusIgnored: wouldRegressTerminalStatus,
    });
  } catch (error) {
    console.error('[webhooks/waslah]', error);
    return NextResponse.json({ error: error?.message || 'Webhook failed' }, { status: 500 });
  }
}

// Some EMX integrations describe their customer callback as an update/PUT.
export async function PUT(request) {
  return POST(request);
}
