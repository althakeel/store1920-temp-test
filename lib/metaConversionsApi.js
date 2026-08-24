import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import {
  buildMetaPurchaseItems,
  getMetaOrderEventId,
} from '@/lib/metaPurchase';
import { isConfirmedPaidOrder } from '@/lib/orderConfirmationPolicy';
import { shouldRecordPurchaseOnCreate } from '@/lib/serverCustomerTracking';
import { shouldSendServerMetaPurchaseOnCreate } from '@/lib/metaPurchasePolicy';

import { META_PIXEL_ID } from '@/lib/metaPixelConfig';

const ACCESS_TOKEN =
  process.env.META_CAPI_ACCESS_TOKEN
  || process.env.META_ACCESS_TOKEN
  || '';

function sha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizePhoneForHash(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits || null;
}

export async function sendPurchaseEvent({
  orderId,
  value,
  currency = 'AED',
  items = [],
  order = null,
  email,
  phone,
  clientIp,
  userAgent,
  fbc,
  fbp,
  eventSourceUrl,
} = {}) {
  if (!ACCESS_TOKEN) {
    return { skipped: true, reason: 'Meta CAPI access token not configured' };
  }

  const eventId = getMetaOrderEventId(orderId);
  if (!eventId) {
    return { skipped: true, reason: 'Missing orderId' };
  }

  const contents = buildMetaPurchaseItems(items, order);
  const userData = {};

  const hashedEmail = sha256(email);
  if (hashedEmail) userData.em = [hashedEmail];

  const hashedPhone = sha256(normalizePhoneForHash(phone));
  if (hashedPhone) userData.ph = [hashedPhone];

  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: eventSourceUrl || process.env.NEXT_PUBLIC_APP_URL || undefined,
        user_data: userData,
        custom_data: {
          value: Number(value || 0),
          currency,
          order_id: eventId,
          content_type: 'product',
          content_ids: contents.map((entry) => entry.id),
          contents,
          num_items: contents.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
        },
      },
    ],
  };

  const response = await fetch(
    `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || response.statusText || 'Meta CAPI request failed';
    throw new Error(message);
  }

  return {
    success: true,
    eventId,
    eventsReceived: data?.events_received ?? null,
    raw: data,
  };
}

async function claimMetaPurchaseSend(orderId) {
  await connectDB();
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, metaPurchaseSentAt: { $in: [null, undefined] } },
    { $set: { metaPurchaseSentAt: new Date() } },
    { new: false },
  ).select('_id');

  return Boolean(claimed);
}

async function releaseMetaPurchaseSend(orderId) {
  await connectDB();
  await Order.findByIdAndUpdate(orderId, { $unset: { metaPurchaseSentAt: '' } });
}

export async function sendMetaPurchaseFromOrder(order, options = {}) {
  if (!order?._id) {
    return { skipped: true, reason: 'missing_order' };
  }

  const paymentMethod = options.paymentMethod || order.paymentMethod;
  if (!shouldRecordPurchaseOnCreate(order, paymentMethod)) {
    return { skipped: true, reason: 'deferred_payment' };
  }

  if (!shouldSendServerMetaPurchaseOnCreate(order, paymentMethod)) {
    return { skipped: true, reason: 'browser_purchase_channel' };
  }

  if (!isConfirmedPaidOrder(order)) {
    return { skipped: true, reason: 'not_confirmed_paid' };
  }

  const orderId = String(order._id);
  if (order.metaPurchaseSentAt) {
    return { skipped: true, reason: 'already_sent' };
  }

  const claimed = await claimMetaPurchaseSend(orderId);
  if (!claimed) {
    return { skipped: true, reason: 'already_sent' };
  }

  const trackingContext = order.trackingContext || options.trackingContext || {};
  const email =
    options.email
    || order.guestEmail
    || order.shippingAddress?.email
    || null;
  const phone =
    options.phone
    || order.guestPhone
    || order.shippingAddress?.phone
    || null;

  try {
    const result = await sendPurchaseEvent({
      orderId: getMetaOrderEventId(order._id),
      value: order.total,
      currency: options.currency || 'AED',
      items: order.orderItems || [],
      order: options.order || order,
      email,
      phone,
      clientIp: options.clientIp || null,
      userAgent: options.userAgent || null,
      fbc: trackingContext.fbc || options.fbc || null,
      fbp: trackingContext.fbp || options.fbp || null,
      eventSourceUrl: trackingContext.eventSourceUrl || options.eventSourceUrl || null,
    });

    if (result?.skipped) {
      await releaseMetaPurchaseSend(orderId);
      return result;
    }

    if (!result?.success) {
      await releaseMetaPurchaseSend(orderId);
    }

    return result;
  } catch (error) {
    await releaseMetaPurchaseSend(orderId);
    console.error('[meta] sendPurchaseEvent failed for order', order._id, error);
    return { success: false, error: error.message };
  }
}
