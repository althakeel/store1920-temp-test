import connectDB from '@/lib/mongodb';
import { getCachedData, setCachedData } from '@/lib/cache';
import { HOMEPAGE_CACHE_KEY } from '@/lib/categorySliderCache';
import StorePreference from '@/models/StorePreference';
import HomeSection from '@/models/HomeSection';
import CategorySlider from '@/models/CategorySlider';
import Product from '@/models/Product';
import Category from '@/models/Category';
import Store from '@/models/Store';
import NavbarMenuSettings from '@/models/NavbarMenuSettings';
import mongoose from 'mongoose';
import { resolveStoreNavMenuItems } from '@/lib/categoryNavigation';
import { buildFeaturedProductsListQuery, isManualFeaturedSelection, resolvePublicFeaturedStore } from '@/lib/featuredProducts';
import { resolvePublicStorePreference } from '@/lib/storePreferencePublic';
import { dedupeProductsBySku } from '@/lib/productSkuDedupe';
import { STOREFRONT_PUBLISHED_FILTER, isProductPublished } from '@/lib/productVisibility';
import { attachProductRatings } from '@/lib/attachProductRatings';

const HOMEPAGE_CACHE_KEY_LOCAL = HOMEPAGE_CACHE_KEY;
const HOMEPAGE_TTL = 60;

function serializeClientPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

const PRODUCT_SELECT =
  'name nameAr slug sku price mrp AED images category categories tags inStock stockQuantity fastDelivery freeShippingEligible useProductsPath imageAspectRatio legacySourceId createdAt updatedAt';

function orderByIds(items, ids) {
  const orderMap = new Map(ids.map((id, index) => [String(id), index]));
  return [...items].sort((a, b) => {
    const aOrder = orderMap.get(String(a._id));
    const bOrder = orderMap.get(String(b._id));
    return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER);
  });
}

