/** @param {string} value */
export function slugifyCategory(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** @param {{ slug?: string }[]} ancestorsIncludingSelf */
export function buildCategoryPathSegments(ancestorsIncludingSelf = []) {
  return ancestorsIncludingSelf
    .map((item) => String(item?.slug || '').trim())
    .filter(Boolean);
}

/** @param {{ slug?: string }[]} ancestorsIncludingSelf */
export function buildCategoryUrl(ancestorsIncludingSelf = []) {
  const segments = buildCategoryPathSegments(ancestorsIncludingSelf);
  return segments.length ? `/category/${segments.join('/')}` : '/shop';
}

/** Public category page path: /category/electronics — no ? or =. */
export function toPublicCategoryPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '/shop';

  const withoutHost = raw.replace(/^https?:\/\/[^/]+/i, '');
  const [pathPart, queryPart = ''] = withoutHost.split('?');
  const pathname = pathPart.split('#')[0];

  if (pathname === '/shop' || pathname === '/products') {
    const params = new URLSearchParams(queryPart.split('#')[0]);
    const category = String(params.get('category') || '').trim();
    const categories = String(params.get('categories') || '').trim();
    const slug = category || (categories.includes(',') ? '' : categories);
    if (!slug) return '/shop';
    const segments = parseCategoryPathSegments(slug)
      .map((segment) => slugifyCategory(segment))
      .filter(Boolean);
    return segments.length ? `/category/${segments.join('/')}` : '/shop';
  }

  const segments = parseCategoryPathSegments(pathname)
    .map((segment) => slugifyCategory(segment))
    .filter(Boolean);

  return segments.length ? `/category/${segments.join('/')}` : '/shop';
}

/** Convert leftover /shop?category=electronics links to /category/electronics. */
export function normalizeStorefrontCategoryHref(href = '') {
  const raw = String(href || '').trim();
  if (!raw || raw === '#') return raw;

  const withoutHost = raw.replace(/^https?:\/\/[^/]+/i, '');
  const pathname = withoutHost.split('?')[0].split('#')[0];
  if (pathname === '/shop' || pathname === '/products' || pathname.startsWith('/category/')) {
    return toPublicCategoryPath(raw);
  }

  return raw;
}

/** @param {string} path */
export function parseCategoryPathSegments(path = '') {
  return String(path || '')
    .replace(/^\/+/, '')
    .replace(/^category\/?/i, '')
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

/** Normalize legacy category labels for lookup (HTML entities, amp splits). */
export function normalizeCategoryLabel(value = '') {
  return String(value || '')
    .replace(/&amp;?/gi, ' and ')
    .replace(/&#0*39;/gi, "'")
    .replace(/â€™/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
