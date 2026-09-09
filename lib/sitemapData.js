import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Blog from '@/models/Blog';
import { getAllActiveCategories } from '@/lib/categoryPageData';
import { buildCategoryUrl } from '@/lib/categorySlug';
import { getProductPath } from '@/lib/productUrl';
import { STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';
import { resolveProductSlugRedirect } from '@/lib/productRedirects';
import { getCustomerSiteUrl } from '@/lib/appUrl';

/**
 * Live XML sitemap builders.
 *
 * Products / categories / blogs are queried from MongoDB on each generation
 * (revalidate = 1 hour). Adding, removing, unpublishing, or re-categorizing
 * catalog data automatically changes the next sitemap response — there is no
 * static sitemap file to edit by hand.
 */

/** Canonical public host for sitemap + robots (never staging .store). */
export const SITE_URL = getCustomerSiteUrl();

export const PRODUCTS_PER_SITEMAP = 10000;

export const SITEMAP_ID = {
  PAGES: 'pages',
  CATEGORIES: 'categories',
  BLOG: 'blog',
  PRODUCTS: 'products',
};

/** @deprecated Use SITEMAP_ID.PAGES — kept for older imports. */
export const STATIC_SITEMAP_ID = SITEMAP_ID.PAGES;

/**
 * Canonical public pages only.
 * Excludes alias stubs (/privacy, /terms, /shipping), personalized pages,
 * and anything that is noindex / auth / checkout (those stay out of robots too).
 */
export const PUBLIC_STATIC_ROUTES = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/shop', priority: 0.9, changeFrequency: 'daily' },
  { path: '/categories', priority: 0.85, changeFrequency: 'weekly' },
  { path: '/fast-delivery', priority: 0.8, changeFrequency: 'daily' },
  { path: '/top-selling', priority: 0.8, changeFrequency: 'daily' },
  { path: '/new-arrivals', priority: 0.8, changeFrequency: 'daily' },
  { path: '/trending-now', priority: 0.8, changeFrequency: 'daily' },
  { path: '/5-star-rated', priority: 0.75, changeFrequency: 'weekly' },
  { path: '/clearance-sale', priority: 0.8, changeFrequency: 'daily' },
  { path: '/offers', priority: 0.8, changeFrequency: 'daily' },
  { path: '/under-149', priority: 0.75, changeFrequency: 'weekly' },
  { path: '/under-499', priority: 0.75, changeFrequency: 'weekly' },
  { path: '/about-us', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/blogs', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/business-information', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/contact-us', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/faq', priority: 0.55, changeFrequency: 'monthly' },
  { path: '/help', priority: 0.55, changeFrequency: 'monthly' },
  { path: '/support', priority: 0.55, changeFrequency: 'monthly' },
  { path: '/careers', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/payment-and-pricing', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/terms-and-conditions', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/terms-of-sale', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/privacy-policy', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/shipping-policy', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/return-policy', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/cookie-policy', priority: 0.35, changeFrequency: 'yearly' },
  { path: '/warranty-policy', priority: 0.35, changeFrequency: 'yearly' },
];

export function buildAbsoluteUrl(path = '/') {
  const normalized = String(path || '/').startsWith('/') ? String(path) : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

/** Public-facing sitemap file name for Search Console (hyphenated). */
export function toPublicSitemapFilename(id = '') {
  const key = String(id || '').trim();
  if (!key) return '';
  if (key === SITEMAP_ID.PAGES) return 'sitemap-pages.xml';
  if (key === SITEMAP_ID.CATEGORIES) return 'sitemap-categories.xml';
  if (key === SITEMAP_ID.BLOG) return 'sitemap-blog.xml';
  if (key === SITEMAP_ID.PRODUCTS) return 'sitemap-products.xml';
  if (/^products-\d+$/.test(key)) return `sitemap-${key}.xml`;
  return `sitemap-${key}.xml`;
}

function buildCategoryChainUrl(allCategories, category) {
  const chain = [];
  let current = category;

  while (current) {
    const slug = String(current.slug || '').trim();
    if (!slug) return null;
    chain.unshift(current);
    const parentId = String(current.parentId || '');
    current = parentId
      ? allCategories.find((item) => String(item._id) === parentId)
      : null;
  }

  const path = buildCategoryUrl(chain);
  if (!path || path === '/shop') return null;
  return buildAbsoluteUrl(path);
}

export function buildStaticSitemapEntries() {
  return PUBLIC_STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: buildAbsoluteUrl(path),
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}

export async function buildCategorySitemapEntries() {
  const categories = await getAllActiveCategories();
  const seen = new Set();

  return categories
    .map((category) => {
      const url = buildCategoryChainUrl(categories, category);
      if (!url || seen.has(url)) return null;
      seen.add(url);
      return {
        url,
        lastModified: category.updatedAt ? new Date(category.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: category.level === 1 ? 0.8 : category.level === 2 ? 0.7 : 0.6,
      };
    })
    .filter(Boolean);
}

export async function buildStoreSitemapEntries() {
  return [];
}

const TEST_BLOG_SLUG = /^(test|test-blog|untitled|lorem|demo|sample)(-|_|\b|$)/i;
const TEST_BLOG_TITLE = /^(test(\s+blog|\s+post)?|untitled|lorem ipsum|demo|sample)\b/i;

export function isPublicSitemapBlog(blog = {}) {
  const slug = String(blog.slug || '').trim();
  const title = String(blog.title || '').trim();
  const text = `${String(blog.excerpt || '')} ${String(blog.contentHtml || '').replace(/<[^>]+>/g, '')}`
    .replace(/\s+/g, ' ')
    .trim();

  if (!slug) return false;
  if (TEST_BLOG_SLUG.test(slug) || /(?:^|-)test(?:-|$)/i.test(slug)) return false;
  if (TEST_BLOG_TITLE.test(title) || title.length < 3) return false;
  if (text.length < 40) return false;
  return true;
}

/** Canonical public pages only — no seller stores, create-store, or stub pricing. */
export async function buildPagesSitemapEntries() {
  return buildStaticSitemapEntries();
}

/** @deprecated Prefer buildPagesSitemapEntries (categories moved to their own sitemap). */
export async function buildStaticBundleSitemapEntries() {
  return buildPagesSitemapEntries();
}

function publishedBlogFilter(now = new Date()) {
  return {
    status: 'published',
    slug: { $exists: true, $nin: ['', null] },
    $or: [
      { publishedAt: { $lte: now } },
      { publishedAt: null },
    ],
  };
}

export async function buildBlogSitemapEntries() {
  await connectDB();

  const blogs = await Blog.find(publishedBlogFilter())
    .select('slug title excerpt contentHtml updatedAt publishedAt')
    .sort({ publishedAt: -1, updatedAt: -1 })
    .lean();

  const seen = new Set();
  return blogs
    .map((blog) => {
      const slug = String(blog.slug || '').trim();
      if (!slug || seen.has(slug) || !isPublicSitemapBlog(blog)) return null;
      seen.add(slug);
      return {
        url: buildAbsoluteUrl(`/blogs/${slug}`),
        lastModified: blog.updatedAt
          ? new Date(blog.updatedAt)
          : blog.publishedAt
            ? new Date(blog.publishedAt)
            : new Date(),
        changeFrequency: 'weekly',
        priority: 0.65,
      };
    })
    .filter(Boolean);
}

function publishedProductFilter() {
  return {
    ...STOREFRONT_PUBLISHED_FILTER,
    slug: { $exists: true, $nin: ['', null] },
  };
}

export async function countPublishedProducts() {
  await connectDB();
  return Product.countDocuments(publishedProductFilter());
}

export async function buildProductSitemapEntries(productSitemapIndex = 0) {
  await connectDB();

  const products = await Product.find(publishedProductFilter())
    .select('slug useProductsPath updatedAt')
    .sort({ updatedAt: -1 })
    .skip(productSitemapIndex * PRODUCTS_PER_SITEMAP)
    .limit(PRODUCTS_PER_SITEMAP)
    .lean();

  const seen = new Set();
  return products
    .map((product) => {
      const slug = String(product.slug || '').trim();
      if (!slug) return null;

      // Skip legacy slugs that permanently redirect (would not match canonical).
      if (resolveProductSlugRedirect(slug)) return null;

      const path = getProductPath(product);
      if (!path || path === '/shop') return null;

      const url = buildAbsoluteUrl(path);
      if (seen.has(url)) return null;
      seen.add(url);

      return {
        url,
        lastModified: product.updatedAt ? new Date(product.updatedAt) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      };
    })
    .filter(Boolean);
}

export function getProductSitemapIdList(productCount = 0) {
  const count = Math.max(0, Number(productCount) || 0);
  const chunks = Math.ceil(count / PRODUCTS_PER_SITEMAP);
  if (chunks <= 0) return [];
  if (chunks === 1) return [SITEMAP_ID.PRODUCTS];
  return Array.from({ length: chunks }, (_, index) => (
    index === 0 ? SITEMAP_ID.PRODUCTS : `products-${index + 1}`
  ));
}

export function parseProductSitemapChunkIndex(id = '') {
  const key = String(id || '').trim();
  if (key === SITEMAP_ID.PRODUCTS) return 0;
  const match = /^products-(\d+)$/.exec(key);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.max(0, n - 1);
}

export async function getSitemapIds() {
  const productCount = await countPublishedProducts();
  const productIds = getProductSitemapIdList(productCount);

  return [
    { id: SITEMAP_ID.PAGES },
    { id: SITEMAP_ID.CATEGORIES },
    { id: SITEMAP_ID.BLOG },
    ...productIds.map((id) => ({ id })),
  ];
}

export async function buildSitemapEntriesForId(id) {
  const key = String(id || '').trim();

  if (key === SITEMAP_ID.PAGES || key === '' || key === '0') {
    return buildPagesSitemapEntries();
  }
  if (key === SITEMAP_ID.CATEGORIES) {
    return buildCategorySitemapEntries();
  }
  if (key === SITEMAP_ID.BLOG) {
    return buildBlogSitemapEntries();
  }

  const chunkIndex = parseProductSitemapChunkIndex(key);
  if (chunkIndex !== null) {
    return buildProductSitemapEntries(chunkIndex);
  }

  // Legacy numeric product chunks (sitemap/1.xml …) from older deploys.
  const numeric = Number.parseInt(key, 10);
  if (Number.isFinite(numeric) && numeric >= 1) {
    return buildProductSitemapEntries(numeric - 1);
  }

  return [];
}
