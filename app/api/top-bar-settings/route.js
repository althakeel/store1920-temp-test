import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import StorePreference from '@/models/StorePreference'

const DEFAULT_TOP_BAR = {
  enabled: true,
  countdownLabel: process.env.NEXT_PUBLIC_TOPBAR_COUNTDOWN_LABEL || 'HURRY UP !',
  countdownEnd: process.env.NEXT_PUBLIC_TOPBAR_COUNTDOWN_END || null,
  items: [
    { id: 'shipping', title: 'Fast Delivery', subtitle: 'Across the UAE', icon: 'truck' },
    { id: 'policy', title: 'Up to 90 days*', subtitle: 'Price adjustment', icon: 'bell' },
    { id: 'rewards', title: 'Signup Rewards', subtitle: '100 Coins + Free Coupons', icon: 'gift', action: 'signup' }
  ]
}

function normalizeTopBar(payload = {}) {
  const srcItems = Array.isArray(payload.items) ? payload.items : []
  const items = [0, 1, 2].map((index) => {
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
    countdownEnd: payload.countdownEnd || DEFAULT_TOP_BAR.countdownEnd,
    items
  }
}

export async function GET() {
  try {
    await connectDB()

    const preference = await StorePreference.findOne({})
      .sort({ updatedAt: -1 })
      .lean()

    if (!preference?.topBar) {
      return NextResponse.json({ topBar: normalizeTopBar(DEFAULT_TOP_BAR) })
    }

    return NextResponse.json({ topBar: normalizeTopBar(preference.topBar) })
  } catch (error) {
    console.error('[Public TopBar Settings GET] Error:', error)
    return NextResponse.json({ topBar: normalizeTopBar(DEFAULT_TOP_BAR) })
  }
}
