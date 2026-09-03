import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import Store from '@/models/Store';
import StorePreference from '@/models/StorePreference';
import Category from '@/models/Category';
import Product from '@/models/Product';
import {
  fetchPickerPage,
  fetchPickerProductsByIds,
  flattenCategoriesMinimal,
  pickHomeLayout,
} from '@/lib/storeProductPicker';

const DEFAULT_FEATURED = {
  productIds: [],
  sourceMode: 'manual',
  categoryIds: [],
  tags: [],
  sectionTitle: 'Craziest sale of the year!',
  sectionDescription: "Grab the best deals before they're gone!",
  sectionTitleAr: '',
  sectionDescriptionAr: '',
};

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(48, Math.max(1, Number.parseInt(searchParams.get('limit') || '24', 10) || 24));
    const search = String(searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'newest';
    const productsOnly = searchParams.get('productsOnly') === 'true';

    if (productsOnly) {
      const picker = await fetchPickerPage(Product, { storeId, page, limit, search, sort });
      return NextResponse.json(picker, {
        headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
      });
    }

    const [store, preference, categories, picker] = await Promise.all([
      Store.findById(storeId)
        .select('featuredProductIds featuredProductsSource featuredProductsCategoryIds featuredProductsTags featuredSectionTitle featuredSectionDescription featuredSectionTitleAr featuredSectionDescriptionAr')
        .lean(),
      StorePreference.findOne({ storeId }).select('appearanceSections.homeMenuCategories').lean(),
      Category.find({}).select('_id name parentId').sort({ name: 1 }).lean(),
      fetchPickerPage(Product, { storeId, page, limit, search, sort }),
    ]);

    const productIds = Array.isArray(store?.featuredProductIds)
      ? store.featuredProductIds.map((id) => String(id)).filter(Boolean)
      : [];

    const previewProducts = productIds.length
      ? await fetchPickerProductsByIds(Product, storeId, productIds)
      : [];

    return NextResponse.json({
      featured: {
        productIds,
        sourceMode: store?.featuredProductsSource || DEFAULT_FEATURED.sourceMode,
        categoryIds: Array.isArray(store?.featuredProductsCategoryIds)
          ? store.featuredProductsCategoryIds.map(String)
          : [],
        tags: Array.isArray(store?.featuredProductsTags) ? store.featuredProductsTags : [],
        sectionTitle: store?.featuredSectionTitle || DEFAULT_FEATURED.sectionTitle,
        sectionDescription: store?.featuredSectionDescription || DEFAULT_FEATURED.sectionDescription,
        sectionTitleAr: store?.featuredSectionTitleAr || '',
        sectionDescriptionAr: store?.featuredSectionDescriptionAr || '',
      },
      appearance: {
        homeMenuCategories: pickHomeLayout(preference?.appearanceSections),
      },
      categories: flattenCategoriesMinimal(categories),
      previewProducts,
      products: picker.products,
      pagination: picker.pagination,
    }, {
      headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
    });
  } catch (error) {
    console.error('[home-preferences GET]', error);
    return NextResponse.json({ error: error.message || 'Failed to load home preferences' }, { status: 500 });
  }
}
