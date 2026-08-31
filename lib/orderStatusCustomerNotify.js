import Order from '@/models/Order';
import { sendOrderStatusEmail } from '@/lib/email';
import { appendOrderCommunicationLog } from '@/lib/orderCommunicationLog';

/** Statuses that get a customer email when the store order status changes. */
const CUSTOMER_STATUS_EMAILS = new Set([
  'PROCESSING',
  'CONFIRMED',
  'PICKUP_REQUESTED',
  'WAITING_FOR_PICKUP',
  'PICKED_UP',
  'WAREHOUSE_RECEIVED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURN_REQUESTED',
  'RTO',
  'RETURN',
  'RETURNED',
  'REPLACEMENT',
  'CANCELLED',
  'REFUNDED',
  'SHIPMENT_CANCELLED',
]);

/** Clear these so a reship can email shipped / OFD / delivered again. */
export const RESET_SHIPMENT_STATUS_EMAIL_KEYS = [
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'PICKED_UP',
  'DELIVERED',
  'RTO',
  'RETURN',
  'RETURNED',
];

export function buildStatusEmailUnset(keys = RESET_SHIPMENT_STATUS_EMAIL_KEYS) {
  return Object.fromEntries(keys.map((key) => [`statusEmailSentAt.${key}`, '']));
}

async function hydrateOrderForStatusEmail(order) {
  const plain = typeof order?.toObject === 'function' ? order.toObject() : { ...(order || {}) };
  if (plain.userId && typeof plain.userId === 'object' && plain.userId.email) {
    return plain;
  }
  const uid = typeof plain.userId === 'object'
    ? String(plain.userId._id || '').trim()
    : String(plain.userId || '').trim();
  if (!uid || plain.isGuest) return plain;
  try {
    const User = (await import('@/models/User')).default;
    const user = await User.findById(uid).select('email name').lean();
    if (user?.email || user?.name) {
      plain.userId = {
        _id: uid,
        email: user.email || '',
        name: user.name || '',
      };
    }
  } catch {
    // sendOrderStatusEmail still checks guest / shipping email
  }
  return plain;
}

/**
 * Email the customer once per store status (packed, shipped, OFD, delivered, etc.).
 * Safe to call from webhooks / live sync — skips unchanged and already-emailed statuses.
 */
export async function notifyCustomerOfOrderStatusChange(order, status, {
  previousStatus = '',
  source = 'status_change',
  force = false,
  actor = {},
} = {}) {
  if (!order?._id) return { sent: false, reason: 'missing_order' };

  const next = String(status || '').toUpperCase();
  const prev = String(previousStatus || order.status || '').toUpperCase();
  if (!next) return { sent: false, reason: 'missing_status' };
  if (!force && prev && prev === next) return { sent: false, reason: 'unchanged' };
  if (!CUSTOMER_STATUS_EMAILS.has(next)) return { sent: false, reason: 'not_emailed_status' };

  const baseOrder = typeof order?.toObject === 'function' ? order.toObject() : { ...(order || {}) };
  const latest = await Order.findById(order._id)
    .select('status statusEmailSentAt whatsappSentAt guestEmail guestName guestPhone shippingAddress userId isGuest shortOrderNumber trackingId trackingUrl courier warehousePacking waslah orderItems items')
    .populate({ path: 'orderItems.productId', select: 'name slug images image sku brand price AED' })
    .lean();

  const alreadyEmailed = Boolean(latest?.statusEmailSentAt?.[next]);
  const needsWhatsApp = next === 'SHIPPED' || next === 'DELIVERED';
  const alreadyWhatsApped = next === 'SHIPPED'
    ? Boolean(latest?.whatsappSentAt?.orderShipped)
    : next === 'DELIVERED'
      ? Boolean(latest?.whatsappSentAt?.orderDelivered)
      : false;

  if (!force && alreadyEmailed && (!needsWhatsApp || alreadyWhatsApped)) {
    return { sent: false, reason: 'already_sent', status: next };
  }

  const orderForEmail = await hydrateOrderForStatusEmail({
    ...baseOrder,
    ...(latest || {}),
    orderItems: latest?.orderItems?.length ? latest.orderItems : baseOrder.orderItems,
    items: latest?.items?.length ? latest.items : baseOrder.items,
    status: next,
  });

  const actorUid = String(actor.uid || actor.userId || '').trim() || null;
  const actorName = String(actor.name || actor.email || source || 'System').trim();
  let recipient = '';

  try {
    let emailFailed = false;
    if (!alreadyEmailed || force) {
      const emailResult = await sendOrderStatusEmail(orderForEmail, next);
      recipient = String(emailResult?.email || '').trim();
      emailFailed = emailResult?.sent === false || emailResult?.reason === 'no_email';

      if (!emailFailed) {
        await Order.findByIdAndUpdate(order._id, {
          $set: { [`statusEmailSentAt.${next}`]: new Date() },
        });
      }

      await appendOrderCommunicationLog(order._id, {
        channel: 'email',
        template: `status_${next}`,
        label: `Status update email (${next})`,
        status: emailFailed ? 'failed' : 'sent',
        recipient: recipient || null,
        sentByUid: actorUid,
        sentByName: actorName,
        details: emailFailed
          ? (emailResult?.reason === 'no_email' ? 'No customer email on this order' : 'Email not sent')
          : `Customer notified: ${next} (${source})`,
      }).catch(() => {});
    }

    if (needsWhatsApp && (force || !alreadyWhatsApped)) {
      try {
        const { sendOrderShippedWhatsApp, sendOrderDeliveredWhatsApp } = await import(
          '@/lib/whatsapp/orderNotifications'
        );
        const whatsappResult = next === 'SHIPPED'
          ? await sendOrderShippedWhatsApp(orderForEmail)
          : await sendOrderDeliveredWhatsApp(orderForEmail);
        const whatsappOk = Boolean(whatsappResult?.success) || Boolean(whatsappResult?.alreadySent);
        await appendOrderCommunicationLog(order._id, {
          channel: 'whatsapp',
          template: next === 'SHIPPED' ? 'order_shipped' : 'order_delivered',
          label: `${next === 'SHIPPED' ? 'Shipped' : 'Delivered'} update (WhatsApp)`,
          status: whatsappOk ? 'sent' : (whatsappResult?.skipped ? 'skipped' : 'failed'),
          recipient: orderForEmail.guestPhone || orderForEmail.shippingAddress?.phone || '',
          sentByUid: actorUid,
          sentByName: actorName,
          details: whatsappOk
            ? ''
            : (whatsappResult?.reason || whatsappResult?.error || ''),
        }).catch(() => {});
      } catch (whatsappError) {
        console.error('[notifyCustomerOfOrderStatusChange] WhatsApp failed', {
          orderId: String(order._id),
          status: next,
          error: whatsappError?.message || whatsappError,
        });
      }
    }

    return {
      sent: !emailFailed || alreadyEmailed,
      reason: emailFailed && !alreadyEmailed ? 'not_sent' : 'sent',
      email: recipient || null,
      status: next,
    };
  } catch (error) {
    const message = error?.message || 'Email failed';
    console.error('[notifyCustomerOfOrderStatusChange]', {
      orderId: String(order._id),
      status: next,
      error: message,
    });
    await appendOrderCommunicationLog(order._id, {
      channel: 'email',
      template: `status_${next}`,
      label: `Status update email (${next})`,
      status: 'failed',
      recipient: recipient || null,
      sentByUid: actorUid,
      sentByName: actorName,
      details: message,
    }).catch(() => {});
    return { sent: false, reason: 'error', error: message, status: next };
  }
}
