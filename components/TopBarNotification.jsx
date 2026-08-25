'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, Gift, Truck } from 'lucide-react'

const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache'
const DEFAULT_NAVBAR_BG = '#8f3404'

const DEFAULT_ITEMS = [
  {
    id: 'shipping',
    title: 'Fast Delivery',
    subtitle: 'Across the UAE'
  },
  {
    id: 'policy',
    title: 'Up to 90 days*',
    subtitle: 'Price adjustment'
  },
  {
    id: 'rewards',
    title: 'Signup Rewards',
    subtitle: '100 Coins + Free Coupons',
    action: 'signup'
  }
]

function parseItems(rawValue) {
  if (!rawValue) return DEFAULT_ITEMS

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_ITEMS
    }

    return parsed
      .map((item, index) => ({
        id: item?.id || `item-${index}`,
        title: typeof item?.title === 'string' ? item.title.trim() : '',
        subtitle: typeof item?.subtitle === 'string' ? item.subtitle.trim() : '',
        href: typeof item?.href === 'string' ? item.href : '',
        action: typeof item?.action === 'string' ? item.action : ''
      }))
      .filter((item) => item.title)
  } catch (error) {
    console.warn('[TopBarNotification] Invalid NEXT_PUBLIC_TOPBAR_ITEMS JSON.')
    return DEFAULT_ITEMS
  }
}

function getCountdownTarget(rawValue) {
  if (rawValue) {
    const parsed = Date.parse(rawValue)
    if (!Number.isNaN(parsed)) return parsed
  }

  const target = new Date()
  target.setHours(23, 59, 59, 999)
  return target.getTime()
}

function formatCountdown(msLeft) {
  const safeMs = Math.max(0, msLeft)
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return { hours, minutes, seconds }
}

function readCachedNavbarBg() {
  if (typeof window === 'undefined') return DEFAULT_NAVBAR_BG

  try {
    const raw = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY)
    if (!raw) return DEFAULT_NAVBAR_BG

    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.backgroundColor === 'string' && parsed.backgroundColor.trim()) {
      return parsed.backgroundColor.trim()
    }
  } catch {
    // Ignore storage parse failures and fall back to default.
  }

  return DEFAULT_NAVBAR_BG
}

function TopItem({ item, icon, onAction }) {
  const content = (
    <div className="px-3 py-1 text-center md:px-5">
      <div className="flex items-center justify-center gap-1 text-[13px] font-semibold leading-tight text-white">
        {icon}
        <span>{item.title}</span>
      </div>
    </div>
  )

  if (item.action) {
    return (
      <button type="button" onClick={() => onAction(item.action)} className="block w-full hover:bg-white/5 transition-colors">
        {content}
      </button>
    )
  }

  if (item.href) {
    return (
      <Link href={item.href} className="block hover:bg-white/5 transition-colors">
        {content}
      </Link>
    )
  }

  return content
}

const TopBarNotification = () => {
  const isEnabled = process.env.NEXT_PUBLIC_TOPBAR_ENABLED !== 'false'
  const items = useMemo(() => {
    const parsed = parseItems(process.env.NEXT_PUBLIC_TOPBAR_ITEMS)
    return [0, 1, 2].map((index) => parsed[index] || DEFAULT_ITEMS[index])
  }, [])
  const countdownLabel = process.env.NEXT_PUBLIC_TOPBAR_COUNTDOWN_LABEL || 'Hurry Up !'
  const countdownTarget = useMemo(
    () => getCountdownTarget(process.env.NEXT_PUBLIC_TOPBAR_COUNTDOWN_END),
    []
  )

  const [now, setNow] = useState(() => Date.now())
  const [navbarBg, setNavbarBg] = useState(DEFAULT_NAVBAR_BG)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    setNavbarBg(readCachedNavbarBg())

    const handleNavbarAppearanceUpdate = (event) => {
      const nextBg = event?.detail?.backgroundColor
      if (typeof nextBg === 'string' && nextBg.trim()) {
        setNavbarBg(nextBg.trim())
        return
      }

      setNavbarBg(readCachedNavbarBg())
    }

    window.addEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate)

    return () => {
      window.removeEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate)
    }
  }, [])

  const countdown = formatCountdown(countdownTarget - now)

  const icons = [
    <Truck key="truck" size={12} className="text-emerald-400" />,
    <Bell key="bell" size={12} className="text-zinc-100" />,
    <Gift key="gift" size={12} className="text-rose-500" />
  ]

  const subtitleColors = [
    'text-emerald-400',
    'text-zinc-200',
    'text-rose-400'
  ]

  const styledItems = items.map((item, index) => ({
    ...item,
    subtitle: item.subtitle,
    subtitleClassName: subtitleColors[index] || 'text-zinc-300'
  }))

  const handleAction = (action) => {
    if (action !== 'signup') return
    const signInEvent = new CustomEvent('openSignInModal', { detail: { isRegister: true } })
    window.dispatchEvent(signInEvent)
  }

  if (!isEnabled) return null

  return (
    <div className="border-b-2 border-b-[#ff7a00] border-t border-zinc-700/90 text-white" style={{ backgroundColor: navbarBg }}>
      <div className="mx-auto max-w-[1400px] overflow-x-auto">
        <div className="grid min-w-[940px] grid-cols-[1fr_1fr_250px_1fr] items-stretch">
          {styledItems.slice(0, 2).map((item, index) => (
            <div key={item.id} className="relative border-r border-r-zinc-600/70">
              <TopItem
                item={{ ...item, subtitle: item.subtitle }}
                icon={icons[index] || icons[0]}
                onAction={handleAction}
              />
              <p className={`-mt-0.5 pb-1 text-center text-[10px] font-medium leading-none ${item.subtitleClassName}`}>
                {item.subtitle}
              </p>
            </div>
          ))}

          <div className="border-r border-r-zinc-600/70 px-2 py-1 text-center">
            <div className="text-[36px] font-extrabold leading-none tracking-tight text-[#ffc700]">
              {countdownLabel}
            </div>
            <div className="mt-0.5 text-[14px] font-semibold tracking-[0.16em] text-[#ffd463]">
              {countdown.hours} : {countdown.minutes} : {countdown.seconds}
            </div>
            <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.24em] text-[#ffc66a]">
              Hrs&nbsp;&nbsp;&nbsp;Min&nbsp;&nbsp;&nbsp;Sec
            </div>
          </div>

          <div className="relative">
            <TopItem item={styledItems[2]} icon={icons[2]} onAction={handleAction} />
            <p className={`-mt-0.5 pb-1 text-center text-[10px] font-medium leading-none ${styledItems[2].subtitleClassName}`}>
              {styledItems[2].subtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TopBarNotification
