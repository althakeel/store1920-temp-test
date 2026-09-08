import { cache } from 'react';
import dbConnect from '@/lib/mongodb';
import Product from '@/models/Product';
import Store from '@/models/Store';
import { attachProductRatings } from '@/lib/attachProductRatings';
import { resolvePublicAppearancePreference } from '@/lib/storePreferencePublic';
import {
  fetchOffersProducts,
  normalizeOfferProduct,
  OFFERS_PAGE_SIZE,
} from '@/lib/offersCatalog';
import {
  DEFAULT_OFFERS_PAGE,
  getOffersPageCopy,
  normalizeOffersPage,
} from '@/lib/offersPageSettings';

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadOffersPageSettings() {
  const preference = await resolvePublicAppearancePreference(Store, Product);
  return normalizeOffersPage(preference?.appearanceSections?.offersPage || DEFAULT_OFFERS_PAGE);
}

export async function getPublicOffersPage({
  page = 1,
  limit = OFFERS_PAGE_SIZE,
  language = 'en',
} = {}) {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(Math.floor(parsedLimit), 48)
    : OFFERS_PAGE_SIZE;

  await dbConnect();
  const settings = await loadOffersPageSettings();
  const copy = getOffersPageCopy(settings);

  const result = await fetchOffersProducts(Product, {
    page: safePage,
    limit: safeLimit,
    mode: settings.mode,
    minDiscount: settings.minDiscountPercent,
    productIds: settings.productIds,
    categoryIds: settings.categoryIds,
  });

  const products = await attachProductRatings(
    result.products.map((product) => normalizeOfferProduct(product, language)),
  );

  return serialize({
    products,
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
    navLabel: copy.navLabel,
    navLabelAr: copy.navLabelAr,
    savedAt: Number(settings.savedAt) || 0,
  });
}

export const getCachedPublicOffersPage = cache(getPublicOffersPage);
