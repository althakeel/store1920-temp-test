import redirects from '@/data/productRedirects.json';

const REDIRECT_MAP = new Map(
  Object.entries(redirects).map(([key, target]) => [key.toLowerCase(), target]),
);

/**
 * Resolve a permanent redirect target for a product slug
 * (legacy / renamed products).
 * @param {string} slug
 * @returns {string|null} absolute path like /products/new-slug
 */
export function resolveProductSlugRedirect(slug = '') {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/^(product|products)\//, '');
  if (!normalized) return null;
  return REDIRECT_MAP.get(normalized) || null;
}

/**
 * @param {URL} url
 * @returns {string|null} destination path (may include query)
 */
export function resolveLegacyProductRedirect(url) {
  const pathname = String(url?.pathname || '');
  const productMatch = pathname.match(/^\/(product|products)\/([^/]+)\/?$/i);
  if (!productMatch) return null;

  const slug = decodeURIComponent(productMatch[2] || '').trim().toLowerCase();
  const destination = resolveProductSlugRedirect(slug);
  if (destination) {
    const destUrl = new URL(destination, 'https://www.store1920.com');
    const params = new URLSearchParams(url.search || '');
    params.delete('add-to-cart');
    const kept = params.toString();
    if (kept && !destUrl.search) destUrl.search = kept;
    return `${destUrl.pathname}${destUrl.search}`;
  }

  if (new URLSearchParams(url.search || '').has('add-to-cart')) {
    const params = new URLSearchParams(url.search || '');
    params.delete('add-to-cart');
    const kept = params.toString();
    const cleanPath = pathname.replace(/\/+$/, '') || pathname;
    return kept ? `${cleanPath}?${kept}` : cleanPath;
  }

  return null;
}

/** Entries for next.config.js redirects() — 301 for both /product and /products prefixes. */
export function getProductRedirectEntries() {
  return Object.entries(redirects).flatMap(([fromSlug, destination]) => {
    const sourceSlug = String(fromSlug || '').trim().replace(/^\/+/, '');
    const dest = String(destination || '').trim();
    if (!sourceSlug || !dest) return [];
    return [
      {
        source: `/product/${sourceSlug}`,
        destination: dest,
        permanent: true,
      },
      {
        source: `/products/${sourceSlug}`,
        destination: dest,
        permanent: true,
      },
    ];
  });
}
