import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  STOREFRONT_LANGUAGE_COOKIE,
  detectLanguageFromAcceptLanguage,
} from '@/lib/storefrontLanguage';
import { resolveLegacyCategoryRedirect } from '@/lib/categoryRedirects';
import { resolveLegacyProductRedirect } from '@/lib/productRedirects';
import { isStagingStoreHost, normalizeRequestHost } from '@/lib/stagingHost';
import {
  applyCorsHeaders,
  applyRateLimitHeaders,
  checkRateLimit,
  corsPreflightResponse,
  createRequestId,
  getClientIp,
  isCheckoutPaymentApiPath,
  isWebhookOrInternalApiPath,
  logApiRequest,
  resolveApiRateLimit,
  resolveBurstLimit,
} from '@/lib/apiSecurity';

const apiProtectedRoutes = [
  /^\/api\/store(\/.*)?$/,
  /^\/api\/wishlist(\/.*)?$/,
];

const publicEndpoints = [
  '/api/store/settings',
  '/api/store/categories',
  '/api/store/featured-products',
  '/api/store/home-menu-categories',
  '/api/store/appearance/sections/public',
  '/api/store/navbar-menu',
  '/api/store/download-image',
  '/api/store/sitemap-settings/public',
  '/api/store/explore-interests/public',
  '/api/store/explore-interests/debug-raw',
  '/api/store/explore-interests/check',
  '/api/store/mobile-banner-slider',
  '/api/store/mobile-small-banners',
  '/api/store/mobile-promo-cards',
  '/api/store/mobile-tile-banners',
  '/api/store/signin-modal',
];

const routeProtectedEndpoints = [
  '/api/store/migration/wp-categories',
];

function applyStorefrontLanguageCookie(request: NextRequest, response: NextResponse) {
  const cookieLang = request.cookies.get(STOREFRONT_LANGUAGE_COOKIE)?.value;
  if (cookieLang === 'ar' || cookieLang === 'en') {
    return;
  }

  const acceptLanguage = request.headers.get('accept-language') || '';
  const language = detectLanguageFromAcceptLanguage(acceptLanguage);
  response.cookies.set(STOREFRONT_LANGUAGE_COOKIE, language, {
    path: '/',
    maxAge: 31536000,
    sameSite: 'lax',
  });
}

function withApiSecurity(
  request: NextRequest,
  response: NextResponse,
  extras?: { rate?: ReturnType<typeof checkRateLimit>; requestId?: string },
) {
  if (extras?.requestId) {
    response.headers.set('X-Request-Id', extras.requestId);
  }
  applyCorsHeaders(request, response);
  if (extras?.rate) {
    applyRateLimitHeaders(response, extras.rate);
  }
  return response;
}

