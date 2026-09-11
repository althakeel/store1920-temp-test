export const MAX_PRODUCT_IMAGE_BADGES = 2;

export const BADGE_FONT_OPTIONS = [
  { id: 'sans', label: 'Sans', family: 'inherit' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", serif' },
  { id: 'display', label: 'Display', family: 'Poppins, ui-sans-serif, system-ui, sans-serif' },
];

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_NEW_BADGE = {
  id: 'badge-1',
  enabled: true,
  label: 'New',
  labelAr: 'جديد',
  position: 'left',
  backgroundColor: '#E52D27',
  textColor: '#FFFFFF',
  borderColor: '#E52D27',
  borderWidth: 0,
  fontFamily: 'sans',
  fontWeight: '700',
  textTransform: 'uppercase',
  shape: 'pill',
};

export const DEFAULT_SECOND_BADGE = {
  id: 'badge-2',
  enabled: true,
  label: 'New',
  labelAr: 'جديد',
  position: 'right',
  backgroundColor: '#FFFFFF',
  textColor: '#E52D27',
  borderColor: '#E52D27',
  borderWidth: 2,
  fontFamily: 'sans',
  fontWeight: '800',
  textTransform: 'uppercase',
  shape: 'pill',
};

export const DEFAULT_NEW_TAG_SETTINGS = {
  enabled: true,
  label: DEFAULT_NEW_BADGE.label,
  labelAr: DEFAULT_NEW_BADGE.labelAr,
  displayDays: 14,
  showOnImageOverlay: true,
  badges: [DEFAULT_NEW_BADGE],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function sanitizeHex(value, fallback) {
  const raw = String(value || '').trim();
  if (HEX_COLOR.test(raw)) {
    return raw.length === 4
      ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase()
      : raw.toUpperCase();
  }
  return fallback;
}

export function oppositeBadgePosition(position) {
  return position === 'right' ? 'left' : 'right';
}

export function getBadgeFontFamily(fontFamily) {
  return BADGE_FONT_OPTIONS.find((option) => option.id === fontFamily)?.family
    || BADGE_FONT_OPTIONS[0].family;
}

export function createProductImageBadge(overrides = {}, existingBadges = []) {
  const usedRight = existingBadges.some((badge) => badge.position === 'right');
  const base = existingBadges.length === 0 ? DEFAULT_NEW_BADGE : DEFAULT_SECOND_BADGE;
  return normalizeProductImageBadge({
    ...base,
    id: `badge-${Date.now().toString(36)}`,
    position: usedRight ? 'left' : oppositeBadgePosition(existingBadges[0]?.position || 'left'),
    ...overrides,
  });
}

export function normalizeProductImageBadge(raw = {}, fallback = DEFAULT_NEW_BADGE) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const position = source.position === 'right' ? 'right' : 'left';
  const fontFamily = BADGE_FONT_OPTIONS.some((option) => option.id === source.fontFamily)
    ? source.fontFamily
    : fallback.fontFamily;
  const fontWeight = ['500', '600', '700', '800'].includes(String(source.fontWeight))
    ? String(source.fontWeight)
    : fallback.fontWeight;
  const textTransform = source.textTransform === 'none' ? 'none' : 'uppercase';
  const shape = source.shape === 'rounded' ? 'rounded' : 'pill';
  const borderWidth = Number(source.borderWidth);
  const label = String(source.label ?? fallback.label).trim();
  const labelAr = String(source.labelAr ?? fallback.labelAr).trim();

  return {
    id: String(source.id || fallback.id || 'badge-1'),
    enabled: source.enabled !== false,
    label: label || fallback.label,
    labelAr: labelAr || fallback.labelAr,
    position,
    backgroundColor: sanitizeHex(source.backgroundColor, fallback.backgroundColor),
    textColor: sanitizeHex(source.textColor, fallback.textColor),
    borderColor: sanitizeHex(source.borderColor, fallback.borderColor),
    borderWidth: Number.isFinite(borderWidth) ? Math.max(0, Math.min(4, Math.round(borderWidth))) : fallback.borderWidth,
    fontFamily,
    fontWeight,
    textTransform,
    shape,
  };
}

function migrateLegacyBadges(source) {
  if (Array.isArray(source.badges) && source.badges.length > 0) {
    return source.badges;
  }

  return [{
    ...DEFAULT_NEW_BADGE,
    label: source.label || DEFAULT_NEW_BADGE.label,
    labelAr: source.labelAr || DEFAULT_NEW_BADGE.labelAr,
  }];
}

function assignOppositePositions(badges) {
  if (badges.length < 2) return badges;
  const [first, second] = badges;
  if (first.position === second.position) {
    return [first, { ...second, position: oppositeBadgePosition(first.position) }];
  }
  return badges;
}

export function normalizeNewTagSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const days = Number(source.displayDays);
  const badges = assignOppositePositions(
    migrateLegacyBadges(source)
      .slice(0, MAX_PRODUCT_IMAGE_BADGES)
      .map((badge, index) => normalizeProductImageBadge(
        badge,
        index === 0 ? DEFAULT_NEW_BADGE : DEFAULT_SECOND_BADGE,
      )),
  );
  const primary = badges[0] || DEFAULT_NEW_BADGE;

  return {
    enabled: source.enabled !== false,
    label: primary.label,
    labelAr: primary.labelAr,
    displayDays: Number.isFinite(days)
      ? Math.max(1, Math.min(365, Math.round(days)))
      : DEFAULT_NEW_TAG_SETTINGS.displayDays,
    showOnImageOverlay: source.showOnImageOverlay !== false,
    badges,
  };
}

