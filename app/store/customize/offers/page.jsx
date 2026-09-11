'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'
import {
  Check,
  FolderTree,
  Languages,
  Loader2,
  Package,
  Percent,
  Save,
  Search,
} from 'lucide-react'
import BusyButtonIcon from '@/components/store/BusyButtonIcon'
import toast from 'react-hot-toast'
import { useAuth } from '@/lib/useAuth'
import PageSkeleton from '@/components/PageSkeleton'
import { getProductThumbnailUrl, normalizeProductImages } from '@/lib/productMedia'
import { PLACEHOLDER_IMAGE } from '@/lib/mediaUrls'
import {
  DEFAULT_OFFERS_NAV_STYLE,
  DEFAULT_OFFERS_PAGE,
  OFFERS_DISCOUNT_PRESETS,
  OFFERS_NAV_FONT_OPTIONS,
  getOffersNavButtonAppearance,
  getOffersPageSubtitle,
  normalizeOffersPage,
} from '@/lib/offersPageSettings'

const PRODUCTS_PER_PAGE = 24
const SAVE_TOAST_ID = 'offers-page-saved'

const SOURCE_OPTIONS = [
  { id: 'discount', label: 'By discount', icon: Percent, description: 'Auto products over a % off' },
  { id: 'manual', label: 'Manual', icon: Package, description: 'Search and pick products' },
  { id: 'category', label: 'Category', icon: FolderTree, description: 'Pull from categories' },
]

function normalizeProductId(productId) {
  return String(productId?._id || productId || '')
}

