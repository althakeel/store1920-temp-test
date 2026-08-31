import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import { getCachedData, setCachedData, generateCacheKey } from '@/lib/cache';
import { STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';

export const dynamic = 'force-dynamic';

const EXCLUDED_ORDER_STATUSES = [
  'CANCELLED',
  'PAYMENT_FAILED',
  'REFUNDED',
  'AWAITING_PAYMENT',
  'TRASH',
  'DELETED',
];

const RANKED_CACHE_TTL = 180;
const MAX_RANKED = 800;

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const raw = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) return null;
  try {
    return new mongoose.Types.ObjectId(raw);
  } catch {
    return null;
  }
}

async function getRankedSalesRows({ orderMatch, fetchLimit }) {
  return Order.aggregate([
    { $match: orderMatch },
    { $unwind: '$orderItems' },
    {
      $addFields: {
        __productId: {
          $convert: {
            input: '$orderItems.productId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    {
      $match: {
        __productId: { $ne: null },
        'orderItems.lineStatus': { $nin: ['CANCELLED', 'OUT_OF_STOCK'] },
      },
    },
    {
      $group: {
        _id: '$__productId',
        unitsSold: {
          $sum: {
            $cond: [
              { $gt: [{ $ifNull: ['$orderItems.quantity', 0] }, 0] },
              { $ifNull: ['$orderItems.quantity', 0] },
              1,
            ],
          },
        },
        orderCount: { $sum: 1 },
      },
    },
    { $match: { unitsSold: { $gt: 0 } } },
    { $sort: { unitsSold: -1, orderCount: -1 } },
    { $limit: fetchLimit },
  ]).allowDiskUse(true);
}

async function buildRankedList({ days, storeId }) {
  const orderMatch = {
    status: { $nin: EXCLUDED_ORDER_STATUSES },
    'orderItems.0': { $exists: true },
    $or: [
      { deletedAt: null },
      { deletedAt: { $exists: false } },
    ],
  };

  if (days > 0) {
    orderMatch.createdAt = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
  }
  if (storeId) {
    orderMatch.storeId = storeId;
  }

  const salesRows = await getRankedSalesRows({
    orderMatch,
    fetchLimit: MAX_RANKED,
  });

  if (!salesRows.length) {
    return { source: 'none', ranked: [] };
  }

  const productIds = salesRows.map((row) => toObjectId(row._id)).filter(Boolean);
  const products = await Product.find({
    _id: { $in: productIds },
    ...STOREFRONT_PUBLISHED_FILTER,
  }).lean();

  const byId = new Map(products.map((product) => [String(product._id), product]));
  const ranked = [];

  for (const row of salesRows) {
    const product = byId.get(String(row._id));
    if (!product) continue;
    const unitsSold = Number(row.unitsSold) || 0;
    ranked.push({
      ...product,
      unitsSold,
      soldCount: Math.max(Number(product.soldCount) || 0, unitsSold),
      orderLineCount: Number(row.orderCount) || 0,
    });
  }

  return {
    source: ranked.length ? 'orders' : 'none',
    ranked,
  };
}

async function buildSoldCountList({ storeId }) {
  const productMatch = {
    ...STOREFRONT_PUBLISHED_FILTER,
    soldCount: { $gt: 0 },
    ...(storeId ? { storeId } : {}),
  };

  const products = await Product.find(productMatch)
    .sort({ soldCount: -1, updatedAt: -1 })
    .limit(MAX_RANKED)
    .lean();

  return {
    source: 'soldCount',
    ranked: products.map((product) => ({
      ...product,
      unitsSold: Number(product.soldCount) || 0,
      soldCount: Number(product.soldCount) || 0,
    })),
  };
}

async function getRankedCatalog({ days, storeId, bustCache }) {
  const rankedKey = generateCacheKey('top-selling-ranked-v3', {
    days,
    storeId: storeId || 'all',
  });

  if (!bustCache) {
    const cached = getCachedData(rankedKey);
    if (cached?.ranked?.length) {
      return cached;
    }
  }

  let result;
  try {
    result = await buildRankedList({ days, storeId });
  } catch (error) {
    console.error('[products/top-selling] order aggregate failed, using soldCount', error);
    result = { source: 'none', ranked: [] };
  }

  if (!result.ranked.length) {
    try {
      result = await buildSoldCountList({ storeId });
    } catch (error) {
      console.error('[products/top-selling] soldCount fallback failed', error);
      result = { source: 'none', ranked: [] };
    }
  }

  // Never cache an empty catalog — that is what made the page "sometimes" blank.
  if (result.ranked.length) {
    setCachedData(rankedKey, result, RANKED_CACHE_TTL);
  }

  return result;
}

/**
 * GET /api/products/top-selling?limit=24&offset=0
 * Ranks products by quantity sold from real orders. Paginate with offset/limit.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 24), 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0);
    const days = Math.min(Math.max(Number(searchParams.get('days') || 0), 0), 3650);
    const storeId = String(searchParams.get('storeId') || '').trim();
    const bustCache = searchParams.get('bust') === '1';

    await dbConnect();

    const { source, ranked } = await getRankedCatalog({ days, storeId, bustCache });
    const total = ranked.length;
    const page = ranked.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    const payload = {
      success: true,
      source,
      products: page,
      total,
      offset,
      limit,
      hasMore: nextOffset < total,
      nextOffset,
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Cache': bustCache ? 'BYPASS' : 'COMPUTED',
      },
    });
  } catch (error) {
    console.error('[products/top-selling]', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to load top selling products',
        products: [],
        total: 0,
        hasMore: false,
        nextOffset: 0,
      },
      { status: 500 },
    );
  }
}
