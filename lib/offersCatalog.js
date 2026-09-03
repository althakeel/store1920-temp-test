import { localizeRecord } from '@/lib/storefrontLanguage';
import {
  applyStorefrontVisibilityFilters,
  buildShopMatchStage,
} from '@/lib/shopProductQuery';
import { buildSkuDedupeKeyAddFieldsStage } from '@/lib/productSkuDedupe';
import {
  DEFAULT_OFFERS_PAGE,
  OFFERS_PAGE_SIZE,
  normalizeOffersPage,
} from '@/lib/offersPageSettings';
import mongoose from 'mongoose';

export { OFFERS_PAGE_SIZE };
export const OFFERS_MIN_DISCOUNT_PERCENT = DEFAULT_OFFERS_PAGE.minDiscountPercent;

function toObjectIds(ids = []) {
  const out = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id)) continue;
    out.push(new mongoose.Types.ObjectId(id));
  }
  return out;
}

export function buildOffersDiscountAddFieldsStage() {
  return {
    $addFields: {
      __discountPct: {
        $cond: [
          {
            $and: [
              { $gt: [{ $ifNull: ['$AED', 0] }, 0] },
              { $gt: [{ $ifNull: ['$price', 0] }, 0] },
              { $gt: ['$AED', '$price'] },
            ],
          },
          {
            $multiply: [
              { $divide: [{ $subtract: ['$AED', '$price'] }, '$AED'] },
              100,
            ],
          },
          0,
        ],
      },
    },
  };
}

function buildOffersBaseMatchStage(minDiscount = OFFERS_MIN_DISCOUNT_PERCENT) {
  const matchStage = applyStorefrontVisibilityFilters(buildShopMatchStage({}));
  return { matchStage, minDiscount };
}

function buildOffersDiscountPipeline(minDiscount) {
  const { matchStage } = buildOffersBaseMatchStage(minDiscount);

  return [
    { $match: matchStage },
    buildOffersDiscountAddFieldsStage(),
    { $match: { __discountPct: { $gt: minDiscount } } },
    buildSkuDedupeKeyAddFieldsStage(),
    { $sort: { __discountPct: -1, inStock: -1, createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: '$__skuDedupeKey',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { __discountPct: -1, _id: -1 } },
  ];
}

function buildCategoryOffersPipeline(categoryIds = []) {
  const objectIds = toObjectIds(categoryIds);
  const stringIds = (Array.isArray(categoryIds) ? categoryIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  const categoryMatchers = [];
  if (objectIds.length) {
    categoryMatchers.push(
      { category: { $in: objectIds } },
      { categories: { $in: objectIds } },
    );
  }
  if (stringIds.length) {
    categoryMatchers.push(
      { category: { $in: stringIds } },
      { categories: { $in: stringIds } },
    );
  }

  const matchStage = applyStorefrontVisibilityFilters({
    ...buildShopMatchStage({}),
    ...(categoryMatchers.length ? { $or: categoryMatchers } : { _id: null }),
  });

  return [
    { $match: matchStage },
    buildOffersDiscountAddFieldsStage(),
    buildSkuDedupeKeyAddFieldsStage(),
    { $sort: { __discountPct: -1, inStock: -1, createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: '$__skuDedupeKey',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { __discountPct: -1, createdAt: -1, _id: -1 } },
  ];
}

async function paginateAggregate(Product, pipeline, { page, limit }) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 48) : OFFERS_PAGE_SIZE;
  const skip = (safePage - 1) * safeLimit;

  const [countResult, products] = await Promise.all([
    Product.aggregate([...pipeline, { $count: 'total' }]),
    Product.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: safeLimit },
      {
        $project: {
          __skuDedupeKey: 0,
        },
      },
    ]),
  ]);

  const total = Number(countResult?.[0]?.total) || 0;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));

  return {
    products,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}

export async function countOffersProducts(Product, minDiscount = OFFERS_MIN_DISCOUNT_PERCENT) {
  const result = await Product.aggregate([
    ...buildOffersDiscountPipeline(minDiscount),
    { $count: 'total' },
  ]);

  return Number(result?.[0]?.total) || 0;
}

async function fetchManualOffersProducts(
  Product,
  { page = 1, limit = OFFERS_PAGE_SIZE, productIds = [] } = {},
) {
  const ids = (Array.isArray(productIds) ? productIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 48) : OFFERS_PAGE_SIZE;

  if (!ids.length) {
    return { products: [], total: 0, page: safePage, limit: safeLimit, totalPages: 1 };
  }

  const objectIds = toObjectIds(ids);
  const matchStage = applyStorefrontVisibilityFilters({
    ...buildShopMatchStage({}),
    _id: { $in: objectIds.length ? objectIds : ids },
  });

  const productsRaw = await Product.find(matchStage)
    .select('_id name nameAr slug price mrp AED images category categories tags inStock stockQuantity createdAt brand brandAr description shortDescription')
    .lean();

  const byId = new Map(productsRaw.map((product) => [String(product._id), product]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const skip = (safePage - 1) * safeLimit;
  const products = ordered.slice(skip, skip + safeLimit).map((product) => ({
    ...product,
    __discountPct: (() => {
      const aed = Number(product?.AED || 0);
      const price = Number(product?.price || 0);
      if (aed > 0 && price > 0 && aed > price) {
        return ((aed - price) / aed) * 100;
      }
      return 0;
    })(),
  }));

  return {
    products,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}

export async function fetchOffersProducts(
  Product,
  {
    page = 1,
    limit = OFFERS_PAGE_SIZE,
    minDiscount = OFFERS_MIN_DISCOUNT_PERCENT,
    mode = 'discount',
    productIds = [],
    categoryIds = [],
  } = {},
) {
  const settings = normalizeOffersPage({
    mode,
    minDiscountPercent: minDiscount,
    productIds,
    categoryIds,
  });

  if (settings.mode === 'manual') {
    return fetchManualOffersProducts(Product, {
      page,
      limit,
      productIds: settings.productIds,
    });
  }

  if (settings.mode === 'category') {
    return paginateAggregate(
      Product,
      buildCategoryOffersPipeline(settings.categoryIds),
      { page, limit },
    );
  }

  return paginateAggregate(
    Product,
    buildOffersDiscountPipeline(settings.minDiscountPercent),
    { page, limit },
  );
}

export function normalizeOfferProduct(product, language = 'en') {
  const localized = localizeRecord(product, language, [
    'name',
    'description',
    'shortDescription',
    'brand',
  ]);

  const discount = Math.round(Number(product?.__discountPct || 0));

  return {
    ...localized,
    discount: discount > 0 ? discount : null,
  };
}
