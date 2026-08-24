import { cleanDisplayText } from '@/lib/displayText';
import { CATEGORY_ARABIC_BY_SLUG } from '@/data/categoryArabicNames';
import { CATEGORY_HIERARCHY } from '@/data/categoryHierarchy';

function normalizeCategoryKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildArabicNameMapFromHierarchy(nodes = [], map = new Map()) {
  nodes.forEach((node) => {
    const arabicName = CATEGORY_ARABIC_BY_SLUG[node.slug];
    if (arabicName) {
      map.set(normalizeCategoryKey(node.name), arabicName);
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      buildArabicNameMapFromHierarchy(node.children, map);
    }
  });
  return map;
}

const UAE_CATEGORY_AR = new Map([
  ['all categories', 'جميع الفئات'],
]);

const UAE_CATEGORY_AR_BY_NAME = buildArabicNameMapFromHierarchy(CATEGORY_HIERARCHY, UAE_CATEGORY_AR);

function lookupArabicBySlug(slug = '') {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return '';
  return CATEGORY_ARABIC_BY_SLUG[key] || '';
}

function lookupArabicByEnglishName(englishName = '') {
  const key = normalizeCategoryKey(englishName);
  if (!key) return '';

  if (UAE_CATEGORY_AR_BY_NAME.has(key)) {
    return UAE_CATEGORY_AR_BY_NAME.get(key);
  }

  const sortedPatterns = [...UAE_CATEGORY_AR_BY_NAME.entries()].sort(
    (left, right) => right[0].length - left[0].length,
  );

  for (const [pattern, arabicName] of sortedPatterns) {
    if (key === pattern) return arabicName;
    if (key.startsWith(`${pattern} `) || key.endsWith(` ${pattern}`)) {
      return arabicName;
    }
  }

  return '';
}

export function getSlugBasedUaeArabicCategoryName(slug = '') {
  return lookupArabicBySlug(slug);
}

export function getCanonicalUaeArabicCategoryName(category = {}) {
  return lookupArabicBySlug(category?.slug) || lookupArabicByEnglishName(category?.name) || '';
}

export function suggestUaeArabicCategoryName(englishName = '', slug = '') {
  const fromSlug = lookupArabicBySlug(slug);
  if (fromSlug) return fromSlug;

  return lookupArabicByEnglishName(englishName);
}

export function suggestUaeArabicCategory(category = {}) {
  return suggestUaeArabicCategoryName(category?.name, category?.slug);
}

export function getLocalizedCategoryName(category, language = 'en') {
  const record = typeof category === 'string' ? { name: category } : (category || {});
  const englishName = cleanDisplayText(record.name || '');

  if (language !== 'ar') {
    return englishName || cleanDisplayText(record.nameAr || '');
  }

  const storedArabic = cleanDisplayText(record.nameAr || '');
  if (storedArabic) return storedArabic;

  const suggested = suggestUaeArabicCategory(record);
  if (suggested) return suggested;

  return englishName;
}

/** Public category page body text. Falls back to the other language when one field is empty. */
export function getLocalizedCategoryDescription(category, language = 'en') {
  const english = cleanDisplayText(category?.description || '');
  const arabic = cleanDisplayText(category?.descriptionAr || '');

  if (language === 'ar') {
    const text = arabic || english;
    return { text, isRtl: Boolean(arabic) };
  }

  const text = english || arabic;
  return { text, isRtl: !english && Boolean(arabic) };
}

export function localizeCategoryRecord(category, language = 'en') {
  if (!category || language !== 'ar') return category;

  return {
    ...category,
    name: getLocalizedCategoryName(category, language),
  };
}
