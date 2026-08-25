/** Client-safe: no server imports (firebase-admin / email). */

const VALID_STATUSES = new Set([
  'ORDER_PLACED',
  'PROCESSING',
  'PENDING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'PAYMENT_FAILED',
  'AWAITING_PAYMENT',
  'RTO',
  'RETURN',
  'RETURNED',
  'REPLACEMENT',
  'RETURN_INITIATED',
  'RETURN_APPROVED',
  'RETURN_REQUESTED',
  'PICKUP_REQUESTED',
  'WAITING_FOR_PICKUP',
  'PICKED_UP',
  'WAREHOUSE_RECEIVED',
  'OUT_FOR_DELIVERY',
]);

/** Excel / courier labels → internal order status */
const STATUS_ALIASES = {
  delivered: 'DELIVERED',
  delivery: 'DELIVERED',
  'order delivered': 'DELIVERED',
  shipped: 'SHIPPED',
  ship: 'SHIPPED',
  'in transit': 'SHIPPED',
  'in-transit': 'SHIPPED',
  transit: 'SHIPPED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  cancel: 'CANCELLED',
  'order cancelled': 'CANCELLED',
  'order canceled': 'CANCELLED',
  'out for delivery': 'OUT_FOR_DELIVERY',
  outfordelivery: 'OUT_FOR_DELIVERY',
  ofd: 'OUT_FOR_DELIVERY',
  processing: 'PROCESSING',
  packed: 'WAITING_FOR_PICKUP',
  'awaiting pickup': 'WAITING_FOR_PICKUP',
  'waiting for pickup': 'WAITING_FOR_PICKUP',
  'pickup requested': 'PICKUP_REQUESTED',
  'picked up': 'PICKED_UP',
  rto: 'RTO',
  'rto not collected': 'RTO',
  'not collected': 'RTO',
  returned: 'RETURNED',
  'order returned': 'RETURNED',
  return: 'RETURN',
};

function normalizeStatusKey(status = '') {
  return String(status || '').trim().toUpperCase();
}

function canonicalizeStatusEnum(status = '') {
  const normalized = normalizeStatusKey(status);
  // American spelling → store enum
  if (normalized === 'CANCELED') return 'CANCELLED';
  return normalized;
}

function isKnownStatus(status = '') {
  return VALID_STATUSES.has(canonicalizeStatusEnum(status));
}

/**
 * Map free-text Status cell (Delivered / RTO / RETURNED / Canceled / …) to store status enum.
 */
export function mapExcelStatusToStoreStatus(raw = '') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const asEnum = canonicalizeStatusEnum(trimmed.replace(/\s+/g, '_'));
  if (VALID_STATUSES.has(asEnum)) return asEnum;

  const key = trimmed
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = key.replace(/\s/g, '');
  const mapped = STATUS_ALIASES[key] || STATUS_ALIASES[compact];
  if (mapped && VALID_STATUSES.has(mapped)) return mapped;

  // Prefix match for values like "RTO (Not Collected)", "Delivered - COD"
  for (const [alias, status] of Object.entries(STATUS_ALIASES)) {
    if (key.startsWith(alias) || compact.startsWith(alias.replace(/\s/g, ''))) {
      return status;
    }
  }

  return null;
}

function pickColumn(row, candidates = []) {
  if (!row || typeof row !== 'object') return '';
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const want = String(candidate).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, value] of entries) {
      const normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized === want || normalized.startsWith(want)) {
        return value;
      }
    }
  }
  return '';
}

/**
 * Normalize one Excel/CSV row into { shipperRef, status }.
 * ShipperRef = order id (shortOrderNumber). Also accepts Order No headers.
 */
export function normalizeBulkStatusExcelRow(row = {}) {
  const shipperRaw = pickColumn(row, [
    'ShipperRef',
    'ShipperRe',
    'Shipper Reference',
    'Order No',
    'Order Number',
    'OrderNo',
    'Order Id',
    'OrderId',
    'shortOrderNumber',
  ]);
  const statusRaw = pickColumn(row, ['Status', 'Order Status', 'New Status']);

  const shipperRef = String(shipperRaw ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/\.0$/, '');
  const status = mapExcelStatusToStoreStatus(statusRaw);

  return {
    shipperRef,
    status,
    statusRaw: String(statusRaw || '').trim(),
  };
}

export function parseBulkStatusExcelRows(rows = []) {
  const updates = [];
  const invalid = [];

  rows.forEach((row, index) => {
    const parsed = normalizeBulkStatusExcelRow(row);
    if (!parsed.shipperRef) {
      invalid.push({ row: index + 2, error: 'Missing ShipperRef' });
      return;
    }
    if (!parsed.status) {
      invalid.push({
        row: index + 2,
        shipperRef: parsed.shipperRef,
        error: `Unrecognized status: ${parsed.statusRaw || '(empty)'}`,
      });
      return;
    }
    updates.push({
      shipperRef: parsed.shipperRef,
      status: parsed.status,
    });
  });

  return { updates, invalid };
}
