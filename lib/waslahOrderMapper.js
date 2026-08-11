import {
  getDisplayOrderNumber,
  getOrderLineItemDisplayName,
  getOrderLineProduct,
} from '@/lib/orderDisplay';
import { buildEmxTrackingUrl } from '@/lib/waslahTracking';

const UAE_COUNTRY = 'ARE';
const DEFAULT_HS_CODE = '000000000000';
const DEFAULT_ORIGIN_COUNTRY = 'AE';
const DEFAULT_SENDER_EMAIL = 'support@store1920.com';
const DEFAULT_ITEM_WEIGHT_KG = 0.25;

function normalizePhone(phone = '', phoneCode = '+971') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('971')) return `+${digits}`;
  const code = String(phoneCode || '+971').replace(/\D/g, '') || '971';
  const local = digits.replace(/^0+/, '');
  return `+${code}${local}`;
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function mapCountryCode(country = '') {
  const normalized = String(country || '').trim().toLowerCase();
  if (!normalized || normalized === 'uae' || normalized.includes('united arab emirates')) {
    return UAE_COUNTRY;
  }
  return String(country || UAE_COUNTRY).trim().toUpperCase();
}

function resolveOrderEmail(order = {}) {
  const addr = order.shippingAddress || {};
  return normalizeEmail(
    addr.email
    || order.guestEmail
    || order.userId?.email
    || '',
  );
}

function buildSender() {
  const senderId = String(process.env.WASLAH_SENDER_ID || '').trim();
  const senderEmail = normalizeEmail(process.env.WASLAH_SENDER_EMAIL || DEFAULT_SENDER_EMAIL);

  return {
    ...(senderId ? { _id: senderId } : {}),
    country: process.env.WASLAH_SENDER_COUNTRY || UAE_COUNTRY,
    contact_name: process.env.WASLAH_SENDER_CONTACT_NAME || 'Store1920',
    company_name: process.env.WASLAH_SENDER_COMPANY_NAME || process.env.WASLAH_SENDER_CONTACT_NAME || 'Store1920',
    phone: process.env.WASLAH_SENDER_PHONE || '',
    email: senderEmail,
    street1: process.env.WASLAH_SENDER_STREET || '',
    city: process.env.WASLAH_SENDER_CITY || 'Dubai',
    is_residential: false,
  };
}

function buildReceiver(order = {}) {
  const addr = order.shippingAddress || {};
  const name = String(addr.name || order.guestName || 'Customer').trim();
  const street = [
    addr.street,
    addr.building,
    addr.landmark,
    addr.district,
    addr.area,
    addr.state,
  ].filter(Boolean).join(', ');
  const receiverEmail = resolveOrderEmail(order);

  return {
    contact_name: name,
    company_name: name,
    phone: normalizePhone(addr.phone || order.guestPhone, addr.phoneCode || order.alternatePhoneCode || '+971'),
    ...(receiverEmail ? { email: receiverEmail } : {}),
    street1: street || 'Address not provided',
    city: String(addr.city || 'Dubai').trim(),
    zipcode: String(addr.zip || addr.pincode || '').trim(),
    country: mapCountryCode(addr.country),
    is_residential: false,
  };
}

function getDefaultHsCode() {
  return String(process.env.WASLAH_DEFAULT_HS_CODE || DEFAULT_HS_CODE).trim() || DEFAULT_HS_CODE;
}

function getDefaultOriginCountry() {
  return String(process.env.WASLAH_DEFAULT_ORIGIN_COUNTRY || DEFAULT_ORIGIN_COUNTRY)
    .trim()
    .toUpperCase() || DEFAULT_ORIGIN_COUNTRY;
}

function normalizeHsCode(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return getDefaultHsCode();
  return digits.padEnd(12, '0').slice(0, 12);
}

function normalizeOriginCountry(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return getDefaultOriginCountry();
  if (raw === 'UAE' || raw === 'ARE' || raw.includes('UNITED ARAB')) return 'AE';
  return raw.slice(0, 2);
}

function resolveItemWeightKg(item = {}, product = {}) {
  const candidates = [
    product.shippingWeightKg,
    product.weightKg,
    item.shippingWeightKg,
    item.weight,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Number(Math.max(0.01, numeric).toFixed(2));
    }
  }
  return DEFAULT_ITEM_WEIGHT_KG;
}

