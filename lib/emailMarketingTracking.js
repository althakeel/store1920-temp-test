import crypto from 'crypto';
import { getCustomerSiteUrl } from '@/lib/appUrl';

const TRACK_OPEN_PATH = '/api/email/track/open';
const TRACK_CLICK_PATH = '/api/email/track/click';

export function createEmailTrackingToken() {
  return crypto.randomBytes(16).toString('hex');
}

function trackingBaseUrl() {
  return getCustomerSiteUrl().replace(/\/$/, '');
}

export function buildEmailOpenPixelUrl(token = '') {
  const t = String(token || '').trim();
  if (!t) return '';
  return `${trackingBaseUrl()}${TRACK_OPEN_PATH}?t=${encodeURIComponent(t)}`;
}

export function buildEmailClickTrackUrl(token = '', targetUrl = '') {
  const t = String(token || '').trim();
  const u = String(targetUrl || '').trim();
  if (!t || !u) return u;
  return `${trackingBaseUrl()}${TRACK_CLICK_PATH}?t=${encodeURIComponent(t)}&u=${encodeURIComponent(u)}`;
}

function shouldTrackHref(href = '') {
  const value = String(href || '').trim();
  if (!value) return false;
  if (/^(mailto:|tel:|sms:|#|javascript:)/i.test(value)) return false;
  if (value.includes(TRACK_CLICK_PATH) || value.includes(TRACK_OPEN_PATH)) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith('/')) return true;
  return false;
}

function rewriteAttr(attrs, name, rewriter) {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const match = String(attrs || '').match(pattern);
  if (!match) return attrs;
  const next = rewriter(String(match[2] || '').replace(/&amp;/g, '&').trim());
  if (next == null) return attrs;
  const safe = String(next).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return String(attrs).replace(pattern, ` ${name}="${safe}"`);
}

/**
 * Inject open pixel + wrap http(s) links for click tracking.
 * Design/layout is unchanged — only tracking URLs are added.
 */
export function injectEmailEngagementTracking(html = '', token = '') {
  const trackingToken = String(token || '').trim();
  if (!trackingToken || !html) return typeof html === 'string' ? html : '';

  let next = String(html);

  next = next.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    let nextAttrs = rewriteAttr(attrs, 'href', (href) => {
      if (!shouldTrackHref(href)) return href;
      return buildEmailClickTrackUrl(trackingToken, href);
    });
    return `<a${nextAttrs}>`;
  });

  const pixelUrl = buildEmailOpenPixelUrl(trackingToken);
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" border="0" style="display:block;width:1px;height:1px;max-width:1px;max-height:1px;border:0;outline:none;text-decoration:none;" />`;

  if (/<\/body>/i.test(next)) {
    next = next.replace(/<\/body>/i, `${pixel}</body>`);
  } else {
    next = `${next}${pixel}`;
  }

  return next;
}

/** Safe redirect target for click tracker (blocks javascript: etc). */
export function resolveTrackedRedirectUrl(raw = '') {
  let value = String(raw || '').trim();
  if (!value) return trackingBaseUrl();

  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw
  }

  value = value.replace(/&amp;/g, '&').trim();
  if (/^(javascript:|data:|vbscript:)/i.test(value)) {
    return trackingBaseUrl();
  }
  if (value.startsWith('/')) {
    return `${trackingBaseUrl()}${value}`;
  }
  if (!/^https?:\/\//i.test(value)) {
    return trackingBaseUrl();
  }
  return value;
}