function enforceStoreAuth(request: NextRequest, pathname: string, method: string) {
  if (routeProtectedEndpoints.includes(pathname)) {
    return null;
  }
  if (publicEndpoints.includes(pathname) && method === 'GET') {
    return null;
  }
  const isApiProtected = apiProtectedRoutes.some((regex) => regex.test(pathname));
  if (!isApiProtected) {
    return null;
  }
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function getRequestHost(request: NextRequest) {
  return normalizeRequestHost(
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '',
  );
}

function goneCreateStore(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/create-store' || pathname.startsWith('/create-store/')) {
    return new NextResponse('This page has been removed.', {
      status: 410,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return null;
}

function applyStagingRobotsTag(request: NextRequest, response: NextResponse) {
  if (!isStagingStoreHost(getRequestHost(request))) return response;
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}

function redirectApexHostToWww(request: NextRequest) {
  const host = getRequestHost(request);

  if (host !== 'store1920.com') return null;

  const { pathname, search } = request.nextUrl;
  if (pathname === '/api' || pathname.startsWith('/api/')) return null;

  return NextResponse.redirect(
    new URL(`https://www.store1920.com${pathname}${search}`),
    301,
  );
}

export async function proxy(request: NextRequest) {
  const removedStoreSignup = goneCreateStore(request);
  if (removedStoreSignup) return applyStagingRobotsTag(request, removedStoreSignup);

  const apexRedirect = redirectApexHostToWww(request);
  if (apexRedirect) return apexRedirect;

  const { pathname } = request.nextUrl;
  const method = request.method || 'GET';
  const requestId = request.headers.get('x-request-id') || createRequestId();
  const ip = getClientIp(request);
  const isApiRoute = pathname.startsWith('/api/');

  if (
    pathname.startsWith('/_next')
    || request.headers.get('RSC') === '1'
    || request.headers.get('Next-Router-Prefetch') === '1'
  ) {
    return NextResponse.next();
  }

  const productRedirect = resolveLegacyProductRedirect(request.nextUrl);
  if (productRedirect) {
    return NextResponse.redirect(new URL(productRedirect, request.url), 308);
  }

  const categoryRedirect = resolveLegacyCategoryRedirect(request.nextUrl);
  if (categoryRedirect) {
    return NextResponse.redirect(new URL(categoryRedirect, request.url), 301);
  }

  if (isApiRoute && method === 'OPTIONS') {
    return corsPreflightResponse(request);
  }

  let rateResult: ReturnType<typeof checkRateLimit> | undefined;

  if (isApiRoute && !isWebhookOrInternalApiPath(pathname) && !isCheckoutPaymentApiPath(pathname)) {
    const burst = resolveBurstLimit(pathname, method);
    if (burst) {
      // Public reads use a separate bucket so they don't compete with mutations.
      const burstKey = burst.tier === 'burst-public'
        ? `burst-public:${ip}`
        : `burst:${ip}`;
      const burstResult = checkRateLimit(burstKey, burst.max, burst.windowMs);
      if (!burstResult.allowed) {
        logApiRequest({
          requestId,
          method,
          pathname,
          ip,
          status: 429,
          tier: burst.tier,
          allowed: false,
        });
        const denied = NextResponse.json(
          {
            error: 'Too many requests. Slow down and try again.',
            code: 'IP_BURST_LIMIT',
            retryAfter: burstResult.waitTime,
          },
          { status: 429 },
        );
        return withApiSecurity(request, denied, { rate: burstResult, requestId });
      }
    }

    const limit = resolveApiRateLimit(pathname, method);
    const pathBucket = pathname.split('/').slice(0, 4).join('/') || pathname;
    rateResult = checkRateLimit(
      `${limit.tier}:${ip}:${pathBucket}`,
      limit.max,
      limit.windowMs,
    );

    if (!rateResult.allowed) {
      logApiRequest({
        requestId,
        method,
        pathname,
        ip,
        status: 429,
        tier: limit.tier,
        allowed: false,
      });
      const denied = NextResponse.json(
        {
          error: `Rate limit exceeded. Try again in ${rateResult.waitTime} seconds.`,
          code: 'RATE_LIMIT',
          retryAfter: rateResult.waitTime,
        },
        { status: 429 },
      );
      return withApiSecurity(request, denied, { rate: rateResult, requestId });
    }
  }

  // Large CSV uploads are authenticated in the route handler; skip proxy buffering.
  if (pathname === '/api/store/product/bulk-import' || pathname === '/api/store/orders/csv') {
    const passthrough = NextResponse.next();
    return isApiRoute
      ? withApiSecurity(request, passthrough, { rate: rateResult, requestId })
      : passthrough;
  }

  const authError = enforceStoreAuth(request, pathname, method);
  if (authError) {
    return withApiSecurity(request, authError, { rate: rateResult, requestId });
  }

  const response = NextResponse.next();

  if (!isApiRoute) {
    applyStorefrontLanguageCookie(request, response);
  } else {
    withApiSecurity(request, response, { rate: rateResult, requestId });
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      logApiRequest({
        requestId,
        method,
        pathname,
        ip,
        status: 200,
        tier: rateResult ? 'api' : 'webhook',
        allowed: true,
      });
    }
  }

  return applyStagingRobotsTag(request, response);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|woff2?)$).*)',
  ],
};
