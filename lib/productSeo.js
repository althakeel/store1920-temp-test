import { getCustomerSiteUrl } from '@/lib/appUrl';
import { getProductPath } from '@/lib/productUrl';
import { collectProductCategoryRefs } from '@/lib/productCategoryRefs';
import {
  buildCategoryIdAliases,
  resolveCategoryHref,
} from '@/lib/categoryTreeUtils';
import { normalizeProductImages, isVideoSource } from '@/lib/productMedia';
import { cleanDisplayText } from '@/lib/displayText';

export function getProductSchemaSiteUrl(siteUrl = '') {
  return String(siteUrl || getCustomerSiteUrl() || 'https://store1920.com').replace(/\/$/, '');
}

export function toAbsoluteProductUrl(pathOrUrl = '', siteUrl = '') {
  const value = String(pathOrUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const base = getProductSchemaSiteUrl(siteUrl);
  if (value.startsWith('//')) return `https:${value}`;
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

export function safeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function stripHtml(value = '') {
  return cleanDisplayText(String(value || '').replace(/<[^>]+>/g, ' '));
}

function formatOfferPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '0.00';
  return amount.toFixed(2);
}

function priceValidUntil() {
  return `${new Date().getFullYear() + 1}-12-31`;
}

function isInStock(product = {}) {
  if (product.inStock === false) return false;
  if (typeof product.stockQuantity === 'number' && product.stockQuantity <= 0) {
    if (product.hasVariants && Array.isArray(product.variants)) {
      return product.variants.some((variant) => Number(variant?.stock || 0) > 0);
    }
    return false;
  }
  return true;
}

function collectProductColors(product = {}) {
  const colors = new Set();
  const add = (value) => {
    const text = String(value || '').trim();
    if (text && text.length < 40) colors.add(text);
  };

  const attributes = product.attributes && typeof product.attributes === 'object'
    ? product.attributes
    : {};

  ['color', 'Color', 'colour', 'Colour', 'colors', 'Colors'].forEach((key) => {
    const raw = attributes[key];
    if (Array.isArray(raw)) raw.forEach(add);
    else if (typeof raw === 'string') String(raw).split(/[,|/]/).forEach(add);
  });

  (Array.isArray(product.variants) ? product.variants : []).forEach((variant) => {
    add(variant?.color || variant?.colour);
    add(variant?.options?.color || variant?.options?.Color || variant?.options?.colour);
    add(variant?.variantOptions?.color || variant?.variantOptions?.Color);
  });

  return [...colors];
}

function resolveProductMpn(product = {}) {
  const attributes = product.attributes && typeof product.attributes === 'object'
    ? product.attributes
    : {};
  return String(
    attributes.mpn
    || attributes.MPN
    || product.mpn
    || product.zoho?.sku
    || '',
  ).trim();
}

function resolveProductImages(product = {}, siteUrl = '') {
  const images = normalizeProductImages(product.images)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry?.url || entry?.src || entry?.path || '';
    })
    .map((url) => toAbsoluteProductUrl(url, siteUrl))
    .filter((url) => /^https?:\/\//i.test(url) && !isVideoSource(url));

  return [...new Set(images)].slice(0, 10);
}

