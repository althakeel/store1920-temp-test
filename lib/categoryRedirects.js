import redirects from '@/data/categoryRedirects.json';
import { toPublicCategoryPath } from '@/lib/categorySlug';

const REDIRECT_MAP = new Map(
  Object.entries(redirects).map(([key, target]) => [key.toLowerCase(), target]),
);

/**
 * Resolve a 301 redirect target for legacy category URLs.
 * @param {string} key - slug, or path like "category/electronics"
 */
export function resolveCategoryRedirect(key = '') {
  const normalized = String(key || '').trim().toLowerCase().replace(/^\/+/, '');
  if (!normalized) return null;
  return REDIRECT_MAP.get(normalized) || null;
}

/**
 * @param {URL} url
 * @returns {string|null}
 */
export function resolveLegacyCategoryRedirect(url) {
  const { pathname, searchParams } = url;

  if (pathname === '/shop' || pathname === '/products') {
    const category = String(searchParams.get('category') || '').trim();
    const categories = String(searchParams.get('categories') || '').trim();
    const slug = category || (categories.includes(',') ? '' : categories);
    if (slug) {
      return resolveCategoryRedirect(slug) || toPublicCategoryPath(slug);
    }
  }

  if (pathname.startsWith('/category/')) {
    const pathKey = pathname.replace(/^\/+/, '');
    const target = resolveCategoryRedirect(pathKey);
    if (target && target !== `/${pathKey}`) return target;
  }

  const bareSlug = pathname.replace(/^\/+/, '');
  if (bareSlug && !bareSlug.includes('/')) {
    const target = resolveCategoryRedirect(bareSlug);
    if (target) return target;
  }

  return null;
}
