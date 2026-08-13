import {
  buildTrackOrderPageUrl,
  getDisplayOrderNumber,
  getOrderLineItemDisplayName,
  getOrderLineProduct,
} from '@/lib/orderDisplay';
import {
  getEmxTrackingNumber,
  buildEmxTrackingUrl,
  getWaslahCourierStatus,
  getWaslahCourierReason,
} from '@/lib/waslahTracking';
import { formatWarehousePacking } from '@/lib/warehouseOrderPacking';
import { getLabelDownloadCount, isWaslahLabelReadyOrder } from '@/lib/waslahReceipts';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getCustomerSiteUrl } from '@/lib/appUrl';

function ensureAbsoluteHttpsUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === '/placeholder.png') return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
  const base = String(getCustomerSiteUrl() || 'https://store1920.com').replace(/\/+$/, '');
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value.replace(/^\//, '')}`;
}

function serializeLineItems(order = {}) {
  return (order.orderItems || []).map((item) => {
    const product = getOrderLineProduct(item);
    const image = ensureAbsoluteHttpsUrl(
      getProductThumbnailUrl(product, { fallback: item?.image || '' }),
    );
    return {
      name: getOrderLineItemDisplayName(item, product),
      quantity: Number(item?.quantity) || 1,
      sku: String(item?.sku || product?.sku || '').trim() || null,
      image: image || null,
      variantOptions: item?.variantOptions || null,
    };
  });
}

/**
 * Compact tracking payload for warehouse / pickup apps.
 */
export function serializeWarehouseTrackingOrder(order = {}) {
  const emxTrackingNumber = getEmxTrackingNumber(order) || '';
  const waslahOrderId = String(order?.waslah?.orderId || '').trim() || null;
  const shortOrderNumber = getDisplayOrderNumber(order) || null;
  const labelDownloadCount = getLabelDownloadCount(order);
  const packing = formatWarehousePacking(order);
  const liveStatus = getWaslahCourierStatus(order)
    || order?.waslah?.appStatus
    || order?.waslah?.carrierStatus
    || null;
  const courierReason = getWaslahCourierReason(order);

  return {
    orderId: String(order?._id || ''),
    shortOrderNumber,
    status: String(order?.status || '').toUpperCase() || null,
    courier: order?.courier || (waslahOrderId ? 'EMX' : null),
    trackingNumber: emxTrackingNumber || null,
    emxTrackingNumber: emxTrackingNumber || null,
    waslahTrackingNumber: String(order?.waslah?.waslahTrackingNumber || '').trim() || null,
    trackingUrl: buildEmxTrackingUrl(emxTrackingNumber) || order?.trackingUrl || null,
    trackOrderPageUrl: buildTrackOrderPageUrl(order),
    labelReady: isWaslahLabelReadyOrder(order),
    labelDownloadCount,
    labelPrintedAt: order?.waslah?.labelPrintedAt || null,
    labelUrl: order?.waslah?.labelUrl || null,
    courierReason: courierReason?.reason || null,
    courierReasonLabel: courierReason?.label || null,
    courierReasonIsFailure: Boolean(courierReason?.isFailure),
    pickup: {
      requested: Boolean(order?.waslah?.pickupRequestedAt),
      requestedAt: order?.waslah?.pickupRequestedAt || null,
      type: order?.waslah?.pickupType || null,
      date: order?.waslah?.pickupDate || null,
      time: order?.waslah?.pickupTime || null,
      vehicle: order?.waslah?.pickupVehicle || null,
    },
    warehousePacking: packing,
    waslah: {
      orderId: waslahOrderId,
      serviceId: order?.waslah?.serviceId || null,
      reference: order?.waslah?.reference || null,
      liveStatus,
      currentStatus: order?.waslah?.currentStatus || null,
      currentSubtag: order?.waslah?.currentSubtag || null,
      lastLocation: order?.waslah?.lastLocation || null,
      lastEventAt: order?.waslah?.lastEventAt || null,
      events: Array.isArray(order?.waslah?.events) ? order.waslah.events : [],
      cancelledAt: order?.waslah?.cancelledAt || null,
    },
    customer: {
      name: order?.guestName
        || order?.userId?.name
        || [order?.shippingAddress?.firstName, order?.shippingAddress?.lastName].filter(Boolean).join(' ')
        || null,
      phone: order?.guestPhone || order?.userId?.phone || order?.shippingAddress?.phone || null,
      email: order?.guestEmail || order?.userId?.email || null,
    },
    shippingAddress: order?.shippingAddress || null,
    paymentMethod: order?.paymentMethod || null,
    total: order?.total ?? null,
    currency: order?.currency || 'AED',
    items: serializeLineItems(order),
    createdAt: order?.createdAt || null,
    updatedAt: order?.updatedAt || null,
  };
}

export const WAREHOUSE_TRACKING_QUEUE_STATUSES = [
  'WAITING_FOR_PICKUP',
  'PICKUP_REQUESTED',
  'PROCESSING',
  'ORDER_PLACED',
  'SHIPPED',
];
