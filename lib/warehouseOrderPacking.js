import Order from '@/models/Order';
import { findOrderByTrackingIdentifier } from '@/lib/orderTrackingLookup';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import { appendOrderCommunicationLog } from '@/lib/orderCommunicationLog';
import { sendOrderStatusEmail } from '@/lib/email';

export const WAREHOUSE_PACKED_STATUS = 'WAITING_FOR_PICKUP';

const BLOCKED_PACK_STATUSES = new Set([
  'CANCELLED',
  'DELIVERED',
  'RETURNED',
  'RETURN',
  'RTO',
  'RETURN_INITIATED',
  'RETURN_APPROVED',
  'RETURN_REQUESTED',
]);

export function isOrderWarehousePacked(order = {}) {
  return order?.warehousePacking?.packed === true;
}

export function formatWarehousePacking(order = {}) {
  const packing = order?.warehousePacking || {};
  if (!packing.packed) {
    return {
      packed: false,
      packedAt: null,
      packedByUid: null,
      packedByName: null,
      packedByEmail: null,
      previousStatus: null,
      notes: null,
      emailSentAt: null,
    };
  }
  return {
    packed: true,
    packedAt: packing.packedAt || null,
    packedByUid: packing.packedByUid || null,
    packedByName: packing.packedByName || null,
    packedByEmail: packing.packedByEmail || null,
    previousStatus: packing.previousStatus || null,
    notes: packing.notes || null,
    emailSentAt: packing.emailSentAt || null,
  };
}

function serializePackedOrder(order) {
  if (!order) return null;
  const plain = typeof order.toObject === 'function' ? order.toObject() : order;
  return {
    ...plain,
    warehousePacking: formatWarehousePacking(plain),
  };
}

async function resolvePackTargetOrder({ storeId, orderId, q }) {
  const id = String(orderId || '').trim();
  const query = String(q || '').trim();

  if (id) {
    const byId = await Order.findOne({
      _id: id,
      storeId: String(storeId),
      ...ACTIVE_RECORD_FILTER,
    }).exec();
    if (byId) return byId;
  }

  if (query) {
    const found = await findOrderByTrackingIdentifier(query);
    if (
      found
      && !found.deletedAt
      && String(found.storeId) === String(storeId)
    ) {
      return Order.findById(found._id).exec();
    }
  }

  return null;
}

/** Build a plain order snapshot with user email/name for status emails (do not mutate mongoose doc). */
async function buildOrderForStatusEmail(order) {
  const plain = typeof order.toObject === 'function'
    ? order.toObject()
    : { ...(order || {}) };

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
    // leave plain as-is; sendOrderStatusEmail still checks shippingAddress / guestEmail
  }
  return plain;
}

async function sendPackedWaitingForPickupEmail(order, actor = {}, { resend = false } = {}) {
  const packedByUid = String(actor.uid || actor.userId || '').trim() || null;
  const packedByName = String(actor.name || actor.email || 'Warehouse staff').trim();

  if (!resend && order.warehousePacking?.emailSentAt) {
    return {
      emailSent: false,
      emailError: null,
      emailSkipped: true,
      recipient: null,
    };
  }

  const orderForEmail = await buildOrderForStatusEmail(order);
  orderForEmail.warehousePacking = {
    ...(orderForEmail.warehousePacking || {}),
    packed: true,
    packedAt: order.warehousePacking?.packedAt || new Date(),
  };

  let emailSent = false;
  let emailError = null;
  let recipient = '';

  try {
    const emailResult = await sendOrderStatusEmail(orderForEmail, WAREHOUSE_PACKED_STATUS);
    recipient = String(
      emailResult?.email
      || orderForEmail.guestEmail
      || orderForEmail.shippingAddress?.email
      || (typeof orderForEmail.userId === 'object' ? orderForEmail.userId.email : '')
      || '',
    ).trim();

    // Prefer the address the mailer actually resolved (includes User / Firebase / Address)
    if (emailResult?.reason === 'no_email' || emailResult?.sent === false) {
      emailError = 'No customer email on this order';
      console.error('[packStoreOrder] packed email skipped — no customer email', {
        orderId: String(order._id),
        shortOrderNumber: order.shortOrderNumber,
      });
      await appendOrderCommunicationLog(order._id, {
        channel: 'email',
        template: 'status_WAITING_FOR_PICKUP',
        label: 'Packed — waiting for pickup email',
        status: 'failed',
        recipient: recipient || null,
        sentByUid: packedByUid,
        sentByName: packedByName,
        details: emailError,
      }).catch(() => {});
    } else {
      emailSent = true;
      if (order.warehousePacking) {
        order.warehousePacking.emailSentAt = new Date();
        await order.save();
      } else {
        await Order.findByIdAndUpdate(order._id, {
          $set: { 'warehousePacking.emailSentAt': new Date() },
        });
      }
      await Order.findByIdAndUpdate(order._id, {
        $set: { 'statusEmailSentAt.WAITING_FOR_PICKUP': new Date() },
      }).catch(() => {});
      await appendOrderCommunicationLog(order._id, {
        channel: 'email',
        template: 'status_WAITING_FOR_PICKUP',
        label: 'Packed — waiting for pickup email',
        status: 'sent',
        recipient: recipient || null,
        sentByUid: packedByUid,
        sentByName: packedByName,
        details: 'Customer notified: order packed and waiting for pickup',
      });
    }
  } catch (err) {
    emailError = err?.message || 'Email failed';
    console.error('[packStoreOrder] packed email failed', {
      orderId: String(order._id),
      error: emailError,
    });
    await appendOrderCommunicationLog(order._id, {
      channel: 'email',
      template: 'status_WAITING_FOR_PICKUP',
      label: 'Packed — waiting for pickup email',
      status: 'failed',
      recipient: recipient || null,
      sentByUid: packedByUid,
      sentByName: packedByName,
      details: emailError,
    }).catch(() => {});
  }

  return { emailSent, emailError, emailSkipped: false, recipient: recipient || null };
}

