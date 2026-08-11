/** MongoDB order id for API routes and deep links. */
import { buildCustomerSitePath } from './appUrl.js';
import { formatVariantOptionsLabel } from './productVariantOptions.js';

function isGenericProductName(value = '') {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === 'product' || text === 'unnamed product';
}

function pickBetterProductName(current = '', candidate = '') {
  const a = String(current || '').trim();
  const b = String(candidate || '').trim();
  if (isGenericProductName(a)) return b || a;
  if (isGenericProductName(b)) return a;
  return a.length >= b.length ? a : b;
}

/** Readable line-item name for reports/exports (variant title, catalog name, etc.). */
export function getOrderLineItemDisplayName(item = {}, product = {}) {
  const opts = item?.variantOptions && typeof item.variantOptions === 'object'
    ? item.variantOptions
    : {};
  const populated = getOrderLineProduct(item);
  const catalog = product && Object.keys(product).length ? product : populated;

  const candidates = [
    opts.title,
    catalog?.name,
    catalog?.title,
    catalog?.nameAr,
    item?.name,
    item?.productName,
    item?.title,
    formatVariantOptionsLabel(opts),
  ].map((value) => String(value || '').trim()).filter(Boolean);

  const best = candidates.find((name) => !isGenericProductName(name));
  return best || candidates[0] || 'Unnamed product';
}

export { pickBetterProductName, isGenericProductName };

export function getOrderMongoId(order) {
  const id = order?._id ?? order?.id;
  return id != null ? String(id) : '';
}

/** Populated product on an order line (API uses productId). */
export function getOrderLineProduct(item) {
  if (!item) return {};
  if (item.product && typeof item.product === 'object') return item.product;
  if (item.productId && typeof item.productId === 'object') return item.productId;
  return {};
}

/** Customer-facing order number (e.g. 523304). Never returns MongoDB _id. */
export function getDisplayOrderNumber(order) {
  const short = order?.shortOrderNumber;
  if (short != null && String(short).trim() !== '') {
    return String(short);
  }
  return '';
}

export function getDisplayOrderLabel(order) {
  const num = getDisplayOrderNumber(order);
  return num ? `Order No: ${num}` : 'Order No: Pending';
}

/** Pull order no / AWB out of a pasted store track-order URL. */
export function extractTrackingReferenceFromInput(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const fromQuery = url.searchParams.get('order')
        || url.searchParams.get('orderNo')
        || url.searchParams.get('orderId')
        || url.searchParams.get('awb')
        || url.searchParams.get('q')
        || '';
      if (fromQuery) return String(fromQuery).trim();

      const pathMatch = url.pathname.match(/track-order\/([^/?#]+)/i);
      if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
      return '';
    } catch {
      return '';
    }
  }

  return value;
}

/** Customer-facing AWB / order number — never a URL. */
export function getPublicTrackingDisplayId(order = {}) {
  const candidates = [
    order?.waslah?.trackingNumber,
    order?.c3x?.airwayBillNumber,
    order?.trackingId,
    getDisplayOrderNumber(order),
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value && !/^https?:\/\//i.test(value)) return value;
  }
  return '';
}

/** Track-order page URL with order number or AWB prefilled and auto-track enabled. */
export function buildTrackOrderPageUrl(orderOrData = {}) {
  const base = buildCustomerSitePath('/track-order');
  const orderNo = getDisplayOrderNumber(orderOrData);
  if (orderNo) {
    return `${base}?order=${encodeURIComponent(orderNo)}&auto=1`;
  }

  const awb = getPublicTrackingDisplayId(orderOrData);
  if (awb) {
    return `${base}?awb=${encodeURIComponent(awb)}&auto=1`;
  }

  return base;
}

/** Best available customer label for store dashboard / exports. */
export function getOrderCustomerDisplayName(order = {}) {
  const shipping = order.shippingAddress || {};
  const user = order.userId && typeof order.userId === 'object' ? order.userId : null;
  const userName = String(user?.name || '').trim();
  const userEmail = String(user?.email || '').trim();

  const candidates = [
    order.isGuest ? order.guestName : null,
    shipping.name,
    userName && userName !== 'Unknown' ? userName : null,
    order.guestName,
    userEmail,
    order.guestEmail,
    shipping.email,
    order.guestPhone,
    shipping.phone,
  ];

  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }

  return order.isGuest ? 'Guest customer' : 'Customer';
}

/** Store dashboard: original order date + time (UAE). */
export function formatStoreOrderDateTime(value, { timeZone = 'Asia/Dubai' } = {}) {
  const { date, time } = formatStoreOrderDateParts(value, { timeZone });
  if (date === '—') return '—';
  return time ? `${date}, ${time}` : date;
}

/** Split date and time for table cells (date on one line, time below). */
export function formatStoreOrderDateParts(value, { timeZone = 'Asia/Dubai' } = {}) {
  if (!value) return { date: '—', time: '' };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '—', time: '' };
  return {
    date: date.toLocaleDateString('en-GB', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}
