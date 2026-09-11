'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw } from 'lucide-react'
import BusyButtonIcon from '@/components/store/BusyButtonIcon'
import {
  MOBILE_BANNER_SECTIONS,
  toPublicBannerSection,
} from '@/lib/mobileBannerLayout'
import { normalizeMobileFeatures, toPreviewMobileFeatures } from '@/lib/mobileFeatures'

const SECTION_ORDER = ['bannerSlider', 'smallBanners', 'promoCards', 'tileBanners']

const SECTION_HREF = {
  bannerSlider: '/store/mobile-features/banners',
  smallBanners: '/store/mobile-features/small-banners',
  promoCards: '/store/mobile-features/promo-cards',
  tileBanners: '/store/mobile-features/tile-banners',
}

function SlideCarousel({ slides, heightPx, intervalSeconds, emptyLabel }) {
  const [index, setIndex] = useState(0)
  const safeSlides = Array.isArray(slides) ? slides.filter((s) => s?.image) : []

  useEffect(() => {
    setIndex(0)
  }, [safeSlides.length, safeSlides[0]?.image])

  useEffect(() => {
    if (safeSlides.length < 2) return undefined
    const ms = Math.max(2, Number(intervalSeconds) || 4) * 1000
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % safeSlides.length)
    }, ms)
    return () => clearInterval(timer)
  }, [safeSlides.length, intervalSeconds])

  if (!safeSlides.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-[10px] text-slate-400"
        style={{ height: heightPx }}
      >
        {emptyLabel}
      </div>
    )
  }

  const current = safeSlides[index] || safeSlides[0]

  return (
    <div className="relative overflow-hidden rounded-lg bg-slate-200" style={{ height: heightPx }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.image}
        alt={current.title || 'Banner'}
        className="h-full w-full object-cover"
      />
      {current.showAdBadge ? (
        <span className="absolute end-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          Ad
        </span>
      ) : null}
      {safeSlides.length > 1 ? (
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
          {safeSlides.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TileGrid({ tiles }) {
  const list = Array.isArray(tiles) ? tiles.filter((t) => t?.image) : []
  if (!list.length) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100 text-[10px] text-slate-400">
        No category tiles
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {list.map((tile, index) => (
        <div
          key={`${tile.image}-${index}`}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div className="relative aspect-[4/3] bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tile.image} alt={tile.title || `Tile ${index + 1}`} className="h-full w-full object-cover" />
          </div>
          <div className="space-y-0.5 p-1.5">
            {tile.title ? (
              <p className="truncate text-[10px] font-semibold text-slate-900">{tile.title}</p>
            ) : null}
            {tile.subtitle ? (
              <p className="truncate text-[9px] text-slate-500">{tile.subtitle}</p>
            ) : null}
            {tile.buttonText ? (
              <span className="inline-block rounded bg-sky-600 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                {tile.buttonText}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Phone-frame preview of app home banners.
 * Matches public API payloads so what you see here is what the mobile app receives.
 *
 * @param {object} props
 * @param {object} [props.features] - Normalized or raw mobileFeatures (optional; when omitted use publicPayload)
 * @param {object} [props.publicPayload] - Already public-shaped sections
 * @param {string} [props.highlightSectionKey] - Emphasize one section while editing
 * @param {boolean} [props.compact]
 * @param {boolean} [props.showEditLinks]
 * @param {() => void} [props.onRefresh]
 * @param {boolean} [props.refreshing]
 */
export default function MobileHomeBannerPreview({
  features,
  publicPayload,
  shopShowcase = null,
  highlightSectionKey = null,
  compact = false,
  showEditLinks = false,
  onRefresh,
  refreshing = false,
}) {
  const payload = useMemo(() => {
    if (publicPayload && typeof publicPayload === 'object') return publicPayload
    return toPreviewMobileFeatures(normalizeMobileFeatures(features || {}), shopShowcase)
  }, [features, publicPayload, shopShowcase])

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">App home preview</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Live preview of your current settings — same images and heights the app API will return after save.
          </p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <BusyButtonIcon busy={refreshing} icon={RefreshCw} size={14} />
            Refresh
          </button>
        ) : null}
      </div>

      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[2rem] border-[10px] border-slate-900 bg-slate-900 p-1 shadow-xl">
          <div className="overflow-hidden rounded-[1.35rem] bg-white">
            <div className="flex h-7 items-center justify-center bg-slate-900">
              <div className="h-1.5 w-16 rounded-full bg-slate-700" />
            </div>

            <div className="max-h-[520px] space-y-3 overflow-y-auto bg-slate-50 p-3">
              <div className="mb-1">
                <p className="text-[11px] font-bold text-slate-900">Home</p>
                <p className="text-[9px] text-slate-400">App preview · not the website</p>
              </div>

              {SECTION_ORDER.map((key) => {
                const meta = MOBILE_BANNER_SECTIONS[key]
                const section = payload[key] || toPublicBannerSection(key, {})
                const list = section[meta.listKey] || []
                const visible = Boolean(section.enabled) && list.length > 0
                const highlighted = highlightSectionKey === key

                return (
                  <div
                    key={key}
                    className={`rounded-xl p-1.5 transition ${
                      highlighted
                        ? 'ring-2 ring-sky-500 ring-offset-1'
                        : visible
                          ? 'bg-transparent'
                          : 'border border-dashed border-slate-200 bg-white/60'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        {meta.label}
                      </span>
                      {showEditLinks ? (
                        <Link
                          href={SECTION_HREF[key]}
                          className="text-[9px] font-semibold text-sky-700 hover:underline"
                        >
                          Edit
                        </Link>
                      ) : null}
                    </div>

                    {!visible ? (
                      <div className="flex h-12 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                        Hidden (disabled or empty)
                      </div>
                    ) : meta.isTiles ? (
                      <TileGrid tiles={list} />
                    ) : (
                      <SlideCarousel
                        slides={list}
                        heightPx={section.heightPx || meta.defaultHeightPx}
                        intervalSeconds={section.slideIntervalSeconds}
                        emptyLabel={`No ${meta.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                )
              })}

              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-2 py-3 text-center text-[9px] text-slate-400">
                Product / category sections from other home APIs appear below in the app
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
