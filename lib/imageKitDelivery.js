/**
 * ImageKit delivery helpers — resize/compress on the CDN so pages don't
 * download full original banner/product files (PageSpeed "Improve image delivery").
 */

const IMAGEKIT_HOST = /(?:^|\.)imagekit\.io$/i;
const PATH_TRANSFORM = /\/tr:[^/]+\//i;
const QUERY_TR = /([?&])tr=[^&]*/i;

export function stripImageKitTransforms(url = '') {
  let next = String(url || '').trim();
  if (!next) return '';
  next = next.replace(PATH_TRANSFORM, '/');
  next = next.replace(QUERY_TR, (match, sep) => (sep === '?' ? '?' : ''));
  next = next.replace(/\?&/, '?').replace(/[?&]$/, '');
  return next;
}

function isImageKitUrl(url = '') {
  try {
    const host = new URL(url).hostname;
    return IMAGEKIT_HOST.test(host) || host.includes('imagekit.io');
  } catch {
    return false;
  }
}

/**
 * @param {string} url
 * @param {{ width?: number, quality?: number, height?: number }} [options]
 */
export function withImageKitDelivery(url = '', {
  width = 1200,
  quality = 72,
  height,
} = {}) {
  const raw = String(url || '').trim();
  if (!raw || !isImageKitUrl(raw)) return raw;

  const clean = stripImageKitTransforms(raw);
  const w = Math.max(64, Math.min(2400, Math.round(Number(width) || 1200)));
  const q = Math.max(40, Math.min(90, Math.round(Number(quality) || 72)));
  const parts = [`w-${w}`, `q-${q}`, 'f-auto'];
  if (height) {
    const h = Math.max(64, Math.min(2400, Math.round(Number(height))));
    parts.push(`h-${h}`, 'c-at_max');
  }

  const transform = `tr:${parts.join(',')}`;

  try {
    const parsed = new URL(clean);
    // Path-style: https://ik.imagekit.io/{id}/{optional path}/file
    // Insert transform after the imagekit id segment when present.
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length >= 1) {
      // ik.imagekit.io / {imagekitId} / ...file
      const insertAt = 1;
      const alreadyHasTr = segments.some((seg) => seg.startsWith('tr:'));
      if (!alreadyHasTr) {
        segments.splice(insertAt, 0, transform);
        parsed.pathname = `/${segments.join('/')}`;
      }
    }
    return parsed.toString();
  } catch {
    return clean.replace(/^(https?:\/\/[^/]+\/[^/]+)\//i, `$1/${transform}/`);
  }
}
