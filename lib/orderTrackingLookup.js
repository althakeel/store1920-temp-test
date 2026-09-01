import Order from '@/models/Order';
import User from '@/models/User';
import { buildGuestOrderIdentityClauses, getPhoneVariants, normalizeEmail } from '@/lib/orderIdentity';
import { fetchNormalizedC3XTracking } from '@/lib/c3xpress';
import { fetchNormalizedDelhiveryTracking } from '@/lib/delhivery';
import {
  fetchNormalizedWaslahTracking,
  getEmxTrackingNumber,
  getReturnEmxTrackingNumber,
  isWaslahCourierOrder,
  resolveTrackingLookupTarget,
  resolveWaslahOrderStatusTransition,
  buildEmxTrackingUrl,
} from '@/lib/waslahTracking';
import { ensurePersistedShortOrderNumber } from '@/lib/orderDisplayServer';
import { extractTrackingReferenceFromInput } from '@/lib/orderDisplay';

function looksLikePhone(value) {
  const trimmed = String(value || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits || digits.length < 9) return false;
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) return false;
  if (/^\d{1,7}$/.test(trimmed)) return false;
  return digits.length <= 15;
}

export function parseTrackingIdentifiers({ phone, email, awb, orderId } = {}) {
  let rawPhone = String(phone || '').trim();
  let rawEmail = normalizeEmail(email);
  const explicitAwb = extractTrackingReferenceFromInput(awb);
  let identifier = explicitAwb || extractTrackingReferenceFromInput(orderId);

  // An explicit `awb` query parameter must remain a tracking identifier. Numeric
  // EMX AWBs can otherwise look exactly like international phone numbers.
  if (!rawPhone && !rawEmail && identifier && !explicitAwb) {
    if (identifier.includes('@')) {
      rawEmail = normalizeEmail(identifier);
      identifier = '';
    } else if (looksLikePhone(identifier)) {
      rawPhone = identifier;
      identifier = '';
    }
  }

  return {
    phone: rawPhone,
    email: rawEmail,
    identifier,
  };
}

export async function buildOrderTrackingClauses({ email, phone } = {}) {
  const clauses = buildGuestOrderIdentityClauses({ email, phone });

  if (email) {
    const users = await User.find({ email: normalizeEmail(email) }).select('_id').lean();
    for (const user of users) {
      if (user?._id) clauses.push({ userId: String(user._id) });
    }
  }

  if (phone) {
    const variants = getPhoneVariants(phone);
    if (variants.length) {
      const users = await User.find({ phone: { $in: variants } }).select('_id').lean();
      for (const user of users) {
        if (user?._id) clauses.push({ userId: String(user._id) });
      }
    }
  }

  return clauses;
}