export function getNewTagLabel(settings = DEFAULT_NEW_TAG_SETTINGS, language = 'en') {
  const normalized = normalizeNewTagSettings(settings);
  const badge = normalized.badges.find((item) => item.enabled) || normalized.badges[0] || DEFAULT_NEW_BADGE;
  if (language === 'ar') return badge.labelAr;
  return badge.label;
}

export function getVisibleNewProductBadges(settings = DEFAULT_NEW_TAG_SETTINGS, language = 'en') {
  const normalized = normalizeNewTagSettings(settings);
  return normalized.badges
    .filter((badge) => badge.enabled)
    .map((badge) => ({
      ...badge,
      label: language === 'ar' ? badge.labelAr : badge.label,
    }));
}

export function getProductCreatedAt(product = {}) {
  return product?.createdAt || product?.created_at || product?.publishedAt || null;
}

export function isProductWithinNewWindow(product, settings = DEFAULT_NEW_TAG_SETTINGS, now = Date.now()) {
  const normalized = normalizeNewTagSettings(settings);
  if (!normalized.enabled) return false;

  const created = getProductCreatedAt(product);
  if (!created) return false;

  const createdMs = new Date(created).getTime();
  if (!Number.isFinite(createdMs)) return false;

  const ageMs = Number(now) - createdMs;
  if (ageMs < 0) return true;
  return ageMs <= normalized.displayDays * MS_PER_DAY;
}

export function shouldShowNewProductTag(product, settings = DEFAULT_NEW_TAG_SETTINGS, now = Date.now()) {
  const normalized = normalizeNewTagSettings(settings);
  if (!normalized.enabled) return false;
  if (!normalized.badges.some((badge) => badge.enabled)) return false;
  return isProductWithinNewWindow(product, normalized, now);
}

export function getNewBadgeStyle(badge, compact = true) {
  return {
    backgroundColor: badge.backgroundColor,
    color: badge.textColor,
    borderColor: badge.borderColor,
    borderWidth: badge.borderWidth,
    borderStyle: badge.borderWidth > 0 ? 'solid' : 'none',
    fontFamily: getBadgeFontFamily(badge.fontFamily),
    fontWeight: badge.fontWeight,
    textTransform: badge.textTransform,
    borderRadius: badge.shape === 'rounded' ? (compact ? 6 : 8) : 999,
  };
}