/**
 * Mark an order packed for warehouse / Packed button.
 * Sets status to WAITING_FOR_PICKUP ("Awaiting Pickup") and emails the customer.
 */
export async function packStoreOrder({
  storeId,
  orderId = '',
  q = '',
  notes = '',
  actor = {},
  force = false,
  resendEmail = false,
} = {}) {
  if (!storeId) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const order = await resolvePackTargetOrder({ storeId, orderId, q });
  if (!order) {
    return { ok: false, status: 404, error: 'Order not found' };
  }

  // Already packed: still allow (re)sending the customer email
  if (isOrderWarehousePacked(order) && !force) {
    const shouldResend = resendEmail || !order.warehousePacking?.emailSentAt;
    let emailSent = false;
    let emailError = null;
    if (shouldResend) {
      if (resendEmail && order.warehousePacking) {
        order.warehousePacking.emailSentAt = null;
      }
      const emailOutcome = await sendPackedWaitingForPickupEmail(order, actor, {
        resend: true,
      });
      emailSent = emailOutcome.emailSent;
      emailError = emailOutcome.emailError;
    }
    return {
      ok: true,
      alreadyPacked: true,
      statusChanged: false,
      emailSent,
      emailError,
      order: serializePackedOrder(order),
      warehousePacking: formatWarehousePacking(order),
      message: emailSent
        ? 'Order already packed — packed email sent to customer'
        : (emailError
          ? `Order already packed — email not sent: ${emailError}`
          : 'Order is already packed'),
    };
  }

  const previousStatus = String(order.status || '').toUpperCase();
  if (BLOCKED_PACK_STATUSES.has(previousStatus)) {
    return {
      ok: false,
      status: 400,
      error: `Cannot pack an order with status ${previousStatus}`,
      order: serializePackedOrder(order),
    };
  }

  const packedAt = new Date();
  const packedByUid = String(actor.uid || actor.userId || '').trim() || null;
  const packedByName = String(actor.name || actor.email || 'Warehouse staff').trim();
  const packedByEmail = String(actor.email || '').trim() || null;
  const noteText = String(notes || '').trim() || null;

  order.warehousePacking = {
    ...(order.warehousePacking?.toObject?.() || order.warehousePacking || {}),
    packed: true,
    packedAt,
    packedByUid,
    packedByName,
    packedByEmail,
    previousStatus: previousStatus || null,
    notes: noteText,
    // Allow force/resendEmail to clear a stale "sent" flag from older buggy packs
    emailSentAt: (force || resendEmail) ? null : (order.warehousePacking?.emailSentAt || null),
  };

  const statusChanged = previousStatus !== WAREHOUSE_PACKED_STATUS;
  if (statusChanged) {
    order.status = WAREHOUSE_PACKED_STATUS;
  }

  await order.save();

  const emailOutcome = await sendPackedWaitingForPickupEmail(order, actor, {
    resend: force || resendEmail || !order.warehousePacking?.emailSentAt,
  });

  return {
    ok: true,
    alreadyPacked: false,
    statusChanged,
    previousStatus,
    status: order.status,
    emailSent: emailOutcome.emailSent,
    emailError: emailOutcome.emailError,
    order: serializePackedOrder(order),
    warehousePacking: formatWarehousePacking(order),
    message: emailOutcome.emailSent
      ? (statusChanged
        ? 'Order packed — customer emailed (waiting for pickup)'
        : 'Order packed — customer emailed')
      : (statusChanged
        ? 'Order packed and set to Awaiting Pickup'
        : 'Order packed'),
  };
}

export async function listPackedStoreOrders({
  storeId,
  page = 1,
  limit = 25,
  fromDate = '',
  toDate = '',
} = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 25));
  const filter = {
    storeId: String(storeId),
    ...ACTIVE_RECORD_FILTER,
    'warehousePacking.packed': true,
  };

  const packedAtFilter = {};
  if (fromDate) {
    const from = new Date(fromDate);
    if (!Number.isNaN(from.getTime())) packedAtFilter.$gte = from;
  }
  if (toDate) {
    const to = new Date(toDate);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      packedAtFilter.$lte = to;
    }
  }
  if (Object.keys(packedAtFilter).length) {
    filter['warehousePacking.packedAt'] = packedAtFilter;
  }

  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ 'warehousePacking.packedAt': -1, createdAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .select('_id shortOrderNumber status total paymentMethod paymentStatus createdAt updatedAt guestName guestEmail guestPhone shippingAddress trackingId courier waslah warehousePacking orderItems')
      .lean(),
  ]);

  return {
    page: pageNum,
    limit: pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    orders: orders.map((order) => ({
      ...order,
      warehousePacking: formatWarehousePacking(order),
    })),
  };
}
