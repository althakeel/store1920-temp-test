import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Blog from '@/models/Blog';
import { getAllActiveCategories } from '@/lib/categoryPageData';
import { buildCategoryUrl } from '@/lib/categorySlug';
import { getProductPath } from '@/lib/productUrl';
import { STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';
import { resolveProductSlugRedirect } from '@/lib/productRedirects';
import { PUBLIC_STATIC_ROUTES, isPublicSitemapBlog } from '@/lib/sitemapData';
import { decodeHtmlEntities } from '@/lib/displayText';
import { isStorefrontWalletEnabled } from '@/lib/storefrontWallet';

/** First page size for HTML sitemap products (more load on scroll). */
export const HTML_SITEMAP_PRODUCT_PAGE_SIZE = 50;

/** @deprecated Prefer paginated HTML_SITEMAP_PRODUCT_PAGE_SIZE */
export const HTML_SITEMAP_PRODUCT_LIMIT = HTML_SITEMAP_PRODUCT_PAGE_SIZE;

const SHOP_PATHS = new Set([
  '/',
  '/shop',
  '/categories',
  '/top-selling',
  '/new-arrivals',
  '/trending-now',
  '/5-star-rated',
  '/clearance-sale',
  '/offers',
]);

const BUDGET_PATHS = new Set(['/under-149', '/under-499']);

const HELP_PATHS = new Set([
  '/faq',
  '/support',
  '/help',
  '/contact-us',
]);

const POLICY_PATHS = new Set([
  '/terms-and-conditions',
  '/terms-of-sale',
  '/privacy-policy',
  '/shipping-policy',
  '/return-policy',
  '/cookie-policy',
  '/warranty-policy',
  '/sitemap',
]);

const ABOUT_PATHS = new Set([
  '/about-us',
  '/business-information',
  '/careers',
  '/payment-and-pricing',
]);

const STATIC_LABELS = {
  '/': 'Home',
  '/shop': 'Shop',
  '/categories': 'Categories',
  '/top-selling': 'Top Selling',
  '/new-arrivals': 'New Arrivals',
  '/trending-now': 'Trending Now',
  '/5-star-rated': '5-Star Rated',
  '/clearance-sale': 'Clearance Sale',
  '/offers': 'Special Offers',
  '/under-149': 'Under AED 149',
  '/under-499': 'Under AED 499',
  '/faq': 'FAQ',
  '/support': 'Support',
  '/help': 'Help Center',
  '/contact-us': 'Contact Us',
  '/blogs': 'All Blog Posts',
  '/terms-and-conditions': 'Terms & Conditions',
  '/terms-of-sale': 'Terms of Sale',
  '/privacy-policy': 'Privacy Policy',
  '/shipping-policy': 'Shipping Policy',
  '/return-policy': 'Return, Refund, Replacement & Cancellation',
  '/cookie-policy': 'Cookie Policy',
  '/warranty-policy': 'Warranty Policy',
  '/sitemap': 'Sitemap',
  '/about-us': 'About Us',
  '/business-information': 'Business Information',
  '/careers': 'Careers',
  '/payment-and-pricing': 'Payment & Pricing',
};

function labelForPath(path) {
  return STATIC_LABELS[path] || path.replace(/^\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function routesFromSet(pathSet) {
  return PUBLIC_STATIC_ROUTES
    .filter(({ path }) => pathSet.has(path))
    .map(({ path }) => ({
      text: labelForPath(path),
      path,
    }));
}

function buildCategoryChain(allCategories, category) {
  const chain = [];
  let current = category;
  while (current) {
    if (!String(current.slug || '').trim()) return null;
    chain.unshift(current);
    const parentId = String(current.parentId || '');
    current = parentId
      ? allCategories.find((item) => String(item._id) === parentId)
      : null;
  }
  return chain;
}

export async function getHtmlSitemapCategoryLinks() {
  const allCategories = await getAllActiveCategories();
  const links = [];
  const seen = new Set();

  const sorted = [...allCategories].sort(
    (a, b) => (a.level || 0) - (b.level || 0)
      || (a.sortOrder || 0) - (b.sortOrder || 0)
      || String(a.name || '').localeCompare(String(b.name || '')),
  );

  for (const category of sorted) {
    const chain = buildCategoryChain(allCategories, category);
    if (!chain?.length) continue;
    const path = buildCategoryUrl(chain);
    if (!path || path === '/shop' || seen.has(path)) continue;
    seen.add(path);

    const name = decodeHtmlEntities(category.name || category.slug || 'Category');
    const depth = Math.max(0, (category.level || chain.length) - 1);
    links.push({
      text: name,
      path,
      depth,
      description: depth > 0 ? `Subcategory` : 'Category',
    });
  }

  return links;
}

export async function getHtmlSitemapBlogLinks() {
  await connectDB();
  const now = new Date();
  const blogs = await Blog.find({
    status: 'published',
    slug: { $exists: true, $nin: ['', null] },
    $or: [{ publishedAt: { $lte: now } }, { publishedAt: null }],
  })
    .select('title slug excerpt contentHtml publishedAt updatedAt')
    .sort({ publishedAt: -1, updatedAt: -1 })
    .lean();

  const seen = new Set();
  return blogs
    .map((blog) => {
      const slug = String(blog.slug || '').trim();
      if (!slug || seen.has(slug) || !isPublicSitemapBlog(blog)) return null;
      seen.add(slug);
      return {
        text: decodeHtmlEntities(blog.title || slug),
        path: `/blogs/${slug}`,
      };
    })
    .filter(Boolean);
}

export async function getHtmlSitemapStoreLinks() {
  return [];
}

export async function getHtmlSitemapProductLinks({
  page = 1,
  limit = HTML_SITEMAP_PRODUCT_PAGE_SIZE,
} = {}) {
  await connectDB();
  const filter = {
    ...STOREFRONT_PUBLISHED_FILTER,
    slug: { $exists: true, $nin: ['', null] },
  };

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || HTML_SITEMAP_PRODUCT_PAGE_SIZE));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .select('name slug useProductsPath updatedAt')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  const seen = new Set();
  const links = products
    .map((product) => {
      const slug = String(product.slug || '').trim();
      if (!slug || resolveProductSlugRedirect(slug)) return null;
      const path = getProductPath(product);
      if (!path || path === '/shop' || seen.has(path)) return null;
      seen.add(path);
      return {
        text: decodeHtmlEntities(product.name || slug),
        path,
      };
    })
    .filter(Boolean);

  const loadedThrough = skip + links.length;
  const hasMore = loadedThrough < total;

  return {
    links,
    total,
    shown: links.length,
    page: safePage,
    limit: safeLimit,
    hasMore,
    nextPage: hasMore ? safePage + 1 : null,
  };
}

function accountLinks() {
  const walletEnabled = isStorefrontWalletEnabled();
  const links = [
    { text: 'My Profile', path: '/dashboard/profile' },
    { text: 'My Orders', path: '/orders' },
    { text: 'My Wishlist', path: '/wishlist' },
    { text: 'Shopping Cart', path: '/cart' },
    { text: 'Sign In', path: '/sign-in' },
    { text: 'Sign Up', path: '/sign-up' },
  ];
  if (walletEnabled) {
    links.push({ text: 'My Wallet', path: '/wallet' });
  }
  return links;
}

/**
 * Full HTML sitemap payload from live MongoDB (same sources as XML sitemaps).
 */
export async function getHtmlSitemapData() {
  const emptyProducts = {
    links: [],
    total: 0,
    shown: 0,
    page: 1,
    limit: HTML_SITEMAP_PRODUCT_PAGE_SIZE,
    hasMore: false,
    nextPage: null,
  };

  let categoryLinks = [];
  let blogLinks = [];
  let productData = emptyProducts;

  try {
    [categoryLinks, blogLinks, productData] = await Promise.all([
      getHtmlSitemapCategoryLinks().catch(() => []),
      getHtmlSitemapBlogLinks().catch(() => []),
      getHtmlSitemapProductLinks({ page: 1, limit: HTML_SITEMAP_PRODUCT_PAGE_SIZE }).catch(() => emptyProducts),
    ]);
  } catch {
    categoryLinks = [];
    blogLinks = [];
    productData = emptyProducts;
  }

  const seenPaths = new Set();
  const uniqueLinks = (links = []) => links.filter((link) => {
    const path = String(link?.path || '').trim();
    if (!path || seenPaths.has(path)) return false;
    seenPaths.add(path);
    return true;
  });

  const sections = [
    {
      id: 'shop',
      title: 'Shop & Browse',
      links: uniqueLinks(routesFromSet(SHOP_PATHS)),
    },
    {
      id: 'budget',
      title: 'Budget Shopping',
      links: uniqueLinks(routesFromSet(BUDGET_PATHS)),
    },
    {
      id: 'categories',
      title: 'Categories',
      links: uniqueLinks(categoryLinks),
      emptyMessage: 'No active categories yet.',
    },
    {
      id: 'blogs',
      title: 'Blog',
      links: uniqueLinks([
        { text: 'All Blog Posts', path: '/blogs' },
        ...blogLinks,
      ]),
    },
    {
      id: 'account',
      title: 'Account',
      links: uniqueLinks(accountLinks()),
    },
    {
      id: 'help',
      title: 'Help & Support',
      links: uniqueLinks(routesFromSet(HELP_PATHS)),
    },
    {
      id: 'policies',
      title: 'Policies & Legal',
      links: uniqueLinks(routesFromSet(POLICY_PATHS)),
    },
    {
      id: 'about',
      title: 'About',
      links: uniqueLinks(routesFromSet(ABOUT_PATHS)),
    },
  ];

  return {
    sections,
    products: {
      initialLinks: productData.links,
      total: productData.total,
      page: productData.page,
      limit: productData.limit,
      hasMore: productData.hasMore,
      nextPage: productData.nextPage,
    },
    stats: {
      categories: categoryLinks.length,
      products: productData.total,
      productsShown: productData.shown,
      blogs: blogLinks.length,
    },
  };
}
