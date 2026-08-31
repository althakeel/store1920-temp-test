import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import Category from '@/models/Category';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import { buildWooCommerceOrderExportCsv } from '@/lib/storeOrderWooExport';
import {
  buildCategoryLookup,
  getProductCategoryLabels,
} from '@/lib/categoryLookup';
import { buildProductDetailsCsv } from '@/lib/storeProductDetailsExport';
import {
  STORE_EXPORT_TYPES,
  buildStoreExportDateFilter,
  buildCategoryExportCsv,
  buildExportFilename,
} from '@/lib/storeHubExports';

export const dynamic = 'force-dynamic';

function parseAuthHeader(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const parts = auth.split(' ');
  return parts.length === 2 ? parts[1] : null;
}

function csvResponse(csv, filename, count) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Count': String(count),
    },
  });
}

export async function GET(request) {
  try {
    const token = parseAuthHeader(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = await authSeller(decoded.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Not authorized as seller' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = String(searchParams.get('type') || '').trim().toLowerCase();
    const range = String(searchParams.get('range') || 'full').trim().toLowerCase() === 'custom'
      ? 'custom'
      : 'full';
    const fromDate = String(searchParams.get('fromDate') || '').trim();
    const toDate = String(searchParams.get('toDate') || '').trim();

    if (!STORE_EXPORT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${STORE_EXPORT_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    let dateFilter = {};
    try {
      dateFilter = buildStoreExportDateFilter(range, fromDate, toDate);
    } catch (filterError) {
      return NextResponse.json(
        { error: filterError?.message || 'Invalid date range' },
        { status: filterError?.status || 400 },
      );
    }

    await dbConnect();
    const filename = buildExportFilename(type, range, fromDate, toDate);

    if (type === 'orders') {
      const orders = await Order.find({
        storeId: String(storeId),
        ...ACTIVE_RECORD_FILTER,
        ...dateFilter,
      })
        .populate({ path: 'orderItems.productId', model: 'Product' })
        .sort({ createdAt: -1 })
        .lean();

      const csv = buildWooCommerceOrderExportCsv(orders);
      return csvResponse(csv, filename, orders.length);
    }

    if (type === 'products') {
      const [products, categories] = await Promise.all([
        Product.find({
          storeId: String(storeId),
          ...dateFilter,
        })
          .select([
            'name', 'nameAr', 'slug', 'sku', 'brand', 'brandAr',
            'description', 'descriptionAr', 'shortDescription', 'shortDescriptionAr', 'shortDescription2',
            'AED', 'price', 'costPrice', 'images', 'externalImages',
            'category', 'categories', 'tags',
            'published', 'inStock', 'stockQuantity', 'soldCount',
            'hasVariants', 'variants',
            'fastDelivery', 'freeShippingEligible',
            'hsCode', 'originCountry', 'shippingWeightKg',
            'useProductsPath', 'allowReturn', 'allowReplacement',
            'imageAspectRatio',
            'seoTitle', 'seoDescription', 'seoKeywords',
            'createdAt', 'updatedAt',
          ].join(' '))
          .sort({ createdAt: -1 })
          .lean(),
        Category.find({})
          .select('_id name nameAr slug legacySourceId parentId')
          .lean(),
      ]);

      const categoryLookup = buildCategoryLookup(categories);
      const enriched = products.map((product) => ({
        ...product,
        categoryNames: getProductCategoryLabels(product, categoryLookup),
      }));
      const csv = buildProductDetailsCsv(enriched);
      return csvResponse(csv, filename, enriched.length);
    }

    // categories — global catalog; date filter applies to category createdAt when custom
    const categories = await Category.find({ ...dateFilter })
      .select([
        '_id', 'name', 'nameAr', 'slug', 'parentId', 'level', 'sortOrder',
        'isActive', 'url', 'metaTitle', 'metaDescription', 'createdAt', 'updatedAt',
      ].join(' '))
      .sort({ level: 1, sortOrder: 1, name: 1 })
      .lean();

    const csv = buildCategoryExportCsv(categories);
    return csvResponse(csv, filename, categories.length);
  } catch (error) {
    console.error('[GET /api/store/exports]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to export' },
      { status: 500 },
    );
  }
}
