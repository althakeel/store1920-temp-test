import { buildEmxTrackingUrl, looksLikeEmxTrackingNumber, looksLikeWaslahPlatformTrackingNumber } from '@/lib/waslahTracking';
import {
  getDisplayOrderNumber,
  getOrderLineItemDisplayName,
  getOrderLineProduct,
} from '@/lib/orderDisplay';

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

function buildWarehouseParty() {
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

function buildCustomerParty(order = {}) {
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
  const customerEmail = resolveOrderEmail(order);

  return {
    contact_name: name,
    company_name: name,
    phone: normalizePhone(addr.phone || order.guestPhone, addr.phoneCode || order.alternatePhoneCode || '+971'),
    ...(customerEmail ? { email: customerEmail } : {}),
    street1: street || 'Address not provided',
    city: String(addr.city || 'Dubai').trim(),
    zipcode: String(addr.zip || addr.pincode || '').trim(),
    country: mapCountryCode(addr.country),
    is_residential: true,
  };
}

/** Reverse pickup follow-up: EMX collects from the customer and delivers to the warehouse. */
export function isWaslahReversePickupOrder(order = {}) {
  const kind = String(order?.fulfillmentKind || '').toUpperCase();
  if (kind === 'RETURN') return true;
  if (kind === 'REPLACEMENT') return false;
  if (order?.sourceOrderId) {
    return String(order?.status || '').toUpperCase() !== 'REPLACEMENT';
  }
  return false;
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
  const isReversePickup = String(payload?.order_type || '').toLowerCase() === 'return'
    || payload?.shipment?.is_reverse === true;

  if (!String(process.env.WASLAH_SENDER_ID || '').trim()) {
    issues.push('WASLAH_SENDER_ID is missing — add your Waslah sender address _id to .env');
  }
  if (!String(process.env.WASLAH_SENDER_PHONE || '').trim()) {
    issues.push('WASLAH_SENDER_PHONE is missing');
  }
  if (!String(process.env.WASLAH_SENDER_STREET || '').trim()) {
    issues.push('WASLAH_SENDER_STREET is missing');
  }
  if (isReversePickup) {
    if (!String(payload?.receiver?._id || '').trim()) {
      issues.push('Warehouse Waslah address _id is required as the return drop-off');
    }
    if (!String(payload?.sender?.phone || '').trim()) {
      issues.push('Customer phone is required for return pickup');
    }
    if (!String(payload?.sender?.street1 || '').trim() || payload.sender.street1 === 'Address not provided') {
      issues.push('Customer pickup address is required');
    }
  } else {
    if (!String(payload?.sender?._id || '').trim()) {
      issues.push('sender._id is required by Waslah');
    }
    if (!String(payload?.receiver?.phone || '').trim()) {
      issues.push('Customer phone is required in the shipping address');
    }
    if (!String(payload?.receiver?.street1 || '').trim() || payload.receiver.street1 === 'Address not provided') {
      issues.push('Complete customer shipping address is required');
    }
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
 * Merchant reference sent to Waslah/EMX — plain store order number (e.g. 618821).
 * Legacy shipments may still use S1920-{orderNo}; lookup accepts both.
 */
export function buildWaslahBaseReference(order = {}) {
  const orderNo = String(getDisplayOrderNumber(order) || order?.shortOrderNumber || '')
    .replace(/^#/, '')
    .replace(/^S1920-/i, '')
    .trim();
  const mongoId = String(order?._id || order?.id || '').trim();
  if (orderNo) return orderNo;
  if (mongoId) return mongoId;
  return '';
}

export function buildWaslahReshipReference(orderOrReference = {}) {
  const fromOrder = typeof orderOrReference === 'string'
    ? orderOrReference
    : buildWaslahBaseReference(orderOrReference);
  const base = String(fromOrder || '')
    .replace(/^#/, '')
    .replace(/^S1920-/i, '')
    .replace(/-R\d+$/i, '')
    .trim();
  if (!base) return `R${Date.now().toString().slice(-6)}`;
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

export function buildWaslahOrderPayload(order = {}, {
  reference,
  serviceId,
  originalWaslahOrderId = '',
  originalTrackingNumber = '',
  originalReference = '',
  returnReason = '',
  returnRequestNumber = '',
} = {}) {
  const orderRef = reference
    || buildWaslahCanonicalReference(order)
    || getDisplayOrderNumber(order)
    || `ORDER_${String(order._id || '').slice(-8)}`;
  const isReturnShipment = isWaslahReversePickupOrder(order);
  const paymentType = isReturnShipment ? 'PPD' : (isCodOrder(order) ? 'COD' : 'PPD');
  const codAmount = paymentType === 'COD' ? Number(order.total || 0) : 0;
  const items = buildShipmentItems(order);
  const shipmentDescription = buildShipmentDescription(items);
  const totalWeight = items.reduce(
    (sum, item) => sum + Number(item.weight?.value || 0) * Number(item.quantity || 1),
    0,
  ) || 0.5;
  const customer = buildCustomerParty(order);
  const warehouse = buildWarehouseParty();
  // Reverse pickup: customer sends the parcel back; warehouse receives it.
  const sender = isReturnShipment ? customer : warehouse;
  const receiver = isReturnShipment ? warehouse : customer;
  const routingCountry = isReturnShipment ? customer.country : receiver.country;
  const serviceType = routingCountry && routingCountry !== UAE_COUNTRY ? 'INT' : 'DOM';
  const resolvedServiceId = String(
    serviceId || process.env.WASLAH_SERVICE_ID || '',
  ).trim();
  const deliveryDuty = String(process.env.WASLAH_DELIVERY_DUTY || 'DDU').trim().toUpperCase() === 'DDP'
    ? 'DDP'
    : 'DDU';
  const outboundWaslahId = String(originalWaslahOrderId || '').trim();
  const outboundTracking = String(originalTrackingNumber || '').trim();
  const outboundReference = String(originalReference || buildWaslahBaseReference(order) || '').replace(/^#/, '').trim();
  const requestNumber = String(returnRequestNumber || '').trim();
  const reason = String(returnReason || (isReturnShipment ? 'Customer return' : '')).trim();
  const reasonObject = reason ? { name: reason, description: reason } : null;

  const payload = {
    order_type: isReturnShipment ? 'return' : 'delivery',
    reference: String(orderRef).replace(/^#/, ''),
    deleted: false,
    ...(resolvedServiceId ? { service_id: resolvedServiceId } : {}),
    shipment: {
      currency: 'AED',
      description: isReturnShipment
        ? `Return pickup: ${shipmentDescription}`
        : shipmentDescription,
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
    sender,
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

  if (isReturnShipment) {
    payload.return_reason = reasonObject || reason;
    payload.reason = reasonObject || reason;
    payload.shipment.return_reason = reason;
    if (requestNumber) {
      payload.request = requestNumber;
      payload.request_number = requestNumber;
      payload.return_request_number = requestNumber;
    }
    if (outboundWaslahId || outboundReference) {
      payload.original_order = {
        ...(outboundWaslahId ? { _id: outboundWaslahId } : {}),
        ...(outboundReference ? { reference: outboundReference } : {}),
      };
      if (outboundWaslahId) {
        payload.original_order_id = outboundWaslahId;
        payload.parent_order_id = outboundWaslahId;
        payload.related_order_id = outboundWaslahId;
        payload.return_of = outboundWaslahId;
      }
      if (outboundReference) {
        payload.original_reference = outboundReference;
      }
    }
    if (outboundTracking) {
      payload.original_tracking_number = outboundTracking;
    }
  }

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
  const type = String(overrides.type || defaults.type || 'pickup').toLowerCase() === 'dropoff'
    ? 'dropoff'
    : 'pickup';

  return {
    type,
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

function cloneDubaiDay(base, addDays = 0) {
  const next = new Date(base);
  next.setDate(next.getDate() + addDays);
  next.setHours(12, 0, 0, 0);
  return next;
}

/** UAE pickup defaults: motorcycle, working hours, today (skip Sunday). Same-day is allowed like EXS. */
export function getDefaultWaslahPickupDate(now = new Date()) {
  const envDate = String(process.env.WASLAH_DEFAULT_PICKUP_DATE || '').trim();
  if (envDate) return envDate;

  const dubaiNow = getDubaiDate(now);
  const candidate = new Date(dubaiNow);

  // Sunday is not a pickup day — use Monday.
  if (candidate.getDay() === 0) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return formatPickupDate(candidate);
}

/** Date cards for the EMX-style Schedule Pickup UI (next ~6 calendar days). */
export function getWaslahPickupDateOptions(now = new Date(), { days = 6 } = {}) {
  const dubaiNow = getDubaiDate(now);
  const todayKey = formatPickupDate(dubaiNow);
  const defaultKey = getDefaultWaslahPickupDate(now);
  const options = [];

  for (let offset = 0; options.length < days && offset < days + 4; offset += 1) {
    const day = cloneDubaiDay(dubaiNow, offset);
    const value = formatPickupDate(day);
    const weekday = day.getDay();
    const isSunday = weekday === 0;
    const isToday = value === todayKey;
    const disabled = isSunday;
    const weekdayLabel = day.toLocaleDateString('en-GB', { weekday: 'long' });
    const monthLabel = day.toLocaleDateString('en-GB', { month: 'long', day: 'numeric' });
    let hint = weekdayLabel;
    if (isToday) hint = 'Today';
    else if (offset === 1) hint = 'Tomorrow';
    options.push({
      value,
      label: monthLabel,
      hint,
      disabled,
      selectedByDefault: value === defaultKey && !disabled,
    });
  }

  return options;
}

export function getDefaultWaslahPickupInfo(overrides = {}, now = new Date()) {
  return {
    type: String(overrides.type || 'pickup').toLowerCase() === 'dropoff' ? 'dropoff' : 'pickup',
    pickup_date: overrides.pickup_date || getDefaultWaslahPickupDate(now),
    pickup_time: overrides.pickup_time
      || String(process.env.WASLAH_DEFAULT_PICKUP_TIME || '').trim()
      || '09:00-21:00',
    pickup_vehicle: overrides.pickup_vehicle
      || String(process.env.WASLAH_DEFAULT_PICKUP_VEHICLE || '').trim()
      || 'motorcycle',
  };
}

export function buildWaslahStoreOrderUpdate(order = {}, {
  waslahOrderId,
  waslahServiceId,
  payload,
  trackingNumber,
  emxTrackingNumber,
  waslahTrackingNumber,
  courierName,
  labelUrl,
  cartId,
  alreadyProcessed = false,
} = {}) {
  const shouldShip = order.status === 'ORDER_PLACED' || order.status === 'PROCESSING';
  const nextEmx = String(emxTrackingNumber || trackingNumber || '').trim();
  const nextWaslahPlatform = String(waslahTrackingNumber || '').trim();
  // Never promote Waslah's 62… platform number to the customer-facing tracking ID.
  const safeEmx = /^1000\d{9,12}$/.test(nextEmx) || (/^\d{10,16}$/.test(nextEmx) && !/^62\d+$/.test(nextEmx))
    ? nextEmx
    : '';
  const prevAwb = String(order.waslah?.trackingNumber || order.trackingId || '').trim();
  const nextAwb = String(safeEmx || order.waslah?.trackingNumber || order.trackingId || '').trim();
  const previousWaslahOrderId = String(order.waslah?.orderId || '').trim();
  const nextWaslahOrderId = String(waslahOrderId || '').trim();
  const awbEnriched = looksLikeWaslahPlatformTrackingNumber(prevAwb) && looksLikeEmxTrackingNumber(nextAwb);
  const awbChanged = Boolean(prevAwb) && Boolean(nextAwb) && prevAwb !== nextAwb && !awbEnriched;
  const shipmentChanged = Boolean(
    (nextWaslahOrderId && nextWaslahOrderId !== previousWaslahOrderId)
    || awbChanged,
  );
  const shipmentConfirmed = Boolean(nextAwb) || Boolean(alreadyProcessed) || Boolean(nextWaslahOrderId);

  return {
    trackingId: safeEmx || (order.trackingId && !/^62\d+$/.test(String(order.trackingId)) ? order.trackingId : null),
    courier: courierName || order.courier || 'EMX',
    trackingUrl: safeEmx
      ? (buildEmxTrackingUrl(safeEmx) || null)
      : (order.trackingUrl || null),
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
      trackingNumber: safeEmx || order.waslah?.trackingNumber || null,
      emxTrackingNumber: safeEmx || order.waslah?.emxTrackingNumber || null,
      waslahTrackingNumber: nextWaslahPlatform
        || order.waslah?.waslahTrackingNumber
        || (/^62\d+$/.test(nextEmx) ? nextEmx : null),
      labelUrl: labelUrl || order.waslah?.labelUrl || null,
      // Waslah often returns a fresh label URL for the same AWB — do not clear "printed" for that.
      labelPrintedAt: awbChanged ? null : (order.waslah?.labelPrintedAt || null),
      labelDownloadCount: awbChanged ? 0 : (Number(order.waslah?.labelDownloadCount) || 0),
      processed: alreadyProcessed || Boolean(safeEmx) || Boolean(order.waslah?.processed),
      processedAt: shipmentChanged
        ? new Date()
        : (order.waslah?.processedAt || ((alreadyProcessed || safeEmx) ? new Date() : null)),
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
