import {
  getDisplayOrderNumber,
  getOrderCustomerDisplayName,
  getOrderLineProduct,
} from '@/lib/orderDisplay';
import { getStoreOrderDisplayItems } from '@/lib/storeOrderLineItems';
import { isAwaitingPaymentOrder } from '@/lib/deferredOrderStatus';
import { isStoreOrderPaid, normalizeStoreOrderPaymentMethod } from '@/lib/storeOrderInsights';
import { matchVariantByOptions } from '@/lib/productVariantOptions';

export const WOOCOMMERCE_ORDER_EXPORT_HEADERS = [
  'Order Number',
  'Order Status',
  'Order Date',
  'First Name (Billing)',
  'Last Name (Billing)',
  'Address 1&2 (Billing)',
  'City (Billing)',
  'State Code (Billing)',
  'Country Code (Billing)',
  'Email (Billing)',
  'Phone (Billing)',
  'Country Code (Shipping)',
  'Payment Method Title',
  'Failed or Success',
  'Order Total Amount',
  'SKU',
  'Item #',
  'Item Name',
  'Bundle / Variant',
  'Quantity (- Refund)',
  'Item Cost',
  'Discount',
];

const PAYMENT_TITLES = {
  COD: 'Cash on delivery',
  CARD: 'Credit / Debit Card',
  STRIPE: 'Credit / Debit Card (Stripe)',
  TABBY: 'Tabby',
  TAMARA: 'Tamara',
  RAZORPAY: 'Razorpay',
  UPI: 'UPI',
  WALLET: 'Wallet',
};

function splitFullName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function resolveCountryCode(country = '') {
  const text = String(country || '').trim().toLowerCase();
  if (!text) return 'AE';
  if (text === 'ae' || text === 'uae' || text.includes('united arab')) return 'AE';
  if (text.length === 2) return text.toUpperCase();
  if (text.includes('india')) return 'IN';
  if (text.includes('saudi')) return 'SA';
  return text.slice(0, 2).toUpperCase();
}

function formatWooOrderDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatExportPhone(shipping = {}, order = {}) {
  const phone = String(shipping.phone || order.guestPhone || '').trim();
  if (!phone) return '';
  const code = String(shipping.phoneCode || order.alternatePhoneCode || '').trim();
  if (phone.startsWith('+')) return phone;
  if (code) return `${code}${phone.replace(/^0+/, '')}`;
  return phone;
}

const EXPORT_ORDER_STATUS_LABELS = {
  PAYMENT_FAILED: 'Payment Failed',
  AWAITING_PAYMENT: 'Pending payment',
  ORDER_PLACED: 'Processing',
  PROCESSING: 'Processing',
  WAITING_FOR_PICKUP: 'Processing',
  PICKUP_REQUESTED: 'Processing',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Completed',
  RETURN_REQUESTED: 'Return requested',
  RETURN_APPROVED: 'Return approved',
  RETURNED: 'Returned',
  RTO: 'RTO (not collected)',
  RETURN: 'Return (after delivery)',
  REPLACEMENT: 'Replacement (after delivery)',
  CANCELLED: 'Cancelled',
};

export function resolveExportPaymentResult(order = {}) {
  const orderStatus = String(order?.status || '').trim().toUpperCase();
  const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();

  if (orderStatus === 'CANCELLED') return 'Cancelled';
  if (
    orderStatus === 'PAYMENT_FAILED'
    || paymentStatus === 'failed'
    || paymentStatus === 'payment_failed'
  ) {
    return 'Failed';
  }
  if (isStoreOrderPaid(order)) return 'Success';
  if (
    isAwaitingPaymentOrder(order)
    || paymentStatus === 'pending'
    || paymentStatus === 'unpaid'
  ) {
    return 'Pending';
  }
  return 'Pending';
}

function resolveExportOrderStatus(order = {}) {
  const orderStatus = String(order?.status || '').trim().toUpperCase();
  if (EXPORT_ORDER_STATUS_LABELS[orderStatus]) {
    return EXPORT_ORDER_STATUS_LABELS[orderStatus];
  }
  if (isStoreOrderPaid(order)) return 'Completed';
  return 'Processing';
}

function resolvePaymentMethodTitle(paymentMethod = '') {
  const method = String(paymentMethod || '').toUpperCase();
  return PAYMENT_TITLES[method] || method || '';
}

function getOrderDiscountAmount(order = {}) {
  let total = 0;

  const couponDiscount = Number(order?.coupon?.discountAmount);
  if (Number.isFinite(couponDiscount) && couponDiscount > 0) {
    total += couponDiscount;
  }

  const walletDiscount = Number(order?.walletDiscount);
  if (Number.isFinite(walletDiscount) && walletDiscount > 0) {
    total += walletDiscount;
  }

  return total;
}

function looksLikeMongoObjectId(value = '') {
  return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
}

function pickExportSku(...candidates) {
  for (const candidate of candidates) {
    const sku = String(candidate ?? '').trim();
    if (!sku) continue;
    if (looksLikeMongoObjectId(sku)) continue;
    return sku;
  }
  return '';
}

function resolveMatchedOrderLineVariant(item = {}, product = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;

  const variantOptions = item?.variantOptions;
  if (!variantOptions || typeof variantOptions !== 'object') return null;

  return matchVariantByOptions(variants, variantOptions);
}

