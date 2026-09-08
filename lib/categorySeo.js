import { DEFAULT_APP_URL, getCustomerSiteUrl, normalizePublicSiteUrl } from './appUrl.js';
import { buildCategoryUrl } from './categorySlug.js';

function getSiteBase(siteUrl = '') {
  return normalizePublicSiteUrl(siteUrl || getCustomerSiteUrl() || DEFAULT_APP_URL);
}

function absoluteUrl(pathOrUrl = '', siteUrl = '') {
  const value = String(pathOrUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return normalizePublicSiteUrl(value);
  const base = getSiteBase(siteUrl);
  if (value.startsWith('//')) return `https:${value}`;
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

export function buildCategoryMetaTitle(category, siteName = 'Store1920') {
  const custom = String(category?.metaTitle || '').trim();
  if (custom) return custom;
  const name = String(category?.name || 'Category').trim();
  return `${name} | ${siteName}`;
}

export function buildCategoryMetaDescription(category) {
  const custom = String(category?.metaDescription || '').trim();
  if (custom) return custom;
  const body = String(category?.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (body) return body.slice(0, 320);
  const name = String(category?.name || 'products').trim();
  return `Shop ${name} online at Store1920. Discover great deals, fast delivery, and quality products across the UAE.`;
}

export function buildCategoryBreadcrumbs(categoryChain = []) {
  const items = [{ name: 'Home', href: '/' }];
  let pathSegments = [];

  for (const category of categoryChain) {
    pathSegments = [...pathSegments, String(category.slug || '').trim()].filter(Boolean);
    items.push({
      name: String(category.name || '').trim(),
      href: `/category/${pathSegments.join('/')}`,
    });
  }

  return items;
}

export function buildBreadcrumbListJsonLd(categoryChain = [], siteUrl = '') {
  const base = getSiteBase(siteUrl);
  const breadcrumbs = buildCategoryBreadcrumbs(categoryChain);

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${base}${item.href}`,
    })),
  };
}

export function buildCategoryCanonicalUrl(categoryChain = [], siteUrl = '') {
  return `${getSiteBase(siteUrl)}${buildCategoryUrl(categoryChain)}`;
}

/**
 * Full Next.js Metadata for category pages — uses Store → Categories SEO fields
 * (metaTitle, metaDescription) plus image/name for Open Graph / Twitter / head tags.
 */
export function buildCategoryPageMetadata(category, categoryChain = [], siteUrl = '') {
  const title = buildCategoryMetaTitle(category);
  const description = buildCategoryMetaDescription(category);
  const canonical = buildCategoryCanonicalUrl(categoryChain, siteUrl);
  const image = absoluteUrl(category?.image || '', siteUrl);
  const displayName = String(category?.name || title).trim();
  const nameAr = String(category?.nameAr || '').trim();

  return {
    title,
    description,
    alternates: {
      canonical,
      ...(nameAr
        ? {
          languages: {
            'en-AE': canonical,
            'ar-AE': canonical,
          },
        }
        : {}),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Store1920',
      type: 'website',
      locale: 'en_AE',
      ...(nameAr ? { alternateLocale: ['ar_AE'] } : {}),
      ...(image
        ? {
          images: [
            {
              url: image,
              alt: displayName,
            },
          ],
        }
        : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    other: {
      ...(nameAr ? { 'og:locale:alternate': 'ar_AE' } : {}),
    },
  };
}

/** CollectionPage JSON-LD using category SEO + public description. */
export function buildCategoryCollectionJsonLd(category, categoryChain = [], siteUrl = '') {
  const base = getSiteBase(siteUrl);
  const canonical = buildCategoryCanonicalUrl(categoryChain, siteUrl);
  const title = buildCategoryMetaTitle(category);
  const description = buildCategoryMetaDescription(category);
  const image = absoluteUrl(category?.image || '', siteUrl);
  const name = String(category?.name || title).trim();

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: canonical,
    ...(image ? { image } : {}),
    isPartOf: {
      '@type': 'WebSite',
      name: 'Store1920',
      url: base,
    },
  };
}
