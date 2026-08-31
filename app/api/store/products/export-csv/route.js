import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  buildCategoryLookup,
  getProductCategoryLabels,
} from '@/lib/categoryLookup';
import { buildProductDetailsCsv } from '@/lib/storeProductDetailsExport';

export const dynamic = 'force-dynamic';

function parseAuthHeader(req) {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const parts = auth.split(' ');
  return parts.length === 2 ? parts[1] : null;
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

    await dbConnect();

    const [products, categories] = await Promise.all([
      Product.find({ storeId: String(storeId) })
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
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `store-all-products-${dateStamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Product-Count': String(enriched.length),
      },
    });
  } catch (error) {
    console.error('[GET /api/store/products/export-csv]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to export products' },
      { status: 500 },
    );
  }
}