function maskReviewAuthorName(name = '') {
  const text = String(name || 'Customer').trim() || 'Customer';
  if (text.length <= 2) return `${text.slice(0, 1)}***`;
  if (text.length <= 4) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 3)}***${text.slice(-1)}`;
}

function reviewDate(review = {}) {
  const raw = review.createdAt || review.datePublished || review.updatedAt;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function reviewBody(review = {}) {
  return stripHtml(review.review || review.comment || review.reviewBody || '').slice(0, 500);
}

function reviewAuthorName(review = {}) {
  return maskReviewAuthorName(
    review.customerName
    || review.user?.name
    || review.author?.name
    || 'Customer',
  );
}

function findCategoryByRef(ref, categories = [], aliases = new Map()) {
  if (ref && typeof ref === 'object') {
    const nestedId = String(ref._id || ref.id || '').trim();
    if (nestedId) {
      const nested = findCategoryByRef(nestedId, categories, aliases);
      if (nested) return nested;
    }
    const nestedSlug = String(ref.slug || ref.name || '').trim();
    if (nestedSlug) return findCategoryByRef(nestedSlug, categories, aliases);
    return null;
  }

  const raw = String(ref || '').trim();
  if (!raw) return null;

  const aliased = aliases.get(raw) || aliases.get(raw.toLowerCase());
  if (aliased) {
    const match = categories.find((item) => String(item?._id) === String(aliased));
    if (match) return match;
  }

  const lower = raw.toLowerCase();
  return categories.find((item) => {
    const id = String(item?._id || '').trim();
    const slug = String(item?.slug || '').trim().toLowerCase();
    const name = String(item?.name || '').trim().toLowerCase();
    const url = String(item?.url || '').trim().toLowerCase();
    return id === raw
      || slug === lower
      || name === lower
      || url === `/category/${lower}`
      || url.endsWith(`/${lower}`);
  }) || null;
}

function walkCategoryAncestors(leaf, categories = [], aliases = new Map()) {
  const byId = new Map(categories.map((item) => [String(item._id), item]));
  const chain = [];
  const guard = new Set();
  let current = leaf;

  while (current && !guard.has(String(current._id))) {
    guard.add(String(current._id));
    chain.unshift({
      _id: String(current._id),
      name: cleanDisplayText(current.name || ''),
      nameAr: cleanDisplayText(current.nameAr || ''),
      slug: String(current.slug || '').trim(),
      url: String(current.url || '').trim(),
      parentId: current.parentId || null,
    });
    const parentId = String(current.parentId || '').trim();
    if (!parentId) break;
    current = byId.get(parentId) || findCategoryByRef(parentId, categories, aliases);
  }

  return chain;
}

/** Full ancestor chain for a product: parent → … → leaf category. */
export function resolveProductCategoryChain(product = {}, categories = []) {
  if (Array.isArray(product?.categoryChain) && product.categoryChain.length) {
    return product.categoryChain;
  }

  const aliases = buildCategoryIdAliases(categories);
  const refs = collectProductCategoryRefs(product);

  let leaf = null;
  for (const ref of refs) {
    leaf = findCategoryByRef(ref, categories, aliases);
    if (leaf) break;
  }

  if (!leaf) return [];
  return walkCategoryAncestors(leaf, categories, aliases);
}

/** Client categoryMap fallback: { [id]: { name, parentId, slug, url } }. */
export function resolveProductCategoryChainFromMap(product = {}, categoryMap = {}) {
  if (Array.isArray(product?.categoryChain) && product.categoryChain.length) {
    return product.categoryChain;
  }

  const refs = collectProductCategoryRefs(product);
  const firstRef = refs.find((ref) => categoryMap[String(ref)]);
  if (!firstRef) return [];

  const chain = [];
  const guard = new Set();
  let currentId = String(firstRef);

  while (currentId && categoryMap[currentId] && !guard.has(currentId)) {
    guard.add(currentId);
    const node = categoryMap[currentId];
    chain.unshift({
      _id: currentId,
      name: node.name || '',
      nameAr: node.nameAr || '',
      slug: node.slug || '',
      url: node.url || '',
      parentId: node.parentId || null,
    });
    currentId = node.parentId ? String(node.parentId) : '';
  }

  return chain;
}

export function getProductPageHeading(product = {}, language = 'en') {
  const isArabic = String(language || '').toLowerCase().startsWith('ar');
  const h1Ar = cleanDisplayText(product?.seoH1Ar || '');
  const h1 = cleanDisplayText(product?.seoH1 || '');
  const nameAr = cleanDisplayText(product?.nameAr || '');
  const name = cleanDisplayText(product?.name || product?.title || '');
  if (isArabic && h1Ar) return h1Ar;
  if (h1) return h1;
  if (isArabic && nameAr) return nameAr;
  return name;
}

export function getProductCanonicalUrl(product = {}, siteUrl = '') {
  const path = getProductPath(product);
  return toAbsoluteProductUrl(path, siteUrl);
}

export function buildProductBreadcrumbJsonLd(product = {}, categoryChain = [], siteUrl = '') {
  const base = getProductSchemaSiteUrl(siteUrl);
  const productUrl = getProductCanonicalUrl(product, siteUrl);
  const productName = getProductPageHeading(product) || cleanDisplayText(product.name || product.title || 'Product');
  const chain = Array.isArray(categoryChain) ? categoryChain.filter((item) => item?.name) : [];

  const crumbs = [
    { name: 'Home', item: `${base}/` },
    ...chain.map((category, index) => ({
      name: cleanDisplayText(category.name),
      item: toAbsoluteProductUrl(resolveCategoryHref(chain.slice(0, index + 1)), siteUrl),
    })),
    { name: productName, item: productUrl },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
}

export function buildProductJsonLd(product = {}, { categoryChain = [], siteUrl = '' } = {}) {
  const productUrl = getProductCanonicalUrl(product, siteUrl);
  const name = getProductPageHeading(product) || cleanDisplayText(product.name || product.title || 'Product');
  const description = stripHtml(
    product.seoDescription
    || product.shortDescription
    || product.description
    || name,
  ).slice(0, 5000);
  const images = resolveProductImages(product, siteUrl);
  const sku = String(product.sku || product.zoho?.sku || '').trim();
  const mpn = resolveProductMpn(product);
  const brand = cleanDisplayText(product.brand || 'Store1920');
  const leafCategory = [...(categoryChain || [])].reverse().find((item) => item?.name);
  const colors = collectProductColors(product);
  const price = formatOfferPrice(product.price);
  const available = isInStock(product);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${productUrl}#product`,
    name,
    ...(images.length ? { image: images } : {}),
    ...(description ? { description } : {}),
    ...(sku ? { sku } : {}),
    ...(mpn ? { mpn } : {}),
    ...(leafCategory?.name ? { category: cleanDisplayText(leafCategory.name) } : {}),
    ...(colors.length ? { color: colors } : {}),
    brand: {
      '@type': 'Brand',
      name: brand,
    },
    offers: {
      '@type': 'Offer',
      '@id': productUrl,
      url: productUrl,
      priceCurrency: 'AED',
      price,
      priceValidUntil: priceValidUntil(),
      itemCondition: 'https://schema.org/NewCondition',
      availability: available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: {
        '@type': 'Organization',
        name: 'store1920',
        url: getProductSchemaSiteUrl(siteUrl),
      },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: product.freeShippingEligible ? '0.00' : '0.00',
          currency: 'AED',
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'AE',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: 0,
            maxValue: 1,
            unitCode: 'DAY',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: product.fastDelivery ? 1 : 2,
            maxValue: product.fastDelivery ? 2 : 5,
            unitCode: 'DAY',
          },
        },
      },
    },
  };
}

