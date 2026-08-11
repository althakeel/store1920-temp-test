import { NextResponse } from 'next/server';
import {
  CATEGORY_PRODUCTS_PAGE_SIZE,
  getAllActiveCategories,
  getCategoryProducts,
} from '@/lib/categoryPageData';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = String(searchParams.get('categoryId') || '').trim();
    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 });
    }

    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const parsedLimit = Number.parseInt(
      searchParams.get('limit') || String(CATEGORY_PRODUCTS_PAGE_SIZE),
      10,
    );
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, CATEGORY_PRODUCTS_PAGE_SIZE)
      : CATEGORY_PRODUCTS_PAGE_SIZE;

    const allCategories = await getAllActiveCategories();
    const result = await getCategoryProducts(categoryId, {
      page,
      limit,
      allCategories,
    });

    const loaded = (Number(result.page) || page) * (Number(result.limit) || limit);

    return NextResponse.json({
      products: result.products || [],
      total: Number(result.total) || 0,
      page: Number(result.page) || page,
      limit: Number(result.limit) || limit,
      hasMore: loaded < (Number(result.total) || 0),
    }, {
      headers: {
        'Cache-Control': process.env.NODE_ENV === 'production'
          ? 'public, s-maxage=120, stale-while-revalidate=600'
          : 'no-store',
      },
    });
  } catch (error) {
    console.error('[public/category-products]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load category products' },
      { status: 500 },
    );
  }
}
