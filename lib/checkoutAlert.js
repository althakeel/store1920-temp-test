export const DEFAULT_CHECKOUT_ALERT = {
  enabled: false,
  title: 'Delivery notice',
  titleAr: 'تنبيه التوصيل',
  message: '',
  messageAr: '',
  showOnCheckout: true,
};

export function normalizeCheckoutAlert(payload = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  return {
    enabled: Boolean(src.enabled),
    title: String(src.title || DEFAULT_CHECKOUT_ALERT.title).trim() || DEFAULT_CHECKOUT_ALERT.title,
    titleAr: String(src.titleAr || DEFAULT_CHECKOUT_ALERT.titleAr).trim(),
    message: String(src.message || '').trim(),
    messageAr: String(src.messageAr || '').trim(),
    showOnCheckout: src.showOnCheckout !== false,
  };
}

export function getActiveCheckoutAlert(alert = {}, { language = 'en' } = {}) {
  const normalized = normalizeCheckoutAlert(alert);
  if (!normalized.enabled || !normalized.showOnCheckout) return null;

  const isArabic = String(language || '').toLowerCase().startsWith('ar');
  const message = (isArabic ? normalized.messageAr : normalized.message) || normalized.message;
  const title = (isArabic ? normalized.titleAr : normalized.title) || normalized.title;

  if (!message) return null;

  return {
    title: title || DEFAULT_CHECKOUT_ALERT.title,
    message,
  };
}