async function populateOrderQuery(query) {
  return query
    .populate({ path: 'orderItems.productId', model: 'Product' })
    .sort({ createdAt: -1 })
    .lean();
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTrackingFieldClauses(value) {
  const text = String(value || '').trim();
  if (!text) return [];

  const digits = text.replace(/\D/g, '');
  const clauses = [
    { 'waslah.emxTrackingNumber': text },
    { trackingId: text },
    { 'waslah.trackingNumber': text },
    { 'waslah.waslahTrackingNumber': text },
    { 'waslahReturn.trackingNumber': text },
    { 'waslahReturn.reference': text },
    { 'waslahReturn.orderId': text },
    { awb: text },
    { airwayBillNo: text },
    { 'waslah.reference': text },
    { 'waslah.reference': text.replace(/^S1920-/i, '') },
    { 'waslah.orderId': text },
  ];

  // Digits-only match when scanners add spaces / GS1 wrappers.
  if (digits && digits !== text) {
    clauses.push(
      { 'waslah.emxTrackingNumber': digits },
      { trackingId: digits },
      { 'waslah.trackingNumber': digits },
      { 'waslah.waslahTrackingNumber': digits },
      { 'waslahReturn.trackingNumber': digits },
      { 'waslahReturn.reference': digits },
      { awb: digits },
      { airwayBillNo: digits },
    );
  }

  if (digits.length >= 10) {
    const exactDigits = new RegExp(`^${escapeRegex(digits)}$`);
    clauses.push(
      { 'waslah.emxTrackingNumber': exactDigits },
      { trackingId: exactDigits },
      { 'waslah.trackingNumber': exactDigits },
      { 'waslahReturn.trackingNumber': exactDigits },
      { awb: exactDigits },
      { airwayBillNo: exactDigits },
    );
  }

  return clauses;
}

export async function findOrderByTrackingIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;

  const candidates = normalizeWarehouseScanCandidates(raw);

  const retMatch = raw.toUpperCase().match(/RET-1920-\d+/);
  if (retMatch) {
    try {
      const ReturnRequest = (await import('@/models/ReturnRequest')).default;
      const caseDoc = await ReturnRequest.findOne({ returnNumber: retMatch[0] }).lean();
      if (caseDoc?.returnPickupOrderId) {
        const pickup = await populateOrderQuery(Order.findById(caseDoc.returnPickupOrderId));
        if (pickup) return pickup;
      }
      if (caseDoc?.orderId) {
        const source = await populateOrderQuery(Order.findById(caseDoc.orderId));
        if (source) return source;
      }
    } catch (error) {
      console.error('[tracking] return id lookup failed', error?.message || error);
    }
  }

  // Prefer exact EMX barcode / store tracking fields first (public track-order page).
  for (const value of candidates) {
    const trackingClauses = buildTrackingFieldClauses(value);
    let order = trackingClauses.length
      ? await populateOrderQuery(Order.findOne({ $or: trackingClauses }))
      : null;
    if (order) return order;

    if (/^[a-fA-F0-9]{24}$/.test(value)) {
      order = await populateOrderQuery(Order.findOne({ 'waslah.orderId': value }));
      if (order) return order;

      order = await populateOrderQuery(Order.findById(value));
      if (order) return order;
    }

    if (/^\d{1,}$/.test(value)) {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        order = await populateOrderQuery(Order.findOne({
          $or: [
            { shortOrderNumber: asNumber },
            { shortOrderNumber: value },
          ],
        }));
        if (order) return order;
      }
    }

    // Reference forms: S1920-618752
    if (/^S1920-\d+/i.test(value)) {
      const orderNo = String(value).replace(/^S1920-/i, '');
      order = await populateOrderQuery(Order.findOne({
        $or: [
          { 'waslah.reference': value },
          { 'waslah.reference': { $regex: `^${escapeRegex(value)}$`, $options: 'i' } },
          { 'waslah.reference': orderNo },
          { shortOrderNumber: Number(orderNo) },
          { shortOrderNumber: orderNo },
        ],
      }));
      if (order) return order;
    }
    // Return pickup reference: 618957-RP
    if (/-RP$/i.test(value)) {
      order = await populateOrderQuery(Order.findOne({
        $or: [
          { 'waslahReturn.reference': value },
          { 'waslahReturn.reference': { $regex: `^${escapeRegex(value)}$`, $options: 'i' } },
        ],
      }));
      if (order) return order;
    }
  }

  return null;
}

/**
 * Normalize scanner payloads from EMX Door-to-Door labels.
 * Handles spaces, Code128 GS1 prefixes, and accidental URL/text wrappers.
 */
export function normalizeWarehouseScanCandidates(raw = '') {
  const input = String(raw || '').trim();
  if (!input) return [];

  const out = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (!out.includes(text)) out.push(text);
  };

  push(input);

  // Extract from pasted EMX track URL.
  const urlAwb = input.match(/trackingnumber=([0-9]{10,16})/i)?.[1];
  if (urlAwb) push(urlAwb);

  const queryAwb = input.match(/[?&]awb=([0-9]{10,16})/i)?.[1];
  if (queryAwb) push(queryAwb);

  // Keep only digits for barcode payloads (Door To Door = 1000…).
  const digits = input.replace(/\D/g, '');
  if (digits) {
    push(digits);
    // Some scanners prepend GS1 AI (00/01) or leading zeros.
    if (/^0+1000\d+$/.test(digits)) push(digits.replace(/^0+/, ''));
    if (/^(00|01)(1000\d{9,12})$/.test(digits)) push(digits.replace(/^(00|01)/, ''));
    const embeddedEmx = digits.match(/1000\d{6,12}/)?.[0];
    if (embeddedEmx) push(embeddedEmx);
  }

  // Reference on the label: S1920-618752
  const ref = input.match(/S1920-\d+/i)?.[0];
  if (ref) push(ref.toUpperCase());

  const returnId = input.toUpperCase().match(/RET-1920-\d+/)?.[0];
  if (returnId) push(returnId);

  // Order number alone from reference
  const orderNo = input.match(/S1920-(\d+)/i)?.[1];
  if (orderNo) push(orderNo);

  return out;
}

export async function findOrdersByContact({ email, phone, limit = 10 } = {}) {
  const clauses = await buildOrderTrackingClauses({ email, phone });
  if (!clauses.length) return [];

  return populateOrderQuery(
    Order.find({ $or: clauses }).limit(Math.max(1, Math.min(limit, 20)))
  );
}

export function ensureShortOrderNumber(order) {
  return order;
}

