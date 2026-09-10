export function normalizeRequestHost(host = '') {
  return String(host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

/** Staging only. Never treat www.store1920.com as staging. */
export function isStagingStoreHost(host = '') {
  const hostname = normalizeRequestHost(host);
  return (
    hostname === 'store1920.store'
    || hostname === 'www.store1920.store'
    || hostname.endsWith('.store1920.store')
  );
}

export function getRequestHostFromHeaders(headersLike) {
  if (!headersLike) return '';
  const forwarded = headersLike.get?.('x-forwarded-host') || headersLike['x-forwarded-host'];
  const host = headersLike.get?.('host') || headersLike.host;
  return normalizeRequestHost(forwarded || host || '');
}
