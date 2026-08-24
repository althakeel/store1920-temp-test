import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getProductAbsoluteUrl } from '@/lib/productUrl';
import { getCustomerSiteUrl } from '@/lib/appUrl';

function getAppBaseUrl() {
  return getCustomerSiteUrl();
}

function ensureAbsoluteHttpsUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === '/placeholder.png') return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
  const base = getAppBaseUrl();
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value.replace(/^\//, '')}`;
}

export function resolveWhatsAppFreeShippingLabel(product = {}, { cartTotal } = {}) {
  if (Boolean(product.freeShippingEligible || product.freeShipping)) {
    return 'Available';
  }

  const total = Number(cartTotal ?? product.cartTotal);
  const threshold = Number(process.env.WABA_FREE_SHIPPING_MIN || 499);
  if (Number.isFinite(total) && Number.isFinite(threshold) && threshold > 0 && total >= threshold) {
    return 'Available';
  }

  return 'Available';
}

export function buildWhatsAppProductPayload(product = {}) {
  const slug = String(product.slug || product._id || '').trim();
  const baseUrl = getAppBaseUrl();
  const price = Number(product.price ?? product.AED ?? 0);
  const originalPrice = Number(product.AED ?? product.price ?? 0);
  const imageUrl = ensureAbsoluteHttpsUrl(getProductThumbnailUrl(product, { fallback: '' }));
  const freeShipping = Boolean(product.freeShippingEligible || product.freeShipping);

  return {
    id: String(product._id || ''),
    name: String(product.name || '').trim(),
    slug,
    sku: String(product.sku || '').trim(),
    price: Number.isFinite(price) ? price : 0,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : 0,
    currency: 'AED',
    imageUrl: imageUrl || '',
    productUrl: slug ? getProductAbsoluteUrl(product, baseUrl) : baseUrl,
    cartUrl: `${baseUrl}/cart`,
    checkoutUrl: `${baseUrl}/checkout`,
    ordersUrl: `${baseUrl}/orders`,
    homeUrl: `${baseUrl}/`,
    freeShipping,
    freeShippingLabel: resolveWhatsAppFreeShippingLabel(product),
    inStock: Boolean(product.inStock),
    brand: String(product.brand || '').trim(),
    shortDescription: String(product.shortDescription || '').trim(),
  };
}