export async function enrichOrderWithLiveTracking(order, { lookupIdentifier = '' } = {}) {
  if (!order) return order;

  const withNumber = await ensurePersistedShortOrderNumber(order);
  const enriched = { ...withNumber };
  const courier = String(enriched.courier || '').toLowerCase();
  const lookupTarget = resolveTrackingLookupTarget(enriched, lookupIdentifier);
  const trackingKind = lookupTarget.kind === 'return' ? 'return' : 'outbound';
  enriched.trackingKind = trackingKind;

  const outboundAwb = getEmxTrackingNumber(enriched)
    || enriched.trackingId
    || enriched.awb
    || enriched.airwayBillNo
    || enriched.waslah?.trackingNumber
    || enriched.waslah?.emxTrackingNumber
    || '';
  const returnAwb = getReturnEmxTrackingNumber(enriched)
    || String(enriched.waslahReturn?.trackingNumber || '').trim();
  const trackingId = trackingKind === 'return'
    ? (lookupTarget.awb || returnAwb)
    : (lookupTarget.awb || outboundAwb);

  enriched.linkedOriginalTrackingNumber = String(
    enriched.waslahReturn?.originalTrackingNumber || outboundAwb || '',
  ).trim() || null;
  enriched.linkedReturnTrackingNumber = returnAwb || null;

  if (trackingId && isWaslahCourierOrder(enriched)) {
    try {
      const normalized = await fetchNormalizedWaslahTracking(trackingId);
      if (normalized) {
        if (trackingKind === 'return') {
          enriched.waslahReturn = {
            ...(enriched.waslahReturn || {}),
            trackingNumber: normalized.trackingId || returnAwb || enriched.waslahReturn?.trackingNumber,
            liveEvents: normalized.waslah?.events || [],
            liveCurrentStatus: normalized.waslah?.currentStatus || null,
            liveLastSubtagMessage: normalized.waslah?.lastSubtagMessage || null,
          };
          enriched.trackingUrl = buildEmxTrackingUrl(trackingId) || normalized.trackingUrl;
          enriched.trackingId = normalized.trackingId || trackingId;
          enriched.courier = enriched.courier || normalized.courier || 'EMX';
          enriched.waslah = {
            ...(enriched.waslah || {}),
            ...(normalized.waslah || {}),
            events: normalized.waslah?.events || [],
          };
        } else {
          enriched.waslah = { ...(enriched.waslah || {}), ...normalized.waslah };
          enriched.trackingUrl = enriched.trackingUrl || normalized.trackingUrl;
          enriched.courier = enriched.courier || normalized.courier;
          const emxLive = getEmxTrackingNumber({
            ...enriched,
            trackingId: normalized.trackingId,
            waslah: { ...(enriched.waslah || {}), ...(normalized.waslah || {}) },
          });
          if (emxLive) {
            enriched.trackingId = emxLive;
            enriched.waslah = {
              ...(enriched.waslah || {}),
              trackingNumber: emxLive,
              emxTrackingNumber: emxLive,
            };
          } else {
            enriched.trackingId = enriched.trackingId || normalized.trackingId;
          }
          const nextOrderStatus = resolveWaslahOrderStatusTransition(
            normalized.waslah?.appStatus,
            enriched.status,
            { packed: enriched?.warehousePacking?.packed === true },
          );
          if (nextOrderStatus) enriched.status = nextOrderStatus;
        }
      }
    } catch (error) {
      console.error('Waslah live tracking fetch failed:', error?.message || error);
    }
  }

  if (trackingId && courier.includes('delhivery')) {
    try {
      const normalized = await fetchNormalizedDelhiveryTracking(trackingId);
      if (normalized) {
        enriched.delhivery = normalized.delhivery;
        enriched.trackingUrl = enriched.trackingUrl || normalized.trackingUrl;
        enriched.courier = enriched.courier || normalized.courier;
        enriched.trackingId = enriched.trackingId || normalized.trackingId;
        if (normalized.delhivery?.current_status) {
          const statusText = normalized.delhivery.current_status.toLowerCase();
          if (statusText.includes('delivered')) enriched.status = 'DELIVERED';
          else if (statusText.includes('out for delivery')) enriched.status = 'OUT_FOR_DELIVERY';
          else if (statusText.includes('picked')) enriched.status = 'PICKED_UP';
          else if (statusText.includes('transit') || statusText.includes('dispatched')) enriched.status = 'SHIPPED';
        }
      }
    } catch (error) {
      console.error('Delhivery live tracking fetch failed:', error?.message || error);
    }
  }

  if (trackingId && courier.includes('c3xpress')) {
    try {
      const normalized = await fetchNormalizedC3XTracking(trackingId);
      if (normalized) {
        enriched.c3x = normalized.c3x;
        enriched.trackingUrl = enriched.trackingUrl || normalized.trackingUrl;
        enriched.courier = enriched.courier || normalized.courier;
        enriched.trackingId = enriched.trackingId || normalized.trackingId;
        if (normalized.c3x?.appStatus) {
          enriched.status = normalized.c3x.appStatus;
        }
      }
    } catch (error) {
      console.error('Live tracking fetch failed:', error?.message || error);
    }
  }

  return ensureShortOrderNumber(enriched);
}
