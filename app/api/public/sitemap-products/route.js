import { NextResponse } from 'next/server';
import {
  getHtmlSitemapProductLinks,
  HTML_SITEMAP_PRODUCT_PAGE_SIZE,
} from '@/lib/htmlSitemapData';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || HTML_SITEMAP_PRODUCT_PAGE_SIZE;

    const data = await getHtmlSitemapProductLinks({ page, limit });

    return NextResponse.json(
      {
        success: true,
        links: data.links,
        total: data.total,
        page: data.page,
        limit: data.limit,
        hasMore: data.hasMore,
        nextPage: data.nextPage,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('[API /api/public/sitemap-products]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load sitemap products' },
      { status: 500 },
    );
  }
}
