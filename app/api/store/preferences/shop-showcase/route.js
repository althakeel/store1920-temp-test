import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import mongoose from 'mongoose'
import connectDB from '@/lib/mongodb'
import StorePreference from '@/models/StorePreference'
import authSeller from '@/middlewares/authSeller'
import { deleteCacheKey } from '@/lib/cache'
import { HOMEPAGE_CACHE_KEY } from '@/lib/categorySliderCache'
import { applyLargeBannerSliderDefaults, serializeLargeBannerSliderItems } from '@/lib/shopShowcaseLargeBanners'

function resolveStoreObjectId(storeId) {
  const value = String(storeId || '').trim()
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return value
  return new mongoose.Types.ObjectId(value)
}

function invalidateShopShowcaseCaches() {
  deleteCacheKey('public:shop-showcase:v2')
  deleteCacheKey(HOMEPAGE_CACHE_KEY)
  deleteCacheKey('server:homepage:v3')

  try {
    revalidatePath('/')
  } catch {
    // Safe when called outside a Next.js request context.
  }
}

const DEFAULT_SHOWCASE = {
  enabled: true,
  featuredSectionTitle: 'Craziest sale of the year!',
  featuredSectionDescription: "Grab the best deals before they're gone!",
  mainBannerEnabled: true,
  mainBannerImage: '',
  mainBannerTitle: 'Power up instantly no battery needed',
  mainBannerTitleEnabled: true,
  mainBannerSubtitle: 'Never stress over a dead battery again',
  mainBannerSubtitleEnabled: true,
  mainBannerCtaText: 'Order Now',
  mainBannerCtaEnabled: true,
  mainBannerLink: '/shop',
  mainBannerLeftColor: '#00112b',
  mainBannerRightColor: '#00112b',
  mainBannerTitleColor: '#ffffff',
  mainBannerSubtitleColor: '#e5e7eb',
  mainBannerCtaBgColor: '#ef2d2d',
  mainBannerCtaTextColor: '#ffffff',
  mainBannerDesktopHeight: 320,
  mainBannerMobileHeight: 100,
  sectionTitle: 'More Reasons to Shop',
  leftBlockBadgeText: '',
  leftBlockSource: 'category',
  dealsTitle: 'MEGA DEALS',
  countdownEnd: null,
  categoryIds: [],
  sectionProductIds: [],
  productIds: [],
  topBannerImage: '',
  topBannerTitle: 'SUPER SAVES FOR SUMMER',
  topBannerTitleEnabled: true,
  topBannerSubtitle: '',
  topBannerSubtitleEnabled: true,
  topBannerCtaText: 'Order now',
  topBannerCtaEnabled: true,
  topBannerCtaBgColor: '#ef2d2d',
  topBannerCtaTextColor: '#ffffff',
  topBannerLink: '/shop',
  bottomBannerImage: '',
  bottomBannerTitle: 'Shop Now. Pay Later. Ready for Summer.',
  bottomBannerTitleEnabled: true,
  bottomBannerSubtitle: '',
  bottomBannerSubtitleEnabled: true,
  bottomBannerCtaText: 'Shop Now',
  bottomBannerCtaEnabled: true,
  bottomBannerCtaBgColor: '#ef2d2d',
  bottomBannerCtaTextColor: '#ffffff',
  bottomBannerLink: '/shop',
  topBannerSliderEnabled: true,
  topBannerSliderInterval: 4000,
  topBannerSliderItems: [],
  bottomBannerSliderEnabled: true,
  bottomBannerSliderInterval: 4000,
  bottomBannerSliderItems: [],
  productBanners: [
    { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
    { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
    { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
    { image: '', title: 'Product Title', subtitle: 'Order now', buttonText: 'Order now', link: '/shop' },
  ],
  bannerSliderEnabled: true,
  bannerSliderDesktopInterval: 4000,
  bannerSliderMobileInterval: 3000,
  bannerSliderDesktopHeight: 220,
  bannerSliderMobileHeight: 120,
  bannerSliderItems: [
    { id: 'banner-slider-1', image: '', link: '/category/sofas', alt: 'Banner 1' },
    { id: 'banner-slider-2', image: '', link: '/category/beds', alt: 'Banner 2' }
  ],
  secondaryBannerSliderEnabled: true,
  secondaryBannerSliderDesktopInterval: 4000,
  secondaryBannerSliderMobileInterval: 3000,
  secondaryBannerSliderDesktopHeight: 220,
  secondaryBannerSliderMobileHeight: 120,
  secondaryBannerSliderPlacement: 'above_top_deals',
  secondaryBannerSliderItems: [
    { id: 'secondary-banner-slider-1', image: '', link: '/shop', alt: 'Lower Banner 1' },
    { id: 'secondary-banner-slider-2', image: '', link: '/shop', alt: 'Lower Banner 2' }
  ],
  referralRewardCoins: 25
}

function normalizeBannerSliderHeight(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(600, Math.max(80, Math.round(numeric)))
}

function normalizeMainBannerHeight(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(700, Math.max(80, Math.round(numeric)))
}

function normalizeBannerSliderItems(items) {
  if (!Array.isArray(items)) return DEFAULT_SHOWCASE.bannerSliderItems

  const normalized = items
    .slice(0, 6)
    .map((item, index) => ({
      id: (item?.id || `banner-slider-${index + 1}`).toString().trim(),
      image: (item?.image || '').toString().trim(),
      link: (item?.link || '/shop').toString().trim(),
      alt: (item?.alt || `Banner ${index + 1}`).toString().trim()
    }))

  return normalized.length ? normalized : DEFAULT_SHOWCASE.bannerSliderItems
}

function normalizeSecondaryBannerSliderItems(items) {
  if (!Array.isArray(items)) return DEFAULT_SHOWCASE.secondaryBannerSliderItems

  const normalized = items
    .slice(0, 6)
    .map((item, index) => ({
      id: (item?.id || `secondary-banner-slider-${index + 1}`).toString().trim(),
      image: (item?.image || '').toString().trim(),
      mobileImage: (item?.mobileImage || '').toString().trim(),
      link: (item?.link || '/shop').toString().trim(),
      alt: (item?.alt || `Lower Banner ${index + 1}`).toString().trim()
    }))

  return normalized.length ? normalized : DEFAULT_SHOWCASE.secondaryBannerSliderItems
}

function normalizeProductBanners(items) {
  if (!Array.isArray(items)) return DEFAULT_SHOWCASE.productBanners

  return items
    .slice(0, 4)
    .map((item) => ({
      image: (item?.image || '').toString().trim(),
      title: (item?.title || '').toString().trim(),
      subtitle: (item?.subtitle || '').toString().trim(),
      buttonText: (item?.buttonText || '').toString().trim(),
      link: (item?.link || '').toString().trim(),
    }))
    .filter((item) => item.image)
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return String(fallback).trim()
  }

  return String(value).trim()
}

function normalizeSecondaryBannerSliderPlacement(value) {
  if (value === 'below_top_deals') return 'below_top_deals'
  if (value === 'below_small_banners') return 'below_small_banners'
  return 'above_top_deals'
}

async function getUserIdFromRequest(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const idToken = authHeader.split(' ')[1]
  const { getAuth } = await import('firebase-admin/auth')
  const { initializeApp, getApps } = await import('firebase-admin/app')
  if (getApps().length === 0) initializeApp()

  try {
    const decoded = await getAuth().verifyIdToken(idToken)
    return decoded.uid
  } catch {
    return null
  }
}

function normalizeShopShowcase(data = {}) {
  const parsedReferralRewardCoins = Number(data.referralRewardCoins)
  const referralRewardCoins = Number.isFinite(parsedReferralRewardCoins)
    ? Math.min(10000, Math.max(0, Math.round(parsedReferralRewardCoins)))
    : DEFAULT_SHOWCASE.referralRewardCoins

  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_SHOWCASE.enabled,
    featuredSectionTitle: normalizeString(data.featuredSectionTitle, DEFAULT_SHOWCASE.featuredSectionTitle),
    featuredSectionDescription: normalizeString(data.featuredSectionDescription, DEFAULT_SHOWCASE.featuredSectionDescription),
    mainBannerEnabled: typeof data.mainBannerEnabled === 'boolean' ? data.mainBannerEnabled : DEFAULT_SHOWCASE.mainBannerEnabled,
    mainBannerImage: normalizeString(data.mainBannerImage, DEFAULT_SHOWCASE.mainBannerImage),
    mainBannerTitle: normalizeString(data.mainBannerTitle, DEFAULT_SHOWCASE.mainBannerTitle),
    mainBannerTitleEnabled: typeof data.mainBannerTitleEnabled === 'boolean' ? data.mainBannerTitleEnabled : DEFAULT_SHOWCASE.mainBannerTitleEnabled,
    mainBannerSubtitle: normalizeString(data.mainBannerSubtitle, DEFAULT_SHOWCASE.mainBannerSubtitle),
    mainBannerSubtitleEnabled: typeof data.mainBannerSubtitleEnabled === 'boolean' ? data.mainBannerSubtitleEnabled : DEFAULT_SHOWCASE.mainBannerSubtitleEnabled,
    mainBannerCtaText: normalizeString(data.mainBannerCtaText, DEFAULT_SHOWCASE.mainBannerCtaText),
    mainBannerCtaEnabled: typeof data.mainBannerCtaEnabled === 'boolean' ? data.mainBannerCtaEnabled : DEFAULT_SHOWCASE.mainBannerCtaEnabled,
    mainBannerLink: normalizeString(data.mainBannerLink, DEFAULT_SHOWCASE.mainBannerLink),
    mainBannerLeftColor: normalizeString(data.mainBannerLeftColor, DEFAULT_SHOWCASE.mainBannerLeftColor),
    mainBannerRightColor: normalizeString(data.mainBannerRightColor, DEFAULT_SHOWCASE.mainBannerRightColor),
    mainBannerTitleColor: normalizeString(data.mainBannerTitleColor, DEFAULT_SHOWCASE.mainBannerTitleColor),
    mainBannerSubtitleColor: normalizeString(data.mainBannerSubtitleColor, DEFAULT_SHOWCASE.mainBannerSubtitleColor),
    mainBannerCtaBgColor: normalizeString(data.mainBannerCtaBgColor, DEFAULT_SHOWCASE.mainBannerCtaBgColor),
    mainBannerCtaTextColor: normalizeString(data.mainBannerCtaTextColor, DEFAULT_SHOWCASE.mainBannerCtaTextColor),
    mainBannerDesktopHeight: normalizeMainBannerHeight(data.mainBannerDesktopHeight, DEFAULT_SHOWCASE.mainBannerDesktopHeight),
    mainBannerMobileHeight: normalizeMainBannerHeight(data.mainBannerMobileHeight, DEFAULT_SHOWCASE.mainBannerMobileHeight),
    sectionTitle: normalizeString(data.sectionTitle, DEFAULT_SHOWCASE.sectionTitle),
    leftBlockBadgeText: normalizeString(data.leftBlockBadgeText, DEFAULT_SHOWCASE.leftBlockBadgeText).slice(0, 12),
    leftBlockSource: data.leftBlockSource === 'product' ? 'product' : 'category',
    dealsTitle: normalizeString(data.dealsTitle, DEFAULT_SHOWCASE.dealsTitle),
    countdownEnd: data.countdownEnd ? new Date(data.countdownEnd) : null,
    categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds.slice(0, 4).map(String) : [],
    sectionProductIds: Array.isArray(data.sectionProductIds) ? data.sectionProductIds.slice(0, 4).map(String) : [],
    productIds: Array.isArray(data.productIds) ? data.productIds.slice(0, 20).map(String) : [],
    topBannerImage: normalizeString(data.topBannerImage, ''),
    topBannerTitle: normalizeString(data.topBannerTitle, DEFAULT_SHOWCASE.topBannerTitle),
    topBannerSubtitle: normalizeString(data.topBannerSubtitle, DEFAULT_SHOWCASE.topBannerSubtitle),
    topBannerCtaText: normalizeString(data.topBannerCtaText, DEFAULT_SHOWCASE.topBannerCtaText),
    topBannerLink: normalizeString(data.topBannerLink, DEFAULT_SHOWCASE.topBannerLink),
    topBannerTitleEnabled: typeof data.topBannerTitleEnabled === 'boolean' ? data.topBannerTitleEnabled : DEFAULT_SHOWCASE.topBannerTitleEnabled,
    topBannerSubtitleEnabled: typeof data.topBannerSubtitleEnabled === 'boolean' ? data.topBannerSubtitleEnabled : DEFAULT_SHOWCASE.topBannerSubtitleEnabled,
    topBannerCtaEnabled: typeof data.topBannerCtaEnabled === 'boolean' ? data.topBannerCtaEnabled : DEFAULT_SHOWCASE.topBannerCtaEnabled,
    topBannerCtaBgColor: normalizeString(data.topBannerCtaBgColor, DEFAULT_SHOWCASE.topBannerCtaBgColor),
    topBannerCtaTextColor: normalizeString(data.topBannerCtaTextColor, DEFAULT_SHOWCASE.topBannerCtaTextColor),
    bottomBannerImage: normalizeString(data.bottomBannerImage, ''),
    bottomBannerTitle: normalizeString(data.bottomBannerTitle, DEFAULT_SHOWCASE.bottomBannerTitle),
    bottomBannerSubtitle: normalizeString(data.bottomBannerSubtitle, DEFAULT_SHOWCASE.bottomBannerSubtitle),
    bottomBannerCtaText: normalizeString(data.bottomBannerCtaText, DEFAULT_SHOWCASE.bottomBannerCtaText),
    bottomBannerLink: normalizeString(data.bottomBannerLink, DEFAULT_SHOWCASE.bottomBannerLink),
    bottomBannerTitleEnabled: typeof data.bottomBannerTitleEnabled === 'boolean' ? data.bottomBannerTitleEnabled : DEFAULT_SHOWCASE.bottomBannerTitleEnabled,
    bottomBannerSubtitleEnabled: typeof data.bottomBannerSubtitleEnabled === 'boolean' ? data.bottomBannerSubtitleEnabled : DEFAULT_SHOWCASE.bottomBannerSubtitleEnabled,
    bottomBannerCtaEnabled: typeof data.bottomBannerCtaEnabled === 'boolean' ? data.bottomBannerCtaEnabled : DEFAULT_SHOWCASE.bottomBannerCtaEnabled,
    bottomBannerCtaBgColor: normalizeString(data.bottomBannerCtaBgColor, DEFAULT_SHOWCASE.bottomBannerCtaBgColor),
    bottomBannerCtaTextColor: normalizeString(data.bottomBannerCtaTextColor, DEFAULT_SHOWCASE.bottomBannerCtaTextColor),
    ...applyLargeBannerSliderDefaults(data),
    productBanners: normalizeProductBanners(data.productBanners),
    bannerSliderEnabled: typeof data.bannerSliderEnabled === 'boolean' ? data.bannerSliderEnabled : DEFAULT_SHOWCASE.bannerSliderEnabled,
    bannerSliderDesktopInterval: Math.max(1500, Number(data.bannerSliderDesktopInterval) || DEFAULT_SHOWCASE.bannerSliderDesktopInterval),
    bannerSliderMobileInterval: Math.max(1500, Number(data.bannerSliderMobileInterval) || DEFAULT_SHOWCASE.bannerSliderMobileInterval),
    bannerSliderDesktopHeight: normalizeBannerSliderHeight(data.bannerSliderDesktopHeight, DEFAULT_SHOWCASE.bannerSliderDesktopHeight),
    bannerSliderMobileHeight: normalizeBannerSliderHeight(data.bannerSliderMobileHeight, DEFAULT_SHOWCASE.bannerSliderMobileHeight),
    bannerSliderItems: normalizeBannerSliderItems(data.bannerSliderItems),
    secondaryBannerSliderEnabled: typeof data.secondaryBannerSliderEnabled === 'boolean' ? data.secondaryBannerSliderEnabled : DEFAULT_SHOWCASE.secondaryBannerSliderEnabled,
    secondaryBannerSliderDesktopInterval: Math.max(1500, Number(data.secondaryBannerSliderDesktopInterval) || DEFAULT_SHOWCASE.secondaryBannerSliderDesktopInterval),
    secondaryBannerSliderMobileInterval: Math.max(1500, Number(data.secondaryBannerSliderMobileInterval) || DEFAULT_SHOWCASE.secondaryBannerSliderMobileInterval),
    secondaryBannerSliderDesktopHeight: normalizeBannerSliderHeight(data.secondaryBannerSliderDesktopHeight, DEFAULT_SHOWCASE.secondaryBannerSliderDesktopHeight),
    secondaryBannerSliderMobileHeight: normalizeBannerSliderHeight(data.secondaryBannerSliderMobileHeight, DEFAULT_SHOWCASE.secondaryBannerSliderMobileHeight),
    secondaryBannerSliderPlacement: normalizeSecondaryBannerSliderPlacement(data.secondaryBannerSliderPlacement),
    secondaryBannerSliderItems: normalizeSecondaryBannerSliderItems(data.secondaryBannerSliderItems),
    referralRewardCoins
  }
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeId = await authSeller(userId)
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    await connectDB()

    const storeObjectId = resolveStoreObjectId(storeId)

    let preference = await StorePreference.findOne({ storeId: storeObjectId }).lean()
    if (!preference) {
      const created = await StorePreference.create({ storeId: storeObjectId, shopShowcase: DEFAULT_SHOWCASE })
      preference = created.toObject()
    }

    return NextResponse.json({
      shopShowcase: normalizeShopShowcase(preference.shopShowcase)
    })
  } catch (error) {
    console.error('[shop-showcase GET] error:', error)
    return NextResponse.json({ error: 'Failed to fetch preference' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeId = await authSeller(userId)
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    const body = await request.json()

    await connectDB()

    const storeObjectId = resolveStoreObjectId(storeId)
    const existing = await StorePreference.findOne({ storeId: storeObjectId }).lean()
    const merged = {
      ...(existing?.shopShowcase || DEFAULT_SHOWCASE),
      ...(body && typeof body === 'object' ? body : {}),
    }
    const shopShowcase = normalizeShopShowcase(merged)

    if (Array.isArray(body?.topBannerSliderItems)) {
      shopShowcase.topBannerSliderItems = serializeLargeBannerSliderItems(
        body.topBannerSliderItems,
        body.topBannerLink || merged.topBannerLink || '/shop',
        'top-large-banner',
      )
      shopShowcase.topBannerImage = shopShowcase.topBannerSliderItems[0]?.image
        || shopShowcase.topBannerImage
        || ''
    }

    if (Array.isArray(body?.bottomBannerSliderItems)) {
      shopShowcase.bottomBannerSliderItems = serializeLargeBannerSliderItems(
        body.bottomBannerSliderItems,
        body.bottomBannerLink || merged.bottomBannerLink || '/shop',
        'bottom-large-banner',
      )
      shopShowcase.bottomBannerImage = shopShowcase.bottomBannerSliderItems[0]?.image
        || shopShowcase.bottomBannerImage
        || ''
    }

    let preference = await StorePreference.findOne({ storeId: storeObjectId })
    if (!preference) {
      preference = new StorePreference({ storeId: storeObjectId })
    }

    preference.set('shopShowcase', shopShowcase)
    preference.markModified('shopShowcase')
    await preference.save()

    const updated = preference.toObject()

    invalidateShopShowcaseCaches()

    return NextResponse.json({
      message: 'Preference saved',
      shopShowcase: normalizeShopShowcase(updated.shopShowcase)
    })
  } catch (error) {
    console.error('[shop-showcase PUT] error:', error)
    return NextResponse.json({ error: 'Failed to save preference' }, { status: 500 })
  }
}
