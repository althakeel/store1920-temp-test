export const OFFERS_PAGE_MODES = ['discount', 'manual', 'category'];

export const OFFERS_DISCOUNT_PRESETS = [10, 25, 40, 50, 60];

export const OFFERS_PAGE_SIZE = 24;

export const DEFAULT_OFFERS_NAV_LABEL = "Today's Deals";
export const DEFAULT_OFFERS_NAV_LABEL_AR = 'عروض اليوم';

export const OFFERS_NAV_FONT_OPTIONS = [
  { id: 'inherit', label: 'Default', value: 'inherit' },
  { id: 'poppins', label: 'Poppins', value: 'var(--font-poppins), Poppins, system-ui, sans-serif' },
  { id: 'montserrat', label: 'Montserrat', value: 'var(--font-montserrat), Montserrat, system-ui, sans-serif' },
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { id: 'helvetica', label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { id: 'georgia', label: 'Georgia', value: 'Georgia, serif' },
  { id: 'times', label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { id: 'verdana', label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { id: 'garamond', label: 'Garamond', value: 'Garamond, Baskerville, serif' },
  { id: 'system', label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
];

export const DEFAULT_OFFERS_NAV_STYLE = {
  fontFamily: 'inherit',
  fontSize: 12,
  fontColor: '#ffffff',
  fontColorAuto: true,
  borderWidth: 0,
  borderColor: '#ffffff',
  borderRadius: 0,
  backgroundTransparent: true,
  backgroundColor: '#ffffff',
};

export const DEFAULT_OFFERS_PAGE = {
  eyebrow: 'Hot Deals',
  eyebrowAr: 'عروض مميزة',
  title: 'Special Offers',
  titleAr: 'عروض خاصة',
  subtitle: '',
  subtitleAr: '',
  navLabel: DEFAULT_OFFERS_NAV_LABEL,
  navLabelAr: DEFAULT_OFFERS_NAV_LABEL_AR,
  navStyle: DEFAULT_OFFERS_NAV_STYLE,
  mode: 'discount',
  minDiscountPercent: 60,
  productIds: [],
  categoryIds: [],
};

const MAX_MANUAL_PRODUCTS = 500;
const MAX_CATEGORIES = 40;

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return OFFERS_PAGE_MODES.includes(mode) ? mode : DEFAULT_OFFERS_PAGE.mode;
}

function normalizeMinDiscount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_OFFERS_PAGE.minDiscountPercent;
  return Math.min(95, Math.max(1, Math.round(n)));
}

function normalizeProductIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = String(raw?._id || raw || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_MANUAL_PRODUCTS) break;
  }
  return ids;
}

function normalizeCategoryIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    const id = String(raw?._id || raw || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_CATEGORIES) break;
  }
  return ids;
}

function normalizeCopy(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 160);
}

