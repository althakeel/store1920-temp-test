import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { buildProductCategoriesAfterAddition } from '@/lib/productCategoryRefs';
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
    const categoryId = String(body?.categoryId || '').trim();
    const productIds = Array.isArray(body?.productIds)
      ? [...new Set(body.productIds.map((productId) => String(productId).trim()).filter(Boolean))]
      : [];

    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required.' }, { status: 400 });
    }
    if (!productIds.length) {
      return NextResponse.json({ error: 'Select at least one product.' }, { status: 400 });
    }

    await connectDB();

    const categoryDoc = await Category.findById(categoryId).select('_id name').lean();
    if (!categoryDoc) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }

    const products = await Product.find({
      _id: { $in: productIds },
      storeId: String(storeId),
    }).select('_id name category categories').lean();

    const foundIds = new Set(products.map((product) => String(product._id)));
    const skipped = productIds
      .filter((productId) => !foundIds.has(productId))
      .map((productId) => ({ productId, reason: 'Product not found.' }));

    let addedCount = 0;

    for (const product of products) {
      const next = buildProductCategoriesAfterAddition(product, categoryId);
      if (next.alreadyHad || !next.changed) {
        skipped.push({
          productId: String(product._id),
          name: product.name,
          reason: 'Product is already in this category.',
        });
        continue;
      }

      await Product.updateOne(
        { _id: product._id, storeId: String(storeId) },
        {
          $set: {
            category: next.category,
            categories: next.categories,
          },
        },
      );
      addedCount += 1;
    }

    invalidateStorefrontProductCaches();

    return NextResponse.json({
      success: addedCount > 0,
      addedCount,
      skippedCount: skipped.length,
      skipped,
      message: addedCount
        ? `Added ${addedCount} product(s) to this category.`
        : 'No products were added to this category.',
    });
  } catch (error) {
    console.error('[store product add-to-category POST] error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to add products to category' },
      { status: 500 },
    );
  }
}
