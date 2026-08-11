import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import Product from '@/models/Product';
import Rating from '@/models/Rating';
import { STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';
import { parseCategoryPathSegments } from '@/lib/categorySlug';
import { deleteCacheKey } from '@/lib/cache';
import {
  buildCategoryIdAliases,
  findCategoryByPathSegments,
  normalizeCategoryParentIds,
} from '@/lib/categoryTreeUtils';
import {
  countProductsDedupedBySku,
  fetchProductsDedupedBySku,
} from '@/lib/productSkuDedupe';
import { buildCategoryIdMatch, buildCategoryIdsMatch } from '@/lib/productCategoryRefs';

const CATEGORY_CACHE_KEY = 'public:categories:tree:v5';
const CATEGORY_PRODUCTS_FETCH_ALL_CAP = 500;
export const CATEGORY_PRODUCTS_PAGE_SIZE = 100;

function serializeClientPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

async function attachProductRatings(products = []) {
  if (!products.length) return products;

  const productIds = products.map((product) => String(product._id));
  const ratingsMap = {};

  try {
    const allRatings = await Rating.find({
      productId: { $in: productIds },
      approved: true,
    })
      .select('productId rating')
      .lean();

    allRatings.forEach((review) => {
      const key = String(review.productId);
      if (!ratingsMap[key]) ratingsMap[key] = [];
      ratingsMap[key].push(review.rating);
    });
  } catch (error) {
    console.error('Category ratings fetch error:', error);
  }

  return products.map((product) => {
    const reviews = ratingsMap[String(product._id)] || [];
    const ratingCount = reviews.length;
    const averageRating = ratingCount > 0
      ? reviews.reduce((sum, rating) => sum + rating, 0) / ratingCount
      : 0;

    return {
      ...product,
      ratingCount,
      averageRating,
    };
  });
}

export async function getAllActiveCategories() {
  await connectDB();
  const raw = await Category.find({ isActive: { $ne: false } })
    .select('name nameAr slug image parentId description descriptionAr level metaTitle metaDescription sortOrder url legacySourceId')
    .sort({ level: 1, sortOrder: 1, name: 1 })
    .lean();

  const aliases = buildCategoryIdAliases(raw);
  return normalizeCategoryParentIds(raw, aliases);
}

export async function resolveCategoryByPathSegments(pathSegments = []) {
  const segments = parseCategoryPathSegments(pathSegments.join('/'));
  if (!segments.length) return null;

  await connectDB();
  const all = await getAllActiveCategories();
  const resolved = findCategoryByPathSegments(all, segments);
  if (!resolved) return null;

  return { ...resolved, all };
}

function collectCategoryAndDescendantIds(allCategories = [], rootId) {
  const root = String(rootId || '').trim();
  if (!root) return [];

  const childrenByParent = new Map();
  for (const category of allCategories) {
    const parentId = String(category?.parentId || '').trim();
    if (!parentId) continue;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(String(category._id));
  }

  const ids = [root];
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    const children = childrenByParent.get(current) || [];
    for (const childId of children) {
      if (ids.includes(childId)) continue;
      ids.push(childId);
      queue.push(childId);
    }
  }

  return ids;
}

function buildCategoryScopeMatch(categoryId, allCategories = []) {
  const descendantIds = collectCategoryAndDescendantIds(allCategories, categoryId);
  if (descendantIds.length > 1) {
    return buildCategoryIdsMatch(descendantIds);
  }
  return buildCategoryIdMatch(categoryId);
}

export async function getCategoryProducts(categoryId, { limit = 48, page = 1, fetchAll = false, allCategories = [] } = {}) {
  await connectDB();
  const category = await Category.findById(categoryId).select('_id slug name').lean();
  if (!category) return { products: [], total: 0 };

  const categoryMatch = buildCategoryScopeMatch(category._id, allCategories);
  if (!categoryMatch) return { products: [], total: 0 };

  const match = {
    $and: [
      STOREFRONT_PUBLISHED_FILTER,
      categoryMatch,
    ],
  };

  const effectiveLimit = fetchAll ? CATEGORY_PRODUCTS_FETCH_ALL_CAP : limit;
  const skip = fetchAll ? 0 : Math.max(0, (page - 1) * limit);
  const [rawProducts, total] = await Promise.all([
    fetchProductsDedupedBySku(Product, match, {
      sort: { createdAt: -1 },
      skip,
      limit: effectiveLimit,
    }),
    countProductsDedupedBySku(Product, match),
  ]);

  const productsWithRatings = await attachProductRatings(rawProducts);

  return {
    products: serializeClientPayload(productsWithRatings),
    total,
    page: fetchAll ? 1 : page,
    limit: effectiveLimit,
    fetchAll,
  };
}

export function invalidateCategoryPageCaches() {
  deleteCacheKey(CATEGORY_CACHE_KEY);
}

export async function getCategoryHeaderStats(categoryId, { allCategories = [] } = {}) {
  await connectDB();

  const categoryMatch = buildCategoryScopeMatch(categoryId, allCategories);
  if (!categoryMatch) {
    return { productCount: 0, fastDeliveryCount: 0, fastDeliveryPercent: 0, averageRating: 0, reviewCount: 0 };
  }

  const match = {
    $and: [STOREFRONT_PUBLISHED_FILTER, categoryMatch],
  };

  const [products, productCount] = await Promise.all([
    Product.find(match).select('_id fastDelivery').lean(),
    countProductsDedupedBySku(Product, match),
  ]);
  const productIds = products.map((product) => String(product._id));
  const fastDeliveryCount = products.filter((product) => product.fastDelivery).length;
  const fastDeliveryPercent = productCount > 0
    ? Math.round((fastDeliveryCount / productCount) * 100)
    : 0;

  let reviewCount = 0;
  let averageRating = 0;

  if (productIds.length) {
    try {
      const [ratingAgg] = await Rating.aggregate([
        {
          $match: {
            productId: { $in: productIds },
            approved: true,
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            sum: { $sum: '$rating' },
          },
        },
      ]);

      reviewCount = Number(ratingAgg?.count) || 0;
      averageRating = reviewCount > 0
        ? Math.round((Number(ratingAgg.sum) / reviewCount) * 10) / 10
        : 0;
    } catch (error) {
      console.error('Category header ratings error:', error);
    }
  }

  return {
    productCount,
    fastDeliveryCount,
    fastDeliveryPercent,
    averageRating,
    reviewCount,
  };
}
