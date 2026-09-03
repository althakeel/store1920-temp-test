import brandLogoAsset from '@/assets/logo/Store1920.png';

const APP_BASE = String(
  process.env.NEXT_PUBLIC_APP_URL
  || process.env.NEXT_PUBLIC_BASE_URL
  || 'https://store1920.com'
).replace(/\/$/, '');

export const STORE1920_BRAND_NAME = 'Store1920';
export const STORE1920_LOGO_PATH = '/logo/Store1920.png';
export const STORE1920_LOGO_URL = String(
  process.env.NEXT_PUBLIC_EMAIL_LOGO_URL || `${APP_BASE}${STORE1920_LOGO_PATH}`
).trim();
export const STORE1920_LOGO_ALT = `${STORE1920_BRAND_NAME} logo`;
export const STORE1920_EMAIL_LOGO_CID = 'store1920-logo';

export const STORE1920_LOGO_SRC =
  typeof brandLogoAsset === 'string'
    ? brandLogoAsset
    : (brandLogoAsset?.src || brandLogoAsset?.default || STORE1920_LOGO_PATH);

export function emailLogoImg(style = 'max-width:200px;height:auto;margin-bottom:16px;display:inline-block;') {
  return `<img src="${STORE1920_LOGO_URL}" alt="${STORE1920_LOGO_ALT}" width="160" style="${style}" />`;
}

/** Compact linked logo for transactional email headers. */
export function emailLogoHeader({
  maxWidth = 108,
  href = APP_BASE,
} = {}) {
  const safeHref = String(href || APP_BASE).trim() || APP_BASE;
  return `
    <a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;line-height:0;">
      <img
        src="${STORE1920_LOGO_URL}"
        alt="${STORE1920_LOGO_ALT}"
        width="${maxWidth}"
        style="display:block;width:${maxWidth}px;max-width:${maxWidth}px;height:auto;border:0;outline:none;margin:0 auto;"
      />
    </a>
  `.trim();
}

export function emailHtmlHasLogo(html = '') {
  if (typeof html !== 'string') return false;
  const lower = html.toLowerCase();
  const cidNeedle = `cid:${STORE1920_EMAIL_LOGO_CID.toLowerCase()}`;
  return lower.includes(cidNeedle)
    || lower.includes('store1920.png')
    || lower.includes(String(STORE1920_LOGO_URL).toLowerCase());
}

export function ensureEmailHtmlHasLogo(html = '') {
  if (typeof html !== 'string' || !html.trim()) {
    return `<div style="text-align:center;padding:24px;background:#ffffff;">${emailLogoImg()}</div>`;
  }
  if (emailHtmlHasLogo(html)) return html;

  const logoBar = `<div style="padding:18px 20px 8px;text-align:center;background:#ffffff;">${emailLogoImg('max-width:160px;height:auto;display:inline-block;margin-bottom:12px;')}</div>`;

  const injectTargets = [
    /<table[^>]*role="presentation"[^>]*style="[^"]*max-width:\s*620px/i,
    /<div style="font-family:[^"]+max-width:\s*620px[^"]*">/i,
    /<div style="[^"]*max-width:\s*620px[^"]*"[^>]*>/i,
    /<div style="font-family:[^"]+max-width:\s*600px[^"]*">/i,
    /<div style="[^"]*max-width:\s*600px[^"]*"[^>]*>/i,
    /<div style="font-family:[^"]+max-width:\s*640px[^"]*">/i,
    /<body[^>]*>/i,
  ];

  for (const pattern of injectTargets) {
    const match = html.match(pattern);
    if (match) {
      return html.replace(match[0], `${match[0]}${logoBar}`);
    }
  }

  return `${logoBar}${html}`;
}

/** @deprecated Prefer not injecting logos into designed marketing HTML. */
export function withBrandEmailLogo(html) {
  return typeof html === 'string' ? html : '';
}