/** API returns every category at top level (with nested children). Use top-level only + unique ids. */
function buildUniqueCategoryOptions(rawCategories = []) {
  const byId = new Map()
  for (const item of Array.isArray(rawCategories) ? rawCategories : []) {
    const id = String(item?._id || item?.id || '').trim()
    const name = String(item?.name || '').trim()
    if (!id || !name || byId.has(id)) continue
    byId.set(id, { _id: id, name })
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function ProductThumb({ product, size = 64 }) {
  const [failed, setFailed] = useState(false)
  const mergedImages = [
    ...normalizeProductImages(product?.images),
    ...normalizeProductImages(product?.externalImages),
  ]
  const imageSrc = getProductThumbnailUrl(
    { ...product, images: mergedImages },
    { fallback: PLACEHOLDER_IMAGE }
  )
  const showImage = imageSrc && imageSrc !== PLACEHOLDER_IMAGE && !failed

  if (!showImage) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300"
        style={{ width: size, height: size }}
      >
        <Package size={Math.max(16, Math.round(size * 0.34))} />
      </div>
    )
  }

  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg bg-slate-100" style={{ width: size, height: size }}>
      <Image
        src={imageSrc}
        alt={product?.name || 'Product'}
        fill
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

export default function OffersCustomizePage() {
  const { getToken } = useAuth()
  const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [productsLoading, setProductsLoading] = useState(false)
  const [form, setForm] = useState(DEFAULT_OFFERS_PAGE)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [pagination, setPagination] = useState({ page: 1, limit: PRODUCTS_PER_PAGE, total: 0, totalPages: 1 })
  const [selectedProducts, setSelectedProducts] = useState([])
  const [translatingNav, setTranslatingNav] = useState(false)
  const [translatingCopy, setTranslatingCopy] = useState(false)
  const searchDebounceRef = useRef(null)
  const productsAbortRef = useRef(null)

  const selectedSet = useMemo(() => new Set(form.productIds.map(normalizeProductId)), [form.productIds])
  const selectedCategorySet = useMemo(
    () => new Set(form.categoryIds.map((id) => String(id))),
    [form.categoryIds]
  )
  const categoryOptions = useMemo(() => buildUniqueCategoryOptions(categories), [categories])

  const previewSubtitle = useMemo(() => getOffersPageSubtitle(form), [form])
  const navStyle = form.navStyle || DEFAULT_OFFERS_NAV_STYLE
  const navButtonPreview = useMemo(
    () => getOffersNavButtonAppearance(navStyle, 'desktop'),
    [navStyle]
  )

  const updateNavStyle = (patch) => {
    setForm((prev) => ({
      ...prev,
      navStyle: { ...(prev.navStyle || DEFAULT_OFFERS_NAV_STYLE), ...patch },
    }))
  }

  const fetchProductsPage = useCallback(async ({ page = 1, search = debouncedSearch } = {}) => {
    productsAbortRef.current?.abort()
    const controller = new AbortController()
    productsAbortRef.current = controller

    try {
      setProductsLoading(true)
      const token = await getToken()
      const { data } = await axios.get('/api/store/product', {
        params: {
          page,
          limit: PRODUCTS_PER_PAGE,
          search: search || undefined,
          sort: 'name',
        },
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setProducts(data.products || [])
      setPagination(data.pagination || {
        page: 1,
        limit: PRODUCTS_PER_PAGE,
        total: (data.products || []).length,
        totalPages: 1,
      })
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return
      toast.error('Failed to load products')
    } finally {
      if (!controller.signal.aborted) setProductsLoading(false)
    }
  }, [debouncedSearch, getToken])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const token = await getToken()
        const [{ data: appearance }, categoriesResponse] = await Promise.all([
          axios.get('/api/store/appearance/sections', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get('/api/store/categories').catch(() => ({ data: { categories: [] } })),
        ])

        setForm(normalizeOffersPage(appearance?.offersPage || DEFAULT_OFFERS_PAGE))
        setCategories(buildUniqueCategoryOptions(categoriesResponse?.data?.categories))
      } catch (error) {
        console.error(error)
        toast.error('Failed to load offers settings')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken])

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 350)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery])

  useEffect(() => {
    if (form.mode !== 'manual' || loading) return
    fetchProductsPage({ page: pagination.page, search: debouncedSearch })
  }, [form.mode, loading, pagination.page, debouncedSearch, fetchProductsPage])

  useEffect(() => {
    if (form.mode !== 'manual' || loading) return
    const ids = form.productIds.map(normalizeProductId).filter(Boolean)
    if (!ids.length) {
      setSelectedProducts([])
      return undefined
    }

    let cancelled = false
    const loadSelected = async () => {
      try {
        const token = await getToken()
        const { data } = await axios.get('/api/store/product', {
          params: { ids: ids.join(',') },
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!cancelled) setSelectedProducts(Array.isArray(data?.products) ? data.products : [])
      } catch {
        if (!cancelled) setSelectedProducts([])
      }
    }
    loadSelected()
    return () => {
      cancelled = true
    }
  }, [form.mode, form.productIds, loading, getToken])

  const toggleProduct = (productId) => {
    const id = normalizeProductId(productId)
    if (!id) return
    setForm((prev) => {
      const exists = prev.productIds.includes(id)
      return {
        ...prev,
        productIds: exists
          ? prev.productIds.filter((item) => item !== id)
          : [...prev.productIds, id],
      }
    })
  }

  const toggleCategory = (categoryId) => {
    const id = String(categoryId || '')
    if (!id) return
    setForm((prev) => {
      const exists = prev.categoryIds.includes(id)
      return {
        ...prev,
        categoryIds: exists
          ? prev.categoryIds.filter((item) => item !== id)
          : [...prev.categoryIds, id],
      }
    })
  }

  const translateTextToArabic = async (text, token, maxLength) => {
    const english = String(text || '').trim()
    if (!english) return ''
    const { data } = await axios.post(
      '/api/store/categories/translate-arabic',
      { text: english },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return String(data?.descriptionAr || '').trim().slice(0, maxLength)
  }

  const translatePageCopyToArabic = async () => {
    const eyebrow = String(form.eyebrow || '').trim()
    const title = String(form.title || '').trim()
    const subtitle = String(form.subtitle || '').trim() || String(previewSubtitle || '').trim()
    if (!eyebrow && !title && !subtitle) {
      toast.error('Enter English page copy first')
      return
    }

    try {
      setTranslatingCopy(true)
      const token = await getToken()
      if (!token) {
        toast.error('Please sign in again')
        return
      }

      const [eyebrowAr, titleAr, subtitleAr] = await Promise.all([
        translateTextToArabic(eyebrow, token, 160),
        translateTextToArabic(title, token, 160),
        translateTextToArabic(subtitle, token, 160),
      ])

      if (!eyebrowAr && !titleAr && !subtitleAr) {
        toast.error('Could not translate page copy to Arabic')
        return
      }

      setForm((prev) => ({
        ...prev,
        ...(eyebrowAr ? { eyebrowAr } : {}),
        ...(titleAr ? { titleAr } : {}),
        ...(subtitleAr ? { subtitleAr } : {}),
      }))
      toast.success('Arabic page copy updated')
    } catch (error) {
      console.error('Translate page copy failed:', error)
      toast.error(error?.response?.data?.error || 'Failed to translate to Arabic')
    } finally {
      setTranslatingCopy(false)
    }
  }

  const translateNavLabelToArabic = async () => {
    const english = String(form.navLabel || '').trim()
    if (!english) {
      toast.error('Enter the English navbar button first')
      return
    }

    try {
      setTranslatingNav(true)
      const token = await getToken()
      if (!token) {
        toast.error('Please sign in again')
        return
      }

      const { data } = await axios.post(
        '/api/store/categories/translate-arabic',
        { text: english },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const translated = String(data?.descriptionAr || '').trim().slice(0, 40)
      if (!translated) {
        toast.error('Could not translate to Arabic')
        return
      }

      setForm((prev) => ({ ...prev, navLabelAr: translated }))
      toast.success('Arabic navbar button updated')
    } catch (error) {
      console.error('Translate navbar button failed:', error)
      toast.error(error?.response?.data?.error || 'Failed to translate to Arabic')
    } finally {
      setTranslatingNav(false)
    }
  }

  const saveSettings = async () => {
    if (saving) return
    if (form.mode === 'manual' && form.productIds.length === 0) {
      toast.error('Select at least one product')
      return
    }
    if (form.mode === 'category' && form.categoryIds.length === 0) {
      toast.error('Select at least one category')
      return
    }

    try {
      setSaving(true)
      const token = await getToken()
      const payload = normalizeOffersPage(form)
      await axios.post(
        '/api/store/appearance/sections',
        { offersPage: payload },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      toast.success('Offers page saved. /offers will show this list now.', { id: SAVE_TOAST_ID })
    } catch (error) {
      console.error(error)
      toast.error('Failed to save offers page', { id: SAVE_TOAST_ID })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="-mx-3 -mt-3 min-h-full w-full max-w-full overflow-x-hidden bg-slate-50 pb-16 sm:-mx-4 sm:-mt-4 lg:-mx-5 lg:-mt-5">
      <div className="border-b border-rose-100 bg-gradient-to-r from-rose-600 via-red-500 to-orange-500 px-4 py-6 text-white sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Customize · /offers</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Today&apos;s Deals / Offers</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/85">
              Edit the page title and subtitle, then choose products by discount, search, or category.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/offers"
              target="_blank"
              className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Preview page
            </Link>
            <button
              type="button"
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
            >
              <span className="relative inline-flex h-4 w-4 items-center justify-center">
                <Loader2
                  size={16}
                  className={`absolute animate-spin ${saving ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                  aria-hidden={!saving}
                />
                <Save
                  size={16}
                  className={saving ? 'pointer-events-none opacity-0' : 'opacity-100'}
                  aria-hidden={saving}
                />
              </span>
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="bg-slate-900 p-5 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-red-300">{form.eyebrow || 'Hot Deals'}</p>
              <p className="mt-1 text-xl font-bold">{form.title || 'Special Offers'}</p>
                <p className="mt-2 text-sm text-white/70">{previewSubtitle}</p>
                {(form.eyebrowAr || form.titleAr || form.subtitleAr) ? (
                  <div className="mt-3 border-t border-white/15 pt-3" dir="rtl">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-300">{form.eyebrowAr || form.eyebrow}</p>
                    <p className="mt-1 text-lg font-bold">{form.titleAr || form.title}</p>
                    <p className="mt-2 text-sm text-white/70">{form.subtitleAr || getOffersPageSubtitle(form, 'ar')}</p>
                  </div>
                ) : null}
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
                  Navbar · /offers
                </p>
                <div className="mt-3 flex items-center">
                  <span
                    className="navbar-deals-btn inline-flex items-center font-extrabold uppercase tracking-[0.06em]"
                    data-font={navButtonPreview.fontId || 'inherit'}
                    style={{
                      ...navButtonPreview.style,
                      color: navButtonPreview.useShine
                        ? '#ffffff'
                        : navButtonPreview.textColor,
                    }}
                  >
                    {form.navLabel || "Today's Deals"}
                  </span>
                </div>
              </div>
            </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Page copy</h2>
              <button
                type="button"
                onClick={translatePageCopyToArabic}
                disabled={translatingCopy || (!String(form.eyebrow || '').trim() && !String(form.title || '').trim() && !String(form.subtitle || previewSubtitle || '').trim())}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BusyButtonIcon busy={translatingCopy} icon={Languages} size={12} />
                {translatingCopy ? 'Translating...' : 'Translate'}
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Eyebrow (English)</label>
                <input
                  type="text"
                  value={form.eyebrow}
                  onChange={(e) => setForm((prev) => ({ ...prev, eyebrow: e.target.value }))}
                  placeholder="Hot Deals"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Eyebrow (Arabic)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.eyebrowAr || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, eyebrowAr: e.target.value }))}
                  placeholder="عروض مميزة"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Title (English)</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Special Offers"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Title (Arabic)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.titleAr || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, titleAr: e.target.value }))}
                  placeholder="عروض خاصة"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Subtitle (English)</label>
                <textarea
                  rows={2}
                  value={form.subtitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
                  placeholder={previewSubtitle}
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Leave blank to auto-generate from the product source below.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Subtitle (Arabic)</label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={form.subtitleAr || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, subtitleAr: e.target.value }))}
                  placeholder={getOffersPageSubtitle(form, 'ar')}
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Navbar button (English)</label>
                <input
                  type="text"
                  value={form.navLabel}
                  onChange={(e) => setForm((prev) => ({ ...prev, navLabel: e.target.value }))}
                  placeholder="Today's Deals"
                  maxLength={40}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Display text only. The button always opens /offers — the URL never changes.
                </p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-slate-500">Navbar button (Arabic)</label>
                  <button
                    type="button"
                    onClick={translateNavLabelToArabic}
                    disabled={translatingNav || !String(form.navLabel || '').trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <BusyButtonIcon busy={translatingNav} icon={Languages} size={12} />
                    {translatingNav ? 'Translating...' : 'Translate'}
                  </button>
                </div>
                <input
                  type="text"
                  dir="rtl"
                  value={form.navLabelAr}
                  onChange={(e) => setForm((prev) => ({ ...prev, navLabelAr: e.target.value }))}
                  placeholder="عروض اليوم"
                  maxLength={40}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-xs font-semibold text-slate-800">Navbar button style</h3>
                <p className="mt-1 text-[11px] text-slate-400">
                  Changes the look of the header button only. The link stays /offers.
                </p>

                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-500">Font</span>
                    <select
                      value={navStyle.fontFamily || 'inherit'}
                      onChange={(e) => updateNavStyle({ fontFamily: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      {OFFERS_NAV_FONT_OPTIONS.map((font) => (
                        <option key={font.id} value={font.id}>
                          {font.label}
                        </option>
                      ))}
                    </select>
                    <p
                      className="navbar-deals-btn mt-2 text-sm font-semibold text-slate-800"
                      data-font={navStyle.fontFamily || 'inherit'}
                      style={{ fontFamily: navButtonPreview.style.fontFamily }}
                    >
                      {(form.navLabel || "Today's Deals")} · {OFFERS_NAV_FONT_OPTIONS.find((font) => font.id === (navStyle.fontFamily || 'inherit'))?.label || 'Default'}
                    </p>
                  </label>

                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                      Font size
                      <span className="tabular-nums text-slate-700">{navStyle.fontSize}px</span>
                    </span>
                    <input
                      type="range"
                      min={8}
                      max={22}
                      value={navStyle.fontSize}
                      onChange={(e) => updateNavStyle({ fontSize: Number(e.target.value) })}
                      className="w-full accent-rose-600"
                    />
                  </label>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">Font color</span>
                      <button
                        type="button"
                        onClick={() => updateNavStyle({ fontColorAuto: !navStyle.fontColorAuto })}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          navStyle.fontColorAuto
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        Auto
                      </button>
                    </div>
                    <div
                      className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 ${
                        navStyle.fontColorAuto ? 'opacity-50' : ''
                      }`}
                    >
                      <input
                        type="color"
                        value={navStyle.fontColor || '#ffffff'}
                        disabled={navStyle.fontColorAuto}
                        onChange={(e) => updateNavStyle({
                          fontColor: e.target.value,
                          fontColorAuto: false,
                        })}
                        className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                        aria-label="Font color"
                      />
                      <input
                        type="text"
                        value={navStyle.fontColorAuto ? 'auto' : navStyle.fontColor}
                        disabled={navStyle.fontColorAuto}
                        onChange={(e) => updateNavStyle({
                          fontColor: e.target.value,
                          fontColorAuto: false,
                        })}
                        className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                      Border
                      <span className="tabular-nums text-slate-700">{navStyle.borderWidth}px</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      value={navStyle.borderWidth}
                      onChange={(e) => updateNavStyle({ borderWidth: Number(e.target.value) })}
                      className="w-full accent-rose-600"
                    />
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                      <input
                        type="color"
                        value={navStyle.borderColor}
                        onChange={(e) => updateNavStyle({ borderColor: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                        aria-label="Border color"
                      />
                      <input
                        type="text"
                        value={navStyle.borderColor}
                        onChange={(e) => updateNavStyle({ borderColor: e.target.value })}
                        className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none"
                      />
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                      Border radius
                      <span className="tabular-nums text-slate-700">{navStyle.borderRadius}px</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={navStyle.borderRadius}
                      onChange={(e) => updateNavStyle({ borderRadius: Number(e.target.value) })}
                      className="w-full accent-rose-600"
                    />
                  </label>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">Background</span>
                      <button
                        type="button"
                        onClick={() => updateNavStyle({ backgroundTransparent: !navStyle.backgroundTransparent })}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          navStyle.backgroundTransparent
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        Transparent
                      </button>
                    </div>
                    <div
                      className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 ${
                        navStyle.backgroundTransparent ? 'opacity-50' : ''
                      }`}
                    >
                      <input
                        type="color"
                        value={navStyle.backgroundColor}
                        disabled={navStyle.backgroundTransparent}
                        onChange={(e) => updateNavStyle({
                          backgroundColor: e.target.value,
                          backgroundTransparent: false,
                        })}
                        className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed"
                        aria-label="Background color"
                      />
                      <input
                        type="text"
                        value={navStyle.backgroundTransparent ? 'transparent' : navStyle.backgroundColor}
                        disabled={navStyle.backgroundTransparent}
                        onChange={(e) => updateNavStyle({
                          backgroundColor: e.target.value,
                          backgroundTransparent: false,
                        })}
                        className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Product source</h2>
            <div className="grid grid-cols-1 gap-2">
              {SOURCE_OPTIONS.map((option) => {
                const Icon = option.icon
                const active = form.mode === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, mode: option.id }))}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-rose-300 bg-rose-50 ring-2 ring-rose-200'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <Icon size={16} className={active ? 'text-rose-600' : 'text-slate-400'} />
                    <p className={`mt-2 text-sm font-semibold ${active ? 'text-rose-900' : 'text-slate-800'}`}>
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{option.description}</p>
                  </button>
                )
              })}
            </div>

            {form.mode === 'discount' && (
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Minimum discount %</label>
                <div className="flex flex-wrap gap-2">
                  {OFFERS_DISCOUNT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, minDiscountPercent: preset }))}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        form.minDiscountPercent === preset
                          ? 'border-rose-400 bg-rose-50 text-rose-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {preset}%+
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  max={95}
                  value={form.minDiscountPercent}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    minDiscountPercent: Number(e.target.value) || 60,
                  }))}
                  className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {form.mode === 'manual' ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Select products</h2>
                    <p className="text-xs text-slate-500">
                      {form.productIds.length} selected · search by name or SKU · click Save to show them on /offers
                    </p>
                  </div>
                  <div className="relative w-full sm:max-w-xs">
                    <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name or SKU..."
                      className="w-full rounded-xl border border-slate-200 py-2.5 ps-9 pe-3 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </div>
                </div>
              </div>

              {form.productIds.length ? (
                <div className="border-b border-rose-100 bg-rose-50/70 px-4 py-3 sm:px-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Selected for /offers ({form.productIds.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.productIds.map((id) => {
                      const product = selectedProducts.find((item) => normalizeProductId(item) === id)
                        || products.find((item) => normalizeProductId(item) === id)
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleProduct(id)}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-rose-400"
                          title="Click to remove"
                        >
                          <span className="truncate">{product?.name || id.slice(-6)}</span>
                          <span className="text-rose-500">×</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-6">
                {productsLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 className="animate-spin" size={22} />
                  </div>
                ) : products.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {products.map((product) => {
                      const id = normalizeProductId(product)
                      const selected = selectedSet.has(id)
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleProduct(id)}
                          className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                            selected
                              ? 'border-rose-300 bg-rose-50 ring-2 ring-rose-200'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <ProductThumb product={product} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{product.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {currency} {Number(product.price || 0).toFixed(2)}
                            </p>
                          </div>
                          {selected ? <Check size={16} className="shrink-0 text-rose-600" /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No products found</p>
                )}
              </div>

              {pagination.totalPages > 1 ? (
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                  <button
                    type="button"
                    disabled={pagination.page <= 1 || productsLoading}
                    onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages || productsLoading}
                    onClick={() => setPagination((prev) => ({
                      ...prev,
                      page: Math.min(prev.totalPages, prev.page + 1),
                    }))}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          ) : form.mode === 'category' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900">Select categories</h2>
              <p className="mt-1 text-xs text-slate-500">
                {form.categoryIds.length} selected · products from these categories show on /offers
              </p>
              <div className="mt-4 grid max-h-[70vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {categoryOptions.length ? categoryOptions.map((category) => {
                  const id = category._id
                  const selected = selectedCategorySet.has(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleCategory(id)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                        selected
                          ? 'border-rose-300 bg-rose-50 font-semibold text-rose-900 ring-2 ring-rose-200'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {category.name || 'Untitled category'}
                    </button>
                  )
                }) : (
                  <p className="col-span-full py-12 text-center text-sm text-slate-500">No categories found</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <Percent className="mx-auto text-rose-500" size={28} />
              <h2 className="mt-3 text-base font-semibold text-slate-900">Discount mode</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                /offers will automatically list storefront products with more than {form.minDiscountPercent}% discount.
                Switch to Manual or Category to curate the list yourself.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