async function fetchShopShowcase() {
  const cacheKey = 'public:shop-showcase:v3';
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const preference = await resolvePublicStorePreference(Store, Product);

  const raw = preference?.shopShowcase || {};
  const config = raw;
  const validSectionProductIds = (raw.sectionProductIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const validProductIds = (raw.productIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const validCategoryIds = (raw.categoryIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const shouldFallbackToCategories = validCategoryIds.length === 0;

  const [sectionProducts, products, categories] = await Promise.all([
    validSectionProductIds.length
        ? Product.find({
          _id: { $in: validSectionProductIds },
          ...STOREFRONT_PUBLISHED_FILTER,
        }).select('_id name nameAr slug images price AED').lean()
      : [],
    validProductIds.length
      ? Product.find({
          _id: { $in: validProductIds },
          ...STOREFRONT_PUBLISHED_FILTER,
        }).select('_id name nameAr slug images price AED').lean()
      : [],
    validCategoryIds.length
      ? Category.find({ _id: { $in: validCategoryIds } }).select('_id name nameAr slug image').lean()
      : shouldFallbackToCategories
        ? Category.find({ $or: [{ parentId: null }, { parentId: '' }] })
            .sort({ createdAt: 1, name: 1 })
            .select('_id name nameAr slug image')
            .limit(9)
            .lean()
        : [],
  ]);

  const payload = {
    config,
    sectionProducts: orderByIds(sectionProducts, validSectionProductIds),
    products: orderByIds(products, validProductIds),
    categories: orderByIds(categories, validCategoryIds),
  };

  setCachedData(cacheKey, payload, 60);
  return payload;
}

async function fetchHomeSections() {
  const sections = await HomeSection.find(
    { isActive: { $ne: false } },
    {
      section: 1,
      sectionType: 1,
      category: 1,
      tag: 1,
      productIds: 1,
      title: 1,
      titleAr: 1,
      subtitle: 1,
      subtitleAr: 1,
      slides: 1,
      slidesData: 1,
      bannerCtaText: 1,
      bannerCtaTextAr: 1,
      bannerCtaLink: 1,
      layout: 1,
      isActive: 1,
      sortOrder: 1,
    }
  )
    .sort({ sortOrder: 1 })
    .lean();

  return sections;
}

async function fetchFeaturedSectionsCount() {
  const cacheKey = 'public:featured-sections-count:v1';
  const cached = getCachedData(cacheKey);
  if (typeof cached === 'number') return cached;

  const count = await CategorySlider.countDocuments({});
  setCachedData(cacheKey, count, 120);
  return count;
}

async function fetchFeaturedProducts(limit = 12) {
  const cacheKey = `public:featured-products:v3:${limit}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  let store = await resolvePublicFeaturedStore(Store, Product);

  const sourceMode = store?.featuredProductsSource === 'category' || store?.featuredProductsSource === 'tag' || store?.featuredProductsSource === 'latest'
    ? store.featuredProductsSource
    : 'manual';
  const productIds = Array.isArray(store?.featuredProductIds)
    ? [...new Set(store.featuredProductIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];

  let products = [];

  if (isManualFeaturedSelection(sourceMode, productIds)) {
    const raw = await Product.find({
      _id: { $in: productIds },
      ...STOREFRONT_PUBLISHED_FILTER,
    }).select(PRODUCT_SELECT).lean();
    const map = new Map(raw.map((p) => [String(p._id), p]));
    products = productIds
      .map((id) => map.get(String(id)))
      .filter((product) => product && isProductPublished(product));
  } else {
    const { query, sort } = buildFeaturedProductsListQuery({
      sourceMode,
      productIds,
      categoryIds: store?.featuredProductsCategoryIds,
      tags: store?.featuredProductsTags,
      storeId: store?._id,
    });
    products = dedupeProductsBySku(
      await Product.find(query).sort(sort).select(PRODUCT_SELECT).limit(limit > 0 ? limit : 40).lean(),
    );
  }

  if (limit > 0) products = products.slice(0, limit);
  products = await attachProductRatings(products);

  const sectionTitleEn = store?.featuredSectionTitle || 'Craziest sale of the year!';
  const sectionDescriptionEn = store?.featuredSectionDescription || "Grab the best deals before they're gone!";
  const sectionTitleAr = String(store?.featuredSectionTitleAr || '').trim();
  const sectionDescriptionAr = String(store?.featuredSectionDescriptionAr || '').trim();

  const payload = {
    products,
    // Keep English in sectionTitle/sectionDescription; client picks AR when language is Arabic.
    sectionTitle: sectionTitleEn,
    sectionDescription: sectionDescriptionEn,
    sectionTitleEn,
    sectionDescriptionEn,
    sectionTitleAr,
    sectionDescriptionAr,
    productIds: products.map((p) => String(p._id)),
  };

  setCachedData(cacheKey, payload, 120);
  return payload;
}

async function fetchAppearance() {
  const cacheKey = 'public:appearance-sections:v1';
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const preference = await StorePreference.findOne({}).sort({ updatedAt: -1 }).select('appearanceSections').lean();
  const homeMenuCategories = preference?.appearanceSections?.homeMenuCategories || {
    enabled: true,
    style: 'grid',
    itemsPerRow: 6,
    rows: 2,
  };

  const payload = { homeMenuCategories };
  setCachedData(cacheKey, payload, 120);
  return payload;
}

async function fetchStoreMenuSettings() {
  const doc = await NavbarMenuSettings.findOne({}).sort({ updatedAt: -1, _id: -1 }).lean();
  const navMenuUseParentCategories = Boolean(doc?.navMenuUseParentCategories);
  const navMenuItems = Array.isArray(doc?.navMenuItems) ? doc.navMenuItems : [];
  const navMenuStyle = doc?.navMenuStyle && typeof doc.navMenuStyle === 'object' ? doc.navMenuStyle : {};

  const catalogCategories = await Category.find({ isActive: { $ne: false } })
    .select('name nameAr slug image parentId legacySourceId')
    .sort({ name: 1 })
    .lean();
  const resolvedNavMenuItems = resolveStoreNavMenuItems(
    { navMenuUseParentCategories, navMenuItems },
    catalogCategories,
  );

  return {
    navMenuItems,
    navMenuUseParentCategories,
    navMenuStyle,
    resolvedNavMenuItems,
  };
}

export async function getHomepageData() {
  const cacheKey = `${HOMEPAGE_CACHE_KEY_LOCAL}:i18n`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  await connectDB();

  const homeSectionsPromise = fetchHomeSections();

  const [shopShowcase, homeSections, featuredSectionsCount, featuredProducts, appearance, storeSettings] = await Promise.all([
    fetchShopShowcase(),
    homeSectionsPromise,
    fetchFeaturedSectionsCount(),
    fetchFeaturedProducts(12),
    fetchAppearance(),
    fetchStoreMenuSettings(),
  ]);

  const payload = serializeClientPayload({
    shopShowcase,
    homeSections,
    featuredSectionsCount,
    featuredProducts,
    appearance,
    storeSettings,
  });

  setCachedData(cacheKey, payload, HOMEPAGE_TTL);
  return payload;
}