export function buildProductReviewJsonLd(product = {}, reviews = [], siteUrl = '') {
  const productUrl = getProductCanonicalUrl(product, siteUrl);
  const name = getProductPageHeading(product) || cleanDisplayText(product.name || product.title || 'Product');
  const approved = (Array.isArray(reviews) ? reviews : [])
    .filter((review) => Number(review?.rating) > 0 && reviewBody(review))
    .slice(0, 20);

  const ratingValues = approved.map((review) => Number(review.rating));
  const reviewCount = ratingValues.length || Number(product.ratingCount || 0);
  const ratingValue = ratingValues.length
    ? ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length
    : Number(product.averageRating || 0);

  if (reviewCount <= 0 || ratingValue <= 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${productUrl}#product`,
    name,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: ratingValue.toFixed(1),
      reviewCount: String(reviewCount),
      bestRating: '5',
      worstRating: '1',
    },
    ...(approved.length
      ? {
        review: approved.map((review) => ({
          '@type': 'Review',
          author: {
            '@type': 'Person',
            name: reviewAuthorName(review),
          },
          ...(reviewDate(review) ? { datePublished: reviewDate(review) } : {}),
          reviewBody: reviewBody(review),
          reviewRating: {
            '@type': 'Rating',
            ratingValue: String(Number(review.rating) || 5),
            bestRating: '5',
            worstRating: '1',
          },
        })),
      }
      : {}),
  };
}

export function buildProductSeoJsonLdDocuments({
  product,
  reviews = [],
  categoryChain = [],
  siteUrl = '',
} = {}) {
  if (!product) return [];

  const documents = [
    buildProductBreadcrumbJsonLd(product, categoryChain, siteUrl),
    buildProductJsonLd(product, { categoryChain, siteUrl }),
  ];

  const reviewDoc = buildProductReviewJsonLd(product, reviews, siteUrl);
  if (reviewDoc) documents.push(reviewDoc);
  return documents;
}
