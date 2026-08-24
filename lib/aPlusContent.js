export function normalizeAPlusImageList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item || '').trim()).filter(Boolean)),
  );
}

export function extractImageUrlsFromHtml(html = '') {
  const source = String(html || '');
  const urls = [];
  const pattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match = pattern.exec(source);
  while (match) {
    const src = String(match[1] || '').trim();
    if (src) urls.push(src);
    match = pattern.exec(source);
  }
  return normalizeAPlusImageList(urls);
}

export function resolveAPlusImageList(storedList, html = '') {
  const fromField = normalizeAPlusImageList(storedList);
  if (fromField.length) return fromField;
  return extractImageUrlsFromHtml(html);
}

export function htmlHasMedia(html = '') {
  return /<(img|video|iframe)\b/i.test(String(html || ''));
}

export function htmlHasPlainText(html = '') {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length > 0;
}

export function stripImagesFromHtml(html = '') {
  return String(html || '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '')
    .trim();
}

export function pickAPlusModules({ product = {}, viewport = 'desktop', isArabic = false } = {}) {
  const useMobile = viewport === 'mobile';
  const desktopHtml = isArabic
    ? (product.aPlusDesktopAr || product.aPlusDesktop || '')
    : (product.aPlusDesktop || '');
  const mobileHtml = isArabic
    ? (product.aPlusMobileAr || product.aPlusMobile || '')
    : (product.aPlusMobile || '');
  const desktopImages = resolveAPlusImageList(product.aPlusDesktopImages, desktopHtml);
  const mobileImages = resolveAPlusImageList(product.aPlusMobileImages, mobileHtml);

  const images = useMobile
    ? (mobileImages.length ? mobileImages : desktopImages)
    : (desktopImages.length ? desktopImages : mobileImages);
  const html = useMobile
    ? (mobileHtml || desktopHtml)
    : (desktopHtml || mobileHtml);
  const htmlForDisplay = images.length ? stripImagesFromHtml(html) : html;

  return {
    images,
    html: htmlForDisplay,
    hasContent: images.length > 0 || htmlHasMedia(htmlForDisplay) || htmlHasPlainText(htmlForDisplay),
  };
}
