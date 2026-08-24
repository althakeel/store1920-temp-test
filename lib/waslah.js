/**
 * Waslah shipping API client (UAE domestic / EMX).
 *
 * Official flow (Seller API v1):
 *   1. POST /orders              — create shipment (service_id on order)
 *   2. POST /cart                — { orders: [order._id], pickup, pickup_info }
 *   3. POST /cart/pickup-checkout — { cart_id, payment_method: "credit_limit" }
 *   4. POST /orders/print-receipt — { ids: [order._id], withLabel: true }
 *   5. POST /orders/history       — { tracking_number } for tracking events
 *   6. POST /orders/cancel        — { ids: [order._id] }
 *
 * Env:
 *   WASLAH_API_BASE_URL  e.g. https://gateway-stg.waslah.ae/api/v1
 *   WASLAH_API_TOKEN     Bearer token
 *   WASLAH_SENDER_ID     Sender address _id from Waslah (required for create order)
 *   WASLAH_SENDER_EMAIL  Shipper email on labels (default support@store1920.com)
 */

import { extractWaslahPrintReceiptUrl } from './waslahReceipts';

function getBaseUrl() {
  return String(process.env.WASLAH_API_BASE_URL || 'https://gateway.waslah.ae/api/v1').replace(/\/$/, '');
}

export function getWaslahCreateOrderPath() {
  const path = String(process.env.WASLAH_CREATE_ORDER_PATH || '/orders').trim();
  return path.startsWith('/') ? path : `/${path}`;
}

export function isWaslahConfigured() {
  return Boolean(process.env.WASLAH_API_TOKEN);
}

export function isWaslahSenderConfigured() {
  return Boolean(String(process.env.WASLAH_SENDER_ID || '').trim());
}

export function isWaslahServiceConfigured() {
  return Boolean(String(process.env.WASLAH_SERVICE_ID || '').trim());
}

export function getWaslahServiceId() {
  return String(process.env.WASLAH_SERVICE_ID || '').trim();
}

export function getWaslahPreferredCourier() {
  return String(process.env.WASLAH_PREFERRED_COURIER || 'EMX').trim().toUpperCase();
}

export function filterWaslahServicesByCourier(services = []) {
  const preferredCourier = getWaslahPreferredCourier();
  const filtered = services.filter((service) => {
    const courierText = `${service.courier || ''} ${service.name || ''}`.toUpperCase();
    return courierText.includes(preferredCourier);
  });

  return filtered.length ? filtered : services;
}

export function getWaslahPublicConfig() {
  return {
    configured: isWaslahConfigured(),
    senderConfigured: isWaslahSenderConfigured(),
    serviceConfigured: isWaslahServiceConfigured(),
    preferredCourier: getWaslahPreferredCourier(),
    serviceId: getWaslahServiceId(),
    baseUrl: getBaseUrl(),
    createOrderPath: getWaslahCreateOrderPath(),
    createOrderUrl: `${getBaseUrl()}${getWaslahCreateOrderPath()}`,
  };
}

function normalizeWaslahApiToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

function describeWaslahToken(token = '') {
  const parts = String(token || '').split('.');
  if (parts.length < 2) {
    return { kind: 'opaque', expired: false, expIso: '' };
  }
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp)) return { kind: 'jwt', expired: false, expIso: '' };
    return {
      kind: 'jwt',
      expired: exp <= Math.floor(Date.now() / 1000),
      expIso: new Date(exp * 1000).toISOString(),
    };
  } catch {
    return { kind: 'jwt', expired: false, expIso: '' };
  }
}

function formatWaslahAuthError(status, message = '') {
  if (status !== 401 && status !== 403) return message;
  const text = String(message || '');
  // Waslah sometimes returns HTTP 401 for bad cancel payloads (missing ids),
  // which is not an expired-token problem.
  if (/ids or tracking ids missing|tracking.?ids? missing|ids? missing/i.test(text)) {
    return text;
  }
  return [
    text || 'Invalid / Expired token.',
    'Generate a new API token in ship.waslah.ae (Settings → API / Developers), set WASLAH_API_TOKEN in .env (token only, no Bearer prefix), then restart the Next.js server.',
  ].join(' ');
}

