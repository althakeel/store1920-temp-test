import Order from '@/models/Order';
import { isWaslahConfigured } from '@/lib/waslah';
import { preserveWaslahLabelDownloadState } from '@/lib/waslahReceipts';
import {
  fetchNormalizedWaslahTracking,
  buildEmxTrackingUrl,
  compactWaslahTrackingEvents,
  getWaslahCheckpointDisplay,
  getWaslahCourierStatus,
  isWaslahTrackingEventOlder,
  isWaslahCourierOrder,
  isWaslahCourierTerminal,
  looksLikeEmxTrackingNumber,
  looksLikeWaslahPlatformTrackingNumber,
  mapWaslahTrackingToOrderStatus,
  parseWaslahTrackingTimestamp,
  resolveWaslahOrderStatusTransition,
} from '@/lib/waslahTracking';

export function canSyncWaslahOrderStatus(order = {}) {
  if (!isWaslahConfigured() || !isWaslahCourierOrder(order)) return false;

  const trackingId = String(
    order?.waslah?.emxTrackingNumber
    || order?.trackingId
    || order?.waslah?.trackingNumber
    || order?.waslah?.waslahTrackingNumber
    || '',
  ).trim();
  // Allow sync when we only have a Waslah order id — refresh recovers the EMX barcode.
  return Boolean(trackingId || order?.waslah?.orderId);
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
    // Still try to recover EMX barcode from Waslah order detail when seller refreshes.
    if (!force || !order?.waslah?.orderId) {
      return { order, changed: false, skipped: true };
    }
  }

  const trackingId = String(
    order.waslah?.emxTrackingNumber
    || order.trackingId
    || order.waslah?.trackingNumber
    || order.waslah?.waslahTrackingNumber
    || '',
  ).trim();

  try {
    let normalized = null;
    if (trackingId) {
      try {
        normalized = await fetchNormalizedWaslahTracking(trackingId);
      } catch (historyError) {
        console.warn('[waslah-sync] history lookup failed:', historyError?.message || historyError);
      }
    }

    // Recover the EMX barcode (1000…) from the Waslah order document when history
    // only knows the Waslah 62… platform number.
    let recoveredEmx = '';
    let recoveredWaslahPlatform = '';
    const waslahOrderId = String(order.waslah?.orderId || '').trim();
    if (waslahOrderId && (!looksLikeEmxTrackingNumber(trackingId) || force)) {
      try {
        const { getWaslahOrder, extractWaslahShipmentDetails } = await import('@/lib/waslah');
        const detail = await getWaslahOrder(waslahOrderId);
        const details = extractWaslahShipmentDetails({
          waslahOrder: detail,
          waslahOrderId,
        });
        recoveredEmx = String(details.emxTrackingNumber || details.trackingNumber || '').trim();
        recoveredWaslahPlatform = String(details.waslahTrackingNumber || '').trim();
        if (recoveredEmx && recoveredEmx !== trackingId) {
          try {
            const byEmx = await fetchNormalizedWaslahTracking(recoveredEmx);
            if (byEmx?.waslah) normalized = byEmx;
          } catch {
            // keep prior normalized payload
          }
        }
      } catch (detailError) {
        console.warn('[waslah-sync] order detail recovery failed:', detailError?.message || detailError);
      }
    }

    const waslah = normalized?.waslah || null;
    if (!waslah && !recoveredEmx) {
      // Common before first courier scan / label scan — not a hard failure.
      return {
        order,
        changed: false,
        empty: true,
        pending: true,
        fetched: Boolean(trackingId || waslahOrderId),
        previousStatus: order.status,
        nextStatus: order.status,
      };
    }

    const resolveSafeEmx = (...candidates) => {
      for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (looksLikeEmxTrackingNumber(value)) return value;
      }
      return '';
    };
    const safeEmx = resolveSafeEmx(
      recoveredEmx,
      waslah?.trackingNumber,
      order.waslah?.emxTrackingNumber,
      order.waslah?.trackingNumber,
      trackingId,
    );
    const platformWaslahNumber = String(
      recoveredWaslahPlatform
      || order.waslah?.waslahTrackingNumber
      || (looksLikeWaslahPlatformTrackingNumber(trackingId) ? trackingId : '')
      || '',
    ).trim() || null;
    const emxTrackingUrl = buildEmxTrackingUrl(safeEmx);

    // Recovered barcode only (no live history payload yet) — still persist EMX AWB.
    if (!waslah) {
      const trackingChanged = Boolean(
        safeEmx
        && safeEmx !== String(order.waslah?.emxTrackingNumber || order.trackingId || '').trim(),
      );
      const enrichedOrder = {
        ...order,
        trackingId: safeEmx || (order.trackingId && !looksLikeWaslahPlatformTrackingNumber(order.trackingId)
          ? order.trackingId
          : null),
        trackingUrl: emxTrackingUrl || order.trackingUrl || null,
        courier: order.courier || 'EMX',
        waslah: {
          ...(order.waslah || {}),
          trackingNumber: safeEmx || order.waslah?.trackingNumber || null,
          emxTrackingNumber: safeEmx || order.waslah?.emxTrackingNumber || null,
          waslahTrackingNumber: platformWaslahNumber,
        },
      };

      if (!persist || !order._id) {
        return {
          order: enrichedOrder,
          changed: trackingChanged,
          fetched: true,
          previousStatus: order.status,
          nextStatus: order.status,
        };
      }

      const update = {
        $set: {
          trackingId: enrichedOrder.trackingId,
          trackingUrl: enrichedOrder.trackingUrl,
          courier: enrichedOrder.courier,
          'waslah.trackingNumber': enrichedOrder.waslah.trackingNumber,
          'waslah.emxTrackingNumber': enrichedOrder.waslah.emxTrackingNumber,
          ...(platformWaslahNumber ? { 'waslah.waslahTrackingNumber': platformWaslahNumber } : {}),
        },
      };
      const saved = await Order.findByIdAndUpdate(order._id, update, { new: true }).lean();
      return {
        order: saved || enrichedOrder,
        changed: trackingChanged,
        fetched: true,
        previousStatus: order.status,
        nextStatus: order.status,
      };
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
    if (isWaslahTrackingEventOlder(waslah.currentEventAt, order.waslah?.lastEventAt) && !safeEmx) {
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
      || (
        safeEmx
        && safeEmx !== String(order.waslah?.emxTrackingNumber || order.trackingId || '').trim()
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
      trackingId: safeEmx || (order.trackingId && !looksLikeWaslahPlatformTrackingNumber(order.trackingId)
        ? order.trackingId
        : null),
      trackingUrl: emxTrackingUrl || order.trackingUrl || normalized?.trackingUrl || null,
      courier: order.courier || normalized?.courier || 'EMX',
      waslah: preserveWaslahLabelDownloadState(order.waslah, {
        ...(order.waslah || {}),
        ...waslah,
        ...waslahFields,
        trackingNumber: safeEmx || order.waslah?.trackingNumber || null,
        emxTrackingNumber: safeEmx || order.waslah?.emxTrackingNumber || null,
        waslahTrackingNumber: platformWaslahNumber,
      }),
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
    if (safeEmx) {
      update.trackingId = safeEmx;
      update['waslah.trackingNumber'] = safeEmx;
      update['waslah.emxTrackingNumber'] = safeEmx;
      update.courier = enrichedOrder.courier || 'EMX';
    }
    if (platformWaslahNumber) update['waslah.waslahTrackingNumber'] = platformWaslahNumber;
    if (emxTrackingUrl) update.trackingUrl = emxTrackingUrl;
    else if (!order.trackingUrl && normalized?.trackingUrl) update.trackingUrl = normalized.trackingUrl;

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
        waslah: preserveWaslahLabelDownloadState(
          order.waslah,
          {
            ...(orderWithLiveStatus.waslah || {}),
            ...(latestOrder.waslah || {}),
          },
        ),
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

    try {
      const { getOrderFulfillmentKind } = await import('@/lib/storeReturnLabels');
      if (getOrderFulfillmentKind(persistedOrder) === 'RETURN') {
        const { syncReturnPickupFromFollowUpOrder } = await import('@/lib/storeReturnWorkflow');
        await syncReturnPickupFromFollowUpOrder(persistedOrder);
      }
    } catch (syncError) {
      console.error('[waslahOrderStatusSync] return pickup sync failed', syncError?.message || syncError);
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
        waslah: preserveWaslahLabelDownloadState(
          order.waslah,
          {
            ...(orderWithLiveStatus.waslah || {}),
            ...(persistedOrder.waslah || {}),
          },
        ),
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
