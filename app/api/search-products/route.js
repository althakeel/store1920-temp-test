import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import {
  buildProductSearchFilter,
  escapeRegex,
  mapSearchProduct,
  mergeCategorySearchIntoFilter,
  normalizeSearchKeyword,
  productTitleMatchesKeyword,
  rankProductsByTitleMatch,
  PRODUCT_SEARCH_SELECT_FIELDS,
} from '@/lib/productSearch';
import { STOREFRONT_PUBLISHED_FILTER } from '@/lib/productVisibility';
import {
  countProductsDedupedBySku,
  dedupeProductsBySku,
  fetchProductsDedupedBySku,
} from '@/lib/productSkuDedupe';

async function resolveCategorySearchValues(keyword = '') {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized || normalized.length < 2) return [];

  const termRegex = new RegExp(escapeRegex(normalized), 'i');
  const categories = await Category.find({
    $or: [
      { name: termRegex },
      { nameAr: termRegex },
      { slug: termRegex },
    ],
  })
    .select('_id slug name')
    .limit(20)
    .lean();

  const values = new Set();
  for (const category of categories) {
    if (category?._id) {
      values.add(category._id);
      values.add(String(category._id));
    }
    if (category?.slug) values.add(category.slug);
    if (category?.name) values.add(category.name);
  }

  return [...values];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = normalizeSearchKeyword(searchParams.get('keyword') || '');
    const category = searchParams.get('category') || '';
    const excludeId = searchParams.get('excludeId') || '';
    const includeOutOfStock = searchParams.get('includeOutOfStock') === 'true';
    const fetchAll = searchParams.get('all') === 'true';
    const limitParam = Number(searchParams.get('limit') || '24');
    const limit = fetchAll
        ? null
        : (Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 24);
    const pageParam = Number.parseInt(searchParams.get('page') || '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const offset = fetchAll ? 0 : (page - 1) * (limit || 0);

    await dbConnect();

    if (category) {
      const categoryQuery = {
        category: { $regex: category, $options: 'i' },
      };

      if (!includeOutOfStock) {
        categoryQuery.inStock = true;
      }

      if (excludeId) {
        categoryQuery._id = { $ne: excludeId };
      }

      const total = await countProductsDedupedBySku(Product, categoryQuery);
      const products = await fetchProductsDedupedBySku(Product, categoryQuery, {
        sort: { createdAt: -1 },
        skip: offset,
        limit,
      });

      return NextResponse.json({
        keyword: '',
        products: products.map(mapSearchProduct),
        resultCount: products.length,
        total,
        page,
        limit,
        totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / (limit || total || 1))),
        message: total === 0 ? 'No products found' : `Found ${total} product${total !== 1 ? 's' : ''}`,
      });
    }

    if (!keyword) {
      return NextResponse.json({
        error: 'No keyword provided',
        products: [],
        resultCount: 0,
      }, { status: 400 });
    }

    const searchFilter = mergeCategorySearchIntoFilter(
      buildProductSearchFilter(keyword, { includeOutOfStock }),
      await resolveCategorySearchValues(keyword),
    );
    const total = await countProductsDedupedBySku(Product, searchFilter);

    let products = await fetchProductsDedupedBySku(Product, searchFilter, {
      sort: { createdAt: -1 },
      skip: offset,
      limit,
    });

    // Supplement with MongoDB text search for multi-word queries when regex returns few hits.
    // Keep only title / brand / SKU hits — text index also covers shortDescription.
    const resultCap = limit ?? total;
    if (products.length < resultCap && page === 1) {
      const existingIds = new Set(products.map((product) => String(product._id)));
      const textFilter = {
        $text: { $search: keyword },
        ...STOREFRONT_PUBLISHED_FILTER,
        ...(includeOutOfStock ? {} : { inStock: true }),
      };

      try {
        const textQuery = Product.find(textFilter, { score: { $meta: 'textScore' } })
          .select(PRODUCT_SEARCH_SELECT_FIELDS)
          .sort({ score: { $meta: 'textScore' }, inStock: -1 });

        if (limit != null) {
          textQuery.limit(Math.max(limit * 2, limit));
        }

        const textMatches = await textQuery.lean();
        const merged = [...products];

        for (const product of textMatches) {
          if (!productTitleMatchesKeyword(product, keyword)) continue;
          const id = String(product._id);
          if (existingIds.has(id)) continue;
          merged.push(product);
          existingIds.add(id);
        }

        products = dedupeProductsBySku(merged);
        if (limit != null) {
          products = products.slice(0, limit);
        }
      } catch {
        // Text index may be unavailable in some environments; regex results are enough.
      }
    }

    products = rankProductsByTitleMatch(products, keyword);

    return NextResponse.json({
      keyword,
      products: products.map(mapSearchProduct),
      resultCount: products.length,
      total,
      page,
      limit,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / (limit || total || 1))),
      message: total === 0 ? 'No products found' : `Found ${total} product${total !== 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error('Search products error:', error);
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}