function formatWaslahError(data, status, rawText = '') {
  if (typeof data === 'string' && data.trim()) return data.trim();

  const parts = [];
  if (data && typeof data === 'object') {
    if (data.message) parts.push(String(data.message));
    if (data.error) {
      parts.push(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
    if (Array.isArray(data.errors)) {
      parts.push(...data.errors
        .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
        .filter((entry) => entry && entry !== '[]' && entry !== '{}'));
    } else if (data.errors && typeof data.errors === 'object') {
      for (const [key, value] of Object.entries(data.errors)) {
        const rendered = Array.isArray(value) ? value.join(', ') : String(value);
        if (!rendered) continue;
        parts.push(`${key}: ${rendered}`);
      }
    }
    if (data.details) {
      parts.push(typeof data.details === 'string' ? data.details : JSON.stringify(data.details));
    }
    const encoded = JSON.stringify(data);
    if (!parts.length && encoded && encoded !== '{}') {
      parts.push(encoded);
    }
  }

  const trimmed = String(rawText || '').trim();
  if (!parts.length && trimmed) parts.push(trimmed.slice(0, 500));
  if (!parts.length) parts.push(`HTTP ${status}`);
  return parts.join(' | ');
}

export async function waslahRequest(path, { method = 'GET', body, timeoutMs } = {}) {
  const token = normalizeWaslahApiToken(process.env.WASLAH_API_TOKEN);
  if (!token) {
    throw new Error('Waslah is not configured. Set WASLAH_API_TOKEN and WASLAH_API_BASE_URL.');
  }

  const tokenMeta = describeWaslahToken(token);
  if (tokenMeta.expired) {
    throw new Error(
      `Waslah API token expired${tokenMeta.expIso ? ` on ${tokenMeta.expIso}` : ''}. `
      + 'Generate a new token in ship.waslah.ae and update WASLAH_API_TOKEN, then restart the server.',
    );
  }

  const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const configuredTimeout = Number(timeoutMs || process.env.WASLAH_API_TIMEOUT_MS || 15000);
  const requestTimeout = Math.min(60000, Math.max(1000, Number.isFinite(configuredTimeout) ? configuredTimeout : 15000));
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(requestTimeout),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error(`Waslah request timed out after ${requestTimeout}ms`);
    }
    throw error;
  }

  const rawText = await res.text();
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText.slice(0, 500) };
    }
  }

  if (!res.ok) {
    const message = formatWaslahAuthError(
      res.status,
      formatWaslahError(data, res.status, rawText),
    );
    const error = new Error(`Waslah API ${method} ${path} failed (${res.status}): ${message}`);
    error.status = res.status;
    error.detail = data;
    error.url = url;
    throw error;
  }

  return data;
}

export function extractWaslahOrderId(response) {
  if (!response || typeof response !== 'object') return null;
  const candidates = [
    response._id,
    response.id,
    response.order_id,
    response.orderId,
    response.data?._id,
    response.data?.id,
    response.data?.order_id,
    response.data?.order?.id,
    response.data?.order?._id,
    response.order?._id,
    response.order?.id,
    response.result?._id,
    response.result?.id,
  ];
  for (const candidate of candidates) {
    const id = String(candidate || '').trim();
    if (id) return id;
  }
  return null;
}

export function isWaslahDuplicateReferenceError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('reference is already exist') || message.includes('reference already')) {
    return true;
  }

  const detailText = typeof error?.detail === 'string'
    ? error.detail
    : JSON.stringify(error?.detail || '');
  if (/reference.*already exist/i.test(detailText)) {
    return true;
  }

  const errorLists = [
    error?.detail?.errors,
    error?.detail?.data?.errors,
    error?.detail?.error?.errors,
  ].filter(Array.isArray);

  return errorLists.some((list) => list.some((entry) => (
    String(entry?.field || '').toLowerCase() === 'reference'
    && (
      String(entry?.type || '').toLowerCase() === 'unique'
      || String(entry?.message || '').toLowerCase().includes('already exist')
    )
  )));
}

function normalizeWaslahOrderList(data) {
  if (!data) return [];
  const unwrapped = unwrapWaslahOrder(data);
  if (unwrapped !== data && unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)) {
    if (unwrapped._id || unwrapped.id) return [unwrapped];
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.orders)) return data.orders;
  if (Array.isArray(data?.results)) return data.results;
  if (data?._id || data?.id) return [data];
  return [];
}

