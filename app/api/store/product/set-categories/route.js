import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  buildProductCategoriesAfterSet,
  sanitizeCategoryIdsForSave,
} from '@/lib/productCategoryRefs';
import { invalidateStorefrontProductCaches } from '@/lib/cache';

export const runtime = 'nodejs';

async function getStoreIdFromRequest(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const idToken = authHeader.replace('Bearer ', '');
  const decodedToken = await getAuth().verifyIdToken(idToken);
  return authSeller(decodedToken.uid);
}

export async function POST(request) {
  try {
    const storeId = await getStoreIdFromRequest(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const productIds = Array.isArray(body?.productIds)
      ? [...new Set(body.productIds.map((productId) => String(productId).trim()).filter(Boolean))]
      : [];
    const categoryIds = sanitizeCategoryIdsForSave(
      Array.isArray(body?.categoryIds) ? body.categoryIds : [body?.categoryId],
    );
    const primaryCategoryId = String(body?.primaryCategoryId || categoryIds[0] || '').trim();

    if (!productIds.length) {
      return NextResponse.json({ error: 'Select at least one product.' }, { status: 400 });
    }
    if (!categoryIds.length) {
      return NextResponse.json({ error: 'Select at least one category.' }, { status: 400 });
    }

    await connectDB();

    const categories = await Category.find({ _id: { $in: categoryIds } }).select('_id').lean();
    const foundCategoryIds = new Set(categories.map((category) => String(category._id)));
    const missing = categoryIds.filter((id) => !foundCategoryIds.has(id));
    if (missing.length) {
      return NextResponse.json({ error: 'One or more categories were not found.' }, { status: 404 });
    }

    const next = buildProductCategoriesAfterSet(categoryIds, primaryCategoryId);
    const result = await Product.updateMany(
      {
        _id: { $in: productIds },
        storeId: String(storeId),
      },
      {
        $set: {
          category: next.category,
          categories: next.categories,
        },
      },
    );

    invalidateStorefrontProductCaches();

    return NextResponse.json({
      success: true,
      matchedCount: Number(result?.matchedCount || 0),
      modifiedCount: Number(result?.modifiedCount || 0),
      message: `Updated categories on ${Number(result?.modifiedCount || 0)} product(s).`,
    });
  } catch (error) {
    console.error('[store product set-categories POST] error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to set product categories' },
      { status: 500 },
    );
  }
}