function resolveLineSku(item = {}) {
  const product = getOrderLineProduct(item);
  const matchedVariant = resolveMatchedOrderLineVariant(item, product);
  const variants = Array.isArray(product?.variants) ? product.variants : [];

  // Prefer the selected variant SKU, then product/line snapshot — never Mongo _id.
  const matchedSku = pickExportSku(
    matchedVariant?.sku,
    item?.sku,
    item?.variantSku,
    product?.sku,
  );
  if (matchedSku) return matchedSku;

  // If only one variant has a real SKU, use it.
  const variantSkus = variants
    .map((variant) => pickExportSku(variant?.sku))
    .filter(Boolean);
  if (variantSkus.length === 1) return variantSkus[0];

  // Same SKU repeated across variants.
  if (variantSkus.length > 1 && new Set(variantSkus).size === 1) {
    return variantSkus[0];
  }

  return '';
}

function resolveExportLineBundleOrVariant(item = {}) {
  if (!item) return '';

  if (item.isBulkBundle) {
    const bundleUnits = Number(item.bundleUnits) || Number(item.quantity) || 1;
    const packQuantity = Math.max(1, Number(item.packQuantity) || 1);
    const packLabel = `${packQuantity} pack${packQuantity > 1 ? 's' : ''}`;
    return `Bundle of ${bundleUnits} (${packLabel})`;
  }

  const variantLabel = String(item.variantLabel || '').trim();
  if (variantLabel) return `Variant: ${variantLabel}`;

  const variantOptions = item.variantOptions;
  if (variantOptions && typeof variantOptions === 'object') {
    const hasVariantChoice = Object.entries(variantOptions).some(([key, value]) => {
      if (key === 'bundleQty') return false;
      return String(value ?? '').trim().length > 0;
    });
    if (hasVariantChoice) {
      const parts = Object.entries(variantOptions)
        .filter(([key, value]) => key !== 'bundleQty' && String(value ?? '').trim())
        .map(([key, value]) => `${key}: ${value}`);
      if (parts.length) return `Variant: ${parts.join(' · ')}`;
    }
  }

  return '';
}

function resolveBillingContact(order = {}) {
  const shipping = order?.shippingAddress || {};
  const user = order?.userId && typeof order.userId === 'object' ? order.userId : null;
  const fullName = shipping.name || order.guestName || getOrderCustomerDisplayName(order);
  const explicitFirst = String(
    shipping.firstName || shipping.first_name || shipping.billingFirstName || ''
  ).trim();
  const explicitLast = String(
    shipping.lastName || shipping.last_name || shipping.billingLastName || ''
  ).trim();
  const split = splitFullName(fullName);
  const email = order.isGuest
    ? (order.guestEmail || shipping.email || '')
    : (user?.email || order.guestEmail || shipping.email || '');
  const city = shipping.city || shipping.district || '';
  const state = shipping.state || '';
  const country = shipping.country || 'United Arab Emirates';
  const address12 = [
    shipping.street || shipping.address || shipping.address1 || '',
    shipping.address2 || '',
  ].filter(Boolean).join(', ');

  return {
    firstName: explicitFirst || split.firstName,
    lastName: explicitLast || split.lastName,
    email: String(email || '').trim(),
    phone: formatExportPhone(shipping, order),
    city: String(city || '').trim(),
    state: String(state || '').trim(),
    countryCode: resolveCountryCode(country),
    address12: String(address12 || '').trim(),
  };
}

export function buildWooCommerceOrderExportRows(orders = []) {
  const rows = [];

  for (const order of orders) {
    const billing = resolveBillingContact(order);
    const orderNumber = getDisplayOrderNumber(order) || order?.legacySourceId || '';
    const orderStatus = resolveExportOrderStatus(order);
    const orderDate = formatWooOrderDate(order?.createdAt);
    const paymentTitle = resolvePaymentMethodTitle(normalizeStoreOrderPaymentMethod(order));
    const paymentResult = resolveExportPaymentResult(order);
    const orderTotal = Number(order?.total || 0).toFixed(2);
    const discountTotal = getOrderDiscountAmount(order);
    const lineItems = getStoreOrderDisplayItems(order);
    const exportLines = lineItems.length ? lineItems : [null];

    exportLines.forEach((item, index) => {
      rows.push([
        orderNumber,
        orderStatus,
        orderDate,
        billing.firstName,
        billing.lastName,
        billing.address12,
        billing.city,
        billing.state,
        billing.countryCode,
        billing.email,
        billing.phone,
        billing.countryCode,
        paymentTitle,
        paymentResult,
        orderTotal,
        item ? resolveLineSku(item) : '',
        item ? String(index + 1) : '',
        item ? String(item.name || '') : '',
        item ? resolveExportLineBundleOrVariant(item) : '',
        item ? String(item.quantity || 1) : '',
        item ? Number(item.price || 0).toFixed(2) : '',
        index === 0 && discountTotal > 0 ? discountTotal.toFixed(2) : '',
      ]);
    });
  }

  return rows;
}

export function escapeWooExportCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildWooCommerceOrderExportCsv(orders = []) {
  const rows = buildWooCommerceOrderExportRows(orders);
  return [
    WOOCOMMERCE_ORDER_EXPORT_HEADERS.join(','),
    ...rows.map((row) => row.map(escapeWooExportCsvCell).join(',')),
  ].join('\n');
}