function buildShipmentItems(order = {}) {
  const lines = Array.isArray(order.orderItems) && order.orderItems.length
    ? order.orderItems
    : (Array.isArray(order.items) ? order.items : []);

  if (!lines.length) {
    return [{
      description: 'Store order',
      origin_country: getDefaultOriginCountry(),
      hs_code: getDefaultHsCode(),
      quantity: 1,
      unit_of_measurement: 'PCS',
      weight: { value: 0.5, unit: 'Kg' },
      price: { value: Number(order.total || 0), currency: 'AED' },
    }];
  }

  return lines.map((item) => {
    const product = getOrderLineProduct(item);
    const productName = String(
      getOrderLineItemDisplayName(item, product),
    ).trim().slice(0, 120) || 'Product';
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitPrice = Number(item.price || product?.price || 0);

    return {
      description: productName,
      origin_country: normalizeOriginCountry(product?.originCountry || item?.originCountry),
      hs_code: normalizeHsCode(product?.hsCode || item?.hsCode),
      quantity,
      unit_of_measurement: 'PCS',
      weight: { value: resolveItemWeightKg(item, product), unit: 'Kg' },
      price: {
        value: Number((unitPrice * quantity).toFixed(2)),
        currency: 'AED',
      },
    };
  });
}

function buildShipmentDescription(items = []) {
  const names = items
    .map((item) => String(item?.name || item?.description || '').trim())
    .filter(Boolean);
  if (!names.length) return 'Store order';
  return names.join(', ').slice(0, 200);
}

function isCodOrder(order = {}) {
  return String(order.paymentMethod || '').toUpperCase() === 'COD';
}

export function validateWaslahOrderPayload(payload = {}) {
  const issues = [];

  if (!String(process.env.WASLAH_SENDER_ID || '').trim()) {
    issues.push('WASLAH_SENDER_ID is missing — add your Waslah sender address _id to .env');
  }
  if (!String(process.env.WASLAH_SENDER_PHONE || '').trim()) {
    issues.push('WASLAH_SENDER_PHONE is missing');
  }
  if (!String(process.env.WASLAH_SENDER_STREET || '').trim()) {
    issues.push('WASLAH_SENDER_STREET is missing');
  }
  if (!String(payload?.sender?._id || '').trim()) {
    issues.push('sender._id is required by Waslah');
  }
  if (!String(payload?.receiver?.phone || '').trim()) {
    issues.push('Customer phone is required in the shipping address');
  }
  if (!String(payload?.receiver?.street1 || '').trim() || payload.receiver.street1 === 'Address not provided') {
    issues.push('Complete customer shipping address is required');
  }
  if (!String(payload?.reference || '').trim()) {
    issues.push('Order reference is required');
  }
  if (!String(payload?.service_id || payload?.shipment?.service_id || process.env.WASLAH_SERVICE_ID || '').trim()) {
    issues.push('EMX service is not configured — set WASLAH_SERVICE_ID in .env or fetch services from Store Orders');
  }

  return issues;
}

/**
 * Map a Store1920 order into a Waslah create-order payload.
 */
