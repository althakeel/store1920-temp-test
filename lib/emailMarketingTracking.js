import crypto from 'crypto';
import { getCustomerSiteUrl } from '@/lib/appUrl';

const TRACK_OPEN_PATH = '/e/open';
const TRACK_CLICK_PATH = '/e/click';

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

/** Encode destination so email clients cannot mangle nested ? & = in hrefs. */
function encodeClickTarget(url = '') {
  return Buffer.from(String(url || ''), 'utf8').toString('base64url');
}

function decodeClickTarget(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';

  // Preferred: base64url payload (no nested query chars).
  if (/^[A-Za-z0-9_-]+$/.test(value) && value.length >= 8) {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8').trim();
      if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(decoded)) return decoded;
    } catch {
      // fall through
    }
  }

  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

export function buildEmailClickTrackUrl(token = '', targetUrl = '') {
  const t = String(token || '').trim();
  const u = String(targetUrl || '').trim();
  if (!t || !u) return u;
  return `${trackingBaseUrl()}${TRACK_CLICK_PATH}?t=${encodeURIComponent(t)}&u=${encodeClickTarget(u)}`;
}

function shouldTrackHref(href = '') {
  const value = String(href || '').trim().replace(/&amp;/g, '&');
  if (!value) return false;
  if (/^(mailto:|tel:|sms:|#|javascript:)/i.test(value)) return false;
  if (value.includes(TRACK_CLICK_PATH) || value.includes(TRACK_OPEN_PATH)) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith('/')) return true;
  // bare domains pasted without protocol
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(value)) return true;
  return false;
}

/** Curly quotes from Word/Docs break href matching in email clients. */
export function normalizeEmailHtmlQuotes(html = '') {
  return String(html || '')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

function absolutizeForTrack(href = '') {
  let value = String(href || '').trim().replace(/&amp;/g, '&');
  if (!value) return trackingBaseUrl();
  if (/^(mailto:|tel:|sms:|#)/i.test(value)) return value;
  if (/^javascript:/i.test(value)) return trackingBaseUrl();
  if (value.startsWith('//')) value = `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${trackingBaseUrl()}${value}`;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(value)) {
    return `https://${value}`;
  }
  return `${trackingBaseUrl()}/${value.replace(/^\.\//, '')}`;
}

function rewriteHrefAttr(attrs, rewriter) {
  const source = String(attrs || '');
  const quoted = /\shref\s*=\s*(["'])([\s\S]*?)\1/i;
  const unquoted = /\shref\s*=\s*([^\s>]+)/i;
  const match = source.match(quoted) || source.match(unquoted);
  if (!match) return attrs;

  const raw = String(match[2] != null ? match[2] : match[1] || '')
    .replace(/&amp;/g, '&')
    .trim();
  const next = rewriter(raw);
  if (next == null || next === '') return attrs;

  const safe = String(next).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return source.replace(match[0], ` href="${safe}"`);
}

/**
 * Inject open pixel + wrap http(s) links for click tracking.
 * Does not alter the seller's saved HTML — only the outbound message body.
 */
export function injectEmailEngagementTracking(html = '', token = '') {
  const trackingToken = String(token || '').trim();
  if (!trackingToken || !html) return typeof html === 'string' ? html : '';

  let next = normalizeEmailHtmlQuotes(html);

  // Ensure every anchor href is absolute + quoted before wrapping (fixes inbox clicks).
  next = next.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    let nextAttrs = rewriteHrefAttr(attrs, (href) => absolutizeForTrack(href));
    nextAttrs = rewriteHrefAttr(nextAttrs, (href) => {
      if (!shouldTrackHref(href)) return href;
      return buildEmailClickTrackUrl(trackingToken, href);
    });
    if (!/\starget\s*=/i.test(nextAttrs)) nextAttrs += ' target="_blank"';
    if (!/\srel\s*=/i.test(nextAttrs)) nextAttrs += ' rel="noopener noreferrer"';
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

/** Append opaque email click token so checkout can attribute purchases to a campaign send. */
export function appendEmailTrackingParam(url = '', token = '') {
  const t = String(token || '').trim();
  const target = String(url || '').trim();
  if (!t || !target) return target;
  if (/^(mailto:|tel:|sms:|#)/i.test(target)) return target;

  try {
    const parsed = new URL(target);
    parsed.searchParams.set('et', t);
    return parsed.toString();
  } catch {
    const sep = target.includes('?') ? '&' : '?';
    return `${target}${sep}et=${encodeURIComponent(t)}`;
  }
}

/** Safe redirect target for click tracker (blocks javascript: etc). */
export function resolveTrackedRedirectUrl(raw = '') {
  let value = decodeClickTarget(raw).replace(/&amp;/g, '&').trim();
  if (!value) return trackingBaseUrl();

  if (/^(javascript:|data:|vbscript:)/i.test(value)) {
    return trackingBaseUrl();
  }
  if (value.startsWith('//')) value = `https:${value}`;
  if (value.startsWith('/')) {
    return `${trackingBaseUrl()}${value}`;
  }
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(value)) {
    return `https://${value}`;
  }
  if (!/^https?:\/\//i.test(value) && !/^(mailto:|tel:)/i.test(value)) {
    return trackingBaseUrl();
  }
  return value;
}
