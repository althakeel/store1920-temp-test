import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import StorePreference from '@/models/StorePreference'
import { getCachedData, setCachedData } from '@/lib/cache'
import { DEFAULT_FAST_DELIVERY_PAGE, normalizeFastDeliveryPage } from '@/lib/fastDeliveryPageSettings'
import { DEFAULT_OFFERS_PAGE, normalizeOffersPage } from '@/lib/offersPageSettings'
import {
  DEFAULT_WHATSAPP_PRODUCT_WIDGET,
  normalizeWhatsAppProductWidget,
} from '@/lib/whatsappProductWidget'

const APPEARANCE_CACHE_KEY = 'public:appearance-sections:v7'

const DEFAULT_APPEARANCE = {
  categorySliders: { enabled: true, title: 'Featured Collections', description: 'Browse our curated collections' },
  carouselSlider: { enabled: true, autoPlay: true, interval: 5, showControls: true },
  dealsOfTheDay: { enabled: true, title: 'Deals of the Day', discount: 50 },
  sitemapCategories: { enabled: true, columnsPerRow: 4 },
  homeMenuCategories: { enabled: true, style: 'grid', itemsPerRow: 6, rows: 2 },
  navbarMenu: { enabled: true, position: 'top', style: 'horizontal' },
  exploreYourInterests: { enabled: true, productIds: [] },
  fastDeliveryPage: DEFAULT_FAST_DELIVERY_PAGE,
  offersPage: DEFAULT_OFFERS_PAGE,
  whatsappProductWidget: DEFAULT_WHATSAPP_PRODUCT_WIDGET,
  productPageInfo: {
    returnsText: 'Easy Returns',
    vatText: 'All prices include VAT.',
    deliveryPrefix: 'Estimated delivery',
    deliverySuffix: '— timelines are estimates.',
    cutoffHour: 23,
    cutoffMinute: 0,
    deliveryMinDays: 2,
    deliveryMaxDays: 3,
    rushPrefix: 'Or ⚡ Rush delivery',
    rushHour: 11,
    rushMinute: 15,
    rushDayLabel: 'Today by',
    badgeSettings: {
      badges: [
        { label: 'Price Lower Than Usual', backgroundColor: '#007600', textColor: '#ffffff', borderRadius: 0 },
        { label: 'Hot Deal', backgroundColor: '#cc0c39', textColor: '#ffffff', borderRadius: 0 },
        { label: 'Best Seller', backgroundColor: '#c45500', textColor: '#ffffff', borderRadius: 0 },
        { label: 'New Arrival', backgroundColor: '#0066c0', textColor: '#ffffff', borderRadius: 0 },
        { label: 'Limited Stock', backgroundColor: '#b12704', textColor: '#ffffff', borderRadius: 0 },
        { label: 'Free Shipping', backgroundColor: '#007185', textColor: '#ffffff', borderRadius: 0 }
      ]
    }
  },
  pageSeo: {}
}

function normalizePathKey(path = '/') {
  const raw = String(path || '').trim()
  if (!raw) return '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  const withoutQuery = withSlash.split('?')[0].split('#')[0]
  const clean = withoutQuery.replace(/\/{2,}/g, '/').replace(/\/$/, '')
  return clean || '/'
}

function parseKeywords(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    )
  }

  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function normalizePageSeo(pageSeo = {}) {
  if (!pageSeo || typeof pageSeo !== 'object' || Array.isArray(pageSeo)) {
    return DEFAULT_APPEARANCE.pageSeo
  }

  const normalized = {}
  for (const [path, value] of Object.entries(pageSeo)) {
    const key = normalizePathKey(path)
    const entry = value && typeof value === 'object' ? value : {}
    const title = String(entry.title || '').trim().slice(0, 120)
    const description = String(entry.description || '').trim().slice(0, 320)
    const keywords = parseKeywords(entry.keywords).slice(0, 30)

    if (!title && !description && keywords.length === 0) {
      continue
    }

    normalized[key] = { title, description, keywords }
  }

  return normalized
}

function normalizeColor(value, fallback) {
  const color = String(value || '').trim()
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : fallback
}

function normalizeBadgeDefinitions(values) {
  const source = Array.isArray(values) && values.length
    ? values
    : DEFAULT_APPEARANCE.productPageInfo.badgeSettings.badges

  const seen = new Set()
  const normalized = []

  source.forEach((entry, index) => {
    const label = String(entry?.label || '').trim().slice(0, 40)
    const key = label.toLowerCase()
    if (!label || seen.has(key)) return
    seen.add(key)

    const fallback = DEFAULT_APPEARANCE.productPageInfo.badgeSettings.badges[index] || DEFAULT_APPEARANCE.productPageInfo.badgeSettings.badges[0]
    normalized.push({
      label,
      backgroundColor: normalizeColor(entry?.backgroundColor, fallback.backgroundColor),
      textColor: normalizeColor(entry?.textColor, fallback.textColor),
      borderRadius: Math.max(0, Math.min(24, Number(entry?.borderRadius ?? fallback.borderRadius)))
    })
  })

  return normalized.length ? normalized.slice(0, 20) : DEFAULT_APPEARANCE.productPageInfo.badgeSettings.badges
}

