import { getCustomerSiteUrl } from '@/lib/appUrl';

export function getAppBaseUrl() {
  return getCustomerSiteUrl();
}

export const WABA_TEMPLATE_NAMES = {
  cartReminder: String(process.env.WABA_TEMPLATE_CART_REMINDER || 'cart_reminder_1920').trim(),
  abandonedCheckout: String(process.env.WABA_TEMPLATE_ABANDONED_CHECKOUT || 'abandoned_checkout_reminder').trim(),
  orderPlaced: String(
    process.env.WABA_TEMPLATE_ORDER_CONFIRMATION
    || process.env.WABA_TEMPLATE_COD_CONFIRMATION
    || 'store1920_order_confirmed',
  ).trim(),
  /** @deprecated Use orderPlaced — kept for env overrides named WABA_TEMPLATE_COD_CONFIRMATION */
  codConfirmation: String(
    process.env.WABA_TEMPLATE_ORDER_CONFIRMATION
    || process.env.WABA_TEMPLATE_COD_CONFIRMATION
    || 'store1920_order_confirmed',
  ).trim(),
  orderDelivered: String(process.env.WABA_TEMPLATE_ORDER_DELIVERED || 'store1920_order_delivered').trim(),
  promotionalOffer: String(process.env.WABA_TEMPLATE_PROMOTIONAL_OFFER || 'promotional_offer__coupon').trim(),
  paidOrderConfirmation: String(process.env.WABA_TEMPLATE_PAID_ORDER || 'confirmation_paid_order').trim(),
  orderShipped: String(process.env.WABA_TEMPLATE_SHIPPED || 'order_shipped').trim(),
  orderReminder: String(process.env.WABA_TEMPLATE_ORDER_REMINDER || 'order_reminder_').trim(),
};

export function formatAedPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0 AED';
  const formatted = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
  return `AED ${formatted}`;
}

export function formatPaymentMethodLabel(paymentMethod) {
  const method = String(paymentMethod || '').toUpperCase();
  if (method === 'COD') return 'COD';
  if (method === 'CARD' || method === 'STRIPE') return 'Card';
  if (method === 'WALLET') return 'Wallet';
  if (method === 'TAMARA') return 'Tamara';
  if (method === 'TABBY') return 'Tabby';
  return method || 'Online';
}
