import {
  SITE_URL,
  PUBLIC_STATIC_ROUTES,
  buildAbsoluteUrl,
  buildCategorySitemapEntries,
  countPublishedProducts,
} from '@/lib/sitemapData';
import { getAllActiveCategories } from '@/lib/categoryPageData';
import { buildCategoryUrl } from '@/lib/categorySlug';
import { decodeHtmlEntities } from '@/lib/displayText';
import { STORE1920_BRAND_NAME } from '@/lib/brandLogo';
import { STORE1920_SUPPORT_EMAIL } from '@/lib/storeContact';

export const LLMS_REVALIDATE_SECONDS = 3600;

const SHOPPING_PATHS = new Set([
  '/',
  '/shop',
  '/categories',
  '/new-arrivals',
  '/top-selling',
  '/trending-now',
  '/fast-delivery',
  '/offers',
  '/clearance-sale',
  '/under-149',
  '/under-499',
  '/5-star-rated',
]);

const POLICY_PATHS = new Set([
  '/terms-and-conditions',
  '/terms-of-sale',
  '/privacy-policy',
  '/shipping-policy',
  '/return-policy',
  '/cookie-policy',
  '/warranty-policy',
  '/payment-and-pricing',
]);

const HELP_PATHS = new Set([
  '/about-us',
  '/contact-us',
  '/faq',
  '/help',
  '/support',
]);

function buildCategoryChainUrl(allCategories, category) {
  const chain = [];
  let current = category;

  while (current) {
    chain.unshift(current);
    const parentId = String(current.parentId || '');
    current = parentId
      ? allCategories.find((item) => String(item._id) === parentId)
      : null;
  }

  return buildAbsoluteUrl(buildCategoryUrl(chain));
}

function formatMarkdownLink(title, url, description = '') {
  const safeTitle = String(title || '').replace(/\]/g, '\\]');
  const suffix = description ? `: ${description}` : '';
  return `- [${safeTitle}](${url})${suffix}`;
}

function groupStaticRoutes(pathsSet) {
  return PUBLIC_STATIC_ROUTES.filter(({ path }) => pathsSet.has(path));
}

function buildCategoryTreeLines(allCategories, { maxDepth = 3 } = {}) {
  const byParent = new Map();

  for (const category of allCategories) {
    const parentKey = category.parentId ? String(category.parentId) : '';
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey).push(category);
  }

  for (const items of byParent.values()) {
    items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));
  }

  const lines = [];

  const walk = (parentId, depth) => {
    if (depth >= maxDepth) return;
    for (const category of byParent.get(parentId) || []) {
      const indent = '  '.repeat(depth);
      const name = decodeHtmlEntities(category.name);
      const url = buildCategoryChainUrl(allCategories, category);
      lines.push(`${indent}- [${name}](${url})`);
      walk(String(category._id), depth + 1);
    }
  };

  walk('', 0);
  return lines;
}

function buildSiteIntro() {
  return `# ${STORE1920_BRAND_NAME}

> ${STORE1920_BRAND_NAME} is a UAE online retailer offering electronics, home, and lifestyle essentials at competitive prices with fast delivery on eligible items. Prices are shown in AED. The storefront supports English and Arabic.

- Website: ${SITE_URL}
- Customer support: ${STORE1920_SUPPORT_EMAIL}
- Order tracking: ${buildAbsoluteUrl('/track-order')}
- Sitemap: ${buildAbsoluteUrl('/sitemap.xml')}
- Full LLM index: ${buildAbsoluteUrl('/llms-full.txt')}

`;
}

function buildStaticSection(title, routes) {
  if (!routes.length) return '';
  const lines = routes.map(({ path }) => {
    const label = path === '/' ? 'Home' : path.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return formatMarkdownLink(label, buildAbsoluteUrl(path));
  });
  return `## ${title}\n${lines.join('\n')}\n\n`;
}

export async function buildLlmsTxt() {
  const [allCategories, productCount] = await Promise.all([
    getAllActiveCategories(),
    countPublishedProducts(),
  ]);

  const topLevelCategories = allCategories
    .filter((category) => !category.parentId && Number(category.level) <= 1)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));

  const shoppingRoutes = groupStaticRoutes(SHOPPING_PATHS);
  const policyRoutes = groupStaticRoutes(POLICY_PATHS);
  const helpRoutes = groupStaticRoutes(HELP_PATHS);

  const categoryLines = topLevelCategories.map((category) => (
    formatMarkdownLink(
      decodeHtmlEntities(category.name),
      buildCategoryChainUrl(allCategories, category),
      category.description ? decodeHtmlEntities(String(category.description).slice(0, 120)) : '',
    )
  ));

  return `${buildSiteIntro()}## Store overview

- Published products: ${productCount.toLocaleString('en-US')}
- Active categories: ${allCategories.length.toLocaleString('en-US')}
- Payment methods: Card, Cash on Delivery (COD), Tabby, Tamara, Wallet
- Languages: English, Arabic

${buildStaticSection('Shopping', shoppingRoutes)}## Top categories
${categoryLines.join('\n')}

${buildStaticSection('Policies', policyRoutes)}${buildStaticSection('Help & company', helpRoutes)}## Optional

- [HTML sitemap](${buildAbsoluteUrl('/sitemap')}): Browse all public pages
- [Seller dashboard](${buildAbsoluteUrl('/store')}): Merchant admin (not for shoppers)
`;
}

export async function buildLlmsFullTxt() {
  const [allCategories, categoryEntries, productCount] = await Promise.all([
    getAllActiveCategories(),
    buildCategorySitemapEntries(),
    countPublishedProducts(),
  ]);

  const shoppingRoutes = groupStaticRoutes(SHOPPING_PATHS);
  const policyRoutes = groupStaticRoutes(POLICY_PATHS);
  const helpRoutes = groupStaticRoutes(HELP_PATHS);
  const otherRoutes = PUBLIC_STATIC_ROUTES.filter(({ path }) => (
    !SHOPPING_PATHS.has(path) && !POLICY_PATHS.has(path) && !HELP_PATHS.has(path)
  ));

  const categoryTree = buildCategoryTreeLines(allCategories, { maxDepth: 4 });

  return `${buildSiteIntro()}## Store overview

- Published products: ${productCount.toLocaleString('en-US')}
- Category pages: ${categoryEntries.length.toLocaleString('en-US')}
- Currency: AED (United Arab Emirates Dirham)
- Delivery: UAE-wide shipping with order tracking

${buildStaticSection('Shopping', shoppingRoutes)}${buildStaticSection('Policies', policyRoutes)}${buildStaticSection('Help & company', helpRoutes)}${buildStaticSection('Other public pages', otherRoutes)}## Category tree
${categoryTree.join('\n')}

## Product & category discovery

- Product URLs follow \`/product/{slug}\` or \`/products/{slug}\` depending on catalog settings.
- Category URLs follow \`/category/{level-1}/{level-2}/{level-3}\`.
- Use the XML sitemap for a complete crawl list: ${buildAbsoluteUrl('/sitemap.xml')}
- Use the concise LLM index: ${buildAbsoluteUrl('/llms.txt')}

## Excluded from public indexing

Private or account-only areas include \`/store/\`, \`/admin/\`, \`/checkout\`, \`/cart\`, \`/sign-in\`, \`/orders\`, and \`/api/\`.
`;
}

export function llmsResponseHeaders() {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': `public, max-age=${LLMS_REVALIDATE_SECONDS}, s-maxage=${LLMS_REVALIDATE_SECONDS}`,
  };
}
