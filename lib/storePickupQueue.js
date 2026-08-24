import Order from '@/models/Order';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrashFilters';
import { getDubaiDateParts } from '@/lib/storeOrdersByProductDates';
import { getDisplayOrderNumber, getOrderCustomerDisplayName } from '@/lib/orderDisplay';
import {
  PICKUP_DONE_STATUSES,
  PICKUP_OVERDUE_MS,
} from '@/lib/storePickupConstants';
import { isPickupAwaitingCourier } from '@/lib/storeOrderPickupWait';

export {
  AWAITING_PICKUP_STATUSES,
  PICKUP_DONE_STATUSES,
  PICKUP_OVERDUE_MS,
} from '@/lib/storePickupConstants';

export { isPickupAwaitingCourier } from '@/lib/storeOrderPickupWait';

export function formatDubaiDateKey(date = new Date()) {
  const parts = getDubaiDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Best timestamp for "when pickup was requested / became ready for courier". */
export function resolvePickupRequestedAt(order = {}) {
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

export function serializePickupQueueOrder(order = {}) {
  const requestedAt = resolvePickupRequestedAt(order);
  const hoursWaiting = requestedAt
    ? Math.max(0, (Date.now() - requestedAt.getTime()) / (60 * 60 * 1000))
    : null;
  const status = String(order.status || '').toUpperCase() || null;
  const overdue = Boolean(
    requestedAt
    && (Date.now() - requestedAt.getTime()) >= PICKUP_OVERDUE_MS
    && !PICKUP_DONE_STATUSES.includes(status)
    && isPickupAwaitingCourier(order),
  );

  return {
    _id: String(order._id),
    shortOrderNumber: order.shortOrderNumber || null,
    displayOrderNumber: getDisplayOrderNumber(order) || null,
    status,
    total: Number(order.total || 0),
    paymentMethod: order.paymentMethod || null,
    customerName: getOrderCustomerDisplayName(order),
    trackingId: order.trackingId || order.waslah?.emxTrackingNumber || order.waslah?.trackingNumber || null,
    pickupDate: order.waslah?.pickupDate || null,
    pickupTime: order.waslah?.pickupTime || null,
    pickupVehicle: order.waslah?.pickupVehicle || null,
    pickupRequestedAt: requestedAt,
    hoursWaiting: hoursWaiting != null ? Number(hoursWaiting.toFixed(1)) : null,
    overdue,
    createdAt: order.createdAt || null,
  };
}

/**
 * Mongo match for EMX shipments with pickup requested / still awaiting courier.
 * Requires a real pickup signal — not every order that merely has a tracking id.
 */
function baseAwaitingPickupQuery(storeId) {
  const query = {
    ...ACTIVE_RECORD_FILTER,
    status: { $nin: PICKUP_DONE_STATUSES },
    $and: [
      {
        $or: [
          { 'waslah.orderId': { $nin: [null, ''] } },
          { 'waslah.emxTrackingNumber': { $nin: [null, ''] } },
          { 'waslah.trackingNumber': { $nin: [null, ''] } },
          { trackingId: { $nin: [null, ''] } },
        ],
      },
      {
        $or: [
          { status: 'PICKUP_REQUESTED' },
          { 'waslah.pickupRequestedAt': { $ne: null } },
          { 'waslah.pickupDate': { $nin: [null, ''] } },
          { 'waslah.appStatus': { $regex: /pickup\s*requested/i } },
          { 'waslah.carrierStatus': { $regex: /pickup\s*requested/i } },
          { 'waslah.currentSubtag': { $regex: /pickuprequested/i } },
          { 'waslah.lastSubtag': { $regex: /pickuprequested/i } },
          { 'waslah.currentStatus': { $regex: /pickup\s*requested/i } },
        ],
      },
      // Packed / Awaiting Pickup stays off this list
      { status: { $ne: 'WAITING_FOR_PICKUP' } },
    ],
  };
  if (storeId) query.storeId = String(storeId);
  return query;
}

/**
 * All orders with pickup requested / awaiting courier (any day).
 * Picked-up / shipped orders are excluded.
 */
export async function findAwaitingPickupOrders({ storeId = '', limit = 300 } = {}) {
  const todayKey = formatDubaiDateKey(new Date());
  const query = baseAwaitingPickupQuery(storeId);

  const orders = await Order.find(query)
    .select('_id shortOrderNumber status total paymentMethod guestName guestEmail guestPhone isGuest userId shippingAddress trackingId createdAt updatedAt warehousePacking waslah')
    .sort({ 'waslah.pickupRequestedAt': 1, updatedAt: -1 })
    .limit(Math.min(500, Math.max(1, Number(limit) || 300)))
    .lean();

  const filtered = orders.filter(isPickupAwaitingCourier);
  const serialized = filtered.map(serializePickupQueueOrder);
  return {
    todayKey,
    count: serialized.length,
    overdueCount: serialized.filter((order) => order.overdue).length,
    todayCount: serialized.filter((order) => (
      order.pickupDate === todayKey
      || (order.pickupRequestedAt && formatDubaiDateKey(new Date(order.pickupRequestedAt)) === todayKey)
    )).length,
    orders: serialized,
  };
}

/**
 * Today's pickup list (Asia/Dubai): scheduled for today or requested today,
 * and not yet picked up.
 */
export async function findTodaysPickupOrders({ storeId = '', limit = 200 } = {}) {
  const todayKey = formatDubaiDateKey(new Date());
  const parts = getDubaiDateParts(new Date());
  const startUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, -4, 0, 0, 0));
  const endUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, -4, 0, 0, 0));

  const base = baseAwaitingPickupQuery(storeId);
  const query = {
    ...base,
    $and: [
      ...(base.$and || []),
      {
        $or: [
          { 'waslah.pickupDate': todayKey },
          {
            'waslah.pickupRequestedAt': {
              $gte: startUtc,
              $lt: endUtc,
            },
          },
        ],
      },
    ],
  };

  const orders = await Order.find(query)
    .select('_id shortOrderNumber status total paymentMethod guestName guestEmail guestPhone isGuest userId shippingAddress trackingId createdAt updatedAt warehousePacking waslah')
    .sort({ 'waslah.pickupRequestedAt': 1 })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)))
    .lean();

  return {
    todayKey,
    count: orders.length,
    orders: orders.filter(isPickupAwaitingCourier).map(serializePickupQueueOrder),
  };
}