function sanitizeProductPageClaimText(value = '', fallback = '') {
  const text = String(value || '').trim()
  if (!text) return fallback
  const lower = text.toLowerCase()
  if (lower.includes('free return')) return 'Easy Returns'
  if (lower === 'free delivery' || lower === 'free shipping' || lower.startsWith('free delivery')) {
    return 'Estimated delivery'
  }
  if (lower.includes('on your first order')) return '— timelines are estimates.'
  return text
}

function normalizePublic(data = {}) {
  const homeMenuCategories = data.homeMenuCategories || {}
  const exploreYourInterests = data.exploreYourInterests || {}
  const fastDeliveryPage = data.fastDeliveryPage || {}
  const offersPage = data.offersPage || {}
  const productPageInfo = data.productPageInfo || {}
  const pageSeo = normalizePageSeo(data.pageSeo)
  return {
    homeMenuCategories: {
      enabled: typeof homeMenuCategories.enabled === 'boolean' ? homeMenuCategories.enabled : DEFAULT_APPEARANCE.homeMenuCategories.enabled,
      style: homeMenuCategories.style === 'carousel' || homeMenuCategories.style === 'horizontal'
        ? 'carousel'
        : DEFAULT_APPEARANCE.homeMenuCategories.style,
      itemsPerRow: Math.max(1, Math.min(10, Number(homeMenuCategories.itemsPerRow || DEFAULT_APPEARANCE.homeMenuCategories.itemsPerRow))),
      rows: Math.max(1, Math.min(6, Number(homeMenuCategories.rows || DEFAULT_APPEARANCE.homeMenuCategories.rows)))
    },
    exploreYourInterests: {
      enabled:
        typeof exploreYourInterests.enabled === 'boolean'
          ? exploreYourInterests.enabled
          : DEFAULT_APPEARANCE.exploreYourInterests.enabled,
      productIds: Array.isArray(exploreYourInterests.productIds)
        ? Array.from(
            new Set(
              exploreYourInterests.productIds
                .map((id) => String(id || '').trim())
                .filter(Boolean)
            )
          )
        : DEFAULT_APPEARANCE.exploreYourInterests.productIds
    },
    fastDeliveryPage: normalizeFastDeliveryPage(fastDeliveryPage),
    offersPage: normalizeOffersPage(offersPage),
    whatsappProductWidget: normalizeWhatsAppProductWidget(
      data.whatsappProductWidget || DEFAULT_APPEARANCE.whatsappProductWidget,
    ),
    productPageInfo: {
      returnsText: sanitizeProductPageClaimText(
        productPageInfo.returnsText,
        DEFAULT_APPEARANCE.productPageInfo.returnsText,
      ),
      vatText: (productPageInfo.vatText || DEFAULT_APPEARANCE.productPageInfo.vatText).toString().trim(),
      deliveryPrefix: sanitizeProductPageClaimText(
        productPageInfo.deliveryPrefix,
        DEFAULT_APPEARANCE.productPageInfo.deliveryPrefix,
      ),
      deliverySuffix: sanitizeProductPageClaimText(
        productPageInfo.deliverySuffix,
        DEFAULT_APPEARANCE.productPageInfo.deliverySuffix,
      ),
      cutoffHour: Math.max(0, Math.min(23, Number(productPageInfo.cutoffHour ?? DEFAULT_APPEARANCE.productPageInfo.cutoffHour))),
      cutoffMinute: Math.max(0, Math.min(59, Number(productPageInfo.cutoffMinute ?? DEFAULT_APPEARANCE.productPageInfo.cutoffMinute))),
      deliveryMinDays: Math.max(0, Math.min(30, Number(productPageInfo.deliveryMinDays ?? DEFAULT_APPEARANCE.productPageInfo.deliveryMinDays))),
      deliveryMaxDays: Math.max(0, Math.min(45, Number(productPageInfo.deliveryMaxDays ?? DEFAULT_APPEARANCE.productPageInfo.deliveryMaxDays))),
      rushPrefix: (productPageInfo.rushPrefix || DEFAULT_APPEARANCE.productPageInfo.rushPrefix).toString().trim(),
      rushHour: Math.max(0, Math.min(23, Number(productPageInfo.rushHour ?? DEFAULT_APPEARANCE.productPageInfo.rushHour))),
      rushMinute: Math.max(0, Math.min(59, Number(productPageInfo.rushMinute ?? DEFAULT_APPEARANCE.productPageInfo.rushMinute))),
      rushDayLabel: (productPageInfo.rushDayLabel || DEFAULT_APPEARANCE.productPageInfo.rushDayLabel).toString().trim(),
      badgeSettings: {
        badges: normalizeBadgeDefinitions(productPageInfo.badgeSettings?.badges)
      }
    },
    pageSeo
  }
}

export async function GET() {
  try {
    const cached = getCachedData(APPEARANCE_CACHE_KEY)
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      })
    }

    await connectDB()
    const preference = await StorePreference.findOne({})
      .sort({ updatedAt: -1 })
      .select('appearanceSections updatedAt')
      .lean()

    const payload = normalizePublic(preference?.appearanceSections || DEFAULT_APPEARANCE)
    setCachedData(APPEARANCE_CACHE_KEY, payload, 120)

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    console.error('[appearance sections public GET] error:', error)
    return NextResponse.json(normalizePublic(DEFAULT_APPEARANCE))
  }
}
