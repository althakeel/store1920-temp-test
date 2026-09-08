/**
 * Shared API security helpers (CORS, IP rate limiting, request logging).
 * Edge-safe: no Node-only APIs, no setInterval.
 */

const DEFAULT_ORIGINS = [
  'https://quickfynd.com',
  'https://www.quickfynd.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/** @type {Map<string, number[]>} */
const rateBuckets = new Map();
const MAX_BUCKETS = 20_000;

function pushOrigin(list, value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return;
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    const origin = url.origin;
    if (!list.includes(origin)) list.push(origin);
  } catch {
    // ignore invalid
  }
}

export function getAllowedCorsOrigins() {
  const origins = [...DEFAULT_ORIGINS];
  pushOrigin(origins, process.env.NEXT_PUBLIC_APP_URL);
  pushOrigin(origins, process.env.NEXT_PUBLIC_BASE_URL);
  pushOrigin(origins, process.env.CORS_ORIGIN);

  const extra = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const item of extra) pushOrigin(origins, item);

  if (process.env.NODE_ENV !== 'production') {
    pushOrigin(origins, 'http://localhost:3001');
    pushOrigin(origins, 'http://127.0.0.1:3001');
  }

  return origins;
}

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  if (first) return first;
  return (
    request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip')
    || 'unknown'
  );
}

export function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sliding-window rate limiter (in-memory per isolate).
 * @returns {{ allowed: boolean, remaining: number, resetTime: number, waitTime: number, limit: number }}
 */
export function checkRateLimit(identifier, maxRequests = 120, windowMs = 60_000) {
  const now = Date.now();
  const key = String(identifier || 'unknown');
  let stamps = rateBuckets.get(key) || [];
  stamps = stamps.filter((ts) => now - ts < windowMs);

  if (stamps.length >= maxRequests) {
    const oldest = stamps[0] || now;
    const resetTime = oldest + windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      waitTime: Math.max(1, Math.ceil((resetTime - now) / 1000)),
      limit: maxRequests,
    };
  }

  stamps.push(now);
  if (rateBuckets.size > MAX_BUCKETS) {
    // Drop oldest keys when the map grows too large (serverless / long-lived).
    const excess = rateBuckets.size - MAX_BUCKETS + 100;
    let removed = 0;
    for (const mapKey of rateBuckets.keys()) {
      rateBuckets.delete(mapKey);
      removed += 1;
      if (removed >= excess) break;
    }
  }
  rateBuckets.set(key, stamps);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - stamps.length),
    resetTime: now + windowMs,
    waitTime: 0,
    limit: maxRequests,
  };
}

/** Paths that must not be rate-limited or CORS-blocked (provider callbacks). */
export function isWebhookOrInternalApiPath(pathname = '') {
  const path = String(pathname || '');
  return (
    path.startsWith('/api/webhooks/')
    || path === '/api/razorpay/webhook'
    || path === '/api/stripe'
    || path.startsWith('/api/inngest')
    || path.startsWith('/api/cron/')
  );
}

/** Place-order / gateway calls must not be killed by the short burst window. */
export function isCheckoutPaymentApiPath(pathname = '') {
  const path = String(pathname || '');
  return (
    path.startsWith('/api/orders')
    || path.startsWith('/api/razorpay')
    || path === '/api/store/orders/create'
    || path === '/api/payment-cancelled'
    || path.startsWith('/api/tabby')
    || path.startsWith('/api/tamara')
    || path.startsWith('/api/stripe')
  );
}

/** Cheap public GETs used on every product/checkout page — don't burn the shared burst budget. */
export function isPublicReadApiPath(pathname = '', method = 'GET') {
  const verb = String(method || 'GET').toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD') return false;
  const path = String(pathname || '');
  return (
    path === '/api/shipping'
    ||     path === '/api/cart'
    || path.startsWith('/api/cart/')
    || path === '/api/address'
    || path.startsWith('/api/address/')
    || path === '/api/wallet'
    || path === '/api/coupons'
    || path === '/api/store-info'
    || path === '/api/store/settings'
    || path === '/api/store/categories'
    || path === '/api/store/navbar-menu'
    || path === '/api/store/featured-products'
    || path === '/api/store/home-menu-categories'
    || path === '/api/store/appearance/sections/public'
    || path === '/api/store/signin-modal'
    || path === '/api/store/download-image'
    || path === '/api/store/sitemap-settings/public'
    || path === '/api/store/explore-interests/public'
    || path === '/api/store/mobile-banner-slider'
    || path === '/api/store/mobile-small-banners'
    || path === '/api/store/mobile-promo-cards'
    || path === '/api/store/mobile-tile-banners'
    || path.startsWith('/api/public/')
    || path.startsWith('/api/auth/')
    || path.startsWith('/api/products')
  );
}

