const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeHtmlEntities(value = '') {
  let text = String(value ?? '');
  if (!text || !text.includes('&')) {
    return text;
  }

  for (let pass = 0; pass < 4; pass += 1) {
    const next = text
      .replace(/&([a-zA-Z]+);/g, (match, name) => {
        const key = String(name || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : match;
      })
      .replace(/&#(\d+);/g, (_, code) => {
        const numeric = Number(code);
        return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : _;
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const numeric = parseInt(hex, 16);
        return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : _;
      });

    if (next === text) break;
    text = next;
  }

  return text;
}

export function cleanDisplayText(value = '') {
  return decodeHtmlEntities(String(value ?? ''))
    // UTF-8 curly quotes/dashes misread as Latin-1 byte sequences (e.g. Womenâs)
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u0098/g, "'")
    .replace(/\u00e2\u0080\u009c/g, '"')
    .replace(/\u00e2\u0080\u009d/g, '"')
    .replace(/\u00e2\u0080\u0093/g, '-')
    .replace(/\u00e2\u0080\u0094/g, '-')
    .replace(/\u00e2\u0080\u00a6/g, '...')
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Å"/g, '"')
    .replace(/Ã¢â‚¬/g, '')
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/(\p{L})âs(\p{L}*)/gu, "$1's$2")
    .replace(/(\p{L})â(\p{L})/gu, "$1'$2")
    // Broken ampersand remnants from double HTML decoding (e.g. Sports &; Fitness)
    .replace(/&;/g, '&')
    .replace(/\u00C2\u00A0/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\u00C2/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLocalizedProductName(product, language = 'en', fallback = '') {
  const record = product || {};
  const englishName = cleanDisplayText(record.name || record.title || fallback);
  if (language !== 'ar') return englishName;

  const arabicName = cleanDisplayText(record.nameAr || '');
  return arabicName || englishName;
}

export function sanitizeCategoryFields(record = {}) {
  if (!record || typeof record !== 'object') return record;

  return {
    ...record,
    name: cleanDisplayText(record.name),
    nameAr: cleanDisplayText(record.nameAr),
    description: cleanDisplayText(record.description),
    descriptionAr: cleanDisplayText(record.descriptionAr),
    metaTitle: cleanDisplayText(record.metaTitle),
    metaDescription: cleanDisplayText(record.metaDescription),
    parentName: cleanDisplayText(record.parentName),
  };
}

export function sanitizeCategoryTree(categories = []) {
  if (!Array.isArray(categories)) return [];

  return categories.map((category) => ({
    ...sanitizeCategoryFields(category),
    children: Array.isArray(category.children)
      ? sanitizeCategoryTree(category.children)
      : category.children,
  }));
}
