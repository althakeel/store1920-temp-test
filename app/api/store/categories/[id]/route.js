import { NextResponse } from "next/server";
import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { invalidateCategoryCaches } from '@/lib/categoryCache';
import { cleanDisplayText, sanitizeCategoryFields } from '@/lib/displayText';

async function verifyStoreSeller(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const idToken = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const storeId = await authSeller(decodedToken.uid);
  if (!storeId) {
    return { error: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) };
  }

  return { userId: decodedToken.uid };
}

async function resolveCategoryRecord(idOrSlug) {
  const key = String(idOrSlug || '').trim();
  if (!key) return null;

  let category = await Category.findById(key).lean();
  if (category) return category;

  category = await Category.findOne({ slug: key.toLowerCase() }).lean();
  if (category) return category;

  return Category.findOne({ slug: key }).lean();
}

function buildSlug(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// PUT - Update a category
export async function PUT(req, { params }) {
  try {
    await connectDB();

    const auth = await verifyStoreSeller(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await req.json();
    const existingCategory = await resolveCategoryRecord(id);

    if (!existingCategory) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const cleanedName = cleanDisplayText(body?.name ?? existingCategory.name);
    if (!cleanedName) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const slug = buildSlug(cleanedName);
    if (slug !== existingCategory.slug) {
      const duplicateCategory = await Category.findOne({
        slug,
        _id: { $ne: existingCategory._id },
      }).lean();

      if (duplicateCategory) {
        return NextResponse.json({ error: 'Category with this name already exists' }, { status: 400 });
      }
    }

    const nextParentId = body?.parentId !== undefined
      ? (body.parentId ? String(body.parentId) : null)
      : (existingCategory.parentId || null);

    const category = await Category.findByIdAndUpdate(
      existingCategory._id,
      {
        name: cleanedName,
        nameAr: body?.nameAr !== undefined
          ? cleanDisplayText(body.nameAr || '')
          : (existingCategory.nameAr || ''),
        slug,
        description: body?.description !== undefined
          ? (cleanDisplayText(body.description || '') || null)
          : (existingCategory.description || null),
        descriptionAr: body?.descriptionAr !== undefined
          ? cleanDisplayText(body.descriptionAr || '')
          : (existingCategory.descriptionAr || ''),
        image: body?.image !== undefined ? (body.image || null) : (existingCategory.image || null),
        parentId: nextParentId,
        metaTitle: body?.metaTitle !== undefined
          ? cleanDisplayText(body.metaTitle || '').slice(0, 120)
          : (existingCategory.metaTitle || ''),
        metaDescription: body?.metaDescription !== undefined
          ? cleanDisplayText(body.metaDescription || '').slice(0, 320)
          : (existingCategory.metaDescription || ''),
      },
      { new: true }
    ).lean();

    if (!category) {
      return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
    }

    invalidateCategoryCaches();

    const parent = category.parentId ? await Category.findById(category.parentId).lean() : null;
    const children = await Category.find({ parentId: category._id }).lean();

    return NextResponse.json({
      category: sanitizeCategoryFields({ ...category, parent, children }),
    }, { status: 200 });
  } catch (error) {
    console.error('Error updating category:', error);
    return NextResponse.json({
      error: error?.message || 'Failed to update category',
    }, { status: 500 });
  }
}

// DELETE - Delete a category
export async function DELETE(req, { params }) {
  try {
    await connectDB();

    const auth = await verifyStoreSeller(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const category = await resolveCategoryRecord(id);

    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    const children = await Category.find({ parentId: category._id }).lean();
    if (children.length > 0) {
      return NextResponse.json({
        error: 'Cannot delete category with subcategories. Please delete subcategories first.',
      }, { status: 400 });
    }

    await Category.findByIdAndDelete(category._id);
    invalidateCategoryCaches();

    return NextResponse.json({ message: 'Category deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
