import Order from '@/models/Order';
import Wallet from '@/models/Wallet';

export const STORE_SELLER_ORDER_STATUSES = [
  'ORDER_PLACED',
  'PROCESSING',
  'PENDING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
  'PAYMENT_FAILED',
  'AWAITING_PAYMENT',
  'RTO',
  'RETURN',
  'RETURNED',
  'REPLACEMENT',
  'RETURN_INITIATED',
  'RETURN_APPROVED',
  'RETURN_REQUESTED',
  'PICKUP_REQUESTED',
  'WAITING_FOR_PICKUP',
  'PICKED_UP',
  'WAREHOUSE_RECEIVED',
  'OUT_FOR_DELIVERY',
];

export function normalizeStoreOrderStatus(status = '') {
  const normalized = String(status || '').trim().toUpperCase();
  // Accept American spelling from Excel / courier exports
  if (normalized === 'CANCELED') return 'CANCELLED';
  return normalized;
}

export function isValidStoreOrderStatus(status = '') {
  const normalized = normalizeStoreOrderStatus(status);
  if (STORE_SELLER_ORDER_STATUSES.includes(normalized)) return true;
  return ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(normalized);
}

export function orderBelongsToStore(order, storeId) {
  const expected = String(storeId || '');
  const orderStoreId = order?.storeId ? String(order.storeId) : '';
  if (orderStoreId && orderStoreId === expected) return true;
  const lineItems = order?.items || order?.orderItems || [];
  const itemStoreIds = lineItems
    .map((item) => item?.storeId && String(item.storeId))
    .filter(Boolean);
  return itemStoreIds.includes(expected);
}

/**
 * Apply a seller dashboard status change on a Mongoose Order document.
 * Caller must save ownership checks first. Saves the order.
 */
export async function applySellerOrderStatus(order, status, {
  silent = false,
  emailAsync = false,
  actor = {},
  source = 'store_status_picker',
} = {}) {
  const nextStatus = normalizeStoreOrderStatus(status);
  const previousStatus = String(order.status || '').toUpperCase();

  if (previousStatus === nextStatus) {
    return {
      changed: false,
      previousStatus,
      status: previousStatus,
      order,
    };
  }

  order.status = nextStatus;

  if (nextStatus === 'REFUNDED') {
    order.isPaid = false;
    order.paymentStatus = 'REFUNDED';
    if (!order.refundedAt) {
      order.refundedAt = new Date();
    }
  }

  const paymentMethod = String(order.paymentMethod || '').toLowerCase();
  if (nextStatus === 'DELIVERED' && paymentMethod === 'cod') {
    order.isPaid = true;
  }
  if (order.delhivery?.payment?.is_cod_recovered && paymentMethod === 'cod') {
    order.isPaid = true;
  }

  if (nextStatus === 'DELIVERED' && order.userId && !order.rewardsCredited) {
    const coinsEarned = 10;
    await Wallet.findOneAndUpdate(
      { userId: order.userId },
      {
        $inc: { coins: coinsEarned },
        $push: {
          transactions: {
            type: 'EARN',
            coins: coinsEarned,
            rupees: Number((coinsEarned * 1).toFixed(2)),
            orderId: order._id.toString(),
          },
        },
      },
      { upsert: true, new: true },
    );
    order.coinsEarned = coinsEarned;
    order.rewardsCredited = true;
  }

  await order.save();

  if (!silent) {
    try {
      const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
      const notifyPromise = notifyCustomerOfOrderStatusChange(order, nextStatus, {
        previousStatus,
        source,
        force: true,
        actor,
      });
      if (emailAsync) {
        void notifyPromise.catch((emailError) => {
          console.error('[applySellerOrderStatus] Async email failed:', emailError);
        });
      } else {
        await notifyPromise;
      }
    } catch (emailError) {
      console.error('[applySellerOrderStatus] Email sending failed:', emailError);
    }
  }

  return {
    changed: true,
    previousStatus,
    status: nextStatus,
    order,
  };
}
