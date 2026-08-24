import dbConnect from '@/lib/mongodb';
import StoreMenu from '@/models/StoreMenu';
import { getAuth } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';
import { cleanDisplayText, sanitizeCategoryTree } from '@/lib/displayText';
import { resolveStoreAccess } from '@/lib/storeAccess';
import { sanitizeCategoryMenuTree } from '@/lib/categoryMenuImages';
import { toPublicCategoryPath, normalizeStorefrontCategoryHref } from '@/lib/categorySlug';

function slugify(text = '') {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildCategoryUrl(name = '') {
  return toPublicCategoryPath(name);
}

function normalizeMenuCategory(category, fallbackIndex = 0) {
  const normalizedChildren = Array.isArray(category?.children)
    ? category.children.map((child, childIndex) => normalizeMenuCategory(child, childIndex))
    : [];

  return {
    ...category,
    id: category?.id || category?._id || category?.systemCategoryId || slugify(category?.name || '') || `category-${fallbackIndex + 1}`,
    systemCategoryId: category?.systemCategoryId || category?.id || category?._id || null,
    parentId: category?.parentId || null,
    parentName: cleanDisplayText(category?.parentName || ''),
    name: cleanDisplayText(category?.name || ''),
    image: String(category?.image || ''),
    url: normalizeStorefrontCategoryHref(category?.url || '') || buildCategoryUrl(cleanDisplayText(category?.name || '')),
    children: normalizedChildren,
  };
}

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

    const firebaseAuth = getAuth();
    const decoded = await firebaseAuth.verifyIdToken(token);
    const access = await resolveStoreAccess(decoded.uid);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const storeMenu = await StoreMenu.findOne({ storeId: access.ownerUserId }).lean();
    const rawCategories = storeMenu?.categories || [];
    const { categories: migratedCategories, changed } = await sanitizeCategoryMenuTree(rawCategories, {
      storeId: access.ownerUserId,
    });

    if (changed) {
      await StoreMenu.findOneAndUpdate(
        { storeId: access.ownerUserId },
        {
          storeId: access.ownerUserId,
          categories: migratedCategories,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );
    }

    return NextResponse.json({
      categories: sanitizeCategoryTree(migratedCategories),
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const token = parseAuthHeader(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const firebaseAuth = getAuth();
    const decoded = await firebaseAuth.verifyIdToken(token);
    const access = await resolveStoreAccess(decoded.uid);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const { categories } = await request.json();

    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { error: 'Categories must be an array' },
        { status: 400 }
      );
    }

    const normalizedCategories = categories.map((category, index) => normalizeMenuCategory(category, index));
    const existingMenu = await StoreMenu.findOne({ storeId: access.ownerUserId }).lean();
    const existingById = new Map(
      (existingMenu?.categories || []).map((category) => [String(category?.id || ''), category])
    );

    const { categories: sanitizedCategories } = await sanitizeCategoryMenuTree(normalizedCategories, {
      storeId: access.ownerUserId,
      existingById,
    });

    const storeMenu = await StoreMenu.findOneAndUpdate(
      { storeId: access.ownerUserId },
      {
        storeId: access.ownerUserId,
        categories: sanitizedCategories,
        updatedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );

    return NextResponse.json({
      categories: sanitizeCategoryTree(storeMenu?.categories || sanitizedCategories),
    }, { status: 200 });
  } catch (error) {
    console.error('[category-menu POST]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save category menu' },
      { status: 500 }
    );
  }
}
