'use client'

import React, { useEffect, useState } from 'react'
import { Home, ShoppingCart, User, Store, Percent } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSelector } from 'react-redux'
import { useAuth } from '@/lib/useAuth'
import { isProductDetailPath } from '@/lib/productUrl'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'
import {
  DEFAULT_OFFERS_NAV_LABEL,
  DEFAULT_OFFERS_NAV_LABEL_AR,
  normalizeNavGifUrl,
  splitOffersNavLabel,
} from '@/lib/offersPageSettings'

const DEFAULT_BRAND_COLOR = '#8f3404'
const INACTIVE_NAV_COLOR = '#94a3b8'
const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache'
const OFFERS_HREF = '/offers'
const SHOP_HREF = '/shop'
const DEALS_ACCENT = '#ea580c'
const DEALS_ACCENT_DARK = '#c2410c'

function readCachedBrandColor() {
  if (typeof window === 'undefined') return DEFAULT_BRAND_COLOR
  try {
    const raw = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY)
    if (!raw) return DEFAULT_BRAND_COLOR
    const parsed = JSON.parse(raw)
    const color = String(parsed?.backgroundColor || '').trim()
    return color || DEFAULT_BRAND_COLOR
  } catch {
    return DEFAULT_BRAND_COLOR
  }
}

