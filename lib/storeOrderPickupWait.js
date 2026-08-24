import {
  PICKUP_DONE_STATUSES,
  PICKUP_OVERDUE_MS,
} from '@/lib/storePickupConstants';

/** Only real pickup / label timestamps — never createdAt (that made old orders look 1000h+ overdue). */
function resolveRequestedAt(order = {}) {
  const candidates = [
    order?.waslah?.pickupRequestedAt,
    order?.waslah?.processedAt,
    order?.waslah?.labelPrintedAt,
    order?.warehousePacking?.packedAt,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function getCarrierStatusBlob(order = {}) {
  return [
    order?.waslah?.appStatus,
    order?.waslah?.carrierStatus,
    order?.waslah?.currentSubtag,
    order?.waslah?.lastSubtag,
    order?.waslah?.currentStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
}

function carrierSaysPickupRequested(blob = '') {
  return blob.includes('pickuprequested') || blob.includes('shipmentlabelgenerated');
}

function carrierSaysPastPickup(blob = '') {
  if (carrierSaysPickupRequested(blob)) return false;
  return (
    blob.includes('pickedup')
    || blob.includes('intransit')
    || blob.includes('outfordelivery')
    || blob.includes('delivered')
  );
}

/**
 * True only when EMX pickup is requested / still awaiting courier collect.
 * Excludes plain Order Placed / Processing that merely have a tracking id.
 */
export function isPickupAwaitingCourier(order = {}) {
  const status = String(order?.status || '').toUpperCase();
  if (PICKUP_DONE_STATUSES.includes(status)) return false;

  const hasEmx = Boolean(
    order?.waslah?.orderId
    || order?.waslah?.emxTrackingNumber
    || order?.waslah?.trackingNumber
    || order?.trackingId,
  );
  if (!hasEmx) return false;

  const blob = getCarrierStatusBlob(order);
  if (carrierSaysPastPickup(blob)) return false;

  // Explicit EMX / Waslah pickup-requested signals
  if (carrierSaysPickupRequested(blob)) return true;
  if (order?.waslah?.pickupRequestedAt) return true;
  if (String(order?.waslah?.pickupDate || '').trim()) return true;

  // Only Pickup Requested — not Packed / Awaiting Pickup
  if (status === 'PICKUP_REQUESTED') return true;

  return false;
}

/** Pickup requested / awaiting courier (not picked up yet). Client-safe. */
export function getOrderPickupWaitInfo(order = {}) {
  if (!isPickupAwaitingCourier(order)) return null;

  const requestedAt = resolveRequestedAt(order);
  if (!requestedAt) {
    return {
      requestedAt: null,
      hoursWaiting: null,
      overdue: false,
      pickupDate: order?.waslah?.pickupDate || null,
      pickupTime: order?.waslah?.pickupTime || null,
    };
  }

  const waitingMs = Date.now() - requestedAt.getTime();
  const hoursWaiting = Math.max(0, waitingMs / (60 * 60 * 1000));

  return {
    requestedAt,
    hoursWaiting: Number(hoursWaiting.toFixed(1)),
    overdue: waitingMs >= PICKUP_OVERDUE_MS,
    pickupDate: order?.waslah?.pickupDate || null,
    pickupTime: order?.waslah?.pickupTime || null,
  };
}
