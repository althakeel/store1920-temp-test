'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import toast from 'react-hot-toast'
import { GripVertical, Loader2, RefreshCw, Save } from 'lucide-react'
import BusyButtonIcon from '@/components/store/BusyButtonIcon'
import { useAuth } from '@/lib/useAuth'
import {
  getHomeLayoutSectionMeta,
  normalizeMobileHomeLayout,
} from '@/lib/mobileHomeApis'
import { normalizeMobileFeatures, toPreviewMobileFeatures } from '@/lib/mobileFeatures'

const BANNER_LAYOUT_IDS = {
  'banner-slider': 'bannerSlider',
  'small-banners': 'smallBanners',
  'promo-cards': 'promoCards',
  'tile-banners': 'tileBanners',
  'shop-showcase': 'bannerSlider', // show large banner mirror when website mode fills it
}

function BannerMediaPreview({ section, kind, label }) {
  const listKey = kind === 'tiles' ? 'tiles' : 'slides'
  const list = Array.isArray(section?.[listKey]) ? section[listKey].filter((i) => i?.image) : []
  const height = section?.heightPx || (kind === 'strip' ? 68 : kind === 'cards' ? 132 : 168)

  if (!section?.enabled || !list.length) {
    return (
      <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-100 text-[9px] text-slate-400">
        No images yet · {label}
      </div>
    )
  }

  if (kind === 'tiles') {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {list.slice(0, 4).map((tile, index) => (
          <div key={`${tile.image}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tile.image} alt={tile.title || label} className="aspect-[4/3] w-full object-cover" />
            {tile.title ? (
              <p className="truncate px-1 py-0.5 text-[8px] font-semibold text-slate-800">{tile.title}</p>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  const first = list[0]
  return (
    <div className="relative overflow-hidden rounded-lg bg-slate-200" style={{ height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={first.image} alt={first.title || label} className="h-full w-full object-cover" />
      {list.length > 1 ? (
        <div className="absolute inset-x-0 bottom-1 flex justify-center gap-1">
          {list.slice(0, 5).map((_, i) => (
            <span key={i} className={`h-1 w-1 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/50'}`} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PreviewBlock({ kind, label, enabled, bannerSection }) {
  if (!enabled) {
    return (
      <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-100 text-[9px] text-slate-400">
        Hidden · {label}
      </div>
    )
  }

  if (bannerSection && (kind === 'showcase' || kind === 'hero' || kind === 'strip' || kind === 'cards' || kind === 'tiles')) {
    return <BannerMediaPreview section={bannerSection} kind={kind === 'showcase' ? 'hero' : kind} label={label} />
  }

  if (kind === 'showcase' || kind === 'hero') {
    return (
      <div className="overflow-hidden rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 px-2 py-4 text-center text-[9px] font-semibold text-white">
        {label}
        <div className="mt-2 flex justify-center gap-1">
          <span className="h-1 w-1 rounded-full bg-white" />
          <span className="h-1 w-1 rounded-full bg-white/50" />
          <span className="h-1 w-1 rounded-full bg-white/50" />
        </div>
      </div>
    )
  }

  if (kind === 'strip') {
    return (
      <div className="flex h-10 items-center justify-center rounded-lg bg-amber-100 text-[9px] font-semibold text-amber-800">
        {label}
      </div>
    )
  }

  if (kind === 'cards') {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {[1, 2].map((n) => (
          <div key={n} className="rounded-lg bg-violet-100 px-1.5 py-3 text-center text-[8px] font-semibold text-violet-800">
            Card {n}
          </div>
        ))}
      </div>
    )
  }

  if (kind === 'tiles') {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="aspect-[4/3] rounded-lg bg-emerald-100 text-center text-[8px] font-semibold leading-[4.5rem] text-emerald-800">
            Tile {n}
          </div>
        ))}
      </div>
    )
  }

  if (kind === 'icons') {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="h-7 w-7 rounded-full bg-sky-100" />
            <span className="h-1 w-6 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    )
  }

  if (kind === 'products' || kind === 'deals' || kind === 'sliders') {
    return (
      <div className="space-y-1.5">
        <p className="text-[9px] font-semibold text-slate-700">{label}</p>
        <div className="flex gap-1.5 overflow-hidden">
          {[1, 2, 3].map((n) => (
            <div key={n} className="w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="aspect-square bg-slate-100" />
              <div className="space-y-0.5 p-1">
                <div className="h-1 rounded bg-slate-200" />
                <div className="h-1 w-2/3 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (kind === 'explore' || kind === 'categories') {
    return (
      <div className="space-y-1.5">
        <p className="text-[9px] font-semibold text-slate-700">{label}</p>
        <div className="flex flex-wrap gap-1">
          {['A', 'B', 'C', 'D', 'E'].map((chip) => (
            <span key={chip} className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-medium text-slate-600">
              {chip}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-3 text-center text-[9px] text-slate-500">
      {label}
    </div>
  )
}

/**
 * Full mobile home preview: same website home APIs + app banners.
 * Drag sections to reorder; order is saved for the mobile app via homeLayout.
 */
export default function MobileHomeLayoutPreview({
  homeLayout,
  bannerPayload = null,
  onChange,
  onSave,
  saving = false,
  onRefresh,
  refreshing = false,
}) {
  const layout = useMemo(
    () => normalizeMobileHomeLayout(homeLayout),
    [homeLayout],
  )
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  const moveSection = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId || !onChange) return
    const sections = [...layout.sections]
    const fromIndex = sections.findIndex((s) => s.id === fromId)
    const toIndex = sections.findIndex((s) => s.id === toId)
    if (fromIndex < 0 || toIndex < 0) return
    const [moved] = sections.splice(fromIndex, 1)
    sections.splice(toIndex, 0, moved)
    onChange({ sections })
  }, [layout.sections, onChange])

  const toggleEnabled = (id) => {
    if (!onChange) return
    onChange({
      sections: layout.sections.map((s) => (
        s.id === id ? { ...s, enabled: !s.enabled } : s
      )),
    })
  }

  const resolveBannerSection = (layoutId) => {
    const key = BANNER_LAYOUT_IDS[layoutId]
    if (!key || !bannerPayload) return null
    return bannerPayload[key] || null
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">App home preview</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Same website home APIs + app banners. Drag to reorder — the mobile app reads this order from{' '}
            <code className="rounded bg-slate-100 px-1 text-[10px]">homeLayout</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <BusyButtonIcon busy={refreshing} icon={RefreshCw} size={12} />
              Refresh
            </button>
          ) : null}
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              <BusyButtonIcon busy={saving} icon={Save} size={12} />
              Save order
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[2rem] border-[10px] border-slate-900 bg-slate-900 p-1 shadow-xl">
          <div className="overflow-hidden rounded-[1.35rem] bg-white">
            <div className="flex h-7 items-center justify-center bg-slate-900">
              <div className="h-1.5 w-16 rounded-full bg-slate-700" />
            </div>

            <div className="max-h-[560px] space-y-2 overflow-y-auto bg-slate-50 p-2.5">
              <div className="mb-1 px-0.5">
                <p className="text-[11px] font-bold text-slate-900">Home</p>
                <p className="text-[9px] text-slate-400">Drag blocks · same APIs as website</p>
              </div>

              {layout.sections.map((item) => {
                const meta = getHomeLayoutSectionMeta(item.id)
                if (!meta) return null
                const isOver = overId === item.id && dragId && dragId !== item.id

                return (
                  <div
                    key={item.id}
                    draggable={Boolean(onChange)}
                    onDragStart={(e) => {
                      setDragId(item.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', item.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverId(null)
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (overId !== item.id) setOverId(item.id)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const fromId = e.dataTransfer.getData('text/plain') || dragId
                      moveSection(fromId, item.id)
                      setDragId(null)
                      setOverId(null)
                    }}
                    className={`rounded-xl border bg-white p-1.5 transition ${
                      dragId === item.id ? 'opacity-50' : ''
                    } ${
                      isOver ? 'border-sky-400 ring-2 ring-sky-200' : 'border-slate-200'
                    } ${onChange ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <div className="mb-1 flex items-center gap-1 px-0.5">
                      {onChange ? (
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        {meta.shortLabel}
                      </span>
                      {meta.sameAsWebsite ? (
                        <span className="rounded bg-emerald-50 px-1 py-0.5 text-[8px] font-semibold text-emerald-700">
                          Web API
                        </span>
                      ) : (
                        <span className="rounded bg-sky-50 px-1 py-0.5 text-[8px] font-semibold text-sky-700">
                          App
                        </span>
                      )}
                      {onChange ? (
                        <label className="inline-flex items-center gap-1 text-[8px] font-medium text-slate-500">
                          <input
                            type="checkbox"
                            checked={item.enabled !== false}
                            onChange={() => toggleEnabled(item.id)}
                            className="h-3 w-3 rounded border-slate-300 text-sky-600"
                            onClick={(e) => e.stopPropagation()}
                          />
                          On
                        </label>
                      ) : null}
                    </div>

                    <PreviewBlock
                      kind={meta.previewKind}
                      label={meta.shortLabel}
                      enabled={item.enabled !== false}
                      bannerSection={resolveBannerSection(item.id)}
                    />

                    <p className="mt-1 truncate px-0.5 font-mono text-[8px] text-slate-400">
                      {meta.method} {meta.path}
                    </p>
                    {meta.configureHref ? (
                      <Link
                        href={meta.configureHref}
                        className="mt-0.5 inline-block px-0.5 text-[9px] font-semibold text-sky-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Configure
                      </Link>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Loads + saves homeLayout for the mobile-features hub. */
export function MobileHomeLayoutPreviewConnected() {
  const { getToken } = useAuth()
  const [features, setFeatures] = useState(() => normalizeMobileFeatures())
  const [shopShowcase, setShopShowcase] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const bannerPayload = useMemo(
    () => toPreviewMobileFeatures(features, shopShowcase),
    [features, shopShowcase],
  )

  const load = useCallback(async ({ soft = false } = {}) => {
    try {
      if (soft) setRefreshing(true)
      else setLoading(true)
      const token = await getToken()
      const [featuresRes, showcaseRes] = await Promise.all([
        axios.get('/api/store/mobile-features', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get('/api/store/preferences/shop-showcase', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: null })),
      ])
      setFeatures(normalizeMobileFeatures(featuresRes.data?.mobileFeatures))
      setShopShowcase(showcaseRes.data?.shopShowcase || showcaseRes.data || null)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load home layout')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
    try {
      setSaving(true)
      const token = await getToken()
      await axios.put(
        '/api/store/mobile-features',
        { mobileFeatures: { homeLayout: features.homeLayout } },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      toast.success('Home order saved for the mobile app')
      await load({ soft: true })
    } catch (error) {
      console.error(error)
      toast.error(error?.response?.data?.error || 'Failed to save order')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
      </div>
    )
  }

  return (
    <MobileHomeLayoutPreview
      homeLayout={features.homeLayout}
      bannerPayload={bannerPayload}
      onChange={(homeLayout) => setFeatures((prev) => ({ ...prev, homeLayout }))}
      onSave={save}
      saving={saving}
      onRefresh={() => load({ soft: true })}
      refreshing={refreshing}
    />
  )
}
