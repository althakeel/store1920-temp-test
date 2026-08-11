import Order from '@/models/Order';
import { isWaslahConfigured } from '@/lib/waslah';
import {
  fetchNormalizedWaslahTracking,
  compactWaslahTrackingEvents,
  getWaslahCheckpointDisplay,
  getWaslahCourierStatus,
  isWaslahTrackingEventOlder,
  isWaslahCourierOrder,
  isWaslahCourierTerminal,
  mapWaslahTrackingToOrderStatus,
  parseWaslahTrackingTimestamp,
  resolveWaslahOrderStatusTransition,
} from '@/lib/waslahTracking';

export function canSyncWaslahOrderStatus(order = {}) {
  if (!isWaslahConfigured() || !isWaslahCourierOrder(order)) return false;

  const trackingId = String(order?.trackingId || order?.waslah?.trackingNumber || '').trim();
  return Boolean(trackingId);
}

export function shouldSyncWaslahOrderStatus(order = {}) {
  if (!canSyncWaslahOrderStatus(order)) return false;

  if (isWaslahCourierTerminal(order)) return false;
  return true;
}

/**
 * Fetch live EMX/Waslah tracking and persist order status (RTO, RETURN, DELIVERED, etc.).
 */
export async function syncWaslahStatusForOrder(order = {}, { persist = true, force = false } = {}) {
  const shouldSync = force ? canSyncWaslahOrderStatus(order) : shouldSyncWaslahOrderStatus(order);
  if (!shouldSync) {
    return { order, changed: false, skipped: true };
  }

  const trackingId = String(order.trackingId || order.waslah?.trackingNumber || '').trim();

  try {
    const normalized = await fetchNormalizedWaslahTracking(trackingId);
    const waslah = normalized?.waslah;
    if (!waslah) {
      return { order, changed: false, error: 'EMX returned no tracking status' };
    }

    const courierStatus = waslah.appStatus
      || mapWaslahTrackingToOrderStatus({
        subtag: waslah.currentSubtag,
        message: waslah.lastSubtagMessage,
        subtagMessage: waslah.currentStatus,
      });
    const previousCourierStatus = getWaslahCourierStatus(order);
    const nextStatus = resolveWaslahOrderStatusTransition(courierStatus, order.status, {
      packed: order?.warehousePacking?.packed === true,
    });

    const parsedEventTime = parseWaslahTrackingTimestamp(waslah.currentEventAt);
    if (isWaslahTrackingEventOlder(waslah.currentEventAt, order.waslah?.lastEventAt)) {
      return {
        order,
        changed: false,
        fetched: true,
        stale: true,
        previousStatus: order.status,
        nextStatus: order.status,
      };
    }
    const previousEventTime = parseWaslahTrackingTimestamp(order.waslah?.lastEventAt);
    const courierChanged = Boolean(
      (courierStatus && courierStatus !== previousCourierStatus)
      || (waslah.currentSubtag && waslah.currentSubtag !== order.waslah?.lastSubtag)
      || (
        Number.isFinite(parsedEventTime)
        && (!Number.isFinite(previousEventTime) || parsedEventTime !== previousEventTime)
      )
      || (
        waslah.lastSubtagMessage
        && waslah.lastSubtagMessage !== order.waslah?.lastSubtagMessage
      )
    );
    const displayStatus = getWaslahCheckpointDisplay({
      subtag: waslah.currentSubtag,
      subtagMessage: waslah.currentStatus,
      message: waslah.lastSubtagMessage,
    });
    const persistedEvents = compactWaslahTrackingEvents(
      waslah.events?.length ? waslah.events : order.waslah?.events,
    );
    const waslahFields = {
      carrierStatus: courierStatus || order.waslah?.carrierStatus || null,
      appStatus: courierStatus || order.waslah?.appStatus || null,
      currentStatus: displayStatus || order.waslah?.currentStatus || null,
      currentSubtag: waslah.currentSubtag || order.waslah?.currentSubtag || null,
      lastSubtag: waslah.currentSubtag || order.waslah?.lastSubtag || null,
      lastSubtagMessage: displayStatus || order.waslah?.lastSubtagMessage || null,
      lastLocation: waslah.lastLocation || order.waslah?.lastLocation || null,
      lastEventAt: Number.isFinite(parsedEventTime)
        ? new Date(parsedEventTime)
        : (order.waslah?.lastEventAt || null),
      events: persistedEvents,
    };

    const enrichedOrder = {
      ...order,
      trackingUrl: order.trackingUrl || normalized.trackingUrl || null,
      courier: order.courier || normalized.courier || order.courier,
      waslah: {
        ...(order.waslah || {}),
        ...waslah,
        ...waslahFields,
        trackingNumber: waslah.trackingNumber || order.waslah?.trackingNumber || trackingId,
      },
    };

    const previousStatus = String(order.status || '').toUpperCase();
    const normalizedNextStatus = String(nextStatus || order.status || '').toUpperCase();
    const statusChanged = Boolean(nextStatus && normalizedNextStatus !== previousStatus);
    const orderWithLiveStatus = statusChanged
      ? { ...enrichedOrder, status: normalizedNextStatus }
      : enrichedOrder;

    if (!persist || !order._id) {
      return {
        order: orderWithLiveStatus,
        changed: statusChanged || courierChanged,
        orderStatusChanged: statusChanged,
        courierChanged,
        fetched: true,
        previousStatus: order.status,
        nextStatus: normalizedNextStatus || order.status,
      };
    }

    // Compare-and-set prevents a slow courier request from overwriting a newer
    // seller edit or webhook update that landed while the request was in flight.
    const update = {
      'waslah.carrierStatus': waslahFields.carrierStatus,
      'waslah.appStatus': waslahFields.appStatus,
      'waslah.currentStatus': waslahFields.currentStatus,
      'waslah.currentSubtag': waslahFields.currentSubtag,
      'waslah.lastSubtag': waslahFields.lastSubtag,
      'waslah.lastSubtagMessage': waslahFields.lastSubtagMessage,
      'waslah.lastLocation': waslahFields.lastLocation,
      'waslah.lastEventAt': waslahFields.lastEventAt,
      'waslah.events': waslahFields.events,
    };
    if (statusChanged) update.status = normalizedNextStatus;
    if (!order.trackingUrl && normalized.trackingUrl) update.trackingUrl = normalized.trackingUrl;

    const persistedOrder = await Order.findOneAndUpdate({
      _id: order._id,
      status: order.status,
      'waslah.lastSubtag': order.waslah?.lastSubtag ?? null,
      'waslah.lastEventAt': order.waslah?.lastEventAt ?? null,
    }, {
      $set: update,
    }, {
      new: true,
    }).lean();

    if (!persistedOrder) {
      const latestOrder = await Order.findById(order._id).lean();
      const conflictOrder = latestOrder ? {
        ...orderWithLiveStatus,
        status: latestOrder.status,
        trackingUrl: latestOrder.trackingUrl || orderWithLiveStatus.trackingUrl,
        courier: latestOrder.courier || orderWithLiveStatus.courier,
        updatedAt: latestOrder.updatedAt || orderWithLiveStatus.updatedAt,
        waslah: {
          ...(orderWithLiveStatus.waslah || {}),
          ...(latestOrder.waslah || {}),
        },
      } : orderWithLiveStatus;

      return {
        order: conflictOrder,
        changed: false,
        orderStatusChanged: false,
        courierChanged: false,
        fetched: true,
        conflict: true,
        previousStatus: order.status,
        nextStatus: conflictOrder.status || order.status,
      };
    }

    if (statusChanged) {
      try {
        const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
        await notifyCustomerOfOrderStatusChange(persistedOrder, normalizedNextStatus, {
          previousStatus,
          source: 'waslah_live_sync',
        });
      } catch (emailError) {
        console.error('[waslahOrderStatusSync] customer status email failed', {
          orderId: String(order._id),
          status: normalizedNextStatus,
          error: emailError?.message || emailError,
        });
      }
    }

    return {
      order: {
        // Keep request-time enrichments (populated products, address, user).
        // Spreading the lean persisted document used to wipe orderItems.productId.
        ...orderWithLiveStatus,
        status: persistedOrder.status,
        trackingUrl: persistedOrder.trackingUrl || orderWithLiveStatus.trackingUrl,
        courier: persistedOrder.courier || orderWithLiveStatus.courier,
        updatedAt: persistedOrder.updatedAt || orderWithLiveStatus.updatedAt,
        waslah: {
          ...(orderWithLiveStatus.waslah || {}),
          ...(persistedOrder.waslah || {}),
        },
      },
      changed: statusChanged || courierChanged,
      orderStatusChanged: statusChanged,
      courierChanged,
      fetched: true,
      previousStatus: order.status,
      nextStatus: normalizedNextStatus || order.status,
    };
  } catch (error) {
    return { order, changed: false, error: error?.message || String(error) };
  }
}

export async function syncWaslahStatusForOrders(
  orders = [],
  { max = 25, persist = true, concurrency = 4 } = {},
) {
  const results = [...orders];
  const eligibleIndexes = [];
  const syncLimit = Math.max(0, Number(max) || 0);

  for (let index = 0; index < orders.length && eligibleIndexes.length < syncLimit; index += 1) {
    if (shouldSyncWaslahOrderStatus(orders[index])) eligibleIndexes.push(index);
  }

  let cursor = 0;
  const workerCount = Math.min(
    eligibleIndexes.length,
    Math.max(1, Math.min(8, Number(concurrency) || 4)),
  );
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < eligibleIndexes.length) {
      const taskIndex = cursor;
      cursor += 1;
      const orderIndex = eligibleIndexes[taskIndex];
      const result = await syncWaslahStatusForOrder(orders[orderIndex], { persist });
      results[orderIndex] = result.order;
    }
  });

  await Promise.all(workers);
  return results;
}
