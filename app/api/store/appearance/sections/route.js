import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import StorePreference from '@/models/StorePreference'
import authSeller from '@/middlewares/authSeller'
import { deleteCacheKey } from '@/lib/cache'
import { DEFAULT_FAST_DELIVERY_PAGE, normalizeFastDeliveryPage } from '@/lib/fastDeliveryPageSettings'
import {
  DEFAULT_WHATSAPP_PRODUCT_WIDGET,
  normalizeWhatsAppProductWidget,
} from '@/lib/whatsappProductWidget'

const DEFAULT_APPEARANCE = {
  categorySliders: { enabled: true, title: 'Featured Collections', description: 'Browse our curated collections' },
  carouselSlider: { enabled: true, autoPlay: true, interval: 5, showControls: true },
  dealsOfTheDay: { enabled: true, title: 'Deals of the Day', discount: 50 },
  sitemapCategories: { enabled: true, columnsPerRow: 4 },
  homeMenuCategories: { enabled: true, style: 'grid', itemsPerRow: 6, rows: 2 },
  navbarMenu: { enabled: true, position: 'top', style: 'horizontal' },
  exploreYourInterests: { enabled: true, productIds: [] },
  fastDeliveryPage: DEFAULT_FAST_DELIVERY_PAGE,
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

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (Number.isNaN(num)) return fallback
  return Math.max(min, Math.min(max, num))
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
      borderRadius: clampNumber(entry?.borderRadius, 0, 24, fallback.borderRadius)
    })
  })

  return normalized.length ? normalized.slice(0, 20) : DEFAULT_APPEARANCE.productPageInfo.badgeSettings.badges
}

