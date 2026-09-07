export function getAssignedUserIdFromCoupon(coupon) {
  return String(coupon?.assignedUserId || '').trim();
}

export function isCouponVisibleToUser(coupon, userId) {
  if (!coupon) return false;

  const assignedUserId = getAssignedUserIdFromCoupon(coupon);
  if (assignedUserId) {
    return Boolean(userId) && String(userId) === assignedUserId;
  }

  return coupon.isPublic !== false;
}

export function getCouponAccessError(coupon, userId, assignedUserIdOverride = '') {
  if (!coupon) return 'Coupon not found';

  const assignedUserId = String(assignedUserIdOverride || getAssignedUserIdFromCoupon(coupon)).trim();
  if (!assignedUserId) return null;

  // Guests can redeem by code without signing in.
  if (!userId) return null;

  if (String(userId) !== assignedUserId) {
    return 'This coupon is only valid for the account that won it';
  }

  return null;
}

export async function resolveCouponWinnerUserId(coupon, SpinLogModel) {
  const assignedUserId = getAssignedUserIdFromCoupon(coupon);
  if (assignedUserId || !SpinLogModel || !coupon?.code) {
    return assignedUserId;
  }

  const spinLog = await SpinLogModel.findOne({ couponCode: String(coupon.code).toUpperCase() })
    .select('userId')
    .lean();

  return String(spinLog?.userId || '').trim();
}

export async function getCouponAccessErrorAsync(coupon, userId, SpinLogModel) {
  const assignedUserId = await resolveCouponWinnerUserId(coupon, SpinLogModel);
  return getCouponAccessError(coupon, userId, assignedUserId);
}