export function isWaslahObjectId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function buildWaslahReferenceLookupAttempts(reference) {
  const ref = String(reference || '').replace(/^#/, '').trim();
  if (!ref) return [];

  // Waslah cannot search by store order # on this tenant — skip /orders/find (expects Mongo _id).
  return [
    { method: 'GET', path: `/orders?reference=${encodeURIComponent(ref)}` },
    { method: 'GET', path: `/orders?search=${encodeURIComponent(ref)}` },
    { method: 'GET', path: `/orders/reference/${encodeURIComponent(ref)}` },
    { method: 'GET', path: `/orders?filter[reference]=${encodeURIComponent(ref)}` },
    { method: 'GET', path: `/orders?query=${encodeURIComponent(ref)}` },
    { method: 'POST', path: '/orders/search', body: { reference: ref } },
    { method: 'POST', path: '/orders/search', body: { search: ref } },
    { method: 'POST', path: '/orders/list', body: { reference: ref, per_page: 10 } },
    { method: 'POST', path: '/orders/list', body: { filters: { reference: ref } } },
    { method: 'POST', path: '/orders/query', body: { reference: ref } },
  ];
}

/** Try to find an existing Waslah order when create fails with duplicate reference. */
export async function findWaslahOrderByReference(reference) {
  const ref = String(reference || '').replace(/^#/, '').trim();
  if (!ref) return null;

  for (const attempt of buildWaslahReferenceLookupAttempts(ref)) {
    try {
      const data = await waslahRequest(attempt.path, {
        method: attempt.method,
        body: attempt.body,
      });
      const orders = normalizeWaslahOrderList(data);
      const exact = orders.find((entry) => String(entry?.reference || '').replace(/^#/, '') === ref);
      if (exact) return exact;
      if (orders.length === 1) return orders[0];
      const partial = orders.find((entry) => String(entry?.reference || '').replace(/^#/, '').includes(ref));
      if (partial) return partial;
    } catch (error) {
      // Waslah returns 404/400/500 when an endpoint does not support reference lookup.
      if (error?.status && ![404, 405, 400, 500].includes(error.status)) {
        throw error;
      }
    }
  }

  return null;
}

/** Try several order references (display number, fallback ref, etc.). */
export async function findWaslahOrderByReferences(references = []) {
  const expanded = [];
  for (const value of references) {
    const ref = String(value || '').replace(/^#/, '').trim();
    if (!ref) continue;
    expanded.push(ref);
    if (/^S1920-/i.test(ref)) {
      expanded.push(ref.replace(/^S1920-/i, ''));
    } else if (/^\d{5,}$/.test(ref)) {
      expanded.push(`S1920-${ref}`);
    }
  }

  const uniqueRefs = [...new Set(expanded)];

  for (const ref of uniqueRefs) {
    const order = await findWaslahOrderByReference(ref);
    const orderId = extractWaslahOrderId(order);
    if (orderId) {
      return {
        order,
        orderId,
        reference: String(order?.reference || ref).replace(/^#/, ''),
      };
    }
  }

  return null;
}

/** Link to an existing Waslah shipment by id and/or reference lookup. */
export async function resolveWaslahOrderLink({
  waslahOrderId = '',
  references = [],
} = {}) {
  const manualId = String(waslahOrderId || '').trim();
  if (manualId) {
    if (!isWaslahObjectId(manualId)) {
      const invalidIdError = new Error(
        `"${manualId}" is a store order reference, not a Waslah Order ID. Copy the 24-character ID from ship.waslah.ae (example: 6a4f6a237ff4643cd426e2bc).`,
      );
      invalidIdError.status = 400;
      invalidIdError.code = 'WASLAH_INVALID_ORDER_ID';
      throw invalidIdError;
    }

    try {
      const order = await getWaslahOrder(manualId);
      if (order) {
        return {
          orderId: manualId,
          reference: String(order.reference || '').replace(/^#/, ''),
          linkedExisting: true,
          order,
        };
      }
    } catch (error) {
      if (!error?.status || error.status !== 404) {
        throw error;
      }
    }
  }

  const found = await findWaslahOrderByReferences(references);
  if (found?.orderId) {
    return {
      orderId: found.orderId,
      reference: found.reference,
      linkedExisting: true,
      order: found.order,
    };
  }

  return null;
}

/** Stable alternate reference when the display order number is already used in Waslah. */
export function buildWaslahFallbackReference(baseReference, storeOrderId) {
  const base = String(baseReference || '').replace(/^#/, '').trim();
  const suffix = String(storeOrderId || '').slice(-6);
  if (!base || !suffix) return '';
  const fallback = `${base}-${suffix}`;
  return fallback === base ? `${base}-R1` : fallback;
}

/** Create a Waslah order. On a used reference, create again with a new unique reference. */
export async function createOrLinkWaslahOrder(payload, { fallbackReference } = {}) {
  const primaryReference = String(payload?.reference || '').replace(/^#/, '').trim();
  const baseReference = primaryReference.replace(/-R\d+$/i, '') || primaryReference;

  const attemptCreate = async (nextPayload, meta = {}) => {
    const created = await createWaslahOrder(nextPayload);
    const orderId = extractWaslahOrderId(created);
    if (!orderId) {
      const error = new Error('Waslah did not return an order id');
      error.detail = created;
      throw error;
    }
    return {
      waslahOrderId: orderId,
      reference: String(nextPayload?.reference || '').replace(/^#/, ''),
      linkedExisting: false,
      usedFallbackReference: Boolean(meta.usedFallbackReference),
      raw: created,
    };
  };

  const uniqueReferences = [
    primaryReference,
    String(fallbackReference || '').replace(/^#/, '').trim(),
    `${baseReference}-R${Date.now().toString().slice(-6)}`,
    `${baseReference}-R${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 90 + 10)}`,
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  let lastError = null;
  for (const [index, reference] of uniqueReferences.entries()) {
    try {
      return await attemptCreate(
        { ...payload, reference },
        { usedFallbackReference: index > 0 },
      );
    } catch (error) {
      lastError = error;
      if (!isWaslahDuplicateReferenceError(error)) throw error;
    }
  }

  const duplicateError = new Error(
    `Waslah already has a shipment for this order. Created a new reference but Waslah still rejected it. Cancel the old AWB in ship.waslah.ae, then click Ship with EMX again.`,
  );
  duplicateError.status = 409;
  duplicateError.code = 'WASLAH_DUPLICATE_REFERENCE';
  duplicateError.reference = primaryReference;
  duplicateError.detail = lastError?.detail || null;
  duplicateError.hint = 'Open ship.waslah.ae, cancel the old shipment for this order number if it is still active, then ship again from Store1920.';
  throw duplicateError;
}

/** Create a Waslah shipment order. Returns the created order document. */
export async function createWaslahOrder(payload) {
  return waslahRequest(getWaslahCreateOrderPath(), { method: 'POST', body: payload });
}

function isRetryableWaslahReversePathError(error) {
  const status = Number(error?.status || 0);
  return status === 404 || status === 405 || status === 400 || status === 422;
}

/**
 * Create a reverse/return shipment so it appears under Waslah → Returns.
 * Tries reverse-specific endpoints first, then POST /orders with order_type=return.
 */
export async function createWaslahReverseOrder(payload, {
  outboundWaslahOrderId = '',
  fallbackReference = '',
} = {}) {
  const outboundId = String(outboundWaslahOrderId || payload?.original_order_id || '').trim();
  const primaryReference = String(payload?.reference || '').replace(/^#/, '').trim();
  const baseReference = primaryReference.replace(/-R\d+$/i, '') || primaryReference;
  const uniqueReferences = [
    primaryReference,
    String(fallbackReference || '').replace(/^#/, '').trim(),
    `${baseReference}-RP${Date.now().toString().slice(-5)}`,
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  let lastError = null;

  const tryCreate = async (path, body) => {
    const created = await waslahRequest(path, { method: 'POST', body });
    const orderId = extractWaslahOrderId(created);
    if (!orderId) {
      const error = new Error('Waslah did not return a reverse order id');
      error.detail = created;
      throw error;
    }
    return {
      waslahOrderId: orderId,
      reference: String(body?.reference || '').replace(/^#/, ''),
      linkedExisting: false,
      usedFallbackReference: false,
      path,
      raw: created,
    };
  };

  if (outboundId) {
    const linkedBodies = uniqueReferences.map((reference) => ({
      ...payload,
      order_type: 'return',
      reference,
    }));

    const reversePaths = [
      `/orders/${outboundId}/return`,
      `/orders/${outboundId}/reverse`,
      '/returns',
      '/reverse-orders',
      '/orders/return',
    ];

    for (const path of reversePaths) {
      for (const body of linkedBodies) {
        try {
          return await tryCreate(path, {
            ...body,
            order_id: outboundId,
            orderId: outboundId,
          });
        } catch (error) {
          lastError = error;
          if (isWaslahDuplicateReferenceError(error)) continue;
          if (isRetryableWaslahReversePathError(error)) break;
          if (error?.status === 401 || error?.status === 403) throw error;
        }
      }
    }
  }

  for (const [index, reference] of uniqueReferences.entries()) {
    try {
      const body = {
        ...payload,
        order_type: 'return',
        reference,
      };
      const created = await tryCreate(getWaslahCreateOrderPath(), body);
      return {
        ...created,
        usedFallbackReference: index > 0,
      };
    } catch (error) {
      lastError = error;
      if (!isWaslahDuplicateReferenceError(error) && !isRetryableWaslahReversePathError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Waslah did not accept the reverse pickup order');
}

export function unwrapWaslahOrder(response) {
  if (!response || typeof response !== 'object') return response;
  return response.data || response.order || response;
}

export function isWaslahAlreadyProcessedError(error) {
  const parts = [
    error?.message,
    error?.detail?.message,
    typeof error?.detail === 'string' ? error.detail : '',
    error?.detail ? JSON.stringify(error.detail) : '',
  ];
  const message = parts.filter(Boolean).join(' ').toLowerCase();
  return message.includes('already been processed')
    || message.includes('cannot be added to cart')
    || message.includes('already in cart');
}

export function isWaslahCheckoutCompleteError(error) {
  const parts = [
    error?.message,
    error?.detail?.message,
    error?.detail ? JSON.stringify(error.detail) : '',
  ];
  const message = parts.filter(Boolean).join(' ').toLowerCase();
  return message.includes('already checked out')
    || message.includes('already processed')
    || message.includes('cart is empty')
    || message.includes('no items');
}

/** True when Waslah already generated a label / AWB for this order. */
export function isWaslahOrderProcessed(waslahOrder = {}) {
  const order = unwrapWaslahOrder(waslahOrder);
  if (!order || typeof order !== 'object') return false;
  if (order.shipped === true) return true;
  if (String(order.tracking_number || order.trackingNumber || '').trim()) return true;
  const subtag = String(order.tracking_status?.subtag || '').toLowerCase();
  return Boolean(subtag && !['pending', 'draft', ''].includes(subtag));
}

/** Fetch an existing Waslah order (tracking, status, etc.). */
export async function getWaslahOrder(waslahOrderId) {
  const id = String(waslahOrderId || '').trim();
  if (!id) return null;
  const response = await waslahRequest(`/orders/${id}`);
  return unwrapWaslahOrder(response);
}

export async function patchWaslahOrder(waslahOrderId, body = {}) {
  const id = String(waslahOrderId || '').trim();
  if (!id) return null;
  return waslahRequest(`/orders/${id}`, { method: 'PATCH', body });
}

export function extractWaslahShipmentDetails({
  waslahOrder = null,
  cartResult = null,
  waslahOrderId = '',
} = {}) {
  const order = unwrapWaslahOrder(waslahOrder);
  const lineItems = cartResult?.line_items || order?.line_items || [];
  const lineItem = lineItems.find((entry) => String(entry.order_id) === String(waslahOrderId))
    || lineItems[0]
    || null;

  const candidates = [
    lineItem?.courier_tracking_number,
    lineItem?.carrier_tracking_number,
    lineItem?.emx_tracking_number,
    lineItem?.courier_awb,
    lineItem?.carrier_awb,
    lineItem?.label_tracking_number,
    lineItem?.tracking_number,
    lineItem?.trackingNumber,
    lineItem?.awb,
    lineItem?.awb_number,
    lineItem?.airway_bill,
    lineItem?.airwayBillNumber,
    order?.courier_tracking_number,
    order?.carrier_tracking_number,
    order?.emx_tracking_number,
    order?.courier_awb,
    order?.carrier_awb,
    order?.tracking_number,
    order?.trackingNumber,
    order?.awb,
    order?.awb_number,
    order?.airway_bill,
    order?.airwayBillNumber,
    order?.shipment?.courier_tracking_number,
    order?.shipment?.carrier_tracking_number,
    order?.shipment?.tracking_number,
    order?.shipment?.trackingNumber,
    order?.shipment?.awb,
    order?.tracking?.tracking_number,
    order?.tracking?.number,
    order?.label?.tracking_number,
    order?.label?.awb,
  ];

  // Deep-scan nested objects for an EMX barcode (1000…) if top-level fields are Waslah-only.
  const deepEmx = findNestedEmxTrackingNumber(order) || findNestedEmxTrackingNumber(lineItem);

  let emxTrackingNumber = deepEmx || null;
  let waslahTrackingNumber = null;

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value || /^[a-fA-F0-9]{24}$/.test(value) || /^S1920-/i.test(value)) continue;
    if (/^1000\d{9,12}$/.test(value)) {
      emxTrackingNumber = emxTrackingNumber || value;
      continue;
    }
    if (/^62\d{10,14}$/.test(value)) {
      waslahTrackingNumber = waslahTrackingNumber || value;
      continue;
    }
    if (!emxTrackingNumber && /^\d{10,16}$/.test(value) && !/^62\d+$/.test(value)) {
      emxTrackingNumber = value;
    }
  }

  // Public / store tracking must be the EMX barcode, never the Waslah first-label number.
  const trackingNumber = emxTrackingNumber || null;

  const courierName = lineItem?.service?.courier?.display_name
    || lineItem?.service?.courier?.name
    || order?.shipment?.service?.courier?.display_name
    || order?.shipment?.service?.courier?.name
    || order?.courier?.display_name
    || order?.courier?.name
    || 'EMX';

  const cartId = cartResult?._id || cartResult?.cart_id || order?.cart_id || null;

  return {
    trackingNumber,
    emxTrackingNumber,
    waslahTrackingNumber,
    courierName,
    cartId,
    lineItem,
  };
}

function findNestedEmxTrackingNumber(node, depth = 0) {
  if (!node || depth > 5) return null;
  if (typeof node === 'string' || typeof node === 'number') {
    const value = String(node).trim();
    return /^1000\d{9,12}$/.test(value) ? value : null;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findNestedEmxTrackingNumber(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findNestedEmxTrackingNumber(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function normalizeWaslahServiceList(data) {
  const list = Array.isArray(data)
    ? data
    : (Array.isArray(data?.data) ? data.data
      : (Array.isArray(data?.services) ? data.services
        : (Array.isArray(data?.rates) ? data.rates
          : (Array.isArray(data?.results) ? data.results : []))));

  return list.map((entry) => ({
    id: String(entry?._id || entry?.id || entry?.service_id || '').trim(),
    name: entry?.name || entry?.service?.name || entry?.service_type?.name || entry?.display_name || '',
    serviceType: entry?.service_type?.code || entry?.service_type?.name || entry?.service_type || entry?.serviceType || entry?.type || '',
    courier: entry?.courier?.display_name || entry?.courier?.name || entry?.courier_name || '',
    price: entry?.total ?? entry?.price ?? entry?.subtotal ?? null,
    currency: entry?.currency || 'AED',
    raw: entry,
  })).filter((entry) => entry.id);
}

function getPreferredWaslahCourier() {
  return getWaslahPreferredCourier();
}

function pickPreferredWaslahService(services = [], serviceType = 'DOM') {
  const preferredCourier = getPreferredWaslahCourier();
  const normalizedType = String(serviceType || 'DOM').toUpperCase();

  const emxOnly = services.filter((service) => (
    String(service.courier || '').toUpperCase().includes(preferredCourier)
    || /emx/i.test(`${service.name} ${service.courier}`)
  ));
  const pool = emxOnly.length ? emxOnly : services;

  return pool.find((service) => (
    String(service.serviceType || '').toUpperCase() === normalizedType
  )) || pool.find((service) => (
    /domestic|premium/i.test(`${service.name} ${service.courier}`)
  )) || pool[0];
}

function getWaslahServiceIdFromPick(services = [], serviceType = 'DOM') {
  return pickPreferredWaslahService(services, serviceType)?.id || '';
}

const SERVICE_LIST_PATHS = [
  '/courier-services',
  '/services',
  '/shipping-services',
  '/company/services',
];

const ORDER_RATE_ATTEMPTS = [
  { method: 'GET', path: (orderId) => `/orders/${orderId}/rates` },
  { method: 'GET', path: (orderId) => `/orders/${orderId}/services` },
  { method: 'POST', path: () => '/orders/rates', body: (orderId, payload) => ({ order_id: orderId, ...(payload || {}) }) },
  { method: 'POST', path: () => '/rates', body: (orderId, payload) => ({ order_id: orderId, ...(payload || {}) }) },
];

const SELECT_SERVICE_ATTEMPTS = [
  { method: 'PATCH', path: (orderId) => `/orders/${orderId}`, body: (serviceId) => ({ service_id: serviceId }) },
  { method: 'PATCH', path: (orderId) => `/orders/${orderId}`, body: (serviceId) => ({ service: { _id: serviceId } }) },
  { method: 'PATCH', path: (orderId) => `/orders/${orderId}`, body: (serviceId) => ({ shipment: { service_id: serviceId } }) },
  { method: 'PATCH', path: (orderId) => `/orders/${orderId}`, body: (serviceId) => ({ service: { id: serviceId } }) },
  { method: 'POST', path: (orderId) => `/orders/${orderId}/select-service`, body: (serviceId) => ({ service_id: serviceId }) },
  { method: 'POST', path: (orderId) => `/orders/${orderId}/service`, body: (serviceId) => ({ service_id: serviceId }) },
];

/** List available Waslah courier services (for WASLAH_SERVICE_ID setup). */
export async function fetchWaslahServices() {
  let lastError = null;

  for (const path of SERVICE_LIST_PATHS) {
    try {
      const data = await waslahRequest(path);
      const services = filterWaslahServicesByCourier(normalizeWaslahServiceList(data));
      if (services.length) {
        return { path, services };
      }
    } catch (error) {
      lastError = error;
      if (error?.status && error.status !== 404) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  return { path: null, services: [] };
}

/** Fetch rate/service options for a specific Waslah order. */
export async function fetchWaslahOrderRates(orderId, createPayload = null) {
  let lastError = null;

  for (const attempt of ORDER_RATE_ATTEMPTS) {
    try {
      const data = await waslahRequest(attempt.path(orderId), {
        method: attempt.method,
        body: attempt.body ? attempt.body(orderId, createPayload) : undefined,
      });
      const services = filterWaslahServicesByCourier(normalizeWaslahServiceList(data));
      if (services.length) {
        return { path: attempt.path(orderId), services };
      }
    } catch (error) {
      lastError = error;
      if (error?.status && ![404, 405, 400].includes(error.status)) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  return { path: null, services: [] };
}

async function assignWaslahOrderService(orderId, serviceId) {
  let lastError = null;

  for (const attempt of SELECT_SERVICE_ATTEMPTS) {
    try {
      const data = await waslahRequest(attempt.path(orderId), {
        method: attempt.method,
        body: attempt.body(serviceId),
      });
      return { path: attempt.path(orderId), data };
    } catch (error) {
      lastError = error;
      if (error?.status && ![404, 405, 400].includes(error.status)) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

export function extractWaslahOrderServiceId(waslahOrder = {}) {
  return String(
    waslahOrder?.service_id
    || waslahOrder?.service?._id
    || waslahOrder?.service?.id
    || waslahOrder?.shipment?.service_id
    || waslahOrder?.shipment?.service?._id
    || waslahOrder?.shipment?.service?.id
    || '',
  ).trim();
}

function isWaslahSelectServiceError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('select a service') || message.includes('service is required');
}

/**
 * Waslah cart requires each order to have a courier service selected.
 * Resolve from env, order rates, or the global services list.
 */
export async function resolveWaslahServiceId({
  orderId,
  createPayload = null,
  preferredServiceId = '',
  serviceType = 'DOM',
} = {}) {
  const explicit = String(preferredServiceId || getWaslahServiceId() || '').trim();
  if (explicit) return explicit;

  if (orderId) {
    const orderRates = await fetchWaslahOrderRates(orderId, createPayload);
    const fromOrder = getWaslahServiceIdFromPick(orderRates.services, serviceType);
    if (fromOrder) return fromOrder;
  }

  const catalog = await fetchWaslahServices();
  const fromCatalog = getWaslahServiceIdFromPick(catalog.services, serviceType);
  if (fromCatalog) return fromCatalog;

  throw new Error(
    'No Waslah courier service is selected. Set WASLAH_SERVICE_ID in .env or use "Fetch services from Waslah" in Store Orders.',
  );
}

/** Ensure a Waslah order has a service before adding it to pickup cart. */
export async function ensureWaslahOrderService(orderId, {
  createPayload = null,
  preferredServiceId = '',
  serviceType = 'DOM',
} = {}) {
  const serviceId = await resolveWaslahServiceId({
    orderId,
    createPayload,
    preferredServiceId,
    serviceType,
  });

  if (!serviceId) {
    throw new Error(
      'No Waslah courier service is selected. Set WASLAH_SERVICE_ID in .env or use "Fetch EMX service ID" in Store Orders.',
    );
  }

  try {
    await assignWaslahOrderService(orderId, serviceId);
  } catch (error) {
    if (!error?.status || error.status >= 500) {
      throw error;
    }
  }

  try {
    const orderDetail = await getWaslahOrder(orderId);
    const assignedServiceId = extractWaslahOrderServiceId(orderDetail);
    if (assignedServiceId) {
      return assignedServiceId;
    }
  } catch (error) {
    console.warn('[waslah] Could not verify service on order:', error?.message || error);
  }

  return serviceId;
}

/** Add order(s) to pickup cart and schedule pickup (Waslah Seller API v1). */
export async function addOrdersToWaslahCart({ orderIds, pickupInfo, serviceId = '' }) {
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!ids.length) {
    throw new Error('At least one Waslah order id is required for cart');
  }

  const pickupType = String(pickupInfo?.type || 'pickup').toLowerCase() === 'dropoff'
    ? 'dropoff'
    : 'pickup';
  const pickup = {
    type: pickupType,
    pickup_date: pickupInfo?.pickup_date,
    pickup_time: pickupInfo?.pickup_time,
    pickup_vehicle: pickupInfo?.pickup_vehicle || 'motorcycle',
  };

  // Official API: POST /cart — service is taken from the order, not the cart body.
  const officialBody = {
    orders: ids,
    pickup: pickupType === 'pickup',
    pickup_info: pickup,
  };

  try {
    return await waslahRequest('/cart', {
      method: 'POST',
      body: officialBody,
    });
  } catch (error) {
    if (isWaslahAlreadyProcessedError(error)) {
      throw error;
    }
    if (!isWaslahSelectServiceError(error)) {
      throw error;
    }
  }

  // Fallback when order was created without a courier service selected.
  const resolvedServiceId = String(serviceId || getWaslahServiceId() || '').trim();
  if (!resolvedServiceId) {
    throw new Error(
      'Waslah cart requires a courier service on the order. Set WASLAH_SERVICE_ID in .env, restart the server, then ship again.',
    );
  }

  const fallbackAttempts = [
    {
      orders: ids,
      pickup: pickupType === 'pickup',
      pickup_info: pickup,
      service_id: resolvedServiceId,
    },
    {
      line_items: ids.map((id) => ({ order_id: id, service_id: resolvedServiceId })),
      pickup: pickupType === 'pickup',
      pickup_info: pickup,
    },
  ];

  let lastError = null;
  for (const body of fallbackAttempts) {
    try {
      return await waslahRequest('/cart', {
        method: 'POST',
        body,
      });
    } catch (fallbackError) {
      lastError = fallbackError;
      if (isWaslahAlreadyProcessedError(fallbackError)) {
        throw fallbackError;
      }
    }
  }

  const cartError = new Error(
    `Waslah cart rejected the order (service ${resolvedServiceId}). `
    + 'Ensure WASLAH_SERVICE_ID is set, restart the server, then try Ship with EMX again.',
  );
  cartError.status = lastError?.status || 400;
  cartError.detail = lastError?.detail || null;
  cartError.serviceId = resolvedServiceId;
  throw cartError;
}

/** Confirm pickup checkout (charges credit limit). */
export async function waslahPickupCheckout(cartId, paymentMethod = 'credit_limit') {
  return waslahRequest('/cart/pickup-checkout', {
    method: 'POST',
    body: {
      cart_id: cartId,
      payment_method: paymentMethod,
    },
  });
}

function isWaslahAlreadyCancelledError(error) {
  const text = `${error?.message || ''} ${JSON.stringify(error?.detail || {})}`.toLowerCase();
  return text.includes('already cancelled')
    || text.includes('already canceled')
    || text.includes('has been cancelled')
    || text.includes('has been canceled');
}

/** Waslah sometimes returns HTTP 500 with "Order not found" for missing / deleted ids. */
function isWaslahOrderNotFoundError(error) {
  if (error?.status === 404) return true;
  const text = `${error?.message || ''} ${JSON.stringify(error?.detail || {})}`.toLowerCase();
  return text.includes('order not found')
    || text.includes('orders not found')
    || text.includes('shipment not found')
    || text.includes('no order found');
}

function isWaslahCancelRetryableError(error) {
  if (!error?.status) return true;
  if (isWaslahOrderNotFoundError(error) || isWaslahAlreadyCancelledError(error)) return true;
  const message = String(error?.message || '');
  const missingIdsPayload = /ids or tracking ids missing|tracking.?ids? missing/i.test(message);
  return [400, 404, 405, 422].includes(error.status)
    || (error.status === 401 && missingIdsPayload)
    // PUT/PATCH delete fallbacks can 500 with "Order not found" — keep trying other shapes.
    || (error.status >= 500 && isWaslahOrderNotFoundError(error));
}

export function isWaslahOrderCancelled(waslahOrder = {}) {
  const order = unwrapWaslahOrder(waslahOrder);
  if (!order || typeof order !== 'object') return false;
  if (order.deleted === true || order.cancelled === true || order.canceled === true) return true;
  const text = [
    order?.tracking_status?.subtag,
    order?.tracking_status?.subtag_message,
    order?.tracking_status?.message,
    order?.status,
    order?.current_status,
    order?.subtag,
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('cancel');
}

/** Cancel a Waslah shipment (Seller API) and confirm it is no longer active. */
export async function cancelWaslahOrder(waslahOrderId, { trackingNumbers = [] } = {}) {
  const id = String(waslahOrderId || '').trim();
  if (!id) {
    throw new Error('Waslah order id is required to cancel the shipment.');
  }

  const trackingIds = [...new Set(
    (Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];

  // Stale / already-deleted Waslah ids: treat as already cancelled so Store1920 can unlink + reship.
  try {
    const existing = await getWaslahOrder(id);
    if (existing && isWaslahOrderCancelled(existing)) {
      return { ok: true, alreadyCancelled: true, path: `/orders/${id}`, data: existing };
    }
  } catch (error) {
    if (isWaslahOrderNotFoundError(error)) {
      return {
        ok: true,
        alreadyCancelled: true,
        path: `/orders/${id}`,
        data: null,
        reason: 'waslah_order_not_found',
      };
    }
  }

  const attempts = [
    // Waslah cancel docs expect ids and/or tracking_ids.
    ...(trackingIds.length
      ? [
        { method: 'POST', path: '/orders/cancel', body: { ids: [id], tracking_ids: trackingIds } },
        { method: 'POST', path: '/orders/cancel', body: { tracking_ids: trackingIds } },
        { method: 'POST', path: '/orders/cancel', body: { trackingIds } },
        { method: 'POST', path: '/orders/cancel', body: { tracking_numbers: trackingIds } },
        { method: 'POST', path: '/orders/cancel', body: { trackingNumbers: trackingIds } },
      ]
      : []),
    { method: 'POST', path: '/orders/cancel', body: { ids: [id] } },
    { method: 'POST', path: '/orders/cancel', body: { ids: [id], tracking_ids: [] } },
    { method: 'POST', path: '/orders/cancel', body: { order_ids: [id] } },
    { method: 'POST', path: '/orders/cancel', body: { orders: [id] } },
    { method: 'POST', path: '/orders/cancel', body: { orderIds: [id] } },
    { method: 'POST', path: '/orders/cancel', body: { id } },
    { method: 'POST', path: '/orders/cancel', body: { order_id: id } },
    { method: 'POST', path: `/orders/${id}/cancel`, body: {} },
    { method: 'PATCH', path: `/orders/${id}`, body: { deleted: true } },
    { method: 'DELETE', path: `/orders/${id}` },
  ];

  let lastError = null;
  let accepted = null;
  let sawNotFound = false;
  for (const attempt of attempts) {
    try {
      const data = await waslahRequest(attempt.path, {
        method: attempt.method,
        body: attempt.body,
      });
      accepted = { ok: true, alreadyCancelled: false, path: attempt.path, data };
      break;
    } catch (error) {
      lastError = error;
      if (isWaslahAlreadyCancelledError(error)) {
        accepted = { ok: true, alreadyCancelled: true, path: attempt.path, data: error?.detail || null };
        break;
      }
      if (isWaslahOrderNotFoundError(error)) {
        sawNotFound = true;
      }
      if (!isWaslahCancelRetryableError(error)) {
        throw error;
      }
    }
  }

  let remaining = null;
  try {
    remaining = await getWaslahOrder(id);
  } catch (error) {
    if (isWaslahOrderNotFoundError(error)) {
      return accepted || {
        ok: true,
        alreadyCancelled: true,
        path: `/orders/${id}`,
        data: null,
        reason: 'waslah_order_not_found',
      };
    }
  }

  if (remaining && !isWaslahOrderCancelled(remaining)) {
    const error = new Error(
      'Waslah did not cancel this shipment. Cancel it in ship.waslah.ae, then ship again from Store1920.',
    );
    error.status = 409;
    error.detail = remaining;
    throw error;
  }

  if (accepted) return accepted;
  if (sawNotFound || (remaining && isWaslahOrderCancelled(remaining))) {
    return {
      ok: true,
      alreadyCancelled: true,
      path: `/orders/${id}`,
      data: remaining,
      reason: sawNotFound ? 'waslah_order_not_found' : 'waslah_already_cancelled',
    };
  }
  if (lastError) throw lastError;
  throw new Error('Waslah did not accept the cancel request.');
}

/** Print shipping label / receipt PDF. Prefer carrier (EMX) label only. */
export async function printWaslahReceipt(orderIds, { withLabel = true, carrierLabelOnly = true } = {}) {
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  const attempts = carrierLabelOnly
    ? [
      { ids, withLabel: true, withReceipt: false },
      { ids, withLabel: true, receipt: false },
      { ids, withLabel: true, labelOnly: true },
      { ids, withLabel: true, carrierLabel: true },
      { ids, withLabel: true },
    ]
    : [{ ids, withLabel }];

  let lastResult = null;
  let lastError = null;
  for (const body of attempts) {
    try {
      const result = await waslahRequest('/orders/print-receipt', {
        method: 'POST',
        body,
      });
      lastResult = result;
      const url = extractWaslahPrintReceiptUrl(result, { preferCarrierLabel: true });
      if (url) {
        return { ...(typeof result === 'object' && result ? result : {}), url };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResult) return lastResult;
  if (lastError) throw lastError;
  return null;
}

export { extractWaslahPrintReceiptUrl } from './waslahReceipts';

/** Fetch tracking history for an AWB (POST /orders/history). */
export async function fetchWaslahTrackingHistory(trackingNumber) {
  const tracking = String(trackingNumber || '').trim();
  if (!tracking) {
    throw new Error('tracking_number is required');
  }
  return waslahRequest('/orders/history', {
    method: 'POST',
    body: { tracking_number: tracking },
    timeoutMs: Number(process.env.WASLAH_TRACKING_TIMEOUT_MS || 8000),
  });
}

const SENDER_ADDRESS_PATHS = [
  '/addresses',
  '/address-book',
  '/company/addresses',
  '/senders',
];

function normalizeWaslahAddressList(data) {
  const list = Array.isArray(data)
    ? data
    : (Array.isArray(data?.data) ? data.data
      : (Array.isArray(data?.addresses) ? data.addresses
        : (Array.isArray(data?.results) ? data.results : [])));

  return list.map((entry) => ({
    id: String(entry?._id || entry?.id || '').trim(),
    contactName: entry?.contact_name || entry?.contactName || '',
    companyName: entry?.company_name || entry?.companyName || '',
    phone: entry?.phone || '',
    street1: entry?.street1 || entry?.street || '',
    city: entry?.city || '',
    country: entry?.country || '',
    isDefault: Boolean(entry?.is_default || entry?.default),
  })).filter((entry) => entry.id);
}

/** Try common Waslah endpoints to list saved sender addresses (for WASLAH_SENDER_ID). */
export async function fetchWaslahSenderAddresses() {
  let lastError = null;

  for (const path of SENDER_ADDRESS_PATHS) {
    try {
      const data = await waslahRequest(path);
      const addresses = normalizeWaslahAddressList(data);
      if (addresses.length) {
        return { path, addresses };
      }
    } catch (error) {
      lastError = error;
      if (error?.status && error.status !== 404) {
        throw error;
      }
    }
  }

  if (lastError) throw lastError;
  return { path: null, addresses: [] };
}