/**
 * Tiered limits: sensitive write endpoints get tighter caps.
 * @returns {{ max: number, windowMs: number, tier: string }}
 */
export function resolveApiRateLimit(pathname = '', method = 'GET') {
  const path = String(pathname || '');
  const verb = String(method || 'GET').toUpperCase();
  const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(verb);

  if (
    path.startsWith('/api/razorpay')
    || path.startsWith('/api/orders')
    || path === '/api/store/orders/create'
  ) {
    return { max: isWrite ? 20 : 60, windowMs: 60_000, tier: 'payment' };
  }

  if (
    path.includes('/login')
    || path.includes('/auth')
    || path.includes('/otp')
    || path.includes('/forgot')
  ) {
    return { max: isWrite ? 15 : 40, windowMs: 60_000, tier: 'auth' };
  }

  if (isPublicReadApiPath(path, verb)) {
    // Product pages call shipping/settings often; keep a generous per-path cap.
    return { max: 300, windowMs: 60_000, tier: 'public-read' };
  }

  if (path.startsWith('/api/store/') && isWrite) {
    return { max: 90, windowMs: 60_000, tier: 'store-write' };
  }

  if (path.startsWith('/api/')) {
    const isDev = process.env.NODE_ENV !== 'production';
    return {
      max: isWrite ? (isDev ? 200 : 100) : (isDev ? 400 : 180),
      windowMs: 60_000,
      tier: 'api',
    };
  }

  return { max: 300, windowMs: 60_000, tier: 'default' };
}

/** Short-window IP burst throttle (separate from per-minute limits). */
export function resolveBurstLimit(pathname = '', method = 'GET') {
  if (isWebhookOrInternalApiPath(pathname) || isCheckoutPaymentApiPath(pathname)) {
    return null;
  }
  // Public storefront GETs share one soft bucket so a product page load
  // (shipping + settings + categories + …) does not 429 itself.
  if (isPublicReadApiPath(pathname, method)) {
    return { max: 180, windowMs: 10_000, tier: 'burst-public' };
  }
  return { max: 120, windowMs: 10_000, tier: 'burst' };
}

export function applyCorsHeaders(request, response, { allowCredentials = false } = {}) {
  const origin = request.headers.get('origin');
  if (!origin) return response;

  const allowed = getAllowedCorsOrigins();
  if (!allowed.includes(origin)) return response;

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Requested-With, X-Request-Id, X-Warehouse-Key, Accept, Origin',
  );
  response.headers.set('Access-Control-Max-Age', '86400');
  if (allowCredentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return response;
}

export function corsPreflightResponse(request) {
  const origin = request.headers.get('origin');
  const allowed = getAllowedCorsOrigins();
  if (origin && !allowed.includes(origin)) {
    return new Response(JSON.stringify({ error: 'CORS origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, X-Requested-With, X-Request-Id, X-Warehouse-Key, Accept, Origin',
    'Access-Control-Max-Age': '86400',
    'Content-Length': '0',
  });
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return new Response(null, { status: 204, headers });
}

export function applyRateLimitHeaders(response, result) {
  if (!result) return response;
  response.headers.set('X-RateLimit-Limit', String(result.limit ?? ''));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining ?? 0));
  if (result.resetTime) {
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));
  }
  if (!result.allowed && result.waitTime) {
    response.headers.set('Retry-After', String(result.waitTime));
  }
  return response;
}

export function logApiRequest({
  requestId,
  method,
  pathname,
  ip,
  status,
  tier,
  allowed,
}) {
  // Structured one-line log for platform log drains (Vercel / CloudWatch / etc.)
  console.info(
    JSON.stringify({
      type: 'api_access',
      requestId,
      method,
      path: pathname,
      ip,
      status,
      tier,
      allowed: allowed !== false,
      ts: new Date().toISOString(),
    }),
  );
}