function normalizeNavLabel(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 40);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseHexColor(value = '') {
  const raw = String(value || '').trim();
  if (/^#([0-9a-f]{3})$/i.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  if (/^#([0-9a-f]{6})$/i.test(raw)) return raw.toLowerCase();
  return null;
}

function normalizeHexColor(value, fallback = '#ffffff') {
  return parseHexColor(value) || fallback;
}

export function resolveOffersNavFontFamily(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return OFFERS_NAV_FONT_OPTIONS[0];
  return OFFERS_NAV_FONT_OPTIONS.find((option) => option.id === raw)
    || OFFERS_NAV_FONT_OPTIONS.find((option) => option.value.toLowerCase() === String(value || '').trim().toLowerCase())
    || OFFERS_NAV_FONT_OPTIONS[0];
}

function contrastTextColor(hex) {
  const normalized = normalizeHexColor(hex, '#ffffff').slice(1);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#111827' : '#ffffff';
}

export function normalizeOffersNavStyle(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const rawBackground = String(src.backgroundColor || '').trim().toLowerCase();
  const backgroundTransparent = src.backgroundTransparent !== undefined
    ? Boolean(src.backgroundTransparent)
    : rawBackground === 'transparent';

  return {
    fontFamily: resolveOffersNavFontFamily(src.fontFamily).id,
    fontSize: clampInt(src.fontSize, 8, 28, DEFAULT_OFFERS_NAV_STYLE.fontSize),
    fontColor: normalizeHexColor(src.fontColor, DEFAULT_OFFERS_NAV_STYLE.fontColor),
    fontColorAuto: src.fontColorAuto !== undefined
      ? Boolean(src.fontColorAuto)
      : !parseHexColor(src.fontColor),
    borderWidth: clampInt(src.borderWidth, 0, 8, DEFAULT_OFFERS_NAV_STYLE.borderWidth),
    borderColor: normalizeHexColor(src.borderColor, DEFAULT_OFFERS_NAV_STYLE.borderColor),
    borderRadius: clampInt(src.borderRadius, 0, 40, DEFAULT_OFFERS_NAV_STYLE.borderRadius),
    backgroundTransparent,
    backgroundColor: normalizeHexColor(src.backgroundColor, DEFAULT_OFFERS_NAV_STYLE.backgroundColor),
  };
}

export function getOffersNavButtonAppearance(style = {}, variant = 'desktop') {
  const normalized = normalizeOffersNavStyle(style);
  const isMobile = variant === 'mobile';
  const fontSize = isMobile
    ? Math.max(8, Math.round(normalized.fontSize * 0.75))
    : normalized.fontSize;
  const transparent = normalized.backgroundTransparent;
  const hasChrome = !transparent || normalized.borderWidth > 0 || normalized.borderRadius > 0;
  const textColor = normalized.fontColorAuto
    ? (transparent ? null : contrastTextColor(normalized.backgroundColor))
    : normalized.fontColor;

  const fontOption = resolveOffersNavFontFamily(normalized.fontFamily);

  return {
    fontId: fontOption.id,
    style: {
      fontFamily: fontOption.value,
      fontSize: `${fontSize}px`,
      lineHeight: 1.05,
      color: textColor || undefined,
      borderWidth: `${normalized.borderWidth}px`,
      borderStyle: normalized.borderWidth > 0 ? 'solid' : 'none',
      borderColor: normalized.borderWidth > 0 ? normalized.borderColor : 'transparent',
      borderRadius: `${normalized.borderRadius}px`,
      backgroundColor: transparent ? 'transparent' : normalized.backgroundColor,
      paddingInline: hasChrome ? '10px' : '4px',
      paddingBlock: hasChrome ? '6px' : '0px',
      height: 'auto',
      minHeight: isMobile ? 28 : 36,
    },
    textColor,
    useShine: transparent && normalized.fontColorAuto,
    hasChrome,
  };
}

export function normalizeOffersPage(payload = {}) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const savedAt = Number(src.savedAt);
  return {
    eyebrow: normalizeCopy(src.eyebrow, DEFAULT_OFFERS_PAGE.eyebrow) || DEFAULT_OFFERS_PAGE.eyebrow,
    eyebrowAr: normalizeCopy(src.eyebrowAr, DEFAULT_OFFERS_PAGE.eyebrowAr) || DEFAULT_OFFERS_PAGE.eyebrowAr,
    title: normalizeCopy(src.title, DEFAULT_OFFERS_PAGE.title) || DEFAULT_OFFERS_PAGE.title,
    titleAr: normalizeCopy(src.titleAr, DEFAULT_OFFERS_PAGE.titleAr) || DEFAULT_OFFERS_PAGE.titleAr,
    subtitle: normalizeCopy(src.subtitle, ''),
    subtitleAr: normalizeCopy(src.subtitleAr, ''),
    navLabel: normalizeNavLabel(src.navLabel, DEFAULT_OFFERS_PAGE.navLabel) || DEFAULT_OFFERS_PAGE.navLabel,
    navLabelAr: normalizeNavLabel(src.navLabelAr, DEFAULT_OFFERS_PAGE.navLabelAr) || DEFAULT_OFFERS_PAGE.navLabelAr,
    navStyle: normalizeOffersNavStyle(src.navStyle),
    mode: normalizeMode(src.mode),
    minDiscountPercent: normalizeMinDiscount(src.minDiscountPercent),
    productIds: normalizeProductIds(src.productIds),
    categoryIds: normalizeCategoryIds(src.categoryIds),
    savedAt: Number.isFinite(savedAt) && savedAt > 0 ? savedAt : 0,
  };
}

export function offersPageCacheToken(settings = {}) {
  const normalized = normalizeOffersPage(settings);
  if (normalized.mode === 'manual') {
    return `manual:${normalized.productIds.length}:${normalized.productIds.join(',')}`;
  }
  if (normalized.mode === 'category') {
    return `category:${normalized.categoryIds.length}:${normalized.categoryIds.join(',')}`;
  }
  return `discount:${normalized.minDiscountPercent}`;
}

function isArabicLanguage(language = 'en') {
  return String(language || '').toLowerCase().startsWith('ar');
}

export function getOffersPageSubtitle(settings = {}, language = 'en') {
  const normalized = normalizeOffersPage(settings);
  if (isArabicLanguage(language)) {
    if (normalized.subtitleAr) return normalized.subtitleAr;
    if (normalized.mode === 'manual') return 'عروض خاصة مختارة';
    if (normalized.mode === 'category') return 'عروض من الفئات المختارة';
    return `منتجات بخصم أكثر من ${normalized.minDiscountPercent}%`;
  }
  if (normalized.subtitle) return normalized.subtitle;
  if (normalized.mode === 'manual') return 'Handpicked special offers';
  if (normalized.mode === 'category') return 'Offers from selected categories';
  return `Products with over ${normalized.minDiscountPercent}% discount`;
}

export function getOffersPageCopy(settings = {}, language = 'en') {
  const normalized = normalizeOffersPage(settings);
  const arabic = isArabicLanguage(language);
  return {
    eyebrow: arabic
      ? (normalized.eyebrowAr || normalized.eyebrow)
      : normalized.eyebrow,
    title: arabic
      ? (normalized.titleAr || normalized.title)
      : normalized.title,
    subtitle: getOffersPageSubtitle(normalized, language),
    navLabel: normalized.navLabel,
    navLabelAr: normalized.navLabelAr,
    navStyle: normalized.navStyle,
  };
}

export function getOffersNavLabel(settings = {}, language = 'en') {
  const normalized = normalizeOffersPage(settings);
  if (String(language || '').toLowerCase().startsWith('ar')) {
    return normalized.navLabelAr || DEFAULT_OFFERS_NAV_LABEL_AR;
  }
  return normalized.navLabel || DEFAULT_OFFERS_NAV_LABEL;
}

export function splitOffersNavLabel(label = '') {
  const words = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { top: "Today's", bottom: 'Deals' };
  if (words.length === 1) return { top: words[0], bottom: '' };
  return {
    top: words.slice(0, -1).join(' '),
    bottom: words[words.length - 1],
  };
}
