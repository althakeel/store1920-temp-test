import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import StorePreference from '@/models/StorePreference'
import authSeller from '@/middlewares/authSeller'

const DEFAULT_TOP_BAR = {
  enabled: true,
  countdownLabel: 'HURRY UP !',
  countdownEnd: null,
  items: [
    { id: 'shipping', title: 'Fast Delivery', subtitle: 'Across the UAE', icon: 'truck' },
    { id: 'policy', title: 'Up to 90 days*', subtitle: 'Price adjustment', icon: 'bell' },
    { id: 'rewards', title: 'Signup Rewards', subtitle: '100 Coins + Free Coupons', icon: 'gift', action: 'signup' }
  ]
}

async function getUserIdFromRequest(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const idToken = authHeader.split(' ')[1]
  const { getAuth } = await import('firebase-admin/auth')
  const { initializeApp, getApps } = await import('firebase-admin/app')

  if (getApps().length === 0) initializeApp()

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken)
    return decodedToken.uid
  } catch {
    return null
  }
}

function normalizeTopBar(payload = {}) {
  const srcItems = Array.isArray(payload.items) ? payload.items : []
  const safeItems = [0, 1, 2].map((index) => {
    const fallback = DEFAULT_TOP_BAR.items[index]
    const src = srcItems[index] || {}

    return {
      id: (src.id || fallback.id || `item-${index}`).toString(),
      title: (src.title || fallback.title || '').toString().trim(),
      subtitle: (src.subtitle || fallback.subtitle || '').toString().trim(),
      icon: (src.icon || fallback.icon || '').toString().trim(),
      href: (src.href || '').toString().trim(),
      action: (src.action || fallback.action || '').toString().trim()
    }
  })

  return {
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : DEFAULT_TOP_BAR.enabled,
    countdownLabel: (payload.countdownLabel || DEFAULT_TOP_BAR.countdownLabel).toString().trim(),
    countdownEnd: payload.countdownEnd ? new Date(payload.countdownEnd) : null,
    items: safeItems
  }
}

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeId = await authSeller(userId)
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    await connectDB()

    let preferences = await StorePreference.findOne({ storeId }).lean()
    if (!preferences) {
      const created = await StorePreference.create({
        storeId,
        topBar: DEFAULT_TOP_BAR
      })
      preferences = created.toObject()
    }

    return NextResponse.json({
      topBar: normalizeTopBar(preferences.topBar)
    })
  } catch (error) {
    console.error('[Store TopBar Preferences GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch top bar preferences' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const storeId = await authSeller(userId)
    if (!storeId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    const body = await request.json()
    const normalizedTopBar = normalizeTopBar(body)

    await connectDB()

    const preferences = await StorePreference.findOneAndUpdate(
      { storeId },
      { $set: { topBar: normalizedTopBar } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    return NextResponse.json({
      message: 'Top bar preferences saved',
      topBar: normalizeTopBar(preferences.topBar)
    })
  } catch (error) {
    console.error('[Store TopBar Preferences PUT] Error:', error)
    return NextResponse.json({ error: 'Failed to save top bar preferences' }, { status: 500 })
  }
}
