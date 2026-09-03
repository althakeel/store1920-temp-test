import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import StorePreference from '@/models/StorePreference';
import { NextResponse } from 'next/server';
import { generateCacheKey, getCachedData, setCachedData } from '@/lib/cache';
import { resolveStorefrontLanguage } from '@/lib/storefrontLanguage';
import {
  OFFERS_PAGE_SIZE,
  fetchOffersProducts,
  normalizeOfferProduct,
} from '@/lib/offersCatalog';
import {
  DEFAULT_OFFERS_PAGE,
  getOffersPageCopy,
  normalizeOffersPage,
  offersPageCacheToken,
} from '@/lib/offersPageSettings';

async function loadOffersPageSettings() {
  const preference = await StorePreference.findOne({})
    .sort({ updatedAt: -1 })
    .select('appearanceSections.offersPage')
    .lean();
  return normalizeOffersPage(preference?.appearanceSections?.offersPage || DEFAULT_OFFERS_PAGE);
}

export async function GET(request) {
  const language = resolveStorefrontLanguage(request);
  const { searchParams } = new URL(request.url);
  const parsedPage = parseInt(searchParams.get('page') || '1', 10);
  const parsedLimit = parseInt(searchParams.get('limit') || String(OFFERS_PAGE_SIZE), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 48) : OFFERS_PAGE_SIZE;

  try {
    await dbConnect();
    const settings = await loadOffersPageSettings();
    const copy = getOffersPageCopy(settings);
    const cacheToken = offersPageCacheToken(settings);

    const cacheKey = generateCacheKey('public:offers', {
      page,
      limit,
      token: cacheToken,
      language,
    });

    const cached = getCachedData(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      });
    }

    const result = await fetchOffersProducts(Product, {
      page,
      limit,
      mode: settings.mode,
      minDiscount: settings.minDiscountPercent,
      productIds: settings.productIds,
      categoryIds: settings.categoryIds,
    });

    const payload = {
      products: result.products.map((product) => normalizeOfferProduct(product, language)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      minDiscountPercent: settings.minDiscountPercent,
      mode: settings.mode,
      eyebrow: copy.eyebrow,
      title: copy.title,
      subtitle: copy.subtitle,
    };

    setCachedData(cacheKey, payload, 120);

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    });
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
      },
      { status: 500 },
    );
  }
}
