/** Client-safe pickup queue constants (no Node/Firebase imports). */

/**
 * Local statuses that mean EMX pickup was requested.
 * Packed / Awaiting Pickup (WAITING_FOR_PICKUP) is NOT included.
 */
export const AWAITING_PICKUP_STATUSES = [
  'PICKUP_REQUESTED',
];

/** Past pickup queue — leave the Pickup list (includes packed / awaiting pickup). */
export const PICKUP_DONE_STATUSES = [
  'WAITING_FOR_PICKUP',
  'PICKED_UP',
  'WAREHOUSE_RECEIVED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RTO',
  'RETURN',
  'RETURNED',
  'REPLACEMENT',
  'PAYMENT_FAILED',
  'AWAITING_PAYMENT',
];

export const PICKUP_OVERDUE_MS = 24 * 60 * 60 * 1000;
