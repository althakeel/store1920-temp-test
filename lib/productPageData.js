import connectDB from '@/lib/mongodb';
import { getCachedData, setCachedData } from '@/lib/cache';
import Product from '@/models/Product';
import Rating from '@/models/Rating';
import User from '@/models/User';
import mongoose from 'mongoose';
import { cache } from 'react';
import { isProductPublished, STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';
import { getAllActiveCategories } from '@/lib/categoryPageData';
import { resolveProductCategoryChain } from '@/lib/productSeo';

const PAGE_CACHE_TTL = 120;
const CATEGORY_CACHE_TTL = 300;
const CATEGORY_CACHE_KEY = 'product-page:categories:v1';

async function getCachedCategoriesForProductPage() {
  const cached = getCachedData(CATEGORY_CACHE_KEY);
  if (cached) return cached;
  const categories = await getAllActiveCategories();
  setCachedData(CATEGORY_CACHE_KEY, categories, CATEGORY_CACHE_TTL);
  return categories;
}

const PRODUCT_SELECT =
  'name nameAr slug description descriptionAr shortDescription shortDescriptionAr shortDescription2 aPlusDesktop aPlusMobile aPlusDesktopAr aPlusMobileAr aPlusDesktopImages aPlusMobileImages brand brandAr attributes AED price images category categories sku inStock stockQuantity soldCount hasVariants variants hasBulkPricing bulkPricing fastDelivery freeShippingEligible useProductsPath allowReturn allowReplacement specTableEnabled specTableColumns specTableRows storeId imageAspectRatio cardVideoPreviewEnabled cardVideoPreviewDelaySec createdAt updatedAt seoTitle seoH1 seoH1Ar seoDescription seoKeywords tags enableFBT fbtProductIds fbtBundlePrice fbtBundleDiscount averageRating ratingCount';

const RELATED_SELECT =
  'name nameAr slug price AED images category categories inStock stockQuantity imageAspectRatio averageRating ratingCount useProductsPath';

const FBT_SELECT =
  'name nameAr price images slug hasVariants variants inStock stockQuantity useProductsPath';

function serializePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function resolveCategoryNames(product) {
  const candidates = [
    product?.category,
    ...(Array.isArray(product?.categories) ? product.categories : []),
  ];

  return [...new Set(
    candidates
      .map((value) => {
        if (!value) return null;
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') return value.name || value.slug || null;
        return null;
      })
      .filter(Boolean)
  )];
}

async function fetchProductBySlug(slug) {
  if (!slug) return null;

  const candidates = [];
  const normalized = String(slug || '').trim();
  if (normalized) candidates.push(normalized);

  // WooCommerce-style duplicate slugs: foo-2, foo-7 → try foo
  let current = normalized;
  while (/-\d+$/.test(current)) {
    current = current.replace(/-\d+$/, '');
    if (current && !candidates.includes(current)) candidates.push(current);
  }

  for (const candidate of candidates) {
    let product = await Product.findOne({ slug: candidate }).select(PRODUCT_SELECT).lean();

    if (!product && /^[a-fA-F0-9]{24}$/.test(candidate)) {
      product = await Product.findById(candidate).select(PRODUCT_SELECT).lean();
    }

    if (product && isProductPublished(product)) {
      return product;
    }
  }

  return null;
}

async function fetchReviewsForProduct(productId) {
  if (!productId) return [];

  const reviews = await Rating.find({
    productId: String(productId),
    approved: true,
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('rating review images videos customerName customerEmail userId orderId helpfulCount createdAt')
    .lean();

  const userIds = [
    ...new Set(
      reviews
        .map((review) => String(review.userId || '').trim())
        .filter((id) => /^[a-fA-F0-9]{24}$/.test(id))
    ),
  ];

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('_id name image email').lean()
    : [];

  const userMap = new Map(users.map((user) => [String(user._id), user]));

  return reviews.map((review) => ({
    ...review,
    user: userMap.get(String(review.userId)) || {
      name: review.customerName || 'Guest',
      email: review.customerEmail,
      image: '/placeholder-avatar.png',
    },
  }));
}

async function fetchRelatedProducts(product, limit = 6) {
  if (!product?.slug) return [];

  const categories = resolveCategoryNames(product);
  const baseFilter = {
    ...STOREFRONT_PUBLISHED_FILTER,
    inStock: { $ne: false },
    slug: { $ne: product.slug },
  };

  let related = [];

  if (categories.length > 0) {
    related = await Product.find({
      ...baseFilter,
      $or: [
        { category: { $in: categories } },
        { categories: { $in: categories } },
      ],
    })
      .select(RELATED_SELECT)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
  }

  if (related.length === 0) {
    related = await Product.find(baseFilter)
      .select(RELATED_SELECT)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
  }

  return related;
}

function hasPositiveStock(product) {
  if (!product) return false;
  if (product.inStock === false) return false;

  if (product.hasVariants && Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.some((variant) => Number(variant?.stock || 0) > 0);
  }

  if (typeof product.stockQuantity === 'number') {
    return product.stockQuantity > 0;
  }

  return true;
}

async function fetchFbtBundle(product) {
  if (!product?.enableFBT || !Array.isArray(product.fbtProductIds) || product.fbtProductIds.length === 0) {
    return {
      enableFBT: false,
      products: [],
      bundlePrice: 0,
      bundleDiscount: 0,
    };
  }

  const ids = product.fbtProductIds
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (!ids.length) {
    return {
      enableFBT: false,
      products: [],
      bundlePrice: 0,
      bundleDiscount: 0,
    };
  }

  const buildPublishedIdQuery = (ids) => ({
    _id: { $in: ids },
    ...STOREFRONT_PUBLISHED_FILTER,
  });

  const rawProducts = await Product.find(buildPublishedIdQuery(ids)).select(FBT_SELECT).lean();
  const byId = new Map(rawProducts.map((item) => [String(item._id), item]));

  const products = ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .filter((item) => isProductPublished(item))
    .filter((item) => Number.isFinite(Number(item.price)) && Number(item.price) >= 0)
    .filter(hasPositiveStock)
    .slice(0, 10);

  return {
    enableFBT: products.length > 0,
    products,
    bundlePrice: product.fbtBundlePrice || 0,
    bundleDiscount: product.fbtBundleDiscount || 0,
  };
}

const EMPTY_PAGE_PAYLOAD = {
  product: null,
  reviews: [],
  relatedProducts: [],
  fbt: { enableFBT: false, products: [], bundlePrice: 0, bundleDiscount: 0 },
  categoryChain: [],
};

export const getProductPageData = cache(async function getProductPageData(slug, language = 'en') {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) {
    return EMPTY_PAGE_PAYLOAD;
  }

  const cacheKey = `product-page:${normalizedSlug}:i18n`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    await connectDB();

    const product = await fetchProductBySlug(normalizedSlug);
    if (!product) {
      const empty = serializePayload(EMPTY_PAGE_PAYLOAD);
      setCachedData(cacheKey, empty, 30);
      return empty;
    }

    const productId = String(product._id);

    const [reviews, relatedProducts, fbt, categories] = await Promise.all([
      fetchReviewsForProduct(productId),
      fetchRelatedProducts(product, 6),
      fetchFbtBundle(product),
      getCachedCategoriesForProductPage().catch(() => []),
    ]);

    const categoryChain = resolveProductCategoryChain(product, categories);
    const leafCategoryName = categoryChain[categoryChain.length - 1]?.name || '';

    const payload = serializePayload({
      product: {
        ...product,
        categoryChain,
        categoryName: leafCategoryName,
      },
      reviews,
      relatedProducts,
      fbt,
      categoryChain,
    });

    setCachedData(cacheKey, payload, PAGE_CACHE_TTL);
    return payload;
  } catch (error) {
    console.error('[getProductPageData] error:', normalizedSlug, error);
    return serializePayload(EMPTY_PAGE_PAYLOAD);
  }
});
