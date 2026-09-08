export const DEFAULT_APP_URL = 'https://www.store1920.com';

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

/** Rewrite leftover .store hosts and prefer www for store1920.com. */
export function normalizePublicSiteUrl(url) {
  const rewritten = String(url || '').replace(
    /https?:\/\/(www\.)?store1920\.store/gi,
    DEFAULT_APP_URL,
  );
  if (!rewritten) return rewritten;

  try {
    const parsed = new URL(rewritten);
    if (parsed.hostname === 'store1920.com') {
      parsed.hostname = 'www.store1920.com';
      return stripTrailingSlash(parsed.toString());
    }
    return stripTrailingSlash(parsed.toString());
  } catch {
    return stripTrailingSlash(
      rewritten.replace(
        /https?:\/\/store1920\.com(?=[:/?#]|$)/gi,
        DEFAULT_APP_URL,
      ),
    );
  }
}

function rewriteLegacyStoreDomain(url) {
  return normalizePublicSiteUrl(url);
}

export function normalizeCustomerUrl(url) {
  return rewriteLegacyStoreDomain(url);
}

export function getAppBaseUrl() {
  return rewriteLegacyStoreDomain(
    String(
      process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        DEFAULT_APP_URL
    )
  ) || DEFAULT_APP_URL;
}

/** Customer-facing storefront URL for SEO, emails, and deep links (never uses .store). */
export function getCustomerSiteUrl() {
  const explicit = rewriteLegacyStoreDomain(
    String(
      process.env.CUSTOMER_FACING_URL ||
        process.env.NEXT_PUBLIC_CUSTOMER_URL ||
        '',
    ).trim(),
  );
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit;
  }

  const base = getAppBaseUrl();
  try {
    const { hostname } = new URL(base);
    if (hostname === 'store1920.store' || hostname === 'www.store1920.store') {
      return DEFAULT_APP_URL;
    }
  } catch {
    // fall through
  }

  return rewriteLegacyStoreDomain(base) || DEFAULT_APP_URL;
}

export function buildCustomerSitePath(pathname = '/') {
  const base = getCustomerSiteUrl();
  const path = String(pathname || '/').trim();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
