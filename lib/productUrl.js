import { getCustomerSiteUrl, normalizePublicSiteUrl } from './appUrl';

export function getProductSlug(product) {
  if (!product) return '';
  return String(product.slug || product._id || product.id || '').trim();
}

export function productUsesProductsPath() {
  return false;
}

export function getProductPath(product) {
  const slug = getProductSlug(product);
  if (!slug) return '/shop';
  return `/product/${slug}`;
}

export function getProductAbsoluteUrl(product, baseUrl = '') {
  const base = normalizePublicSiteUrl(baseUrl || getCustomerSiteUrl()).replace(/\/$/, '');
  return `${base}${getProductPath(product)}`;
}

export function isProductDetailPath(pathname = '') {
  const path = String(pathname || '');
  if (path.startsWith('/product/') && path.length > '/product/'.length) return true;
  return /^\/products\/[^/]+/.test(path);
}