function normalizeAppearance(data = {}) {
  const categorySliders = data.categorySliders || {}
  const carouselSlider = data.carouselSlider || {}
  const dealsOfTheDay = data.dealsOfTheDay || {}
  const sitemapCategories = data.sitemapCategories || {}
  const homeMenuCategories = data.homeMenuCategories || {}
  const navbarMenu = data.navbarMenu || {}
  const exploreYourInterests = data.exploreYourInterests || {}
  const fastDeliveryPage = data.fastDeliveryPage || {}
  const productPageInfo = data.productPageInfo || {}
  const pageSeo = normalizePageSeo(data.pageSeo)

  return {
    categorySliders: {
      enabled: typeof categorySliders.enabled === 'boolean' ? categorySliders.enabled : DEFAULT_APPEARANCE.categorySliders.enabled,
      title: (categorySliders.title || DEFAULT_APPEARANCE.categorySliders.title).toString().trim(),
      description: (categorySliders.description || DEFAULT_APPEARANCE.categorySliders.description).toString().trim()
    },
    carouselSlider: {
      enabled: typeof carouselSlider.enabled === 'boolean' ? carouselSlider.enabled : DEFAULT_APPEARANCE.carouselSlider.enabled,
      autoPlay: typeof carouselSlider.autoPlay === 'boolean' ? carouselSlider.autoPlay : DEFAULT_APPEARANCE.carouselSlider.autoPlay,
      interval: clampNumber(carouselSlider.interval, 1, 30, DEFAULT_APPEARANCE.carouselSlider.interval),
      showControls: typeof carouselSlider.showControls === 'boolean' ? carouselSlider.showControls : DEFAULT_APPEARANCE.carouselSlider.showControls
    },
    dealsOfTheDay: {
      enabled: typeof dealsOfTheDay.enabled === 'boolean' ? dealsOfTheDay.enabled : DEFAULT_APPEARANCE.dealsOfTheDay.enabled,
      title: (dealsOfTheDay.title || DEFAULT_APPEARANCE.dealsOfTheDay.title).toString().trim(),
      discount: clampNumber(dealsOfTheDay.discount, 0, 100, DEFAULT_APPEARANCE.dealsOfTheDay.discount)
    },
    sitemapCategories: {
      enabled: typeof sitemapCategories.enabled === 'boolean' ? sitemapCategories.enabled : DEFAULT_APPEARANCE.sitemapCategories.enabled,
      columnsPerRow: clampNumber(sitemapCategories.columnsPerRow, 1, 8, DEFAULT_APPEARANCE.sitemapCategories.columnsPerRow)
    },
    homeMenuCategories: {
      enabled: typeof homeMenuCategories.enabled === 'boolean' ? homeMenuCategories.enabled : DEFAULT_APPEARANCE.homeMenuCategories.enabled,
      style: ['grid', 'list', 'carousel', 'horizontal'].includes(homeMenuCategories.style)
        ? homeMenuCategories.style
        : DEFAULT_APPEARANCE.homeMenuCategories.style,
      itemsPerRow: clampNumber(homeMenuCategories.itemsPerRow, 1, 10, DEFAULT_APPEARANCE.homeMenuCategories.itemsPerRow),
      rows: clampNumber(homeMenuCategories.rows, 1, 6, DEFAULT_APPEARANCE.homeMenuCategories.rows)
    },
    navbarMenu: {
      enabled: typeof navbarMenu.enabled === 'boolean' ? navbarMenu.enabled : DEFAULT_APPEARANCE.navbarMenu.enabled,
      position: ['top', 'bottom', 'sticky'].includes(navbarMenu.position) ? navbarMenu.position : DEFAULT_APPEARANCE.navbarMenu.position,
      style: ['horizontal', 'vertical', 'minimal'].includes(navbarMenu.style) ? navbarMenu.style : DEFAULT_APPEARANCE.navbarMenu.style
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
    whatsappProductWidget: normalizeWhatsAppProductWidget(
      data.whatsappProductWidget || DEFAULT_APPEARANCE.whatsappProductWidget,
    ),
    productPageInfo: {
      returnsText: (productPageInfo.returnsText || DEFAULT_APPEARANCE.productPageInfo.returnsText).toString().trim(),
      vatText: (productPageInfo.vatText || DEFAULT_APPEARANCE.productPageInfo.vatText).toString().trim(),
      deliveryPrefix: (productPageInfo.deliveryPrefix || DEFAULT_APPEARANCE.productPageInfo.deliveryPrefix).toString().trim(),
      deliverySuffix: (productPageInfo.deliverySuffix || DEFAULT_APPEARANCE.productPageInfo.deliverySuffix).toString().trim(),
      cutoffHour: clampNumber(productPageInfo.cutoffHour, 0, 23, DEFAULT_APPEARANCE.productPageInfo.cutoffHour),
      cutoffMinute: clampNumber(productPageInfo.cutoffMinute, 0, 59, DEFAULT_APPEARANCE.productPageInfo.cutoffMinute),
      deliveryMinDays: clampNumber(productPageInfo.deliveryMinDays, 0, 30, DEFAULT_APPEARANCE.productPageInfo.deliveryMinDays),
      deliveryMaxDays: clampNumber(productPageInfo.deliveryMaxDays, 0, 45, DEFAULT_APPEARANCE.productPageInfo.deliveryMaxDays),
      rushPrefix: (productPageInfo.rushPrefix || DEFAULT_APPEARANCE.productPageInfo.rushPrefix).toString().trim(),
      rushHour: clampNumber(productPageInfo.rushHour, 0, 23, DEFAULT_APPEARANCE.productPageInfo.rushHour),
      rushMinute: clampNumber(productPageInfo.rushMinute, 0, 59, DEFAULT_APPEARANCE.productPageInfo.rushMinute),
      rushDayLabel: (productPageInfo.rushDayLabel || DEFAULT_APPEARANCE.productPageInfo.rushDayLabel).toString().trim(),
      badgeSettings: {
        badges: normalizeBadgeDefinitions(productPageInfo.badgeSettings?.badges)
      }
    },
    pageSeo
  }
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeId = await authSeller(userId)
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    await connectDB()

    let preference = await StorePreference.findOne({ storeId }).select('appearanceSections').lean()
    if (!preference) {
      return NextResponse.json(normalizeAppearance(DEFAULT_APPEARANCE))
    }

    return NextResponse.json(normalizeAppearance(preference.appearanceSections || DEFAULT_APPEARANCE))
  } catch (error) {
    console.error('[appearance sections GET] error:', error)
    return NextResponse.json(DEFAULT_APPEARANCE)
  }
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeId = await authSeller(userId)
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    const body = await request.json()

    await connectDB()

    const existingPreference = await StorePreference.findOne({ storeId }).lean()
    const mergedPayload = {
      ...(existingPreference?.appearanceSections || {}),
      ...(body || {})
    }
    const appearanceSections = normalizeAppearance(mergedPayload)

    await StorePreference.findOneAndUpdate(
      { storeId },
      { $set: { appearanceSections } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    deleteCacheKey('public:appearance-sections:v1')
    deleteCacheKey('public:appearance-sections:v2')

    return NextResponse.json({ message: 'Appearance settings saved', ...appearanceSections })
  } catch (error) {
    console.error('[appearance sections POST] error:', error)
    return NextResponse.json({ error: 'Failed to save appearance settings' }, { status: 500 })
  }
}