export function buildWaslahBaseReference(order = {}) {
  const orderNo = String(getDisplayOrderNumber(order) || order?.shortOrderNumber || '')
    .replace(/^#/, '')
    .trim();
  const mongoId = String(order?._id || order?.id || '').trim();
  if (orderNo) return `S1920-${orderNo}`;
  if (mongoId) return `S1920-${mongoId}`;
  return '';
}

export function buildWaslahReshipReference(orderOrReference = {}) {
  const fromOrder = typeof orderOrReference === 'string'
    ? orderOrReference
    : buildWaslahBaseReference(orderOrReference);
  const base = String(fromOrder || '').replace(/^#/, '').replace(/-R\d+$/i, '').trim();
  if (!base) return `S1920-R${Date.now().toString().slice(-6)}`;
  return `${base}-R${Date.now().toString().slice(-6)}`;
}

export function buildWaslahCanonicalReference(order = {}) {
  const cancelCount = Number(order?.waslah?.cancelCount || 0);
  const needsReship = Boolean(
    order?.waslah?.cancelledAt
    || order?.waslah?.unlinkedInWaslah
    || cancelCount > 0,
  );
  const stored = String(order?.waslah?.reference || '').replace(/^#/, '').trim();
  if (stored && !needsReship) return stored;

  const base = buildWaslahBaseReference(order);
  if (!base) return '';
  if (!needsReship) return base;
  return buildWaslahReshipReference(base);
}

export function buildWaslahOrderPayload(order = {}, { reference, serviceId } = {}) {
  const orderRef = reference
    || buildWaslahCanonicalReference(order)
    || getDisplayOrderNumber(order)
    || `ORDER_${String(order._id || '').slice(-8)}`;
  const paymentType = isCodOrder(order) ? 'COD' : 'PPD';
  const codAmount = paymentType === 'COD' ? Number(order.total || 0) : 0;
  const items = buildShipmentItems(order);
  const shipmentDescription = buildShipmentDescription(items);
  const totalWeight = items.reduce(
    (sum, item) => sum + Number(item.weight?.value || 0) * Number(item.quantity || 1),
    0,
  ) || 0.5;
  const receiver = buildReceiver(order);
  const serviceType = receiver.country && receiver.country !== UAE_COUNTRY ? 'INT' : 'DOM';
  const resolvedServiceId = String(
    serviceId || process.env.WASLAH_SERVICE_ID || '',
  ).trim();
  const deliveryDuty = String(process.env.WASLAH_DELIVERY_DUTY || 'DDU').trim().toUpperCase() === 'DDP'
    ? 'DDP'
    : 'DDU';

  const payload = {
    order_type: 'delivery',
    reference: String(orderRef).replace(/^#/, ''),
    deleted: false,
    ...(resolvedServiceId ? { service_id: resolvedServiceId } : {}),
    shipment: {
      currency: 'AED',
      description: shipmentDescription,
      service_type: serviceType,
      ...(resolvedServiceId ? { service_id: resolvedServiceId } : {}),
      payment_type: paymentType,
      quantity: 1,
      pieces: 1,
      is_document: false,
      weight: { value: Number(totalWeight.toFixed(2)) || 0.5, unit: 'Kg' },
      items,
      cod_amount: Number(codAmount.toFixed(2)),
      delivery_method: 'hand_to_recipient',
      is_remote_area: false,
      is_dangerous_goods: false,
      inspection_allowed: false,
      itemization: false,
      delivery_duty: deliveryDuty,
    },
    sender: buildSender(),
    receiver,
    packages: [{
      weight: { value: Number(totalWeight.toFixed(2)) || 0.5, unit: 'Kg' },
      dimensions: {
        width: Number(process.env.WASLAH_DEFAULT_PKG_WIDTH || 36),
        height: Number(process.env.WASLAH_DEFAULT_PKG_HEIGHT || 8),
        length: Number(process.env.WASLAH_DEFAULT_PKG_LENGTH || 24),
        unit: 'cm',
      },
    }],
  };

  if (serviceType === 'INT') {
    payload.clearance = {
      declared_currency: 'USD',
      declared_value: Number(process.env.WASLAH_INT_DECLARED_VALUE || 0) || 0,
    };
  }

  return payload;
}

export function buildDefaultPickupInfo(overrides = {}) {
  const defaults = getDefaultWaslahPickupInfo({}, new Date());

  return {
    type: 'pickup',
    pickup_date: overrides.pickup_date || defaults.pickup_date,
    pickup_time: overrides.pickup_time || defaults.pickup_time,
    pickup_vehicle: overrides.pickup_vehicle || defaults.pickup_vehicle,
  };
}

function getDubaiDate(now = new Date()) {
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMs + (4 * 3600000));
}

function formatPickupDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** UAE pickup defaults: van, afternoon-evening, next eligible day (skip Sunday; after 10:00 use next day). */
export function getDefaultWaslahPickupDate(now = new Date()) {
  const envDate = String(process.env.WASLAH_DEFAULT_PICKUP_DATE || '').trim();
  if (envDate) return envDate;

  const dubaiNow = getDubaiDate(now);
  const candidate = new Date(dubaiNow);
  const afterCutoff = dubaiNow.getHours() >= 10;
  const weekday = dubaiNow.getDay(); // 0 = Sunday, 6 = Saturday

  if (weekday === 6 && afterCutoff) {
    // Saturday after 10:00 AM → Monday (skip Sunday)
    candidate.setDate(candidate.getDate() + 2);
  } else if (afterCutoff) {
    candidate.setDate(candidate.getDate() + 1);
  }

  if (candidate.getDay() === 0) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return formatPickupDate(candidate);
}

export function getDefaultWaslahPickupInfo(overrides = {}, now = new Date()) {
  return {
    pickup_date: overrides.pickup_date || getDefaultWaslahPickupDate(now),
    pickup_time: overrides.pickup_time
      || String(process.env.WASLAH_DEFAULT_PICKUP_TIME || '').trim()
      || '14:00-21:00',
    pickup_vehicle: overrides.pickup_vehicle
      || String(process.env.WASLAH_DEFAULT_PICKUP_VEHICLE || '').trim()
      || 'van',
  };
}

export function buildWaslahStoreOrderUpdate(order = {}, {
  waslahOrderId,
  waslahServiceId,
  payload,
  trackingNumber,
  courierName,
  labelUrl,
  cartId,
  alreadyProcessed = false,
} = {}) {
  const shouldShip = order.status === 'ORDER_PLACED' || order.status === 'PROCESSING';
  const prevAwb = String(order.waslah?.trackingNumber || order.trackingId || '').trim();
  const nextAwb = String(trackingNumber || order.waslah?.trackingNumber || order.trackingId || '').trim();
  const previousWaslahOrderId = String(order.waslah?.orderId || '').trim();
  const nextWaslahOrderId = String(waslahOrderId || '').trim();
  const awbChanged = Boolean(prevAwb) && Boolean(nextAwb) && prevAwb !== nextAwb;
  const shipmentChanged = Boolean(
    (nextWaslahOrderId && nextWaslahOrderId !== previousWaslahOrderId)
    || awbChanged,
  );
  const shipmentConfirmed = Boolean(nextAwb) || Boolean(alreadyProcessed);

  return {
    trackingId: trackingNumber || order.trackingId || order.waslah?.trackingNumber || null,
    courier: courierName || order.courier || 'EMX',
    trackingUrl: buildEmxTrackingUrl(trackingNumber || order.trackingId || order.waslah?.trackingNumber) || order.trackingUrl || null,
    // Creating a draft Waslah order is not the same as shipping it. Advance the
    // store lifecycle only after Waslah confirms processing or returns an AWB.
    status: shouldShip && shipmentConfirmed ? 'SHIPPED' : order.status,
    waslah: {
      // Preserve automatic-shipping metadata, but never copy a previous
      // Cancelled checkpoint onto a newly created AWB.
      ...(order.waslah || {}),
      orderId: waslahOrderId,
      cartId: cartId || order.waslah?.cartId || null,
      serviceId: waslahServiceId || order.waslah?.serviceId || null,
      reference: payload?.reference || order.waslah?.reference || null,
      trackingNumber: trackingNumber || order.waslah?.trackingNumber || null,
      labelUrl: labelUrl || order.waslah?.labelUrl || null,
      // Waslah often returns a fresh label URL for the same AWB — do not clear "printed" for that.
      labelPrintedAt: awbChanged ? null : (order.waslah?.labelPrintedAt || null),
      processed: alreadyProcessed || Boolean(trackingNumber) || Boolean(order.waslah?.processed),
      processedAt: shipmentChanged
        ? new Date()
        : (order.waslah?.processedAt || ((alreadyProcessed || trackingNumber) ? new Date() : null)),
      unlinkedInWaslah: false,
      ...(shipmentChanged ? {
        carrierStatus: null,
        appStatus: null,
        currentStatus: null,
        currentSubtag: null,
        lastSubtag: null,
        lastSubtagMessage: null,
        lastLocation: null,
        lastEventAt: null,
        lastEventId: null,
        events: [],
        cancelledAt: null,
      } : {
        lastSubtag: order.waslah?.lastSubtag || null,
        lastSubtagMessage: order.waslah?.lastSubtagMessage || null,
      }),
    },
  };
}
