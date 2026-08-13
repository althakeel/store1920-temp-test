/** Helpers for Waslah / EMX shipping label and receipt downloads. */

/**
 * True when Waslah can print an EMX carrier label for this order.
 * Requires a Waslah shipment id — EMX barcode (1000…) may appear only after pickup/sync.
 */
export function isWaslahLabelReadyOrder(order = {}) {
  const waslahOrderId = String(order?.waslah?.orderId || '').trim();
  if (!waslahOrderId) return false;
  if (order?.waslah?.cancelledAt && !waslahOrderId) return false;
  return true;
}

/** True when the public EMX barcode tracking number is known. */
export function hasEmxCarrierTrackingNumber(order = {}) {
  const awb = String(
    order?.waslah?.emxTrackingNumber
    || order?.waslah?.trackingNumber
    || order?.trackingId
    || '',
  ).trim();
  if (!awb || /^62\d+$/.test(awb)) return false;
  return /^1000\d{9,12}$/.test(awb) || /^\d{10,16}$/.test(awb);
}

export function isWaslahLabelNotPrinted(order = {}) {
  return isWaslahLabelReadyOrder(order) && getLabelDownloadCount(order) <= 0;
}

export function getLabelDownloadCount(order = {}) {
  const counted = Number(order?.waslah?.labelDownloadCount);
  if (Number.isFinite(counted) && counted > 0) return Math.floor(counted);
  // Legacy orders marked printed before download counting existed.
  if (order?.waslah?.labelPrintedAt) return 1;
  return 0;
}

export function isWaslahLabelPrinted(order = {}) {
  return isWaslahLabelReadyOrder(order) && getLabelDownloadCount(order) > 0;
}

/** Statuses that should move to Waiting for Pickup when the EMX label is downloaded. */
const LABEL_DOWNLOAD_STATUS_ELIGIBLE = new Set([
  'ORDER_PLACED',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'IN_TRANSIT',
]);

/**
 * After downloading the EMX carrier label, set store status to Waiting for Pickup
 * unless the order is already further along (pickup requested / in transit / delivered).
 */
export function getStatusAfterLabelDownload(order = {}) {
  const current = String(order?.status || '').toUpperCase();
  if (!current) return 'WAITING_FOR_PICKUP';
  if (current === 'WAITING_FOR_PICKUP' || current === 'PICKUP_REQUESTED') return current;
  if (LABEL_DOWNLOAD_STATUS_ELIGIBLE.has(current)) return 'WAITING_FOR_PICKUP';
  return null;
}

export function buildLabelPrintedUpdate(order = {}, printedAt = new Date()) {
  const nextStatus = getStatusAfterLabelDownload(order);
  return {
    'waslah.labelPrintedAt': printedAt,
    ...(nextStatus ? { status: nextStatus } : {}),
  };
}

/** Mongo update that marks printed and increments download count (1, 2, 3…). */
export function buildLabelDownloadedMongoUpdate(order = {}, printedAt = new Date()) {
  return {
    $set: buildLabelPrintedUpdate(order, printedAt),
    $inc: { 'waslah.labelDownloadCount': 1 },
  };
}

export function getWaslahOrderIdsFromOrders(orders = []) {
  return [...new Set(
    orders
      .filter(isWaslahLabelReadyOrder)
      .map((order) => String(order.waslah.orderId).trim())
      .filter(Boolean),
  )];
}

export function extractWaslahPrintReceiptUrl(printResult, { preferCarrierLabel = true } = {}) {
  if (!printResult) return null;
  if (typeof printResult === 'string' && /^https?:\/\//i.test(printResult)) {
    return printResult.trim();
  }

  const carrierFirst = [
    printResult.carrier_label_url,
    printResult.carrierLabelUrl,
    printResult.label_url,
    printResult.labelUrl,
    printResult.data?.carrier_label_url,
    printResult.data?.label_url,
    printResult.data?.labelUrl,
    printResult.labels?.[0]?.url,
    printResult.data?.labels?.[0]?.url,
    Array.isArray(printResult.files)
      ? printResult.files.find((file) => /label|carrier|emx/i.test(`${file?.name || ''} ${file?.type || ''}`))?.url
      : null,
  ];

  const receiptFallback = [
    printResult.url,
    printResult.pdf_url,
    printResult.receipt_url,
    printResult.file_url,
    printResult.data?.url,
    printResult.data?.pdf_url,
    printResult.data?.receipt_url,
    printResult.file?.url,
  ];

  const candidates = preferCarrierLabel
    ? [...carrierFirst, ...receiptFallback]
    : [...receiptFallback, ...carrierFirst];

  return candidates.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()))?.trim() || null;
}
