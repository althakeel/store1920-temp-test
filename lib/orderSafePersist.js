import Order from '@/models/Order';

export function toPlain(value) {
  if (value == null) return value;
  if (typeof value.toObject === 'function') return value.toObject();
  return value;
}

export function toPlainReturns(order) {
  if (!Array.isArray(order?.returns)) return [];
  return order.returns.map((row) => toPlain(row));
}

/**
 * Patch selected order fields without mongoose optimistic __v locking.
 * `order.save()` races with Waslah/return writers and can also persist
 * nested waslah defaults, which clobbers live tracking.
 */
export async function patchOrder(orderId, $set) {
  const id = orderId?._id || orderId;
  if (!id || !$set || typeof $set !== 'object') return null;
  const keys = Object.keys($set);
  if (!keys.length) return null;
  return Order.findByIdAndUpdate(id, { $set }, { new: true });
}
