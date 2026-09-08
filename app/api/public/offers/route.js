import { NextResponse } from 'next/server';
import { resolveStorefrontLanguage } from '@/lib/storefrontLanguage';
import { getPublicOffersPage } from '@/lib/offersPageData';
import {
  DEFAULT_OFFERS_PAGE,
  getOffersPageCopy,
  OFFERS_PAGE_SIZE,
} from '@/lib/offersPageSettings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request) {
  const language = resolveStorefrontLanguage(request);
  const { searchParams } = new URL(request.url);
  const parsedPage = parseInt(searchParams.get('page') || '1', 10);
  const parsedLimit = parseInt(searchParams.get('limit') || String(OFFERS_PAGE_SIZE), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 48) : OFFERS_PAGE_SIZE;

  try {
    const payload = await getPublicOffersPage({ page, limit, language });
    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[public/offers] fetch failed:', error);
    const fallbackCopy = getOffersPageCopy(DEFAULT_OFFERS_PAGE);
    return NextResponse.json(
      {
        products: [],
        pagination: { page: 1, limit, total: 0, totalPages: 1 },
        minDiscountPercent: DEFAULT_OFFERS_PAGE.minDiscountPercent,
        mode: DEFAULT_OFFERS_PAGE.mode,
        eyebrow: fallbackCopy.eyebrow,
        title: fallbackCopy.title,
        subtitle: fallbackCopy.subtitle,
        navLabel: fallbackCopy.navLabel,
        navLabelAr: fallbackCopy.navLabelAr,
        savedAt: 0,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
