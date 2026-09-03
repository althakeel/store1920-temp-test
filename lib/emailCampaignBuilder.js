import { getProductAbsoluteUrl } from '@/lib/productUrl';
import { getProductThumbnailUrl, isVideoSource } from '@/lib/productMedia';
import { STORE1920_SUPPORT_EMAIL } from '@/lib/storeContact';
import { getCustomerSiteUrl, normalizeCustomerUrl } from '@/lib/appUrl';

const BASE_URL = () => getCustomerSiteUrl() || 'https://store1920.com';
const CURRENCY = () => process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED';

/** Make hrefs inbox-safe: absolute https URLs (relative paths break in email clients). */
function absolutizeHref(url = '') {
  const raw = String(url || '').trim().replace(/&amp;/g, '&');
  if (!raw) return BASE_URL();
  if (
    raw.startsWith('#')
    || /^mailto:/i.test(raw)
    || /^tel:/i.test(raw)
    || /^sms:/i.test(raw)
  ) {
    return raw;
  }
  if (/^javascript:/i.test(raw)) return '#';

  const normalized = normalizeCustomerUrl(raw) || raw;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('//')) return `https:${normalized}`;

  const base = BASE_URL().replace(/\/$/, '');
  if (normalized.startsWith('/')) return `${base}${normalized}`;

  // store1920.com/offers or www.store1920.com/... without protocol
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#]|$)/i.test(normalized)) {
    return normalizeCustomerUrl(`https://${normalized}`) || `https://${normalized}`;
  }

  return `${base}/${normalized.replace(/^\.\//, '')}`;
}

const safeHref = (url) => absolutizeHref(url || BASE_URL());

function toAbsoluteMediaUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw || isVideoSource(raw)) return '';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  const base = BASE_URL().replace(/\/$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  // Paths stored without a leading slash (e.g. uploads/…)
  if (/^(uploads|images|media|products)\//i.test(raw)) return `${base}/${raw}`;
  return raw;
}

export function resolveEmailProductImage(product = {}) {
  const thumb = getProductThumbnailUrl(product, { fallback: '', allowVideo: false });
  if (thumb) return toAbsoluteMediaUrl(thumb);
  const list = Array.isArray(product.images) ? product.images : [];
  for (const entry of list) {
    const candidate = typeof entry === 'string'
      ? entry
      : (entry?.url || entry?.src || entry?.path || '');
    const absolute = toAbsoluteMediaUrl(candidate);
    if (absolute) return absolute;
  }
  return toAbsoluteMediaUrl(product.image || '');
}

/** Normalize DB products for email render + preview (photo thumbnail, absolute URL). */
export function mapProductsForEmail(products = [], { categoryLookup = null } = {}) {
  return (Array.isArray(products) ? products : []).map((p) => {
    const id = String(p._id || p.id || '').trim();
    const images = Array.isArray(p.images) ? p.images : [];
    const image = resolveEmailProductImage(p);
    let category = String(p.categoryName || p.category || '').trim();
    if (categoryLookup && typeof categoryLookup === 'object') {
      // optional external label map
    }
    if (/^[a-f0-9]{24}$/i.test(category)) category = 'Product';
    return {
      id,
      _id: id,
      slug: p.slug,
      sku: String(p.sku || p.SKU || '').trim(),
      name: p.name,
      brand: String(p.brand || '').trim(),
      description: String(p.description || ''),
      shortDescription: String(p.shortDescription || ''),
      category: category || 'Product',
      categoryName: category || 'Product',
      categoryId: String(p.category || '').trim(),
      price: p.salePrice ?? p.price,
      originalPrice: p.originalPrice || p.AED || p.mrp || null,
      image,
      images,
      stock: p.stockQuantity || p.stock || 0,
      createdAt: p.createdAt,
    };
  }).filter((product) => Boolean(product.id));
}

function rewriteEmailImgSrc(src = '', { origin = '', forSend = false } = {}) {
  let next = String(src || '').replace(/&amp;/g, '&').trim();
  if (!next || next.startsWith('data:')) return next;

  if (next.startsWith('//')) next = `https:${next}`;

  // Sent mail must never point at localhost — rewrite to the public customer site.
  if (forSend && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(next)) {
    const path = next.replace(/^https?:\/\/[^/]+/i, '') || '/';
    next = `${BASE_URL().replace(/\/$/, '')}${path}`;
  }

  const base = String(origin || (forSend ? BASE_URL() : '') || '').replace(/\/$/, '');
  if (next.startsWith('/')) {
    next = `${base || BASE_URL().replace(/\/$/, '')}${next}`;
  } else if (!/^https?:\/\//i.test(next) && !next.startsWith('data:')) {
    const absolute = toAbsoluteMediaUrl(next);
    if (absolute) next = absolute;
  }

  if (!forSend && base && /\/logo\/Store1920\.png(?:\?|$)/i.test(next)) {
    next = `${base}/logo/Store1920.png`;
  }

  return next;
}

/** Preview iframes: prefer direct image URLs + no-referrer (proxy was breaking many CDNs/logos). */
export function rewriteEmailPreviewMediaUrls(html = '', origin = '') {
  const base = String(origin || '').replace(/\/$/, '');
  if (!html) return html;

  return String(html).replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    const srcMatch = String(attrs || '').match(/\ssrc\s*=\s*(["'])(.*?)\1/i);
    if (!srcMatch) return full;

    let src = String(srcMatch[2] || '').replace(/&amp;/g, '&').trim();
    if (!src || src.startsWith('data:')) {
      if (/\sreferrerpolicy\s*=/i.test(attrs)) return full;
      return `<img${attrs} referrerpolicy="no-referrer">`;
    }

    // Already proxied — leave as-is but ensure referrerpolicy.
    if (src.includes('/api/store/email-marketing/media')) {
      if (/\sreferrerpolicy\s*=/i.test(attrs)) return full;
      return `<img${attrs} referrerpolicy="no-referrer">`;
    }

    src = rewriteEmailImgSrc(src, { origin: base, forSend: false });

    const safeSrc = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    let nextAttrs = String(attrs).replace(/\ssrc\s*=\s*(["']).*?\1/i, ` src="${safeSrc}"`);
    if (!/\sreferrerpolicy\s*=/i.test(nextAttrs)) {
      nextAttrs += ' referrerpolicy="no-referrer"';
    }
    if (!/\sloading\s*=/i.test(nextAttrs)) {
      nextAttrs += ' loading="lazy"';
    }
    return `<img${nextAttrs}>`;
  });
}

/** Final pass before send: absolute https image URLs (no lazy-load) + absolute links. */
export function absolutizeEmailHtmlImages(html = '') {
  if (!html) return html;
  let next = String(html).replace(/<img\b([^>]*)>/gi, (full, attrs) => {
    const srcMatch = String(attrs || '').match(/\ssrc\s*=\s*(["'])(.*?)\1/i);
    if (!srcMatch) return full;

    let src = String(srcMatch[2] || '').replace(/&amp;/g, '&').trim();
    if (!src || src.startsWith('data:')) return full;

    src = rewriteEmailImgSrc(src, { forSend: true });
    if (!src) return full;

    const safeSrc = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    let nextAttrs = String(attrs)
      .replace(/\ssrc\s*=\s*(["']).*?\1/i, ` src="${safeSrc}"`)
      .replace(/\sloading\s*=\s*(["']).*?\1/i, '');
    if (!/\sreferrerpolicy\s*=/i.test(nextAttrs)) {
      nextAttrs += ' referrerpolicy="no-referrer"';
    }
    if (!/\sborder\s*=/i.test(nextAttrs)) {
      nextAttrs += ' border="0"';
    }
    return `<img${nextAttrs}>`;
  });

  // Ensure every anchor uses an absolute URL (relative hrefs fail in Gmail/Outlook).
  next = next.replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    let nextAttrs = rewriteAttrUrl(attrs, 'href', (href) => {
      if (!href || href.startsWith('#') || /^mailto:/i.test(href) || /^tel:/i.test(href) || /^sms:/i.test(href)) {
        return href;
      }
      if (/^javascript:/i.test(href)) return '#';
      return absolutizeHref(href);
    });
    if (!/\starget\s*=/i.test(nextAttrs)) nextAttrs += ' target="_blank"';
    if (!/\srel\s*=/i.test(nextAttrs)) nextAttrs += ' rel="noopener noreferrer"';
    return `<a${nextAttrs}>`;
  });

  return next;
}

export const EMAIL_BLOCK_TYPES = [
  { type: 'header', label: 'Logo header', description: 'Brand logo and tagline' },
  { type: 'hero', label: 'Hero banner', description: 'Headline with optional background image' },
  { type: 'badge', label: 'Offer badge', description: 'Highlight pill / promo tag' },
  { type: 'text', label: 'Text block', description: 'Paragraph or announcement' },
  { type: 'html', label: 'Custom HTML', description: 'HTML + CSS — links, images, animations' },
  { type: 'two_column', label: '2-column grid', description: 'Side-by-side text / images' },
  { type: 'button', label: 'Button', description: 'Primary call-to-action' },
  { type: 'form', label: 'Signup form', description: 'Newsletter / lead capture form' },
  { type: 'social', label: 'Social media icons', description: 'Icons with custom links' },
  { type: 'image', label: 'Image', description: 'Full-width image with optional link' },
  { type: 'products', label: 'Product grid', description: '1 or 2 column product grid' },
  { type: 'product_carousel', label: 'Product carousel', description: 'Horizontal product strip with images' },
  { type: 'product_latest', label: 'Latest products', description: 'Newest arrivals with detail cards' },
  { type: 'product_related', label: 'Related products', description: 'Similar / recommended picks' },
  { type: 'divider', label: 'Divider', description: 'Horizontal rule' },
  { type: 'spacer', label: 'Spacer', description: 'Vertical space' },
  { type: 'footer', label: 'Footer', description: 'Unsubscribe and support links' },
];

export const FORM_FIELD_OPTIONS = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
];

/** Visual layouts for signup / lead forms in email. */
export const FORM_STYLE_OPTIONS = [
  { id: 'newsletter', label: 'Newsletter card', description: 'Classic subscribe card' },
  { id: 'minimal', label: 'Minimal line', description: 'Clean single-column fields' },
  { id: 'bold', label: 'Bold banner', description: 'Full-color promo signup' },
  { id: 'split', label: 'Split panel', description: 'Offer left, form right' },
  { id: 'sms', label: 'SMS / WhatsApp', description: 'Phone-first capture' },
  { id: 'vip', label: 'VIP club', description: 'Dark premium membership' },
  { id: 'discount', label: 'Discount code', description: 'Get 10% off signup' },
  { id: 'waitlist', label: 'Waitlist', description: 'Notify me when available' },
  { id: 'rsvp', label: 'Event RSVP', description: 'Elegant invite response' },
  { id: 'inline', label: 'Inline strip', description: 'Email + button in one row' },
  { id: 'stacked', label: 'Stacked soft', description: 'Soft pastel stacked fields' },
  { id: 'outline', label: 'Outline frame', description: 'Bordered centered form' },
];

/** One-click form purpose presets (copy + fields + style). */
export const FORM_TYPE_PRESETS = [
  {
    id: 'newsletter',
    label: 'Newsletter',
    heading: 'Join our newsletter',
    subheading: 'Get offers and new arrivals in your inbox.',
    fields: ['name', 'email'],
    buttonLabel: 'Subscribe',
    formStyle: 'newsletter',
    buttonColor: '#0f766e',
    backgroundColor: '#f8fafc',
  },
  {
    id: 'sms',
    label: 'SMS alerts',
    heading: 'Get deals by text',
    subheading: 'Join our SMS / WhatsApp list for flash sales.',
    fields: ['phone', 'name'],
    buttonLabel: 'Join SMS list',
    formStyle: 'sms',
    buttonColor: '#0d9488',
    backgroundColor: '#042f2e',
  },
  {
    id: 'vip',
    label: 'VIP club',
    heading: 'Become a VIP',
    subheading: 'Early access, private sales, and member codes.',
    fields: ['name', 'email'],
    buttonLabel: 'Join VIP',
    formStyle: 'vip',
    buttonColor: '#ca8a04',
    backgroundColor: '#1c1917',
  },
  {
    id: 'discount',
    label: 'Welcome discount',
    heading: 'Get 10% off',
    subheading: 'Sign up and unlock your welcome code.',
    fields: ['email'],
    buttonLabel: 'Unlock my code',
    formStyle: 'discount',
    buttonColor: '#dc2626',
    backgroundColor: '#fff1f2',
  },
  {
    id: 'waitlist',
    label: 'Waitlist',
    heading: 'Join the waitlist',
    subheading: 'Be first when this drops again.',
    fields: ['email', 'phone'],
    buttonLabel: 'Notify me',
    formStyle: 'waitlist',
    buttonColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  {
    id: 'rsvp',
    label: 'Event RSVP',
    heading: 'You are invited',
    subheading: 'Reserve your seat — limited spots.',
    fields: ['name', 'email'],
    buttonLabel: 'RSVP now',
    formStyle: 'rsvp',
    buttonColor: '#7c3aed',
    backgroundColor: '#0f172a',
  },
  {
    id: 'contact',
    label: 'Contact / concierge',
    heading: 'Talk to our team',
    subheading: 'We will get back within 24 hours.',
    fields: ['name', 'email', 'phone'],
    buttonLabel: 'Send request',
    formStyle: 'outline',
    buttonColor: '#0f172a',
    backgroundColor: '#ffffff',
  },
  {
    id: 'inline',
    label: 'Quick email strip',
    heading: 'Stay in the loop',
    subheading: 'One tap to subscribe.',
    fields: ['email'],
    buttonLabel: 'Join',
    formStyle: 'inline',
    buttonColor: '#0f766e',
    backgroundColor: '#ecfdf5',
  },
];

function applyFormTypePreset(presetId) {
  const preset = FORM_TYPE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return {};
  const { id: _id, label: _label, ...fields } = preset;
  return { ...fields, formType: presetId };
}
/** Hero mark: free emoji, icon pack, or uploaded image */
export const HERO_MARK_MODES = [
  { id: 'emoji', label: 'Emoji' },
  { id: 'icon', label: 'Icons' },
  { id: 'image', label: 'Image' },
  { id: 'none', label: 'None' },
];

export const HERO_ICON_OPTIONS = [
  { id: 'sparkles', label: 'Sparkles', emoji: '✨' },
  { id: 'party', label: 'Party', emoji: '🎉' },
  { id: 'gift', label: 'Gift', emoji: '🎁' },
  { id: 'fire', label: 'Hot', emoji: '🔥' },
  { id: 'star', label: 'Star', emoji: '⭐' },
  { id: 'heart', label: 'Heart', emoji: '❤️' },
  { id: 'tag', label: 'Sale tag', emoji: '🏷️' },
  { id: 'cart', label: 'Cart', emoji: '🛒' },
  { id: 'package', label: 'Package', emoji: '📦' },
  { id: 'megaphone', label: 'Announce', emoji: '📣' },
  { id: 'rocket', label: 'Launch', emoji: '🚀' },
  { id: 'check', label: 'Check', emoji: '✅' },
  { id: 'crown', label: 'Premium', emoji: '👑' },
  { id: 'bell', label: 'Alert', emoji: '🔔' },
  { id: 'wave', label: 'Hello', emoji: '👋' },
  { id: 'sun', label: 'Bright', emoji: '☀️' },
];

export function resolveHeroMarkHtml(block, { size = 42 } = {}) {
  const mode = block.iconMode || (block.iconImageUrl ? 'image' : 'emoji');
  if (mode === 'none') return '';
  if (mode === 'image' && block.iconImageUrl) {
    return `<div style="margin-bottom:10px;"><img src="${escapeHtml(block.iconImageUrl)}" alt="" style="width:${size}px;height:${size}px;object-fit:contain;display:inline-block;border-radius:10px;" /></div>`;
  }
  if (mode === 'icon') {
    const preset = HERO_ICON_OPTIONS.find((item) => item.id === block.iconId);
    const mark = preset?.emoji || block.emoji || '';
    if (!mark) return '';
    return `<div style="font-size:${size}px;line-height:1;margin-bottom:10px;">${escapeHtml(mark)}</div>`;
  }
  if (block.emoji) {
    return `<div style="font-size:${size}px;line-height:1;margin-bottom:10px;">${escapeHtml(block.emoji)}</div>`;
  }
  return '';
}

export const SOCIAL_NETWORKS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C', defaultUrl: 'https://instagram.com/' },
  { id: 'facebook', label: 'Facebook', color: '#1877F2', defaultUrl: 'https://facebook.com/' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', defaultUrl: 'https://wa.me/' },
  { id: 'tiktok', label: 'TikTok', color: '#111111', defaultUrl: 'https://tiktok.com/' },
  { id: 'youtube', label: 'YouTube', color: '#FF0000', defaultUrl: 'https://youtube.com/' },
  { id: 'x', label: 'X (Twitter)', color: '#111111', defaultUrl: 'https://x.com/' },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', defaultUrl: 'https://linkedin.com/' },
  { id: 'snapchat', label: 'Snapchat', color: '#FFFC00', defaultUrl: 'https://snapchat.com/' },
];

export const GRID_COLUMN_OPTIONS = [
  { id: 1, label: '1 column (stacked)' },
  { id: 2, label: '2 columns (grid)' },
];

export const PRODUCT_CARD_STYLES = [
  { id: 'classic', label: 'Classic', description: 'Image, title, text, price, button' },
  { id: 'minimal', label: 'Minimal', description: 'Clean image + name + price' },
  { id: 'bold', label: 'Bold sale', description: 'Strong price and sale badge' },
  { id: 'compact', label: 'Compact', description: 'Smaller image, tight spacing' },
  { id: 'magazine', label: 'Magazine', description: 'Large image, soft caption bar' },
  { id: 'overlay', label: 'Overlay', description: 'Text over image with dark fade' },
  { id: 'soft', label: 'Soft shop', description: 'Rounded pastel card, gentle CTA' },
  { id: 'outline', label: 'Outline', description: 'Border frame, centered details' },
  { id: 'split', label: 'Split', description: 'Image left, details right' },
  { id: 'ticket', label: 'Ticket deal', description: 'Dashed offer card with badge' },
];

export const PRODUCT_CTA_PRESETS = [
  { id: 'Shop now', label: 'Shop now' },
  { id: 'Buy now', label: 'Buy now' },
  { id: 'View product', label: 'View product' },
  { id: 'Order now', label: 'Order now' },
  { id: 'Watch video', label: 'Watch video' },
  { id: 'See details', label: 'See details' },
];

export const PRODUCT_CTA_STYLES = [
  { id: 'filled', label: 'Filled' },
  { id: 'outline', label: 'Outline' },
  { id: 'text', label: 'Text link' },
];

export const PRODUCT_MEDIA_MODES = [
  { id: 'image', label: 'Product image' },
  { id: 'video', label: 'Video thumbnail' },
];

export const PRODUCT_IMAGE_RATIO_OPTIONS = [
  { id: '1:1', label: 'Square (1:1)' },
  { id: '4:5', label: 'Portrait (4:5)' },
];

export function resolveProductImageRatioPadding(ratioId = '1:1') {
  return ratioId === '4:5' ? 125 : 100;
}

function newTabLinkAttrs() {
  return 'target="_blank" rel="noopener noreferrer"';
}

export const PRODUCT_SOURCE_OPTIONS = [
  { id: 'featured', label: 'Featured / in-stock picks' },
  { id: 'latest', label: 'Latest products' },
  { id: 'related', label: 'Related / recommended' },
];

export const PRODUCT_SELECTION_MODES = [
  { id: 'auto', label: 'Auto (featured / latest / related)' },
  { id: 'category', label: 'By category' },
  { id: 'manual', label: 'Choose products (slider picks)' },
];

export const LOGO_POSITION_OPTIONS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

/** Applies to the whole email (all blocks), not only buttons. */
export const EMAIL_FONT_FAMILY_OPTIONS = [
  { id: 'helvetica', label: 'Helvetica / Arial', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { id: 'poppins', label: 'Poppins', value: "Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'montserrat', label: 'Montserrat', value: "Montserrat, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'inter', label: 'Inter', value: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'roboto', label: 'Roboto', value: "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'open-sans', label: 'Open Sans', value: "'Open Sans', Helvetica, Arial, sans-serif" },
  { id: 'lato', label: 'Lato', value: "Lato, Helvetica, Arial, sans-serif" },
  { id: 'nunito', label: 'Nunito', value: "Nunito, Helvetica, Arial, sans-serif" },
  { id: 'raleway', label: 'Raleway', value: "Raleway, Helvetica, Arial, sans-serif" },
  { id: 'georgia', label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', Times, serif" },
  { id: 'playfair', label: 'Playfair Display (serif)', value: "'Playfair Display', Georgia, 'Times New Roman', serif" },
  { id: 'merriweather', label: 'Merriweather (serif)', value: "Merriweather, Georgia, serif" },
  { id: 'verdana', label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: 'courier', label: 'Courier (mono)', value: "'Courier New', Courier, monospace" },
  { id: 'palatino', label: 'Palatino (serif)', value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { id: 'lucida', label: 'Lucida', value: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
];

export function getEmailFontGoogleHref(fontId = '') {
  const id = String(fontId || '').trim().toLowerCase();
  const families = {
    poppins: 'Poppins:wght@400;500;600;700;800',
    montserrat: 'Montserrat:wght@400;500;600;700;800',
    inter: 'Inter:wght@400;500;600;700;800',
    roboto: 'Roboto:wght@400;500;700',
    'open-sans': 'Open+Sans:wght@400;600;700',
    lato: 'Lato:wght@400;700',
    nunito: 'Nunito:wght@400;600;700;800',
    raleway: 'Raleway:wght@400;600;700',
    playfair: 'Playfair+Display:wght@400;600;700',
    merriweather: 'Merriweather:wght@400;700',
  };
  const family = families[id];
  if (!family) return '';
  return `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
}

export const BUTTON_ALIGN_OPTIONS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

export const BUTTON_STYLE_OPTIONS = [
  { id: 'filled', label: 'Filled' },
  { id: 'outline', label: 'Outline' },
  { id: 'text', label: 'Text link' },
];

export const BUTTON_WEIGHT_OPTIONS = [
  { id: '400', label: 'Regular' },
  { id: '500', label: 'Medium' },
  { id: '600', label: 'Semibold' },
  { id: '700', label: 'Bold' },
  { id: '800', label: 'Extra bold' },
];

export const BADGE_STYLE_OPTIONS = [
  { id: 'filled', label: 'Filled pill' },
  { id: 'outline', label: 'Outline' },
  { id: 'soft', label: 'Soft background' },
  { id: 'banner', label: 'Full-width banner' },
];

export const BADGE_ALIGN_OPTIONS = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Center' },
  { id: 'right', label: 'Right' },
];

export function resolveEmailFontFamily(fontIdOrValue = '') {
  const raw = String(fontIdOrValue || '').trim();
  if (!raw) return EMAIL_FONT_FAMILY_OPTIONS[0].value;
  const byId = EMAIL_FONT_FAMILY_OPTIONS.find((item) => item.id === raw);
  if (byId) return byId.value;
  const byValue = EMAIL_FONT_FAMILY_OPTIONS.find((item) => item.value === raw);
  if (byValue) return byValue.value;
  // Allow custom CSS font stacks
  if (raw.includes(',') || raw.includes("'") || raw.includes('"')) return raw;
  return EMAIL_FONT_FAMILY_OPTIONS[0].value;
}

export const HEADER_NAV_LAYOUT_OPTIONS = [
  { id: 'below', label: 'Below logo' },
  { id: 'beside', label: 'Beside logo' },
  { id: 'top', label: 'Above logo' },
];

export const HEADER_NAV_STYLE_OPTIONS = [
  { id: 'plain', label: 'Plain text' },
  { id: 'underline', label: 'Underline' },
  { id: 'pills', label: 'Pills' },
  { id: 'buttons', label: 'Buttons' },
];

export const HEADER_MENU_PRESETS = [
  {
    id: 'shop',
    label: 'Shop menu',
    items: [
      { label: 'Shop', path: '/' },
      { label: 'New in', path: '/new-arrivals' },
      { label: 'Sale', path: '/sale' },
      { label: 'Categories', path: '/categories' },
    ],
  },
  {
    id: 'help',
    label: 'Help menu',
    items: [
      { label: 'Track order', path: '/track-order' },
      { label: 'Returns', path: '/return-policy' },
      { label: 'Support', path: '/contact' },
    ],
  },
  {
    id: 'minimal',
    label: 'Minimal',
    items: [
      { label: 'Shop', path: '/' },
      { label: 'Sale', path: '/sale' },
    ],
  },
];

function defaultHeaderNavItems() {
  const base = BASE_URL().replace(/\/$/, '');
  return [
    { id: createBlockId(), label: 'Shop', url: `${base}/` },
    { id: createBlockId(), label: 'New', url: `${base}/new-arrivals` },
    { id: createBlockId(), label: 'Sale', url: `${base}/sale` },
  ];
}

export function createBlockId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultProductFields(extra = {}) {
  return {
    heading: 'Shop the edit',
    selectionMode: 'manual',
    productSource: 'featured',
    category: '',
    productIds: [],
    limit: 4,
    gridColumns: 2,
    gridRows: 2,
    cardStyle: 'classic',
    showPrice: true,
    showSalePrice: true,
    showOriginalPrice: true,
    showDiscountPercent: true,
    showCta: true,
    showDescription: true,
    showBadge: false,
    showCategory: true,
    showShadow: true,
    showBorder: true,
    ctaLabel: 'Shop now',
    ctaStyle: 'filled', // filled | outline | text
    badgeText: 'NEW',
    accentColor: '#0f766e',
    buttonColor: '#0f766e',
    buttonTextColor: '#ffffff',
    borderColor: '#e5e7eb',
    cardBackground: '#ffffff',
    mediaMode: 'image', // image | video
    imageRatio: '1:1', // 1:1 | 4:5
    ...extra,
  };
}

export function createDefaultBlock(type) {
  const id = createBlockId();
  switch (type) {
    case 'header':
      return {
        id,
        type,
        tagline: 'Smart Shopping, Smart Savings',
        logoUrl: '',
        showLogo: false,
        logoWidth: 150,
        logoMaxHeight: 72,
        logoPosition: 'center',
        logoLink: BASE_URL(),
        logoAlt: 'Store1920',
        backgroundColor: '#ffffff',
        paddingTop: 22,
        paddingBottom: 22,
        paddingLeft: 24,
        paddingRight: 24,
        showTagline: true,
        taglineColor: '#64748b',
        taglineSize: 12,
        taglineWeight: '500',
        showBottomBorder: true,
        bottomBorderColor: '#f1f5f9',
        showNav: true,
        navLayout: 'below',
        navAlign: 'center',
        navStyle: 'plain',
        navColor: '#334155',
        navActiveColor: '#0f766e',
        navSize: 13,
        navWeight: '600',
        navGap: 16,
        navItems: defaultHeaderNavItems(),
        showHeaderCta: false,
        headerCtaLabel: 'Shop now',
        headerCtaUrl: BASE_URL(),
        headerCtaColor: '#0f766e',
        headerCtaTextColor: '#ffffff',
      };
    case 'hero':
      return {
        id,
        type,
        iconMode: 'emoji',
        emoji: '✨',
        iconId: 'sparkles',
        iconImageUrl: '',
        title: 'Your headline here',
        subtitle: 'Supporting line for the campaign',
        color: '#0f172a',
        colorEnd: '#134e4a',
        imageUrl: '',
        overlay: true,
      };
    case 'badge':
      return {
        id,
        type,
        text: 'LIMITED TIME OFFER',
        color: '#0f766e',
        textColor: '#ffffff',
        backgroundColor: '#f8fafc',
        align: 'center',
        badgeStyle: 'filled',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        borderRadius: 999,
        paddingTop: 18,
        paddingBottom: 0,
        paddingLeft: 24,
        paddingRight: 24,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        badgePaddingTop: 8,
        badgePaddingBottom: 8,
        badgePaddingLeft: 14,
        badgePaddingRight: 14,
        showBorder: false,
        borderColor: '#0f766e',
        borderWidth: 2,
      };
    case 'text':
      return {
        id,
        type,
        html: 'Write your message to customers. Keep it clear and focused on one offer.',
        align: 'left',
      };
    case 'html':
      return {
        id,
        type,
        html: '<!-- Paste your HTML below -->\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0">\n  <tr>\n    <td style="padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">\n      <h2 style="margin:0 0 8px;font-size:20px;">Your HTML section</h2>\n      <p style="margin:0 0 12px;">Paste HTML here — links, images, tables, and inline styles all work.</p>\n      <a href="https://store1920.com" style="color:#0f766e;font-weight:700;">Shop now →</a>\n    </td>\n  </tr>\n</table>',
        css: `/* Optional CSS for this block (preview + clients that support <style>) */
.email-html-block a { color: #0f766e; }
/* @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.email-html-block .animate { animation: fadeIn 0.8s ease both; } */`,
        padding: true,
        showCta: false,
        ctaLabel: 'Shop now',
        ctaUrl: BASE_URL(),
        ctaColor: '#0f766e',
        ctaTextColor: '#ffffff',
        ctaAlign: 'center',
        ctaStyle: 'filled',
        ctaPosition: 'below',
      };
    case 'two_column':
      return {
        id,
        type,
        leftTitle: 'Left column',
        leftHtml: 'Add text or an offer for the left side.',
        leftImage: '',
        rightTitle: 'Right column',
        rightHtml: 'Add text or an offer for the right side.',
        rightImage: '',
        backgroundColor: '#f8fafc',
      };
    case 'social':
      return {
        id,
        type,
        heading: 'Follow us',
        align: 'center',
        iconSize: 36,
        backgroundColor: '#f8fafc',
        networks: [
          { id: 'instagram', enabled: true, url: 'https://instagram.com/' },
          { id: 'facebook', enabled: true, url: 'https://facebook.com/' },
          { id: 'whatsapp', enabled: true, url: 'https://wa.me/' },
          { id: 'tiktok', enabled: false, url: 'https://tiktok.com/' },
          { id: 'youtube', enabled: false, url: 'https://youtube.com/' },
          { id: 'x', enabled: false, url: 'https://x.com/' },
          { id: 'linkedin', enabled: false, url: 'https://linkedin.com/' },
          { id: 'snapchat', enabled: false, url: 'https://snapchat.com/' },
        ],
      };
    case 'button':
      return {
        id,
        type,
        label: 'Shop now',
        url: BASE_URL(),
        color: '#0f766e',
        textColor: '#ffffff',
        align: 'center',
        buttonStyle: 'filled',
        fontSize: 15,
        fontWeight: '700',
        borderRadius: 10,
        paddingY: 14,
        paddingX: 36,
        fullWidth: false,
      };
    case 'form':
      return {
        id,
        type,
        heading: 'Join our newsletter',
        subheading: 'Get offers and new arrivals in your inbox.',
        fields: ['name', 'email'],
        buttonLabel: 'Subscribe',
        buttonColor: '#0f766e',
        formStyle: 'card',
        backgroundColor: '#f8fafc',
        successUrl: `${BASE_URL()}/welcome-offer`,
      };
    case 'image':
      return {
        id,
        type,
        src: '',
        alt: 'Campaign image',
        url: BASE_URL(),
      };
    case 'products':
      return { id, type, ...defaultProductFields({ heading: 'Product grid', selectionMode: 'category' }) };
    case 'product_carousel':
      return { id, type, ...defaultProductFields({ heading: 'Product slider', selectionMode: 'manual', limit: 4 }) };
    case 'product_latest':
      return {
        id,
        type,
        ...defaultProductFields({
          heading: 'Latest products',
          selectionMode: 'auto',
          productSource: 'latest',
          showBadge: true,
        }),
      };
    case 'product_related':
      return {
        id,
        type,
        ...defaultProductFields({
          heading: 'Related products',
          selectionMode: 'category',
          productSource: 'related',
        }),
      };
    case 'divider':
      return { id, type, color: '#e5e7eb' };
    case 'spacer':
      return { id, type, height: 24 };
    case 'footer':
      return {
        id,
        type,
        logoUrl: '',
        logoWidth: 140,
        logoPosition: 'center',
        backgroundColor: '#0f172a',
        copyrightText: `© ${new Date().getFullYear()} Store1920. All rights reserved.`,
        supportLabel: 'Questions?',
        supportEmail: STORE1920_SUPPORT_EMAIL,
        showSupport: true,
        unsubscribeText: 'Unsubscribe from promotional emails',
        showUnsubscribe: true,
        showLogo: false,
        companyWebsite: BASE_URL(),
      };
    default:
      return { id, type: 'text', html: '', align: 'left' };
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickProducts(products = [], block = {}) {
  const limit = Math.min(8, Math.max(1, Number(block.limit) || 4));
  const list = Array.isArray(products) ? [...products] : [];
  const hasChosenIds = Array.isArray(block.productIds) && block.productIds.some(Boolean);
  const mode = block.selectionMode || (hasChosenIds ? 'manual' : 'auto');

  if (mode === 'manual') {
    const ids = (block.productIds || []).map(String).filter(Boolean);
    if (!ids.length) {
      // Choose-products mode: show nothing until the seller picks items
      return [];
    }
    const byId = new Map(list.map((product) => [String(product.id || product._id), product]));
    const metaMap = block.productMeta && typeof block.productMeta === 'object'
      ? block.productMeta
      : {};
    const chosen = ids.map((id) => {
      const live = byId.get(id);
      if (live) {
        const meta = metaMap[id] || {};
        return {
          ...meta,
          ...live,
          id,
          _id: id,
          name: live.name || meta.name || '',
          sku: live.sku || meta.sku || '',
          image: toAbsoluteMediaUrl(live.image || meta.image || ''),
          price: live.price ?? meta.price ?? null,
          originalPrice: live.originalPrice ?? meta.originalPrice ?? null,
        };
      }
      const meta = metaMap[id];
      if (!meta) return null;
      return {
        id,
        _id: id,
        name: meta.name || '',
        sku: meta.sku || '',
        brand: meta.brand || '',
        image: toAbsoluteMediaUrl(meta.image || ''),
        price: meta.price ?? null,
        originalPrice: meta.originalPrice ?? null,
        category: meta.categoryName || meta.category || '',
        categoryName: meta.categoryName || meta.category || '',
      };
    }).filter(Boolean);
    // Always keep every selected product in preview/send (cap at 8 for layout safety)
    return chosen.slice(0, Math.min(8, Math.max(limit, ids.length, chosen.length)));
  }

  if (mode === 'category' || block.category) {
    const category = String(block.category || '').trim().toLowerCase();
    if (category) {
      const filtered = list.filter((item) => (
        String(item.category || '').toLowerCase() === category
        || String(item.categoryName || '').toLowerCase() === category
        || String(item.categoryId || '') === String(block.category)
      ));
      if (filtered.length) return filtered.slice(0, limit);
    }
  }

  const source = block.productSource || 'featured';
  if (source === 'latest') {
    return list
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, limit);
  }

  if (source === 'related') {
    const seedCategory = String(block.category || list[0]?.category || '').toLowerCase();
    const related = list.filter((item) => {
      if (!seedCategory) return true;
      return String(item.category || '').toLowerCase() === seedCategory;
    });
    const pool = related.length >= 2 ? related : list;
    return pool.slice(0, limit);
  }

  return list.slice(0, limit);
}

function stripHtmlText(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyObjectId(value = '') {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function productCategoryLabel(product) {
  const label = String(
    product?.categoryName
    || product?.categoryLabel
    || product?.category
    || '',
  ).trim();
  if (!label || isLikelyObjectId(label)) return '';
  return label;
}

function productShortDescription(product, maxLen = 90) {
  const raw = product?.shortDescription || product?.description || '';
  const text = stripHtmlText(raw);
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

function productImage(product) {
  return resolveEmailProductImage(product);
}

function productVideoMeta(product, productUrl) {
  const thumb = product?.videoThumbnail || product?.videoPoster || product?.thumbnail || productImage(product);
  const href = product?.videoUrl || product?.video || productUrl;
  return { thumb, href };
}

function productMeta(product) {
  const salePrice = Number(product.price || 0);
  const originalPrice = product.originalPrice ? Number(product.originalPrice) : null;
  const saving = originalPrice && originalPrice > salePrice
    ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
    : 0;
  return { salePrice, originalPrice, saving };
}

function cardShellStyle({ bg, borderColor, showBorder, showShadow, radius = 14 }) {
  const border = showBorder === false ? 'border:none;' : `border:1px solid ${escapeHtml(borderColor || '#e5e7eb')};`;
  const shadow = showShadow === false ? '' : 'box-shadow:0 8px 24px rgba(15,23,42,0.08);';
  return `background:${escapeHtml(bg || '#ffffff')};border-radius:${radius}px;overflow:hidden;${border}${shadow}`;
}

function renderCardMedia({
  product,
  productUrl,
  mediaMode = 'image',
  showBadge = false,
  badgeText = 'NEW',
  saving = 0,
  showDiscountPercent = true,
  accent = '#0f766e',
  fit = 'cover',
  imageRatio = '1:1',
  height = 0,
  width = 0,
}) {
  const videoMode = mediaMode === 'video';
  const { thumb, href } = productVideoMeta(product, productUrl);
  const image = toAbsoluteMediaUrl(videoMode ? thumb : productImage(product));
  const link = videoMode ? href : productUrl;
  const objectFit = fit === 'contain' ? 'contain' : 'cover';
  const paddingPercent = resolveProductImageRatioPadding(imageRatio);
  // Prefer explicit height when provided (email-safe); otherwise keep aspect-ratio box.
  const fixedHeight = Number(height) > 0 ? Math.round(Number(height)) : 0;
  const imgWidth = Number(width) > 0 ? Math.round(Number(width)) : (fixedHeight || 280);
  const imgAttrs = 'referrerpolicy="no-referrer" border="0"';
  const mediaInner = image
    ? (fixedHeight
      ? `<div style="width:100%;height:${fixedHeight}px;overflow:hidden;background:#f8fafc;line-height:0;font-size:0;">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product?.name || 'Product')}" width="${imgWidth}" height="${fixedHeight}" ${imgAttrs} style="width:100%;max-width:100%;height:${fixedHeight}px;object-fit:${objectFit};object-position:center;display:block;border:0;outline:none;text-decoration:none;background:#f8fafc;" />
        </div>`
      : `<div style="width:100%;padding-bottom:${paddingPercent}%;height:0;position:relative;overflow:hidden;background:#f8fafc;line-height:0;font-size:0;">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product?.name || 'Product')}" width="${imgWidth}" ${imgAttrs} style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:${objectFit};object-position:center;display:block;border:0;outline:none;background:#f8fafc;" />
        </div>`)
    : (fixedHeight
      ? `<div style="width:100%;height:${fixedHeight}px;background:#f1f5f9;"></div>`
      : `<div style="width:100%;padding-bottom:${paddingPercent}%;height:0;background:#f1f5f9;"></div>`);
  return `
    <a href="${escapeHtml(link)}" ${newTabLinkAttrs()} style="display:block;position:relative;text-decoration:none;background:#f8fafc;border:0;outline:none;">
      ${mediaInner}
      ${videoMode ? `
        <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:999px;background:rgba(15,23,42,0.72);color:#fff;font-size:18px;line-height:48px;text-align:center;">▶</span>
      ` : ''}
      ${showBadge ? `<span style="position:absolute;top:10px;left:10px;z-index:2;background:#111827;color:#fff;font-size:10px;font-weight:800;letter-spacing:0.6px;padding:5px 8px;border-radius:999px;">${escapeHtml(badgeText)}</span>` : ''}
      ${showDiscountPercent && saving > 0 ? `<span style="position:absolute;top:10px;right:10px;z-index:2;background:${escapeHtml(accent)};color:#fff;font-size:10px;font-weight:800;padding:5px 8px;border-radius:999px;">-${saving}%</span>` : ''}
    </a>
  `;
}

function renderPriceHtml({
  showPrice = true,
  showSalePrice = true,
  showOriginalPrice = true,
  showDiscountPercent = true,
  salePrice,
  originalPrice,
  saving,
  currency,
  accent,
  size = 18,
  align = 'left',
  compact = false,
}) {
  if (!showPrice) return '';
  const sale = showSalePrice !== false;
  const original = showOriginalPrice !== false && originalPrice && originalPrice > salePrice;
  const percent = showDiscountPercent !== false && saving > 0;
  const saleSize = compact ? Math.min(size, 14) : size;
  const originalSize = compact ? 11 : 12;
  const badge = percent
    ? `<span style="display:inline-block;font-size:${compact ? 9 : 10}px;font-weight:800;color:#ffffff;background:#dc2626;padding:2px ${compact ? 5 : 6}px;border-radius:999px;line-height:1.2;vertical-align:middle;">-${saving}%</span>`
    : '';
  // Narrow carousel cards: keep sale+compare on one row, % badge on the next so nothing clips.
  if (compact && percent) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;">
        <tr>
          <td style="text-align:${align};vertical-align:middle;line-height:1.25;">
            ${sale ? `<span style="font-size:${saleSize}px;font-weight:800;color:${escapeHtml(accent)};">${currency}${Math.floor(salePrice)}</span>` : ''}
            ${original ? `<span style="margin-left:5px;font-size:${originalSize}px;color:#9ca3af;text-decoration:line-through;">${currency}${Math.floor(originalPrice)}</span>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding-top:4px;text-align:${align};">${badge}</td>
        </tr>
      </table>
    `;
  }
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-collapse:collapse;">
      <tr>
        <td style="text-align:${align};vertical-align:middle;line-height:1.2;">
          ${sale ? `<span style="font-size:${saleSize}px;font-weight:800;color:${escapeHtml(accent)};">${currency}${Math.floor(salePrice)}</span>` : ''}
          ${original ? `<span style="margin-left:6px;font-size:${originalSize}px;color:#9ca3af;text-decoration:line-through;">${currency}${Math.floor(originalPrice)}</span>` : ''}
          ${percent ? `<span style="margin-left:6px;">${badge}</span>` : ''}
        </td>
      </tr>
    </table>
  `;
}

function renderProductTitle(name, { lines = 2, fontSize = 13, align = 'left', color = '#111827' } = {}) {
  const lineHeight = 1.35;
  const height = Math.round(fontSize * lineHeight * lines);
  return `
    <div style="font-size:${fontSize}px;font-weight:700;color:${escapeHtml(color)};line-height:${lineHeight};height:${height}px;overflow:hidden;text-align:${align};">
      ${escapeHtml(name || 'Product')}
    </div>
  `;
}

function renderCtaHtml({
  showCta = true,
  productUrl,
  ctaLabel = 'Shop now',
  ctaStyle = 'filled',
  buttonColor = '#0f766e',
  buttonTextColor = '#ffffff',
  fullWidth = true,
}) {
  if (!showCta) return '';
  const label = String(ctaLabel || 'Shop now').trim() || 'Shop now';
  let color = String(buttonColor || '#0f766e').trim() || '#0f766e';
  let text = String(buttonTextColor || '#ffffff').trim() || '#ffffff';
  // Guard against invisible buttons (empty / white-on-white)
  if (/^#([fF]{3}|[fF]{6})$/.test(color)) color = '#0f766e';
  if (ctaStyle === 'filled' && /^#([fF]{3}|[fF]{6})$/.test(text)) text = '#ffffff';
  if (ctaStyle === 'text') {
    return `<a href="${escapeHtml(productUrl)}" ${newTabLinkAttrs()} style="display:inline-block;margin-top:12px;color:${escapeHtml(color)};font-size:12px;font-weight:700;text-decoration:underline;">${escapeHtml(label)} →</a>`;
  }
  if (ctaStyle === 'outline') {
    return `<a href="${escapeHtml(productUrl)}" ${newTabLinkAttrs()} style="display:${fullWidth ? 'block' : 'inline-block'};margin-top:12px;background:transparent;color:${escapeHtml(color)};border:2px solid ${escapeHtml(color)};text-decoration:none;text-align:center;padding:10px 14px;border-radius:9px;font-size:12px;font-weight:800;">${escapeHtml(label)}</a>`;
  }
  return `<a href="${escapeHtml(productUrl)}" ${newTabLinkAttrs()} style="display:${fullWidth ? 'block' : 'inline-block'};margin-top:12px;background:${escapeHtml(color)};color:${escapeHtml(text)};text-decoration:none;text-align:center;padding:11px 14px;border-radius:9px;font-size:12px;font-weight:800;">${escapeHtml(label)}</a>`;
}

function renderEmptyProducts(label = 'products') {
  return `
    <div style="padding:28px 16px;text-align:center;color:#6b7280;font-size:13px;border:1px dashed #d1d5db;border-radius:12px;background:#fff;">
      ${escapeHtml(label)}
    </div>
  `;
}

function renderDetailCard(product, options = {}) {
  const {
    showPrice = true,
    showSalePrice = true,
    showOriginalPrice = true,
    showDiscountPercent = true,
    showCta = true,
    showBadge = false,
    showDescription = true,
    showCategory = true,
    showShadow = true,
    showBorder = true,
    accent = '#0f766e',
    widthPercent = 50,
    cardStyle = 'classic',
    ctaLabel = 'Shop now',
    ctaStyle = 'filled',
    badgeText = 'NEW',
    buttonColor = '#0f766e',
    buttonTextColor = '#ffffff',
    borderColor = '#e5e7eb',
    cardBackground = '#ffffff',
  mediaMode = 'image',
    imageRatio = '1:1',
    cellWidthPx = 0,
  } = options;

  const baseUrl = BASE_URL();
  const currency = CURRENCY();
  const productUrl = getProductAbsoluteUrl(product, baseUrl) || `${baseUrl}/products`;
  const { salePrice, originalPrice, saving } = productMeta(product);
  const category = showCategory ? productCategoryLabel(product) : '';
  const description = showDescription ? productShortDescription(product, cardStyle === 'compact' ? 60 : 90) : '';
  const style = cardStyle || 'classic';
  const bg = cardBackground || '#ffffff';
  const btnColor = buttonColor || accent || '#0f766e';
  const ratio = imageRatio === '4:5' ? '4:5' : '1:1';
  const ratioHeight = (base) => (ratio === '4:5' ? Math.round(base * 1.25) : base);
  const fixedCell = Number(cellWidthPx) > 0;
  const cellWidth = fixedCell
    ? `width:${Math.round(cellWidthPx)}px;min-width:${Math.round(cellWidthPx)}px;max-width:${Math.round(cellWidthPx)}px;`
    : `width:${widthPercent}%;`;
  const priceOpts = {
    showPrice, showSalePrice, showOriginalPrice, showDiscountPercent,
    salePrice, originalPrice, saving, currency, accent: btnColor,
    compact: fixedCell,
  };
  const ctaOpts = {
    showCta, productUrl, ctaLabel, ctaStyle, buttonColor: btnColor, buttonTextColor,
    fullWidth: style !== 'compact',
  };
  const mediaOpts = {
    product, productUrl, mediaMode, showBadge, badgeText: badgeText || 'NEW',
    saving, showDiscountPercent, accent: btnColor, imageRatio: ratio,
    width: fixedCell ? Math.round(cellWidthPx) : (widthPercent >= 100 ? 560 : 280),
  };
  const shell = { bg, borderColor, showBorder, showShadow };
  // Carousel cards are narrow — scale image heights down for compact.
  const compactImageBase = fixedCell ? 96 : 120;

  if (style === 'minimal') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <div style="${cardShellStyle({ ...shell, radius: 12 })}">
          ${renderCardMedia({ ...mediaOpts, height: ratioHeight(170), showBadge: false, showDiscountPercent: false, fit: 'cover' })}
          <div style="padding:12px 8px;text-align:center;">
            ${renderProductTitle(product.name, { lines: 2, fontSize: 13, align: 'center' })}
            ${renderPriceHtml({ ...priceOpts, size: 16, align: 'center' })}
            <div style="text-align:center;">${renderCtaHtml({ ...ctaOpts, fullWidth: false })}</div>
          </div>
        </div>
      </td>
    `;
  }

  if (style === 'bold') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <div style="${cardShellStyle({ ...shell, borderColor: btnColor, showBorder: true, radius: 16 })}border:2px solid ${escapeHtml(btnColor)};">
          ${renderCardMedia({ ...mediaOpts, height: ratioHeight(180), showDiscountPercent: false, fit: 'cover' })}
          <div style="padding:14px;text-align:center;">
            ${renderProductTitle(product.name, { lines: 2, fontSize: 14, align: 'center', color: '#0f172a' })}
            ${renderPriceHtml({ ...priceOpts, size: 20, align: 'center' })}
            ${renderCtaHtml({ ...ctaOpts, ctaStyle: ctaStyle || 'filled' })}
          </div>
        </div>
      </td>
    `;
  }

  if (style === 'compact') {
    return `
      <td style="${cellWidth}padding:4px;vertical-align:top;">
        <div style="${cardShellStyle({ ...shell, radius: 10 })}">
          ${renderCardMedia({ ...mediaOpts, height: ratioHeight(compactImageBase), showDiscountPercent: false, fit: 'cover' })}
          <div style="padding:8px;">
            ${renderProductTitle(product.name, { lines: 2, fontSize: 11 })}
            ${renderPriceHtml({ ...priceOpts, size: 13 })}
            ${renderCtaHtml({ ...ctaOpts, fullWidth: false })}
          </div>
        </div>
      </td>
    `;
  }

  if (style === 'magazine') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <div style="${cardShellStyle({ ...shell, radius: 4, showBorder: false })}border-bottom:3px solid ${escapeHtml(btnColor)};">
          ${renderCardMedia({ ...mediaOpts, height: fixedCell ? ratioHeight(140) : (widthPercent >= 100 ? 260 : 200) })}
          <div style="padding:16px 12px;">
            ${category ? `<div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${escapeHtml(btnColor)};font-weight:700;margin-bottom:6px;">${escapeHtml(category)}</div>` : ''}
            <div style="font-size:16px;font-weight:700;color:#0f172a;line-height:1.3;font-family:Georgia,serif;">${escapeHtml(product.name || 'Product')}</div>
            ${description ? `<div style="margin-top:8px;font-size:12px;color:#64748b;line-height:1.5;">${escapeHtml(description)}</div>` : ''}
            ${renderPriceHtml({ ...priceOpts, size: 18 })}
            ${renderCtaHtml({ ...ctaOpts, ctaStyle: 'text', fullWidth: false })}
          </div>
        </div>
      </td>
    `;
  }

  if (style === 'overlay') {
    const height = fixedCell ? ratioHeight(160) : (widthPercent >= 100 ? 280 : 220);
    const videoMode = mediaMode === 'video';
    const { thumb, href } = productVideoMeta(product, productUrl);
    const image = toAbsoluteMediaUrl(videoMode ? thumb : productImage(product));
    const link = videoMode ? href : productUrl;
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <a href="${escapeHtml(link)}" style="display:block;text-decoration:none;border-radius:16px;overflow:hidden;${showShadow === false ? '' : 'box-shadow:0 10px 28px rgba(15,23,42,0.18);'}">
          <div style="position:relative;height:${height}px;background:#0f172a;">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name || 'Product')}" width="${fixedCell ? Math.round(cellWidthPx) : 280}" height="${height}" referrerpolicy="no-referrer" border="0" style="width:100%;max-width:100%;height:${height}px;object-fit:cover;display:block;border:0;" />` : ''}
            ${videoMode ? `<span style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:999px;background:rgba(15,23,42,0.72);color:#fff;font-size:18px;line-height:48px;text-align:center;">▶</span>` : ''}
            <div style="position:absolute;left:0;right:0;bottom:0;padding:20px 16px;background:linear-gradient(180deg,rgba(15,23,42,0) 0%,rgba(15,23,42,0.92) 70%);color:#fff;">
              ${showBadge ? `<span style="display:inline-block;background:${escapeHtml(btnColor)};color:#fff;font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px;margin-bottom:8px;">${escapeHtml(badgeText || 'NEW')}</span>` : ''}
              <div style="font-size:15px;font-weight:800;line-height:1.3;">${escapeHtml(product.name || 'Product')}</div>
              ${showPrice && showSalePrice !== false ? `<div style="margin-top:8px;font-size:20px;font-weight:900;">${currency}${Math.floor(salePrice)}${showDiscountPercent !== false && saving > 0 ? ` <span style="font-size:12px;opacity:0.9;">-${saving}%</span>` : ''}</div>` : ''}
              ${showCta ? `<div style="margin-top:10px;font-size:12px;font-weight:700;opacity:0.95;">${escapeHtml(ctaLabel || 'Shop now')} →</div>` : ''}
            </div>
          </div>
        </a>
      </td>
    `;
  }

  if (style === 'soft') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <div style="${cardShellStyle({ ...shell, bg: bg === '#ffffff' ? '#f8fafc' : bg, radius: 24, showBorder: false })}padding:10px;">
          <div style="border-radius:18px;overflow:hidden;">
            ${renderCardMedia({ ...mediaOpts, height: ratioHeight(170), showDiscountPercent: false, fit: 'cover' })}
          </div>
          <div style="padding:14px 8px 10px;text-align:center;">
            ${renderProductTitle(product.name, { lines: 2, fontSize: 14, align: 'center', color: '#0f172a' })}
            ${renderPriceHtml({ ...priceOpts, size: 17, align: 'center' })}
            <div style="text-align:center;">${renderCtaHtml({ ...ctaOpts, fullWidth: false })}</div>
          </div>
        </div>
      </td>
    `;
  }

  if (style === 'outline') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <div style="${cardShellStyle({ ...shell, borderColor: borderColor || '#0f172a', radius: 0, showShadow: false })}border:2px solid ${escapeHtml(borderColor || '#0f172a')};">
          ${renderCardMedia({ ...mediaOpts, height: 180 })}
          <div style="padding:16px;text-align:center;border-top:2px solid ${escapeHtml(borderColor || '#0f172a')};">
            ${category ? `<div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;margin-bottom:6px;">${escapeHtml(category)}</div>` : ''}
            <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:1.3;text-transform:uppercase;">${escapeHtml(product.name || 'Product')}</div>
            ${renderPriceHtml({ ...priceOpts, size: 18, align: 'center', accent: '#0f172a' })}
            ${renderCtaHtml({ ...ctaOpts, ctaStyle: ctaStyle === 'filled' ? 'outline' : ctaStyle, buttonColor: borderColor || '#0f172a' })}
          </div>
        </div>
      </td>
    `;
  }

  if (style === 'split') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${cardShellStyle({ ...shell, radius: 14 })}">
          <tr>
            <td width="42%" style="vertical-align:middle;">
              ${renderCardMedia({ ...mediaOpts, height: 150, showBadge: false, showDiscountPercent: false })}
            </td>
            <td style="padding:14px;vertical-align:middle;">
              ${showBadge ? `<div style="display:inline-block;background:${escapeHtml(btnColor)};color:#fff;font-size:9px;font-weight:800;padding:3px 7px;border-radius:999px;margin-bottom:6px;">${escapeHtml(badgeText || 'NEW')}</div>` : ''}
              <div style="font-size:13px;font-weight:700;color:#0f172a;line-height:1.35;">${escapeHtml(product.name || 'Product')}</div>
              ${description ? `<div style="margin-top:6px;font-size:11px;color:#64748b;line-height:1.4;">${escapeHtml(description)}</div>` : ''}
              ${renderPriceHtml({ ...priceOpts, size: 16 })}
              ${renderCtaHtml({ ...ctaOpts, ctaStyle: 'text', fullWidth: false })}
            </td>
          </tr>
        </table>
      </td>
    `;
  }

  if (style === 'ticket') {
    return `
      <td style="${cellWidth}padding:8px;vertical-align:top;">
        <div style="background:${escapeHtml(bg)};border:2px dashed ${escapeHtml(btnColor)};border-radius:14px;overflow:hidden;${showShadow === false ? '' : 'box-shadow:0 8px 20px rgba(15,23,42,0.06);'}">
          ${renderCardMedia({ ...mediaOpts, height: 150 })}
          <div style="padding:14px;text-align:center;">
            <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${escapeHtml(btnColor)};margin-bottom:4px;">Special deal</div>
            <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:1.3;">${escapeHtml(product.name || 'Product')}</div>
            ${renderPriceHtml({ ...priceOpts, size: 20, align: 'center' })}
            ${renderCtaHtml(ctaOpts)}
          </div>
        </div>
      </td>
    `;
  }

  // classic — uniform card for grids / carousel
  const classicPad = fixedCell ? 10 : 14;
  const classicTitleSize = fixedCell ? 12 : 14;
  const classicPriceSize = fixedCell ? 14 : 18;
  return `
    <td style="${cellWidth}padding:${fixedCell ? 6 : 8}px;vertical-align:top;">
      <div style="${cardShellStyle({ ...shell, radius: 14 })}">
        ${renderCardMedia({
          ...mediaOpts,
          height: ratioHeight(fixedCell ? 148 : (widthPercent >= 100 ? 220 : 180)),
          showDiscountPercent: false,
          fit: 'cover',
        })}
        <div style="padding:${classicPad}px;box-sizing:border-box;">
          ${category ? `<div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px;height:14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:100%;">${escapeHtml(category)}</div>` : ''}
          ${renderProductTitle(product.name, { lines: 2, fontSize: classicTitleSize })}
          ${description && !fixedCell ? `<div style="margin-top:6px;font-size:12px;color:#6b7280;line-height:1.45;height:34px;overflow:hidden;">${escapeHtml(description)}</div>` : ''}
          ${renderPriceHtml({ ...priceOpts, size: classicPriceSize, compact: fixedCell })}
          ${renderCtaHtml(ctaOpts)}
        </div>
      </div>
    </td>
  `;
}
function renderProductGridLayout(products, block, options = {}) {
  if (!products.length) return renderEmptyProducts(options.emptyLabel || 'products');
  const columns = Number(block.gridColumns) === 1 ? 1 : 2;
  // "How many" is the source of truth — do not clip by stale gridRows.
  const limit = Math.min(12, Math.max(1, Number(block.limit) || 4));
  const capped = products.slice(0, Math.min(products.length, limit));
  const widthPercent = columns === 1 ? 100 : 50;
  const cards = capped.map((product) => renderDetailCard(product, {
    showPrice: block.showPrice !== false,
    showSalePrice: block.showSalePrice !== false,
    showOriginalPrice: block.showOriginalPrice !== false,
    showDiscountPercent: block.showDiscountPercent !== false,
    showCta: block.showCta !== false,
    showBadge: Boolean(options.showBadge || block.showBadge),
    showDescription: block.showDescription !== false,
    showCategory: block.showCategory !== false,
    showShadow: block.showShadow !== false,
    showBorder: block.showBorder !== false,
    accent: block.accentColor || options.accent || '#0f766e',
    widthPercent,
    cardStyle: block.cardStyle || 'classic',
    ctaLabel: block.ctaLabel || 'Shop now',
    ctaStyle: block.ctaStyle || 'filled',
    badgeText: block.badgeText || 'NEW',
    buttonColor: block.buttonColor || block.accentColor || '#0f766e',
    buttonTextColor: block.buttonTextColor || '#ffffff',
    borderColor: block.borderColor || '#e5e7eb',
    cardBackground: block.cardBackground || '#ffffff',
    mediaMode: block.mediaMode || 'image',
    imageRatio: block.imageRatio || '1:1',
  }));
  const rows = [];
  for (let i = 0; i < cards.length; i += columns) {
    const cells = cards.slice(i, i + columns);
    while (cells.length < columns) {
      cells.push(`<td style="width:${widthPercent}%;padding:8px;"></td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

function renderSocialBlock(block) {
  const networksMeta = Object.fromEntries(SOCIAL_NETWORKS.map((item) => [item.id, item]));
  const size = Math.min(48, Math.max(28, Number(block.iconSize) || 36));
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const items = (Array.isArray(block.networks) ? block.networks : [])
    .filter((item) => item?.enabled && String(item.url || '').trim());

  if (!items.length) {
    return `
      <div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px;background:${escapeHtml(block.backgroundColor || '#f8fafc')};">
        Enable social icons and add links in Customize
      </div>
    `;
  }

  const cells = items.map((item) => {
    const meta = networksMeta[item.id] || { label: item.id, color: '#334155' };
    const short = meta.label.slice(0, 2).toUpperCase();
    const textColor = item.id === 'snapchat' ? '#111111' : '#ffffff';
    return `
      <td style="padding:0 6px;">
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(meta.label)}" style="text-decoration:none;display:inline-block;">
          <span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;border-radius:999px;background:${meta.color};color:${textColor};font-size:${Math.max(10, Math.floor(size / 3))}px;font-weight:800;text-align:center;font-family:Arial,sans-serif;">
            ${escapeHtml(short)}
          </span>
        </a>
      </td>
    `;
  }).join('');

  return `
    <div style="padding:18px 24px 22px;background:${escapeHtml(block.backgroundColor || '#f8fafc')};text-align:${align};">
      ${block.heading ? `<div style="margin:0 0 12px;font-size:13px;font-weight:700;color:#334155;text-align:${align};">${escapeHtml(block.heading)}</div>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;${align === 'left' ? 'margin-left:0;' : align === 'right' ? 'margin-right:0;margin-left:auto;' : ''}">
        <tr>${cells}</tr>
      </table>
    </div>
  `;
}

function renderTwoColumnBlock(block) {
  const cell = (title, html, image) => {
    const src = toAbsoluteMediaUrl(image || '');
    return `
    <td style="width:50%;padding:8px;vertical-align:top;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        ${src ? `<img src="${escapeHtml(src)}" alt="" width="280" height="160" referrerpolicy="no-referrer" border="0" style="width:100%;max-width:100%;height:160px;object-fit:cover;display:block;border:0;" />` : ''}
        <div style="padding:14px;">
          ${title ? `<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:6px;">${escapeHtml(title)}</div>` : ''}
          ${html ? `<div style="font-size:13px;line-height:1.6;color:#334155;">${escapeHtml(html)}</div>` : ''}
        </div>
      </div>
    </td>
  `;
  };
  return `
    <div style="padding:12px 18px 20px;background:${escapeHtml(block.backgroundColor || '#f8fafc')};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${cell(block.leftTitle, block.leftHtml, block.leftImage)}
          ${cell(block.rightTitle, block.rightHtml, block.rightImage)}
        </tr>
      </table>
    </div>
  `;
}

function renderCarouselLayout(products, block) {
  if (!products.length) return renderEmptyProducts('carousel products');
  const style = block.cardStyle || 'classic';
  const cardWidthByStyle = {
    compact: 132,
    minimal: 156,
    bold: 176,
    magazine: 188,
    overlay: 176,
    soft: 168,
    outline: 176,
    split: 248,
    ticket: 176,
    classic: 188,
  };
  const cardWidth = cardWidthByStyle[style] || 168;
  const accentRaw = String(block.buttonColor || block.accentColor || '').trim();
  const accent = (!accentRaw || /^#([fF]{3}|[fF]{6})$/.test(accentRaw)) ? '#0f766e' : accentRaw;

  const cells = products.map((product) => renderDetailCard(product, {
    showPrice: block.showPrice !== false,
    showSalePrice: block.showSalePrice !== false,
    showOriginalPrice: block.showOriginalPrice !== false,
    showDiscountPercent: block.showDiscountPercent !== false,
    showCta: block.showCta !== false,
    showBadge: Boolean(block.showBadge),
    // Carousel cards stay tight — hide long descriptions except magazine/split.
    showDescription: style === 'magazine' || style === 'split',
    showCategory: style === 'magazine' || style === 'outline' || style === 'classic',
    showShadow: block.showShadow !== false,
    showBorder: block.showBorder !== false,
    accent,
    widthPercent: 100,
    cellWidthPx: cardWidth,
    cardStyle: style,
    ctaLabel: block.ctaLabel || 'Shop now',
    ctaStyle: block.ctaStyle || 'filled',
    badgeText: block.badgeText || 'NEW',
    buttonColor: accent,
    buttonTextColor: block.buttonTextColor || '#ffffff',
    borderColor: block.borderColor || '#e5e7eb',
    cardBackground: block.cardBackground || '#ffffff',
    mediaMode: block.mediaMode || 'image',
    imageRatio: block.imageRatio || '1:1',
  })).join('');

  return `
    <div class="email-product-carousel" style="overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;touch-action:pan-x;cursor:grab;scrollbar-width:none;-ms-overflow-style:none;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:auto;border-collapse:separate;table-layout:fixed;">
        <tr>${cells}</tr>
      </table>
    </div>
  `;
}

function looksLikeObjectId(value = '') {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

function resolveCategoryLabel(block = {}, products = []) {
  const named = String(block.categoryName || '').trim();
  if (named && !looksLikeObjectId(named)) return named;

  const raw = String(block.category || '').trim();
  if (!raw) return '';
  if (!looksLikeObjectId(raw)) return raw;

  const match = (Array.isArray(products) ? products : []).find((product) => (
    String(product.categoryId || '') === raw
    || String(product.category || '') === raw
  ));
  const fromProduct = String(match?.categoryName || match?.category || '').trim();
  if (fromProduct && !looksLikeObjectId(fromProduct)) return fromProduct;
  return 'Selected category';
}

function renderProductSection(block, products, layout, { previewMode = false } = {}) {
  const selected = pickProducts(products, block);
  if (!selected.length) {
    if (!previewMode) return '';
    return `
    <div style="padding:8px 18px 24px;background:#f8fafc;">
      ${block.heading ? `<h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#0f172a;text-align:center;">${escapeHtml(block.heading)}</h3>` : ''}
      ${renderEmptyProducts(
        block.selectionMode === 'manual'
          ? 'No products selected yet. Search and choose products on the left.'
          : (layout === 'latest'
            ? 'No latest products available for preview.'
            : layout === 'related'
              ? 'No related products available for preview.'
              : 'No products available for preview.'),
      )}
    </div>
  `;
  }

  let body = '';
  if (layout === 'carousel') body = renderCarouselLayout(selected, block);
  else if (layout === 'latest') body = renderProductGridLayout(selected, block, { showBadge: true, emptyLabel: 'latest products', accent: '#0369a1' });
  else if (layout === 'related') body = renderProductGridLayout(selected, block, { emptyLabel: 'related products', accent: '#7c3aed' });
  else body = renderProductGridLayout(selected, block);

  const categoryLabel = resolveCategoryLabel(block, selected);
  const modeLabel = previewMode
    ? (block.selectionMode === 'manual'
      ? 'Chosen products'
      : block.selectionMode === 'category' && (categoryLabel || block.category)
        ? `Category: ${categoryLabel || 'Selected category'}`
        : `${block.productSource || 'featured'} products`)
    : '';

  return `
    <div style="padding:8px 18px 24px;background:#f8fafc;">
      ${block.heading ? `<h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#0f172a;text-align:center;">${escapeHtml(block.heading)}</h3>` : ''}
      ${modeLabel ? `<p style="margin:0 0 14px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">${escapeHtml(modeLabel)}</p>` : (block.heading ? `<div style="height:8px;"></div>` : '')}
      ${body}
    </div>
  `;
}

function renderFooter(block = {}, recipientEmail = '') {
  const baseUrl = safeHref(block.companyWebsite).replace(/\/$/, '') || 'https://store1920.com';
  const unsubscribeUrl = recipientEmail
    ? `${baseUrl}/unsubscribe?unsubscribe=promotional&email=${encodeURIComponent(recipientEmail)}`
    : `${baseUrl}/unsubscribe?unsubscribe=promotional`;
  const position = ['left', 'center', 'right'].includes(block.logoPosition)
    ? block.logoPosition
    : 'center';
  const logoWidth = Math.min(200, Math.max(80, Number(block.logoWidth) || 140));
  const logoSrc = String(block.logoUrl || '').trim();
  const logoHtml = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="Store logo" width="${logoWidth}" style="max-width:${logoWidth}px;height:auto;display:inline-block;" />`
    : '';
  const supportEmail = String(block.supportEmail || STORE1920_SUPPORT_EMAIL).trim();
  const supportLabel = String(block.supportLabel || 'Questions?').trim();
  const copyrightText = String(block.copyrightText || `© ${new Date().getFullYear()} Store1920. All rights reserved.`).trim();
  const unsubscribeText = String(block.unsubscribeText || 'Unsubscribe from promotional emails').trim();

  return `
    <div style="background:${escapeHtml(block.backgroundColor || '#0f172a')};padding:32px 24px;text-align:${position};color:#cbd5e1;">
      ${logoHtml ? `<div style="margin-bottom:12px;">${logoHtml}</div>` : ''}
      ${copyrightText ? `<p style="margin:0 0 12px;font-size:12px;color:#94a3b8;text-align:${position};">${escapeHtml(copyrightText)}</p>` : ''}
      ${block.showSupport !== false && supportEmail ? `
        <p style="margin:0 0 12px;font-size:12px;text-align:${position};">
          ${escapeHtml(supportLabel)} <a href="mailto:${escapeHtml(supportEmail)}" style="color:#e2e8f0;">${escapeHtml(supportEmail)}</a>
        </p>
      ` : ''}
      ${block.companyWebsite ? `
        <p style="margin:0 0 12px;font-size:12px;text-align:${position};">
          <a href="${escapeHtml(baseUrl)}" style="color:#e2e8f0;text-decoration:underline;">${escapeHtml(baseUrl.replace(/^https?:\/\//, ''))}</a>
        </p>
      ` : ''}
      ${block.showUnsubscribe !== false ? `<a href="${unsubscribeUrl}" style="color:#5eead4;font-size:11px;">${escapeHtml(unsubscribeText)}</a>` : ''}
    </div>
  `;
}

function renderHeaderNav(block) {
  const items = (Array.isArray(block.navItems) ? block.navItems : [])
    .filter((item) => String(item?.label || '').trim());
  if (!items.length) return '';

  const align = ['left', 'center', 'right'].includes(block.navAlign) ? block.navAlign : 'center';
  const size = Math.min(18, Math.max(11, Number(block.navSize) || 13));
  const weight = ['400', '500', '600', '700'].includes(String(block.navWeight))
    ? String(block.navWeight)
    : '600';
  const gap = Math.min(28, Math.max(6, Number(block.navGap) || 16));
  const color = escapeHtml(block.navColor || '#334155');
  const active = escapeHtml(block.navActiveColor || '#0f766e');
  const style = block.navStyle || 'plain';

  const links = items.map((item, index) => {
    const href = escapeHtml(safeHref(item.url || BASE_URL()));
    const label = escapeHtml(String(item.label).trim());
    const isLast = index === items.length - 1;
    let linkStyle = `color:${color};font-size:${size}px;font-weight:${weight};text-decoration:none;display:inline-block;`;
    if (style === 'underline') {
      linkStyle += `border-bottom:2px solid ${active};padding-bottom:2px;`;
    } else if (style === 'pills') {
      linkStyle += `background:#f1f5f9;color:${active};padding:6px 12px;border-radius:999px;`;
    } else if (style === 'buttons') {
      linkStyle += `background:${active};color:#ffffff;padding:7px 14px;border-radius:8px;`;
    }
    return `<a href="${href}" style="${linkStyle}">${label}</a>${isLast ? '' : `<span style="display:inline-block;width:${gap}px;"></span>`}`;
  }).join('');

  return `
    <div style="text-align:${align};line-height:1.4;">
      ${links}
    </div>
  `;
}

function renderHeaderCta(block) {
  if (block.showHeaderCta === false || !block.headerCtaLabel) return '';
  const href = escapeHtml(safeHref(block.headerCtaUrl || BASE_URL()));
  const bg = escapeHtml(block.headerCtaColor || '#0f766e');
  const color = escapeHtml(block.headerCtaTextColor || '#ffffff');
  return `
    <div style="margin-top:12px;text-align:${['left', 'center', 'right'].includes(block.navAlign) ? block.navAlign : 'center'};">
      <a href="${href}" style="display:inline-block;background:${bg};color:${color};text-decoration:none;padding:9px 18px;border-radius:8px;font-size:12px;font-weight:700;">
        ${escapeHtml(block.headerCtaLabel)}
      </a>
    </div>
  `;
}

function resolveBoxSpacing(block = {}, prefix = 'padding', defaults = {}) {
  const fallbackY = Number(block[`${prefix}Y`]) || defaults.top || 0;
  const fallbackX = Number(block[`${prefix}X`]) || defaults.left || 0;
  const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) ?? fallback));
  return {
    top: clamp(block[`${prefix}Top`], 0, 96, defaults.top ?? fallbackY),
    right: clamp(block[`${prefix}Right`], 0, 96, defaults.right ?? fallbackX),
    bottom: clamp(block[`${prefix}Bottom`], 0, 96, defaults.bottom ?? fallbackY),
    left: clamp(block[`${prefix}Left`], 0, 96, defaults.left ?? fallbackX),
  };
}

function resolveHeaderPadding(block = {}) {
  const fallbackY = Number(block.paddingY) || 22;
  const fallbackX = Number(block.paddingX) || 24;
  return resolveBoxSpacing(block, 'padding', {
    top: fallbackY,
    right: fallbackX,
    bottom: fallbackY,
    left: fallbackX,
  });
}

function renderBadgeBlock(block = {}) {
  const pad = resolveBoxSpacing(block, 'padding', {
    top: 18, right: 24, bottom: 0, left: 24,
  });
  const margin = resolveBoxSpacing(block, 'margin', {
    top: 0, right: 0, bottom: 0, left: 0,
  });
  const badgePad = resolveBoxSpacing(block, 'badgePadding', {
    top: 8, right: 14, bottom: 8, left: 14,
  });
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
  const sectionBg = escapeHtml(block.backgroundColor || '#f8fafc');
  const accent = escapeHtml(block.color || '#0f766e');
  const textColor = escapeHtml(block.textColor || '#ffffff');
  const fontSize = Math.min(24, Math.max(9, Number(block.fontSize) || 11));
  const fontWeight = ['400', '500', '600', '700', '800'].includes(String(block.fontWeight))
    ? String(block.fontWeight)
    : '800';
  const letterSpacing = Math.min(4, Math.max(0, Number(block.letterSpacing) || 1));
  const radius = Math.min(999, Math.max(0, Number(block.borderRadius) ?? 999));
  const style = block.badgeStyle || 'filled';
  const isBanner = style === 'banner';
  const borderWidth = Math.min(6, Math.max(0, Number(block.borderWidth) || 2));
  const borderColor = escapeHtml(block.borderColor || block.color || '#0f766e');
  const showBorder = block.showBorder === true;

  let pillStyle = '';
  if (style === 'outline') {
    pillStyle = `background:transparent;color:${accent};border:${borderWidth}px solid ${accent};`;
  } else if (style === 'soft') {
    pillStyle = `background:#f1f5f9;color:${accent};${showBorder ? `border:${borderWidth}px solid ${borderColor};` : 'border:none;'}`;
  } else if (style === 'banner') {
    pillStyle = `background:${accent};color:${textColor};display:block;width:100%;${showBorder ? `border:${borderWidth}px solid ${borderColor};` : 'border:none;'}`;
  } else {
    pillStyle = `background:${accent};color:${textColor};${showBorder ? `border:${borderWidth}px solid ${borderColor};` : 'border:none;'}`;
  }

  const pillRadius = isBanner ? Math.min(radius, 12) : radius;
  const displayMode = isBanner ? 'block' : 'inline-block';

  return `
    <div style="margin:${margin.top}px ${margin.right}px ${margin.bottom}px ${margin.left}px;padding:${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px;text-align:${align};background:${sectionBg};">
      <span style="display:${displayMode};${pillStyle}font-size:${fontSize}px;font-weight:${fontWeight};letter-spacing:${letterSpacing}px;padding:${badgePad.top}px ${badgePad.right}px ${badgePad.bottom}px ${badgePad.left}px;border-radius:${pillRadius}px;line-height:1.2;text-transform:uppercase;">
        ${escapeHtml(block.text || 'OFFER')}
      </span>
    </div>
  `;
}

function sanitizeEmailCss(css = '') {
  return String(css || '')
    .replace(/<\/style/gi, '<\\/style')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .trim();
}

function rewriteAttrUrl(attrs, attrName, rewriter) {
  const quoted = new RegExp(`\\s${attrName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const unquoted = new RegExp(`\\s${attrName}\\s*=\\s*([^\\s>]+)`, 'i');
  const source = String(attrs || '');
  const match = source.match(quoted) || source.match(unquoted);
  if (!match) return attrs;
  const next = rewriter(String(match[2] || match[1] || '').replace(/&amp;/g, '&').trim());
  if (next == null || next === '') return attrs;
  const safe = String(next).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return source.replace(match[0], ` ${attrName}="${safe}"`);
}

/** Absolutize href/src inside custom HTML so links & images work in inbox clients. */
function rewriteEmailHtmlFragmentUrls(html = '') {
  if (!html) return html;
  return String(html)
    .replace(/<a\b([^>]*)>/gi, (full, attrs) => {
      let nextAttrs = rewriteAttrUrl(attrs, 'href', (href) => {
        if (!href || href.startsWith('#') || /^mailto:/i.test(href) || /^tel:/i.test(href) || /^sms:/i.test(href)) {
          return href;
        }
        if (/^javascript:/i.test(href)) return '#';
        return absolutizeHref(href);
      });
      // Ensure bare <a> without href still gets a usable link target when data-href is used.
      if (!/\shref\s*=/i.test(nextAttrs) && /\sdata-href\s*=/i.test(nextAttrs)) {
        nextAttrs = rewriteAttrUrl(nextAttrs, 'data-href', (href) => absolutizeHref(href));
        const dataHref = String(nextAttrs).match(/\sdata-href\s*=\s*(["'])(.*?)\1/i)?.[2];
        if (dataHref) nextAttrs += ` href="${dataHref.replace(/"/g, '&quot;')}"`;
      }
      if (!/\starget\s*=/i.test(nextAttrs)) nextAttrs += ' target="_blank"';
      if (!/\srel\s*=/i.test(nextAttrs)) nextAttrs += ' rel="noopener noreferrer"';
      return `<a${nextAttrs}>`;
    })
    .replace(/<(img|source)\b([^>]*)>/gi, (full, tag, attrs) => {
      let nextAttrs = rewriteAttrUrl(attrs, 'src', (src) => toAbsoluteMediaUrl(src) || src);
      nextAttrs = rewriteAttrUrl(nextAttrs, 'srcset', (srcset) => {
        return String(srcset || '')
          .split(',')
          .map((part) => {
            const trimmed = part.trim();
            if (!trimmed) return '';
            const [url, ...rest] = trimmed.split(/\s+/);
            const absolute = toAbsoluteMediaUrl(url) || url;
            return [absolute, ...rest].join(' ');
          })
          .filter(Boolean)
          .join(', ');
      });
      if (String(tag).toLowerCase() === 'img') {
        if (!/\sborder\s*=/i.test(nextAttrs)) nextAttrs += ' border="0"';
        if (!/\sreferrerpolicy\s*=/i.test(nextAttrs)) nextAttrs += ' referrerpolicy="no-referrer"';
        if (!/\sstyle\s*=/i.test(nextAttrs)) {
          nextAttrs += ' style="max-width:100%;height:auto;display:block;border:0;"';
        }
      }
      return `<${tag}${nextAttrs}>`;
    })
    .replace(/<(video|audio)\b([^>]*)>/gi, (full, tag, attrs) => {
      let nextAttrs = rewriteAttrUrl(attrs, 'src', (src) => toAbsoluteMediaUrl(src) || src);
      nextAttrs = rewriteAttrUrl(nextAttrs, 'poster', (src) => toAbsoluteMediaUrl(src) || src);
      return `<${tag}${nextAttrs}>`;
    })
    .replace(/\burl\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (full, quote, rawUrl) => {
      const absolute = toAbsoluteMediaUrl(String(rawUrl || '').trim());
      if (!absolute) return full;
      return `url(${quote || ''}${absolute}${quote || ''})`;
    });
}

/**
 * Allow rich email HTML: tags, links, images, <style>, animations.
 * Still strips scripts / handlers / javascript: for safety.
 * If a full document is pasted, pulls <style> + <body> content.
 */
function sanitizeEmailHtmlFragment(html = '', { extraCss = '' } = {}) {
  let raw = String(html || '');
  const collectedCss = [];

  const pushCss = (css) => {
    const clean = sanitizeEmailCss(css);
    if (clean) collectedCss.push(clean);
  };

  // Pull style blocks (keep them — re-inject after sanitize).
  raw = raw.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    pushCss(css);
    return '';
  });

  // Full HTML document paste → use body only.
  const bodyMatch = raw.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) raw = bodyMatch[1];

  // Drop document chrome / dangerous embeds. Keep almost everything else (a, img, table, svg, video…).
  raw = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body|meta|title|base|noscript)[^>]*>/gi, '')
    // External stylesheet <link> → @import inside our style block (best-effort).
    .replace(/<link\b([^>]*)>/gi, (_, attrs) => {
      const rel = String(attrs).match(/\srel\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
      const href = String(attrs).match(/\shref\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
      if (/stylesheet/i.test(rel) && href) {
        const absolute = /^https?:\/\//i.test(href) ? href : safeHref(href);
        if (absolute) pushCss(`@import url("${absolute.replace(/"/g, '')}");`);
      }
      return '';
    })
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\/?form\b[^>]*>/gi, '')
    .trim();

  pushCss(extraCss);

  const body = rewriteEmailHtmlFragmentUrls(raw);
  const styleBlock = collectedCss.length
    ? `<style type="text/css">${collectedCss.join('\n')}</style>`
    : '';

  if (!body && !styleBlock) return '';
  return `${styleBlock}${body ? `<div class="email-html-block">${body}</div>` : ''}`;
}

function renderHtmlBlockCta(block = {}) {
  if (block.showCta === false) return '';
  const label = String(block.ctaLabel || '').trim();
  if (!label && block.showCta !== true) return '';
  const align = ['left', 'center', 'right'].includes(block.ctaAlign) ? block.ctaAlign : 'center';
  const bg = escapeHtml(block.ctaColor || '#0f766e');
  const text = escapeHtml(block.ctaTextColor || '#ffffff');
  const style = block.ctaStyle || 'filled';
  let linkStyle = 'display:inline-block;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;';
  if (style === 'outline') {
    linkStyle += `background:transparent;color:${bg};border:2px solid ${bg};`;
  } else if (style === 'text') {
    linkStyle += `background:transparent;color:${bg};padding:8px 4px;border-radius:0;text-decoration:underline;`;
  } else {
    linkStyle += `background:${bg};color:${text};border:2px solid ${bg};`;
  }
  return `
    <div style="padding:8px 28px 24px;text-align:${align};background:#ffffff;">
      <a href="${escapeHtml(safeHref(block.ctaUrl || BASE_URL()))}" style="${linkStyle}">
        ${escapeHtml(label || 'Shop now')}
      </a>
    </div>
  `;
}

function renderBlock(block, { products = [], recipientEmail = '', previewMode = false } = {}) {
  switch (block.type) {
    case 'header': {
      const logoWidth = Math.min(280, Math.max(40, Number(block.logoWidth) || 150));
      const logoMaxHeight = Math.min(160, Math.max(24, Number(block.logoMaxHeight) || 72));
      const logoSrc = String(block.logoUrl || '').trim();
      const showLogo = block.showLogo === true || Boolean(logoSrc);
      const position = ['left', 'center', 'right'].includes(block.logoPosition)
        ? block.logoPosition
        : 'center';
      const pad = resolveHeaderPadding(block);
      const logoHref = safeHref(block.logoLink || BASE_URL());
      const logoAlt = escapeHtml(block.logoAlt || 'Store logo');
      const imgStyle = `max-width:${logoWidth}px;max-height:${logoMaxHeight}px;width:auto;height:auto;display:inline-block;`;
      // Never auto-inject the default Store1920 logo — only show an uploaded/custom logoUrl.
      const logoImg = showLogo && logoSrc
        ? `<img src="${escapeHtml(logoSrc)}" alt="${logoAlt}" width="${logoWidth}" style="${imgStyle}" />`
        : '';
      const logoHtml = logoImg
        ? `<a href="${escapeHtml(logoHref)}" style="text-decoration:none;display:inline-block;">${logoImg}</a>`
        : '';
      const taglineSize = Math.min(22, Math.max(10, Number(block.taglineSize) || 12));
      const taglineWeight = ['400', '500', '600', '700'].includes(String(block.taglineWeight))
        ? String(block.taglineWeight)
        : '500';
      const border = block.showBottomBorder === false
        ? 'border-bottom:none;'
        : `border-bottom:1px solid ${escapeHtml(block.bottomBorderColor || '#f1f5f9')};`;
      const taglineHtml = block.showTagline !== false && block.tagline
        ? `<p style="margin:10px 0 0;font-size:${taglineSize}px;font-weight:${taglineWeight};color:${escapeHtml(block.taglineColor || '#64748b')};text-align:${position};line-height:1.4;">${escapeHtml(block.tagline)}</p>`
        : '';
      const navHtml = block.showNav !== false ? renderHeaderNav(block) : '';
      const ctaHtml = renderHeaderCta(block);
      const navLayout = block.navLayout || 'below';
      const logoBlock = (logoHtml || taglineHtml)
        ? `
        <div style="text-align:${position};">
          ${logoHtml}
          ${taglineHtml}
        </div>
      `
        : '';

      // Skip empty header shells (no logo, tagline, nav, or CTA).
      if (!logoBlock && !navHtml && !ctaHtml) return '';

      let body = '';
      if (navLayout === 'top') {
        body = `
          ${navHtml ? `<div style="margin-bottom:14px;">${navHtml}</div>` : ''}
          ${logoBlock}
          ${ctaHtml}
        `;
      } else if (navLayout === 'beside') {
        const navAlign = position === 'right' ? 'left' : 'right';
        body = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;text-align:${position};width:42%;">${logoBlock || '&nbsp;'}</td>
              <td style="vertical-align:middle;text-align:${navAlign};width:58%;">${navHtml || '&nbsp;'}${ctaHtml}</td>
            </tr>
          </table>
        `;
      } else {
        body = `
          ${logoBlock}
          ${navHtml ? `<div style="margin-top:14px;">${navHtml}</div>` : ''}
          ${ctaHtml}
        `;
      }

      return `
        <div style="padding:${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px;background:${escapeHtml(block.backgroundColor || '#ffffff')};${border}">
          ${body}
        </div>
      `;
    }
    case 'hero': {
      const start = block.color || '#0f172a';
      const end = block.colorEnd || '#134e4a';
      const imageUrl = toAbsoluteMediaUrl(block.imageUrl || '');
      const markHtml = resolveHeroMarkHtml(block, { size: imageUrl ? 36 : 42 });
      if (imageUrl) {
        return `
          <div style="position:relative;background:#0f172a;">
            <img src="${escapeHtml(imageUrl)}" alt="" width="620" height="280" referrerpolicy="no-referrer" border="0" style="width:100%;max-width:100%;height:280px;object-fit:cover;display:block;opacity:${block.overlay === false ? '1' : '0.55'};border:0;" />
            <div style="padding:28px 24px 36px;text-align:center;color:#ffffff;background:linear-gradient(180deg, rgba(15,23,42,0.15), rgba(15,23,42,0.85));">
              ${markHtml}
              <h1 style="margin:0;font-size:30px;font-weight:800;letter-spacing:-0.4px;">${escapeHtml(block.title || '')}</h1>
              ${block.subtitle ? `<p style="margin:10px 0 0;font-size:16px;opacity:0.95;">${escapeHtml(block.subtitle)}</p>` : ''}
            </div>
          </div>
        `;
      }
      return `
        <div style="background:linear-gradient(135deg,${start} 0%,${end} 100%);padding:48px 24px;text-align:center;color:#ffffff;">
          ${markHtml}
          <h1 style="margin:0;font-size:30px;font-weight:800;letter-spacing:-0.4px;">${escapeHtml(block.title || '')}</h1>
          ${block.subtitle ? `<p style="margin:10px 0 0;font-size:16px;opacity:0.95;">${escapeHtml(block.subtitle)}</p>` : ''}
        </div>
      `;
    }
    case 'badge':
      return renderBadgeBlock(block);
    case 'text':
      return `
        <div style="padding:20px 28px;background:#f8fafc;">
          <p style="margin:0;font-size:15px;line-height:1.7;color:#1f2937;text-align:${escapeHtml(block.align || 'left')};">
            ${escapeHtml(block.html || '')}
          </p>
        </div>
      `;
    case 'html': {
      const fragment = sanitizeEmailHtmlFragment(block.html, { extraCss: block.css || '' });
      const ctaHtml = renderHtmlBlockCta(block);
      if (!fragment && !ctaHtml) {
        if (!previewMode) return '';
        return `
          <div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border:1px dashed #cbd5e1;">
            Paste HTML in this block to preview it here.
          </div>
        `;
      }
      const body = fragment
        ? (block.padding === false ? fragment : `<div style="padding:0;background:transparent;">${fragment}</div>`)
        : '';
      const position = block.ctaPosition === 'above' ? 'above' : 'below';
      if (position === 'above') return `${ctaHtml}${body}`;
      return `${body}${ctaHtml}`;
    }
    case 'two_column':
      return renderTwoColumnBlock(block);
    case 'social':
      return renderSocialBlock(block);
    case 'button': {
      const align = ['left', 'center', 'right'].includes(block.align) ? block.align : 'center';
      const bg = escapeHtml(block.color || '#0f766e');
      const text = escapeHtml(block.textColor || '#ffffff');
      const size = Math.min(22, Math.max(11, Number(block.fontSize) || 15));
      const weight = ['400', '500', '600', '700', '800'].includes(String(block.fontWeight))
        ? String(block.fontWeight)
        : '700';
      const radius = Math.min(40, Math.max(0, Number(block.borderRadius) ?? 10));
      const padY = Math.min(28, Math.max(6, Number(block.paddingY) || 14));
      const padX = Math.min(56, Math.max(10, Number(block.paddingX) || 36));
      const style = block.buttonStyle || 'filled';
      const fullWidth = block.fullWidth === true;
      const display = fullWidth ? 'block' : 'inline-block';
      let linkStyle = `display:${display};text-decoration:none;text-align:center;font-size:${size}px;font-weight:${weight};padding:${padY}px ${padX}px;border-radius:${radius}px;`;
      if (style === 'outline') {
        linkStyle += `background:transparent;color:${bg};border:2px solid ${bg};`;
      } else if (style === 'text') {
        linkStyle += `background:transparent;color:${bg};padding:8px 4px;border-radius:0;text-decoration:underline;font-weight:${weight};`;
      } else {
        linkStyle += `background:${bg};color:${text};border:2px solid ${bg};`;
      }
      return `
        <div style="padding:8px 28px 24px;text-align:${align};background:#f8fafc;">
          <a href="${escapeHtml(safeHref(block.url))}" style="${linkStyle}">
            ${escapeHtml(block.label || 'Shop now')}
          </a>
        </div>
      `;
    }    case 'form':
      return renderFormBlock(block);
    case 'image':
      if (!block.src) {
        if (!previewMode) return '';
        return `
          <div style="padding:20px 28px;background:#f8fafc;">
            <div style="border:1px dashed #d1d5db;border-radius:12px;padding:40px;text-align:center;color:#9ca3af;font-size:13px;">
              Add an image URL — or pick a product image in the builder
            </div>
          </div>
        `;
      }
      return `
        <div style="padding:12px 28px;background:#f8fafc;">
          <a href="${escapeHtml(safeHref(block.url))}">
            <img src="${escapeHtml(toAbsoluteMediaUrl(block.src))}" alt="${escapeHtml(block.alt || '')}" width="560" referrerpolicy="no-referrer" border="0" style="width:100%;max-width:100%;height:auto;border-radius:12px;display:block;border:0;" />
          </a>
        </div>
      `;
    case 'products':
      return renderProductSection(block, products, 'grid', { previewMode });
    case 'product_carousel':
      return renderProductSection(block, products, 'carousel', { previewMode });
    case 'product_latest':
      return renderProductSection({ ...block, productSource: block.productSource || 'latest' }, products, 'latest', { previewMode });
    case 'product_related':
      return renderProductSection({ ...block, productSource: block.productSource || 'related' }, products, 'related', { previewMode });
    case 'divider':
      return `
        <div style="padding:8px 28px;background:#f8fafc;">
          <hr style="border:none;border-top:1px solid ${escapeHtml(block.color || '#e5e7eb')};margin:0;" />
        </div>
      `;
    case 'spacer':
      return `<div style="height:${Number(block.height) || 24}px;line-height:${Number(block.height) || 24}px;background:#f8fafc;">&nbsp;</div>`;
    case 'footer':
      return renderFooter(block, recipientEmail);
    default:
      return '';
  }
}

function renderFormFields(fields, { labelColor = '#475569', inputBg = '#ffffff', inputBorder = '#dbe3ef', inputColor = '#94a3b8' } = {}) {
  return fields.map((fieldId) => {
    const meta = FORM_FIELD_OPTIONS.find((item) => item.id === fieldId);
    const label = meta?.label || fieldId;
    return `
      <div style="margin:0 0 10px;text-align:left;">
        <label style="display:block;font-size:12px;font-weight:600;color:${escapeHtml(labelColor)};margin-bottom:4px;">${escapeHtml(label)}</label>
        <div style="border:1px solid ${escapeHtml(inputBorder)};border-radius:8px;padding:10px 12px;background:${escapeHtml(inputBg)};color:${escapeHtml(inputColor)};font-size:13px;">
          Enter ${escapeHtml(label.toLowerCase())}
        </div>
      </div>
    `;
  }).join('');
}

function renderFormBlock(block = {}) {
  const fields = Array.isArray(block.fields) && block.fields.length ? block.fields : ['email'];
  const style = block.formStyle || block.formType || 'newsletter';
  const href = escapeHtml(safeHref(block.successUrl || `${BASE_URL()}/welcome-offer`));
  const btn = escapeHtml(block.buttonColor || '#0f766e');
  const heading = escapeHtml(block.heading || 'Join our newsletter');
  const sub = block.subheading ? escapeHtml(block.subheading) : '';
  const cta = escapeHtml(block.buttonLabel || 'Subscribe');
  const note = 'Opens signup on your site — submissions appear in Email Marketing → Leads.';

  if (style === 'sms') {
    return `
      <div style="padding:28px 24px;background:${escapeHtml(block.backgroundColor || '#042f2e')};text-align:center;">
        <div style="display:inline-block;background:#0f766e;color:#fff;font-size:10px;font-weight:800;letter-spacing:1px;padding:5px 10px;border-radius:999px;margin-bottom:12px;">SMS / WHATSAPP</div>
        <h3 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">${heading}</h3>
        ${sub ? `<p style="margin:8px 0 18px;font-size:13px;color:rgba(255,255,255,0.82);">${sub}</p>` : ''}
        <div style="max-width:320px;margin:0 auto;text-align:left;">
          ${renderFormFields(fields, { labelColor: '#99f6e4', inputBg: '#134e4a', inputBorder: '#115e59', inputColor: '#ccfbf1' })}
        </div>
        <a href="${href}" style="display:inline-block;margin-top:8px;background:${btn};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:700;font-size:14px;">${cta}</a>
        <p style="margin:12px 0 0;font-size:11px;color:rgba(255,255,255,0.55);">${note}</p>
      </div>
    `;
  }

  if (style === 'rsvp') {
    return `
      <div style="padding:32px 24px;background:${escapeHtml(block.backgroundColor || '#0f172a')};text-align:center;">
        <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#c4b5fd;margin-bottom:10px;">You are invited</div>
        <h3 style="margin:0;font-size:28px;font-weight:600;color:#ffffff;font-family:Georgia,serif;">${heading}</h3>
        ${sub ? `<p style="margin:10px 0 20px;font-size:13px;color:#cbd5e1;">${sub}</p>` : ''}
        <div style="max-width:340px;margin:0 auto;border:1px solid rgba(196,181,253,0.35);border-radius:12px;padding:18px;background:rgba(15,23,42,0.55);">
          ${renderFormFields(fields, { labelColor: '#e9d5ff', inputBg: '#1e1b4b', inputBorder: '#4c1d95', inputColor: '#c4b5fd' })}
          <a href="${href}" style="display:block;margin-top:8px;background:${btn};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px;">${cta}</a>
        </div>
        <p style="margin:12px 0 0;font-size:11px;color:#64748b;">${note}</p>
      </div>
    `;
  }

  if (style === 'discount') {
    return `
      <div style="padding:24px 20px;background:${escapeHtml(block.backgroundColor || '#fff1f2')};text-align:center;">
        <div style="background:#ffffff;border:2px dashed #fb7185;border-radius:16px;padding:22px;">
          <div style="display:inline-block;background:#dc2626;color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px;margin-bottom:10px;">SAVE NOW</div>
          <h3 style="margin:0;font-size:26px;font-weight:900;color:#9f1239;">${heading}</h3>
          ${sub ? `<p style="margin:8px 0 16px;font-size:13px;color:#be123c;">${sub}</p>` : ''}
          ${renderFormFields(fields, { labelColor: '#9f1239', inputBorder: '#fecdd3' })}
          <a href="${href}" style="display:inline-block;margin-top:6px;background:${btn};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:800;font-size:14px;">${cta}</a>
          <p style="margin:10px 0 0;font-size:11px;color:#9f1239;">${note}</p>
        </div>
      </div>
    `;
  }

  if (style === 'vip') {
    return `
      <div style="padding:28px 24px;background:${escapeHtml(block.backgroundColor || '#1c1917')};text-align:center;">
        <div style="font-size:20px;margin-bottom:8px;">👑</div>
        <h3 style="margin:0;font-size:22px;font-weight:800;color:#fbbf24;">${heading}</h3>
        ${sub ? `<p style="margin:8px 0 16px;font-size:13px;color:#d6d3d1;">${sub}</p>` : ''}
        <div style="max-width:340px;margin:0 auto;">
          ${renderFormFields(fields, { labelColor: '#fde68a', inputBg: '#292524', inputBorder: '#44403c', inputColor: '#a8a29e' })}
        </div>
        <a href="${href}" style="display:inline-block;margin-top:6px;background:${btn};color:#1c1917;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:800;font-size:14px;">${cta}</a>
        <p style="margin:10px 0 0;font-size:11px;color:#78716c;">${note}</p>
      </div>
    `;
  }

  if (style === 'waitlist') {
    return `
      <div style="padding:24px 28px;background:${escapeHtml(block.backgroundColor || '#eff6ff')};text-align:center;">
        <h3 style="margin:0;font-size:20px;font-weight:800;color:#1e3a8a;">${heading}</h3>
        ${sub ? `<p style="margin:8px 0 14px;font-size:13px;color:#1d4ed8;">${sub}</p>` : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:70%;padding-right:8px;">${renderFormFields(fields.slice(0, 1), { labelColor: '#1e40af', inputBorder: '#bfdbfe' })}</td>
          <td style="width:30%;vertical-align:bottom;padding-bottom:10px;">
            <a href="${href}" style="display:block;background:${btn};color:#ffffff;text-decoration:none;padding:11px 10px;border-radius:8px;font-weight:700;font-size:13px;text-align:center;">${cta}</a>
          </td>
        </tr></table>
        <p style="margin:0;font-size:11px;color:#64748b;">${note}</p>
      </div>
    `;
  }

  if (style === 'inline') {
    return `
      <div style="padding:18px 24px;background:${escapeHtml(block.backgroundColor || '#ecfdf5')};text-align:center;">
        <div style="font-size:14px;font-weight:700;color:#065f46;margin-bottom:10px;">${heading}${sub ? ` — ${sub}` : ''}</div>
        <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#ffffff;border:1px solid #a7f3d0;border-radius:8px 0 0 8px;padding:11px 14px;color:#94a3b8;font-size:13px;min-width:180px;text-align:left;">Enter email</td>
          <td><a href="${href}" style="display:inline-block;background:${btn};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:0 8px 8px 0;font-weight:700;font-size:13px;">${cta}</a></td>
        </tr></table>
      </div>
    `;
  }

  if (style === 'outline') {
    return `
      <div style="padding:24px 28px;background:${escapeHtml(block.backgroundColor || '#ffffff')};text-align:center;">
        <div style="border:2px solid #0f172a;padding:22px;">
          <h3 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.06em;">${heading}</h3>
          ${sub ? `<p style="margin:8px 0 16px;font-size:13px;color:#475569;">${sub}</p>` : ''}
          ${renderFormFields(fields, { labelColor: '#0f172a', inputBorder: '#0f172a' })}
          <a href="${href}" style="display:inline-block;margin-top:6px;background:${btn};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:0;font-weight:700;font-size:14px;">${cta}</a>
          <p style="margin:10px 0 0;font-size:11px;color:#64748b;">${note}</p>
        </div>
      </div>
    `;
  }

  if (style === 'split') {
    return `
      <div style="padding:16px 18px;background:${escapeHtml(block.backgroundColor || '#f8fafc')};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="width:42%;vertical-align:middle;padding:16px;background:#0f172a;color:#fff;border-radius:12px 0 0 12px;">
            <div style="font-size:18px;font-weight:800;">${heading}</div>
            ${sub ? `<div style="margin-top:8px;font-size:12px;opacity:0.85;">${sub}</div>` : ''}
          </td>
          <td style="width:58%;vertical-align:middle;padding:16px;background:#ffffff;border:1px solid #e2e8f0;border-left:none;border-radius:0 12px 12px 0;">
            ${renderFormFields(fields)}
            <a href="${href}" style="display:block;background:${btn};color:#ffffff;text-decoration:none;padding:11px 14px;border-radius:8px;font-weight:700;font-size:13px;text-align:center;">${cta}</a>
          </td>
        </tr></table>
      </div>
    `;
  }

  if (style === 'bold') {
    return `
      <div style="padding:28px 24px;background:${escapeHtml(block.backgroundColor || btn)};text-align:center;">
        <h3 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">${heading}</h3>
        ${sub ? `<p style="margin:8px 0 16px;font-size:13px;color:rgba(255,255,255,0.9);">${sub}</p>` : ''}
        ${renderFormFields(fields, { labelColor: '#ffffff', inputBg: 'rgba(255,255,255,0.15)', inputBorder: 'rgba(255,255,255,0.35)', inputColor: '#e2e8f0' })}
        <a href="${href}" style="display:inline-block;margin-top:6px;background:#ffffff;color:${btn};text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:800;font-size:14px;">${cta}</a>
        <p style="margin:10px 0 0;font-size:11px;color:rgba(255,255,255,0.75);">${note}</p>
      </div>
    `;
  }

  // newsletter / card / stacked / minimal fallback
  const useCard = style === 'newsletter' || style === 'card' || style === 'stacked' || !style;
  return `
    <div style="padding:24px 28px;background:${escapeHtml(block.backgroundColor || '#f8fafc')};text-align:center;">
      <div style="${useCard ? 'background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:20px;' : ''}">
        <h3 style="margin:0;font-size:20px;font-weight:800;color:#0f172a;">${heading}</h3>
        ${sub ? `<p style="margin:8px 0 16px;font-size:13px;color:#64748b;">${sub}</p>` : '<div style="height:14px;"></div>'}
        ${renderFormFields(fields)}
        <a href="${href}" style="display:inline-block;margin-top:6px;background:${btn};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;">${cta}</a>
        <p style="margin:10px 0 0;font-size:11px;color:#64748b;">${note}</p>
      </div>
    </div>
  `;
}

export function renderEmailFromBlocks(blocks = [], {
  products = [],
  recipientEmail = '',
  preheader = '',
  fontFamily = '',
  interactivePreview = false,
  previewMode = false,
} = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const isPreview = Boolean(interactivePreview || previewMode);
  const body = list.map((block, index) => {
    const html = renderBlock(block, { products, recipientEmail, previewMode: isPreview });
    if (!html) return '';
    if (!interactivePreview) return html;
    const blockId = block.id || `${block.type}-${index}`;
    return `<div data-block-id="${escapeHtml(blockId)}" class="email-preview-block" role="button" tabindex="0">${html}</div>`;
  }).join('');
  const font = resolveEmailFontFamily(fontFamily);
  const googleFontHref = getEmailFontGoogleHref(fontFamily);
  const fontLink = googleFontHref
    ? `<link rel="stylesheet" href="${googleFontHref}" />`
    : '';
  const previewStyles = interactivePreview ? `
        .email-preview-block{cursor:pointer;outline:2px solid transparent;outline-offset:2px;transition:outline-color .15s,box-shadow .15s;border-radius:8px;}
        .email-preview-block:hover{outline-color:#5eead4;}
        .email-preview-block.is-selected{outline-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,0.18);}
      ` : '';
  const html = `
    <div style="font-family:${font};max-width:620px;width:100%;margin:0 auto;background:#ffffff;">
      ${fontLink}
      <style>
        .email-product-carousel{scrollbar-width:none;-ms-overflow-style:none;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;touch-action:pan-x;}
        .email-product-carousel::-webkit-scrollbar{display:none;width:0;height:0;}
        ${previewStyles}
      </style>
      ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
      ${body}
    </div>
  `;
  // Sent emails (and non-iframe renders): force absolute image URLs so clients can load them.
  if (isPreview) return html;
  return absolutizeEmailHtmlImages(html);
}

export function cloneBlocks(blocks = []) {
  return JSON.parse(JSON.stringify(blocks || [])).map((block) => ({
    ...block,
    id: createBlockId(),
  }));
}

export function firstProductImage(products = []) {
  for (const product of products) {
    const image = productImage(product);
    if (image) return image;
  }
  return '';
}