function useBrandColor() {
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR)

  useEffect(() => {
    setBrandColor(readCachedBrandColor())

    const controller = new AbortController()
    fetch(`/api/store/navbar-menu?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const next = String(data?.backgroundColor || '').trim()
        if (next) setBrandColor(next)
      })
      .catch(() => {})

    const handleUpdate = (event) => {
      const next = event?.detail?.backgroundColor
      if (typeof next === 'string' && next.trim()) {
        setBrandColor(next.trim())
        return
      }
      setBrandColor(readCachedBrandColor())
    }

    window.addEventListener('navbarAppearanceUpdated', handleUpdate)
    return () => {
      controller.abort()
      window.removeEventListener('navbarAppearanceUpdated', handleUpdate)
    }
  }, [])

  return brandColor
}

function RegularNavItem({ item, pathname, brandColor, hydrated }) {
  const Icon = item.icon
  const isActive = item.match(pathname)
  const activeColor = brandColor || DEFAULT_BRAND_COLOR
  const iconColor = isActive ? activeColor : INACTIVE_NAV_COLOR

  return (
    <Link
      href={item.href}
      className="group flex min-w-0 flex-1 items-end justify-center px-0.5 pb-0.5"
      aria-current={isActive ? 'page' : undefined}
    >
      <span
        className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-1 transition-all duration-200 active:scale-95 ${
          isActive ? '' : 'group-hover:opacity-80'
        }`}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Icon
            size={18}
            strokeWidth={isActive ? 2.5 : 1.9}
            color={iconColor}
            className="transition-colors duration-200"
          />
          {hydrated && item.badge > 0 && (
            <span
              className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
              style={{ backgroundColor: activeColor }}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </span>
        <span
          className={`max-w-[52px] truncate text-[9px] leading-none tracking-tight transition-colors duration-200 ${
            isActive ? 'font-semibold' : 'font-medium'
          }`}
          style={{ color: iconColor }}
        >
          {item.label}
        </span>
      </span>
    </Link>
  )
}

function CenterTodayDealsItem({ pathname, line1, line2, gifUrl = '' }) {
  const isActive = pathname === OFFERS_HREF
  const hasGif = Boolean(String(gifUrl || '').trim())

  return (
    <Link
      href={OFFERS_HREF}
      className="group relative -mt-4 flex min-w-0 flex-1 flex-col items-center justify-end pb-0.5"
      aria-label={`${line1} ${line2}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span
        className="relative flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full shadow-[0_4px_14px_rgba(234,88,12,0.35)] ring-[3px] ring-white transition-transform duration-200 active:scale-95"
        style={{
          background: `linear-gradient(145deg, ${DEALS_ACCENT} 0%, ${DEALS_ACCENT_DARK} 100%)`,
        }}
      >
        {hasGif ? (
          <img src={gifUrl} alt="" className="h-7 w-7 object-contain" />
        ) : (
          <Percent size={21} color="#ffffff" strokeWidth={2.5} />
        )}
      </span>
      <span className="mt-1 flex flex-col items-center leading-none">
        <span
          className={`text-[8px] leading-tight transition-colors duration-200 ${
            isActive ? 'font-bold' : 'font-semibold'
          }`}
          style={{ color: isActive ? DEALS_ACCENT_DARK : DEALS_ACCENT }}
        >
          {line1}
        </span>
        <span
          className={`text-[8px] leading-tight transition-colors duration-200 ${
            isActive ? 'font-bold' : 'font-semibold'
          }`}
          style={{ color: isActive ? DEALS_ACCENT_DARK : DEALS_ACCENT }}
        >
          {line2}
        </span>
      </span>
    </Link>
  )
}

export default function MobileBottomNav() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  const pathname = usePathname()
  const cartCount = useSelector((state) => state.cart.total)
  const { user } = useAuth()
  const { t, language } = useStorefrontI18n()
  const brandColor = useBrandColor()
  const [dealsNavLabels, setDealsNavLabels] = useState({
    en: DEFAULT_OFFERS_NAV_LABEL,
    ar: DEFAULT_OFFERS_NAV_LABEL_AR,
  })
  const [dealsNavGifUrl, setDealsNavGifUrl] = useState('')
  const isSignedIn = !!user
  const isArabic = language === 'ar'
  const dealsNavLabel = isArabic ? dealsNavLabels.ar : dealsNavLabels.en
  const dealsNavParts = splitOffersNavLabel(dealsNavLabel)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('offersNavLabelCache')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.en || parsed?.ar) {
          setDealsNavLabels({
            en: String(parsed.en || DEFAULT_OFFERS_NAV_LABEL).trim() || DEFAULT_OFFERS_NAV_LABEL,
            ar: String(parsed.ar || DEFAULT_OFFERS_NAV_LABEL_AR).trim() || DEFAULT_OFFERS_NAV_LABEL_AR,
          })
        }
        if (parsed?.gif !== undefined || parsed?.navGifUrl !== undefined) {
          setDealsNavGifUrl(normalizeNavGifUrl(parsed.gif || parsed.navGifUrl))
        }
      }
    } catch {
      // Ignore storage read failures.
    }

    const applyOffersNav = (offersPage = {}) => {
      const nextLabels = {
        en: String(offersPage.navLabel || DEFAULT_OFFERS_NAV_LABEL).trim() || DEFAULT_OFFERS_NAV_LABEL,
        ar: String(offersPage.navLabelAr || DEFAULT_OFFERS_NAV_LABEL_AR).trim() || DEFAULT_OFFERS_NAV_LABEL_AR,
      }
      const nextGif = normalizeNavGifUrl(offersPage.navGifUrl || offersPage.gif)
      setDealsNavLabels(nextLabels)
      setDealsNavGifUrl(nextGif)
      try {
        window.localStorage.setItem('offersNavLabelCache', JSON.stringify({
          ...nextLabels,
          gif: nextGif,
        }))
      } catch {
        // Ignore storage write failures.
      }
    }

    const controller = new AbortController()
    fetch(`/api/store/appearance/sections/public?t=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.offersPage) return
        applyOffersNav(data.offersPage)
      })
      .catch(() => {})

    const handleOffersNavLabelUpdate = (event) => {
      const detail = event?.detail || {}
      if (detail.en || detail.ar) {
        setDealsNavLabels({
          en: String(detail.en || DEFAULT_OFFERS_NAV_LABEL).trim() || DEFAULT_OFFERS_NAV_LABEL,
          ar: String(detail.ar || DEFAULT_OFFERS_NAV_LABEL_AR).trim() || DEFAULT_OFFERS_NAV_LABEL_AR,
        })
      }
      if (detail.gif !== undefined || detail.navGifUrl !== undefined) {
        setDealsNavGifUrl(normalizeNavGifUrl(detail.gif || detail.navGifUrl))
      }
    }
    window.addEventListener('offersNavLabelUpdated', handleOffersNavLabelUpdate)

    return () => {
      controller.abort()
      window.removeEventListener('offersNavLabelUpdated', handleOffersNavLabelUpdate)
    }
  }, [])

  if (isProductDetailPath(pathname)) {
    return null
  }

  const accountHref = isSignedIn ? '/dashboard/orders' : '/sign-in'

  const leftItems = [
    { href: '/', icon: Home, label: t('common.home'), match: (path) => path === '/' },
    {
      href: SHOP_HREF,
      icon: Store,
      label: t('navbar.shopOptions'),
      match: (path) => path === SHOP_HREF || path.startsWith('/shop'),
    },
  ]

  const rightItems = [
    { href: '/cart', icon: ShoppingCart, label: t('navbar.cart'), badge: cartCount, match: (path) => path === '/cart' },
    {
      href: accountHref,
      icon: User,
      label: t('navbar.account'),
      match: (path) => path === accountHref || path.startsWith('/dashboard/') || path === '/sign-in',
    },
  ]

  return (
    <nav
      aria-label="Mobile navigation"
      dir={isArabic ? 'rtl' : 'ltr'}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/80 bg-white/95 backdrop-blur-md lg:hidden"
      style={{
        paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 24px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div className="mx-auto flex h-[58px] max-w-lg items-stretch justify-around px-0.5">
        {leftItems.map((item) => (
          <RegularNavItem
            key={item.href}
            item={item}
            pathname={pathname}
            brandColor={brandColor}
            hydrated={hydrated}
          />
        ))}

        <CenterTodayDealsItem
          pathname={pathname}
          line1={dealsNavParts.top}
          line2={dealsNavParts.bottom || dealsNavLabel}
          gifUrl={dealsNavGifUrl}
        />

        {rightItems.map((item) => (
          <RegularNavItem
            key={item.href}
            item={item}
            pathname={pathname}
            brandColor={brandColor}
            hydrated={hydrated}
          />
        ))}
      </div>
    </nav>
  )
}
