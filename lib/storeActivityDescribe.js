const AREA_LABELS = [
  ['/api/store/product/bulk-update', 'products'],
  ['/api/store/product', 'products'],
  ['/api/store/categories', 'categories'],
  ['/api/store/brands', 'brands'],
  ['/api/store/appearance', 'appearance'],
  ['/api/store/featured-products', 'featured products'],
  ['/api/store/category-slider', 'category sliders'],
  ['/api/store/explore-interests', 'explore interests'],
  ['/api/store/navbar-menu', 'navbar'],
  ['/api/store/settings', 'settings'],
  ['/api/store/profile', 'profile'],
  ['/api/store/users', 'team access'],
  ['/api/store/shipping', 'shipping'],
  ['/api/store/coupons', 'coupons'],
  ['/api/store/orders', 'orders'],
  ['/api/store/reviews', 'reviews'],
  ['/api/store/inventory', 'inventory'],
  ['/api/store/blogs', 'blogs'],
  ['/api/store/media', 'media'],
  ['/api/store/giveaways', 'giveaways'],
  ['/api/store/spin', 'spin wheel'],
  ['/api/store/email-marketing', 'email marketing'],
  ['/api/store/promotional-emails', 'email marketing'],
  ['/api/store/personalized-offers', 'promotional offers'],
  ['/api/store/abandoned-checkout', 'abandoned checkout'],
  ['/api/store/return-requests', 'returns'],
  ['/api/store/tickets', 'support tickets'],
  ['/api/store/alerts', 'alerts'],
  ['/api/store/preferences', 'preferences'],
  ['/api/store/home-preferences', 'home preferences'],
  ['/api/store/menu-management', 'menu'],
  ['/api/store/mobile-features', 'mobile features'],
  ['/api/store/dashboard/insights', 'AI insights'],
];

const SKIP_ACTIVITY_PATHS = [
  '/api/store/activity-log',
  '/api/store/dashboard/insights',
  '/api/store/dashboard/live',
  '/api/store/orders/notifications',
  '/api/store/is-seller',
];

const SKIP_DETAIL_FIELDS = /^(pass|password|token|secret|authorization|cookie|apikey|html|description|descriptionar|content|images|externalimages|stats|body|file)$/i;

export function normalizeActivityPath(value = '') {
  try {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://store.local');
    return decodeURIComponent(url.pathname || '').replace(/\/+$/, '') || url.pathname;
  } catch {
    return String(value || '').split('?')[0].replace(/\/+$/, '');
  }
}

export function shouldSkipStoreActivityPath(path = '') {
  const normalized = normalizeActivityPath(path);
  return SKIP_ACTIVITY_PATHS.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function humanizeKey(key = '') {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function shortValue(value) {
  if (value === true) return 'on';
  if (value === false) return 'off';
  if (value == null) return '';
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return 'updated';
    return keys.slice(0, 4).map(humanizeKey).join(', ');
  }
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function summarizeStoreActivityPayload(payload) {
  let data = payload;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { summary: '', details: [] };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { summary: '', details: [] };
  }

  const itemName = String(
    data.name || data.nameEn || data.title || data.productName || data.sku || data.email || '',
  ).trim();
  const details = [];

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_DETAIL_FIELDS.test(key) || value === undefined) continue;
    const label = humanizeKey(key);
    const text = shortValue(value);
    if (!text) continue;
    details.push(`${label}: ${text}`);
    if (details.length >= 8) break;
  }

  const summary = [itemName && `Item: ${itemName}`, details.join(' · ')].filter(Boolean).join(' — ');
  return {
    summary: summary.slice(0, 800),
    details: details.slice(0, 8),
    itemName: itemName.slice(0, 120),
  };
}

export function describeStoreActivity({ method = 'POST', path = '', pagePath = '', itemName = '' } = {}) {
  const verb = {
    post: 'Saved',
    put: 'Updated',
    patch: 'Updated',
    delete: 'Deleted',
  }[String(method || '').toLowerCase()] || 'Changed';

  const normalized = normalizeActivityPath(path);
  const area = AREA_LABELS.find(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}/`))?.[1]
    || String(normalized.split('/').filter(Boolean).slice(-1)[0] || 'dashboard').replace(/-/g, ' ');

  const page = normalizeActivityPath(pagePath).replace(/^\/store\/?/, '');
  const pageLabel = page ? page.replace(/-/g, ' ') : '';
  const item = String(itemName || '').trim();
  const base = pageLabel ? `${verb} ${area} from ${pageLabel}` : `${verb} ${area}`;
  return item && !base.includes(item) ? `${base}: ${item}` : base;
}
