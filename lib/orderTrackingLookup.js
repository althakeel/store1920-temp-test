import Order from '@/models/Order';
import User from '@/models/User';
import { buildGuestOrderIdentityClauses, getPhoneVariants, normalizeEmail } from '@/lib/orderIdentity';
import { fetchNormalizedC3XTracking } from '@/lib/c3xpress';
import { fetchNormalizedDelhiveryTracking } from '@/lib/delhivery';
import {
  fetchNormalizedWaslahTracking,
  isWaslahCourierOrder,
  resolveWaslahOrderStatusTransition,
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

export async function findOrderByTrackingIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  let order = await populateOrderQuery(Order.findOne({ trackingId: value }));
  if (order) return order;

  order = await populateOrderQuery(Order.findOne({ 'waslah.trackingNumber': value }));
  if (order) return order;

  if (/^[a-fA-F0-9]{24}$/.test(value)) {
    order = await populateOrderQuery(Order.findOne({ 'waslah.orderId': value }));
    if (order) return order;

    order = await populateOrderQuery(Order.findById(value));
    if (order) return order;
  }

  if (/^\d{1,}$/.test(value)) {
    order = await populateOrderQuery(Order.findOne({ shortOrderNumber: Number(value) }));
    if (order) return order;
  }

  return null;
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

export async function enrichOrderWithLiveTracking(order) {
  if (!order) return order;

  const withNumber = await ensurePersistedShortOrderNumber(order);
  const enriched = { ...withNumber };
  const courier = String(enriched.courier || '').toLowerCase();
  const trackingId = enriched.trackingId || enriched.awb || enriched.airwayBillNo || enriched.waslah?.trackingNumber;

  if (trackingId && isWaslahCourierOrder(enriched)) {
    try {
      const normalized = await fetchNormalizedWaslahTracking(trackingId);
      if (normalized) {
        enriched.waslah = { ...(enriched.waslah || {}), ...normalized.waslah };
        enriched.trackingUrl = enriched.trackingUrl || normalized.trackingUrl;
        enriched.courier = enriched.courier || normalized.courier;
        enriched.trackingId = enriched.trackingId || normalized.trackingId;
        const nextOrderStatus = resolveWaslahOrderStatusTransition(
          normalized.waslah?.appStatus,
          enriched.status,
          { packed: enriched?.warehousePacking?.packed === true },
        );
        if (nextOrderStatus) enriched.status = nextOrderStatus;
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