/**
 * Pickup requested and still awaiting courier for 24+ hours.
 */
export async function findOverduePickupOrders({
  storeId = '',
  limit = 100,
  onlyUnnotified = false,
} = {}) {
  const cutoff = new Date(Date.now() - PICKUP_OVERDUE_MS);
  const base = baseAwaitingPickupQuery(storeId);
  const query = {
    ...base,
    $and: [
      ...(base.$and || []),
      {
        $or: [
          { 'waslah.pickupRequestedAt': { $lte: cutoff, $ne: null } },
          {
            $and: [
              {
                $or: [
                  { 'waslah.pickupRequestedAt': null },
                  { 'waslah.pickupRequestedAt': { $exists: false } },
                ],
              },
              { 'waslah.processedAt': { $lte: cutoff, $ne: null } },
            ],
          },
        ],
      },
      ...(onlyUnnotified
        ? [{
            $or: [
              { 'waslah.pickupOverdueNotifiedAt': null },
              { 'waslah.pickupOverdueNotifiedAt': { $exists: false } },
            ],
          }]
        : []),
    ],
  };

  const orders = await Order.find(query)
    .select('_id shortOrderNumber status total paymentMethod guestName guestEmail guestPhone isGuest userId shippingAddress trackingId storeId createdAt updatedAt warehousePacking waslah')
    .sort({ 'waslah.pickupRequestedAt': 1 })
    .limit(Math.min(300, Math.max(1, Number(limit) || 100)))
    .lean();

  const filtered = orders
    .filter(isPickupAwaitingCourier)
    .filter((order) => {
      const at = resolvePickupRequestedAt(order);
      return at && at.getTime() <= cutoff.getTime();
    });

  return {
    cutoff: cutoff.toISOString(),
    count: filtered.length,
    orders: filtered.map(serializePickupQueueOrder),
    rawOrders: filtered,
  };
}
