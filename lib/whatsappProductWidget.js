/**
 * Product-page WhatsApp floating widget settings (StorePreference.appearanceSections).
 */

export const DEFAULT_WHATSAPP_PRODUCT_WIDGET = {
  enabled: false,
  phoneNumber: '',
  messageTemplate: 'Hi, I am interested in this product: {productName}',
  buttonImageUrl: '',
  productIds: [],
  hideTawkWhenVisible: true,
};

function normalizeHttpUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') || /^https?:\/\//i.test(raw)) return raw.slice(0, 2048);
  return '';
}

/** Digits only, for wa.me links (include country code, no +). */
export function normalizeWhatsAppPhoneDigits(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(0, 15);
}

export function normalizeWhatsAppProductWidget(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const productIds = Array.isArray(source.productIds)
    ? Array.from(
        new Set(
          source.productIds
            .map((id) => String(id || '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 500)
    : [];

  const messageTemplate = String(
    source.messageTemplate ?? DEFAULT_WHATSAPP_PRODUCT_WIDGET.messageTemplate,
  )
    .trim()
    .slice(0, 500);

  return {
    enabled: Boolean(source.enabled),
    phoneNumber: normalizeWhatsAppPhoneDigits(source.phoneNumber),
    messageTemplate: messageTemplate || DEFAULT_WHATSAPP_PRODUCT_WIDGET.messageTemplate,
    buttonImageUrl: normalizeHttpUrl(source.buttonImageUrl),
    productIds,
    hideTawkWhenVisible: source.hideTawkWhenVisible !== false,
  };
}

export function shouldShowWhatsAppProductWidget(widget, productId) {
  const config = normalizeWhatsAppProductWidget(widget);
  if (!config.enabled) return false;
  if (!config.phoneNumber || config.phoneNumber.length < 8) return false;
  const id = String(productId || '').trim();
  if (!id) return false;
  return config.productIds.includes(id);
}

export function buildWhatsAppProductChatUrl({
  phoneNumber,
  messageTemplate,
  productName = '',
  productUrl = '',
} = {}) {
  const digits = normalizeWhatsAppPhoneDigits(phoneNumber);
  if (!digits) return null;

  const template = String(messageTemplate || DEFAULT_WHATSAPP_PRODUCT_WIDGET.messageTemplate);
  const text = template
    .replace(/\{productName\}/gi, String(productName || 'this product').trim() || 'this product')
    .replace(/\{productUrl\}/gi, String(productUrl || '').trim())
    .trim();

  const params = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${digits}${params}`;
}
