'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/useAuth'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import Image from 'next/image'
import PageSkeleton from '@/components/PageSkeleton'
import { getProductThumbnailUrl, normalizeProductImages } from '@/lib/productMedia'
import { PLACEHOLDER_IMAGE } from '@/lib/mediaUrls'
import {
    Save,
    Loader,
    Package,
    Search,
    LayoutGrid,
    Tag,
    FolderTree,
    Sparkles,
    Clock,
    Check,
    Rows3,
    Columns3,
    Eye,
    Languages,
} from 'lucide-react'

const FEATURED_SAVE_TOAST_ID = 'featured-section-saved'

const SOURCE_OPTIONS = [
    { id: 'manual', label: 'Manual', icon: Package, description: 'Pick products yourself' },
    { id: 'category', label: 'Category', icon: FolderTree, description: 'Pull from categories' },
    { id: 'tag', label: 'Tags', icon: Tag, description: 'Match product tags' },
    { id: 'latest', label: 'Latest', icon: Clock, description: 'Newest catalog items' },
]

const PRODUCTS_PER_PAGE = 24
const PREVIEW_DEBOUNCE_MS = 450

function normalizeProductId(productId) {
    return String(productId?._id || productId || '')
}

function buildPreviewFromSelection(selectedIds, productPool = []) {
    const poolMap = new Map(productPool.map((product) => [normalizeProductId(product), product]))
    return selectedIds
        .slice(0, 5)
        .map((id) => poolMap.get(normalizeProductId(id)))
        .filter(Boolean)
}

function ProductThumb({ product, size = 72 }) {
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
                className="flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300"
                style={{ width: size, height: size }}
            >
                <Package size={Math.max(18, Math.round(size * 0.34))} />
            </div>
        )
    }

    return (
        <div
            className="relative shrink-0 overflow-hidden rounded-xl bg-slate-100"
            style={{ width: size, height: size }}
        >
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

export default function HomePreferences() {
    const { getToken } = useAuth()
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED'
    const [activeTab, setActiveTab] = useState('products')
    const [products, setProducts] = useState([])
    const [previewProducts, setPreviewProducts] = useState([])
    const [categories, setCategories] = useState([])
    const [selectedProducts, setSelectedProducts] = useState([])
    const [sourceMode, setSourceMode] = useState('manual')
    const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
    const [selectedTagsText, setSelectedTagsText] = useState('')
    const [loading, setLoading] = useState(true)
    const [productsLoading, setProductsLoading] = useState(false)
    const [selectingAll, setSelectingAll] = useState(false)
    const [saving, setSaving] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [sortBy, setSortBy] = useState('name')
    const [pagination, setPagination] = useState({ page: 1, limit: PRODUCTS_PER_PAGE, total: 0, totalPages: 1 })
    const searchDebounceRef = useRef(null)
    const previewDebounceRef = useRef(null)
    const productsAbortRef = useRef(null)
    const previewCacheRef = useRef(new Map())
    const skipNextProductsFetchRef = useRef(false)
    const [featuredSectionTitle, setFeaturedSectionTitle] = useState('Craziest sale of the year!')
    const [featuredSectionSubtitle, setFeaturedSectionSubtitle] = useState('Select products to display in the featured section on your home page')
    const [featuredSectionTitleAr, setFeaturedSectionTitleAr] = useState('')
    const [featuredSectionSubtitleAr, setFeaturedSectionSubtitleAr] = useState('')
    const [translatingCopy, setTranslatingCopy] = useState(false)

    const [designSettings, setDesignSettings] = useState({
        categorySliders: { enabled: true, title: 'Featured Collections', description: 'Browse our curated collections' },
        carouselSlider: { enabled: true, autoPlay: true, interval: 5, showControls: true },
        dealsOfTheDay: { enabled: true, title: 'Deals of the Day', discount: 50 },
        sitemapCategories: { enabled: true, columnsPerRow: 4 },
        homeMenuCategories: { enabled: true, style: 'grid', itemsPerRow: 5, rows: 2 },
        navbarMenu: { enabled: true, position: 'top', style: 'horizontal' },
    })

    const cachePreviewProducts = useCallback((items = []) => {
        for (const product of items) {
            previewCacheRef.current.set(normalizeProductId(product), product)
        }
    }, [])

    const fetchPreviewProducts = useCallback(async (productIds = [], productPool = []) => {
        const ids = productIds.slice(0, 5).map(normalizeProductId).filter(Boolean)
        if (!ids.length) {
            setPreviewProducts([])
            return
        }

        cachePreviewProducts(productPool)

        const localPreview = ids
            .map((id) => previewCacheRef.current.get(id))
            .filter(Boolean)

        if (localPreview.length === ids.length) {
            setPreviewProducts(localPreview)
            return
        }

        const missingIds = ids.filter((id) => !previewCacheRef.current.has(id))
        if (!missingIds.length) {
            setPreviewProducts(localPreview)
            return
        }

        try {
            const token = await getToken()
            const { data } = await axios.get('/api/store/product', {
                params: { ids: missingIds.join(',') },
                headers: { Authorization: `Bearer ${token}` },
            })
            cachePreviewProducts(data.products || [])
            setPreviewProducts(ids.map((id) => previewCacheRef.current.get(id)).filter(Boolean))
        } catch {
            setPreviewProducts(buildPreviewFromSelection(ids, productPool))
        }
    }, [cachePreviewProducts, getToken])

    const fetchProductsPage = useCallback(async ({
        page = 1,
        search = debouncedSearch,
        sort = sortBy,
        silent = false,
    } = {}) => {
        productsAbortRef.current?.abort()
        const controller = new AbortController()
        productsAbortRef.current = controller

        try {
            if (!silent) setProductsLoading(true)
            const token = await getToken()
            const { data } = await axios.get('/api/store/home-preferences', {
                params: {
                    productsOnly: 'true',
                    page,
                    limit: PRODUCTS_PER_PAGE,
                    search: search || undefined,
                    sort,
                },
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })

            if (controller.signal.aborted) return

            const nextProducts = data.products || []
            setProducts(nextProducts)
            cachePreviewProducts(nextProducts)
            setPagination(data.pagination || {
                page: 1,
                limit: PRODUCTS_PER_PAGE,
                total: nextProducts.length,
                totalPages: 1,
            })
        } catch (error) {
            if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return
            toast.error('Failed to load products')
            console.error(error)
        } finally {
            if (!controller.signal.aborted) {
                setProductsLoading(false)
            }
        }
    }, [cachePreviewProducts, debouncedSearch, getToken, sortBy])

    const fetchInitialData = async () => {
        try {
            setLoading(true)
            const token = await getToken()

            const { data } = await axios.get('/api/store/home-preferences', {
                params: {
                    page: 1,
                    limit: PRODUCTS_PER_PAGE,
                    sort: sortBy,
                },
                headers: { Authorization: `Bearer ${token}` },
            })

            const featuredData = data.featured || {}
            const initialSelected = (featuredData.productIds || []).map(normalizeProductId)

            setCategories(data.categories || [])
            setSelectedProducts(initialSelected)
            setSourceMode(featuredData.sourceMode || 'manual')
            setSelectedCategoryIds(featuredData.categoryIds || [])
            setSelectedTagsText(Array.isArray(featuredData.tags) ? featuredData.tags.join(', ') : '')
            if (featuredData.sectionTitle) setFeaturedSectionTitle(featuredData.sectionTitle)
            if (featuredData.sectionDescription) setFeaturedSectionSubtitle(featuredData.sectionDescription)
            setFeaturedSectionTitleAr(featuredData.sectionTitleAr || '')
            setFeaturedSectionSubtitleAr(featuredData.sectionDescriptionAr || '')

            if (data.appearance?.homeMenuCategories) {
                const nextLayout = data.appearance.homeMenuCategories
                const nextStyle = nextLayout.style === 'carousel' || nextLayout.style === 'horizontal'
                    ? 'carousel'
                    : 'grid'
                setDesignSettings((prev) => ({
                    ...prev,
                    homeMenuCategories: {
                        ...prev.homeMenuCategories,
                        ...nextLayout,
                        style: nextStyle,
                    },
                }))
            }

            const initialProducts = data.products || []
            setProducts(initialProducts)
            cachePreviewProducts(initialProducts)
            cachePreviewProducts(data.previewProducts || [])
            setPreviewProducts(data.previewProducts || buildPreviewFromSelection(initialSelected, initialProducts))
            setPagination(data.pagination || {
                page: 1,
                limit: PRODUCTS_PER_PAGE,
                total: initialProducts.length,
                totalPages: 1,
            })
            skipNextProductsFetchRef.current = true
        } catch (error) {
            toast.error('Failed to load data')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchInitialData()
    }, [])

    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchQuery.trim())
            setPagination((current) => ({ ...current, page: 1 }))
        }, 300)
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        }
    }, [searchQuery])

    useEffect(() => {
        if (loading || sourceMode !== 'manual') return
        if (skipNextProductsFetchRef.current) {
            skipNextProductsFetchRef.current = false
            return
        }
        fetchProductsPage({ page: pagination.page, search: debouncedSearch, sort: sortBy, silent: pagination.page > 1 })
    }, [loading, sourceMode, pagination.page, debouncedSearch, sortBy, fetchProductsPage])

    useEffect(() => {
        if (sourceMode !== 'manual') return

        const localPreview = buildPreviewFromSelection(selectedProducts, [
            ...products,
            ...Array.from(previewCacheRef.current.values()),
        ])
        if (localPreview.length) {
            setPreviewProducts(localPreview)
        }

        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
        previewDebounceRef.current = setTimeout(() => {
            fetchPreviewProducts(selectedProducts, products)
        }, PREVIEW_DEBOUNCE_MS)

        return () => {
            if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
        }
    }, [selectedProducts, sourceMode, products, fetchPreviewProducts])

    const toggleProduct = (productId) => {
        const id = normalizeProductId(productId)
        const product = products.find((item) => normalizeProductId(item) === id)
        if (product) {
            previewCacheRef.current.set(id, product)
        }
        setSelectedProducts((prev) => (
            prev.includes(id)
                ? prev.filter((existingId) => existingId !== id)
                : [...prev, id]
        ))
    }

    const selectCurrentPage = () => {
        const pageIds = products.map((product) => normalizeProductId(product))
        setSelectedProducts((prev) => Array.from(new Set([...prev, ...pageIds])))
    }

    const selectAllProducts = async () => {
        try {
            setSelectingAll(true)
            const token = await getToken()
            const { data } = await axios.get('/api/store/product', {
                params: {
                    idsOnly: 'true',
                    search: debouncedSearch || undefined,
                },
                headers: { Authorization: `Bearer ${token}` },
            })
            setSelectedProducts((prev) => Array.from(new Set([...prev, ...(data.productIds || [])])))
            toast.success(`Selected ${data.total || 0} product(s)`)
        } catch {
            toast.error('Failed to select all products')
        } finally {
            setSelectingAll(false)
        }
    }

    const toggleCategory = (categoryId) => {
        setSelectedCategoryIds((prev) => (
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId]
        ))
    }

    const translateFeaturedCopyToArabic = async () => {
        const englishTitle = String(featuredSectionTitle || '').trim()
        const englishSubtitle = String(featuredSectionSubtitle || '').trim()
        if (!englishTitle && !englishSubtitle) {
            toast.error('Enter English title or subtitle first')
            return
        }

        try {
            setTranslatingCopy(true)
            const token = await getToken()
            if (!token) {
                toast.error('Please sign in again')
                return
            }

            const translateText = async (text) => {
                if (!text) return ''
                const { data } = await axios.post(
                    '/api/store/categories/translate-arabic',
                    { text },
                    { headers: { Authorization: `Bearer ${token}` } }
                )
                return String(data?.descriptionAr || '').trim()
            }

            const [titleAr, subtitleAr] = await Promise.all([
                translateText(englishTitle),
                translateText(englishSubtitle),
            ])

            if (!titleAr && !subtitleAr) {
                toast.error('Could not translate to Arabic')
                return
            }

            if (titleAr) setFeaturedSectionTitleAr(titleAr)
            if (subtitleAr) setFeaturedSectionSubtitleAr(subtitleAr)
            toast.success('Arabic fields updated', { id: 'featured-copy-translated' })
        } catch (error) {
            console.error('Translate featured copy failed:', error)
            toast.error(error?.response?.data?.error || 'Failed to translate to Arabic')
        } finally {
            setTranslatingCopy(false)
        }
    }

    const saveFeaturedProducts = async () => {
        if (saving) return

        try {
            const normalizedTags = selectedTagsText
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)

            if (sourceMode === 'manual' && selectedProducts.length === 0) {
                toast.error('Select at least one product')
                return
            }

            if (sourceMode === 'category' && selectedCategoryIds.length === 0) {
                toast.error('Select at least one category')
                return
            }

            if (sourceMode === 'tag' && normalizedTags.length === 0) {
                toast.error('Add at least one tag')
                return
            }

            setSaving(true)
            const token = await getToken()
            const layoutStyle = designSettings.homeMenuCategories?.style === 'carousel' ? 'carousel' : 'grid'
            const layoutRows = layoutStyle === 'carousel'
                ? 1
                : Number(designSettings.homeMenuCategories?.rows || 2)
            await axios.post('/api/store/featured-products',
                {
                    productIds: selectedProducts,
                    sourceMode,
                    categoryIds: selectedCategoryIds,
                    tags: normalizedTags,
                    sectionTitle: featuredSectionTitle,
                    sectionDescription: featuredSectionSubtitle,
                    sectionTitleAr: featuredSectionTitleAr,
                    sectionDescriptionAr: featuredSectionSubtitleAr,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            await axios.post('/api/store/appearance/sections',
                {
                    ...designSettings,
                    homeMenuCategories: {
                        ...designSettings.homeMenuCategories,
                        style: layoutStyle,
                        itemsPerRow: Number(designSettings.homeMenuCategories?.itemsPerRow || 5),
                        rows: layoutRows,
                    },
                },
                { headers: { Authorization: `Bearer ${token}` } }
            )

            if (typeof window !== 'undefined') {
                const payload = {
                    sectionTitle: featuredSectionTitle,
                    sectionDescription: featuredSectionSubtitle,
                    sectionTitleAr: featuredSectionTitleAr,
                    sectionDescriptionAr: featuredSectionSubtitleAr,
                    layout: {
                        style: layoutStyle,
                        itemsPerRow: Number(designSettings.homeMenuCategories?.itemsPerRow || 5),
                        rows: layoutRows,
                    },
                    updatedAt: Date.now(),
                }
                window.localStorage.setItem('featuredSectionLive', JSON.stringify(payload))
                window.dispatchEvent(new CustomEvent('featuredSectionLiveUpdate', { detail: payload }))
            }
            toast.success('Featured section saved', { id: FEATURED_SAVE_TOAST_ID })
        } catch (error) {
            toast.error('Failed to save featured products', { id: FEATURED_SAVE_TOAST_ID })
            console.error(error)
        } finally {
            setSaving(false)
        }
    }

    const saveDesignSettings = async () => {
        try {
            setSaving(true)
            const token = await getToken()
            await axios.post('/api/store/appearance/sections',
                designSettings,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            toast.success('Home design settings saved successfully')
        } catch (error) {
            toast.error('Failed to save design settings')
            console.error(error)
        } finally {
            setSaving(false)
        }
    }

    const selectedTags = selectedTagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

    const selectedIdSet = useMemo(
        () => new Set(selectedProducts.map(normalizeProductId)),
        [selectedProducts]
    )

    const sourceSummary = sourceMode === 'manual'
        ? `${selectedProducts.length} selected`
        : sourceMode === 'category'
            ? `${selectedCategoryIds.length} categories`
            : sourceMode === 'tag'
                ? `${selectedTags.length} tags`
                : 'Auto from latest'

    const previewItems = sourceMode === 'manual'
        ? previewProducts
        : products.slice(0, 5)

    if (loading) {
        return <PageSkeleton />
    }

    return (
        <div className="-mx-3 -mt-3 min-h-full w-full max-w-full overflow-x-hidden bg-white pb-16 sm:-mx-4 sm:-mt-4 lg:-mx-5 lg:-mt-5">
            {/* Header */}
            <div className="border-b border-slate-200 bg-white">
                <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-6">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                            <Sparkles size={14} />
                            Storefront
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                            Section 1 - home page
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Configure your featured section title, product source, and layout.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                            <span className="text-slate-500">Source:</span>{' '}
                            <span className="font-semibold text-slate-800">{sourceSummary}</span>
                        </div>
                        <button
                            type="button"
                            onClick={saveFeaturedProducts}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <Loader size={16} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Save changes
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
                {activeTab === 'products' && (
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] xl:gap-8">
                        {/* Left panel — settings */}
                        <div className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
                            {/* Live preview */}
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <Eye size={14} />
                                    Storefront preview
                                </div>
                                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-violet-900 p-5 text-white">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">English</p>
                                    <p className="text-lg font-bold leading-tight">{featuredSectionTitle || 'Section title'}</p>
                                    <p className="mt-1 text-sm text-white/70">{featuredSectionSubtitle || 'Section subtitle'}</p>
                                    <div className="mt-4 border-t border-white/10 pt-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Arabic</p>
                                        <p dir="rtl" lang="ar" className="mt-1 text-lg font-bold leading-tight">
                                            {featuredSectionTitleAr || 'عنوان القسم'}
                                        </p>
                                        <p dir="rtl" lang="ar" className="mt-1 text-sm text-white/70">
                                            {featuredSectionSubtitleAr || 'وصف القسم'}
                                        </p>
                                    </div>
                                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                        {(previewItems.length ? previewItems : [1, 2, 3, 4, 5]).map((item, index) => (
                                            <div
                                                key={typeof item === 'object' ? item._id : index}
                                                className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/20"
                                            >
                                                {typeof item === 'object' ? (
                                                    <ProductThumb product={item} size={52} />
                                                ) : (
                                                    <div className="h-full w-full animate-pulse bg-white/10" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="mt-3 text-[11px] text-white/50">
                                        {designSettings.homeMenuCategories?.style === 'carousel' ? 'carousel' : 'grid'} ·{' '}
                                        {designSettings.homeMenuCategories?.itemsPerRow || 5}
                                        {designSettings.homeMenuCategories?.style === 'carousel'
                                            ? ' cards visible'
                                            : ` per row · ${designSettings.homeMenuCategories?.rows || 2} rows`}
                                    </p>
                                </div>
                            </div>

                            {/* Section copy */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-sm font-semibold text-slate-900">Section copy</h2>
                                    <button
                                        type="button"
                                        onClick={translateFeaturedCopyToArabic}
                                        disabled={translatingCopy}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {translatingCopy ? <Loader size={13} className="animate-spin" /> : <Languages size={13} />}
                                        Translate to Arabic
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-500">Title (English)</label>
                                        <input
                                            type="text"
                                            value={featuredSectionTitle}
                                            onChange={(e) => setFeaturedSectionTitle(e.target.value)}
                                            placeholder="Top picks for you"
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-500">Subtitle (English)</label>
                                        <textarea
                                            value={featuredSectionSubtitle}
                                            onChange={(e) => setFeaturedSectionSubtitle(e.target.value)}
                                            placeholder="Grab the best deals before they're gone!"
                                            rows={2}
                                            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-500">Title (Arabic)</label>
                                        <input
                                            type="text"
                                            dir="rtl"
                                            lang="ar"
                                            value={featuredSectionTitleAr}
                                            onChange={(e) => setFeaturedSectionTitleAr(e.target.value)}
                                            placeholder="عنوان القسم"
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-500">Subtitle (Arabic)</label>
                                        <textarea
                                            dir="rtl"
                                            lang="ar"
                                            value={featuredSectionSubtitleAr}
                                            onChange={(e) => setFeaturedSectionSubtitleAr(e.target.value)}
                                            placeholder="وصف القسم"
                                            rows={2}
                                            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Product source */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                                <h2 className="mb-4 text-sm font-semibold text-slate-900">Product source</h2>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                                    {SOURCE_OPTIONS.map((option) => {
                                        const Icon = option.icon
                                        const active = sourceMode === option.id
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => {
                                                    setSourceMode(option.id)
                                                    if (option.id === 'manual') {
                                                        setPagination((current) => ({ ...current, page: 1 }))
                                                    }
                                                }}
                                                className={`rounded-xl border p-3 text-left transition ${
                                                    active
                                                        ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                                }`}
                                            >
                                                <Icon size={16} className={active ? 'text-violet-600' : 'text-slate-400'} />
                                                <p className={`mt-2 text-sm font-semibold ${active ? 'text-violet-900' : 'text-slate-800'}`}>
                                                    {option.label}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-slate-500">{option.description}</p>
                                            </button>
                                        )
                                    })}
                                </div>

                                {sourceMode === 'category' && (
                                    <div className="mt-4">
                                        <label className="mb-2 block text-xs font-medium text-slate-500">Categories</label>
                                        <div className="max-h-48 space-y-1.5 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                                            {categories.length === 0 ? (
                                                <p className="px-2 py-3 text-sm text-slate-500">No categories found</p>
                                            ) : (
                                                categories.map((category) => {
                                                    const checked = selectedCategoryIds.includes(category.id)
                                                    return (
                                                        <button
                                                            key={category.id}
                                                            type="button"
                                                            onClick={() => toggleCategory(category.id)}
                                                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                                                                checked ? 'bg-violet-100 text-violet-900' : 'bg-white text-slate-700 hover:bg-slate-100'
                                                            }`}
                                                            style={{ paddingLeft: `${8 + category.depth * 12}px` }}
                                                        >
                                                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                                checked ? 'border-violet-500 bg-violet-500 text-white' : 'border-slate-300'
                                                            }`}>
                                                                {checked ? <Check size={10} /> : null}
                                                            </span>
                                                            {category.name}
                                                        </button>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}

                                {sourceMode === 'tag' && (
                                    <div className="mt-4">
                                        <label className="mb-2 block text-xs font-medium text-slate-500">Tags</label>
                                        <input
                                            type="text"
                                            value={selectedTagsText}
                                            onChange={(e) => setSelectedTagsText(e.target.value)}
                                            placeholder="summer, sale, new-arrivals"
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                        <p className="mt-1.5 text-[11px] text-slate-400">Comma-separated tags</p>
                                    </div>
                                )}

                                {sourceMode === 'latest' && (
                                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                                        Newest products appear automatically. Manual selection is ignored.
                                    </div>
                                )}
                            </div>

                            {/* Layout */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                                    <LayoutGrid size={16} />
                                    Layout
                                </h2>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-medium text-slate-500">Display style</label>
                                        <select
                                            value={designSettings.homeMenuCategories.style === 'carousel' ? 'carousel' : 'grid'}
                                            onChange={(e) => {
                                                const nextStyle = e.target.value === 'carousel' ? 'carousel' : 'grid'
                                                setDesignSettings({
                                                    ...designSettings,
                                                    homeMenuCategories: {
                                                        ...designSettings.homeMenuCategories,
                                                        style: nextStyle,
                                                        ...(nextStyle === 'carousel' ? { rows: 1 } : {}),
                                                    },
                                                })
                                            }}
                                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        >
                                            <option value="grid">Grid</option>
                                            <option value="carousel">Carousel</option>
                                        </select>
                                    </div>
                                    <div className={`grid gap-3 ${designSettings.homeMenuCategories.style === 'carousel' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                                                <Columns3 size={12} />
                                                {designSettings.homeMenuCategories.style === 'carousel' ? 'Cards visible' : 'Per row'}
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={designSettings.homeMenuCategories.itemsPerRow}
                                                onChange={(e) => setDesignSettings({
                                                    ...designSettings,
                                                    homeMenuCategories: {
                                                        ...designSettings.homeMenuCategories,
                                                        itemsPerRow: parseInt(e.target.value, 10) || 5,
                                                    },
                                                })}
                                                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                            />
                                        </div>
                                        {designSettings.homeMenuCategories.style !== 'carousel' && (
                                            <div>
                                                <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-500">
                                                    <Rows3 size={12} />
                                                    Rows
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="6"
                                                    value={designSettings.homeMenuCategories.rows || 2}
                                                    onChange={(e) => setDesignSettings({
                                                        ...designSettings,
                                                        homeMenuCategories: {
                                                            ...designSettings.homeMenuCategories,
                                                            rows: parseInt(e.target.value, 10) || 2,
                                                        },
                                                    })}
                                                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right panel — product picker */}
                        <div className="min-w-0">
                            {sourceMode === 'manual' ? (
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            <div>
                                                <h2 className="text-base font-semibold text-slate-900">Select products</h2>
                                                <p className="text-xs text-slate-500">
                                                    {selectedProducts.length} selected · {pagination.total} total products
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={selectCurrentPage}
                                                    disabled={productsLoading || !products.length}
                                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    Select page
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={selectAllProducts}
                                                    disabled={selectingAll || productsLoading}
                                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    {selectingAll ? 'Selecting...' : `Select all${debouncedSearch ? ' matching' : ''}`}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedProducts([])}
                                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px] lg:grid-cols-[1fr_200px]">
                                            <div className="relative">
                                                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Search name or SKU..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                                />
                                            </div>
                                            <select
                                                value={sortBy}
                                                onChange={(e) => {
                                                    setSortBy(e.target.value)
                                                    setPagination((current) => ({ ...current, page: 1 }))
                                                }}
                                                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                            >
                                                <option value="name">Name A–Z</option>
                                                <option value="price">Price low–high</option>
                                                <option value="newest">Newest first</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="relative p-4 sm:p-6">
                                        {productsLoading ? (
                                            <div className="flex items-center justify-center py-20">
                                                <Loader size={28} className="animate-spin text-violet-500" />
                                            </div>
                                        ) : products.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                                <Package size={40} className="text-slate-300" />
                                                <p className="mt-3 text-sm font-medium text-slate-600">No products found</p>
                                                <p className="text-xs text-slate-400">Try a different search term</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                                                {products.map((product) => {
                                                    const productId = normalizeProductId(product)
                                                    const isSelected = selectedIdSet.has(productId)
                                                    return (
                                                        <button
                                                            key={productId}
                                                            type="button"
                                                            onClick={() => toggleProduct(productId)}
                                                            className={`group relative rounded-2xl border p-3 text-left transition ${
                                                                isSelected
                                                                    ? 'border-violet-400 bg-violet-50/60 ring-2 ring-violet-200'
                                                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                                                            }`}
                                                        >
                                                            <span className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border transition ${
                                                                isSelected
                                                                    ? 'border-violet-500 bg-violet-500 text-white'
                                                                    : 'border-slate-300 bg-white text-transparent group-hover:border-slate-400'
                                                            }`}>
                                                                <Check size={12} />
                                                            </span>

                                                            <div className="mb-3 flex justify-center">
                                                                <ProductThumb product={product} size={88} />
                                                            </div>

                                                            <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-800">
                                                                {product.name}
                                                            </p>
                                                            {product.sku ? (
                                                                <p className="mt-1 truncate text-[10px] text-slate-400">{product.sku}</p>
                                                            ) : null}

                                                            <div className="mt-2 flex items-center justify-between gap-1">
                                                                <span className="text-sm font-bold text-slate-900">
                                                                    {currency}{Number(product.price || 0).toFixed(0)}
                                                                </span>
                                                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                                                    product.inStock
                                                                        ? 'bg-emerald-50 text-emerald-700'
                                                                        : 'bg-red-50 text-red-600'
                                                                }`}>
                                                                    {product.inStock ? 'In stock' : 'Out'}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {pagination.totalPages > 1 ? (
                                        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                                            <p className="text-xs text-slate-500">
                                                Page {pagination.page} of {pagination.totalPages}
                                                {' · '}
                                                Showing {products.length} of {pagination.total}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled={pagination.page <= 1 || productsLoading}
                                                    onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
                                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Previous
                                                </button>
                                                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, index) => {
                                                    const start = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4))
                                                    const pageNumber = start + index
                                                    if (pageNumber > pagination.totalPages) return null
                                                    return (
                                                        <button
                                                            key={pageNumber}
                                                            type="button"
                                                            disabled={productsLoading}
                                                            onClick={() => setPagination((current) => ({ ...current, page: pageNumber }))}
                                                            className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                                                                pagination.page === pageNumber
                                                                    ? 'bg-violet-600 text-white'
                                                                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {pageNumber}
                                                        </button>
                                                    )
                                                })}
                                                <button
                                                    type="button"
                                                    disabled={pagination.page >= pagination.totalPages || productsLoading}
                                                    onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
                                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center sm:min-h-[420px] sm:p-10">
                                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                                        {sourceMode === 'category' ? <FolderTree size={24} /> : null}
                                        {sourceMode === 'tag' ? <Tag size={24} /> : null}
                                        {sourceMode === 'latest' ? <Clock size={24} /> : null}
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-900">
                                        {sourceMode === 'category' && 'Category-driven section'}
                                        {sourceMode === 'tag' && 'Tag-driven section'}
                                        {sourceMode === 'latest' && 'Latest products section'}
                                    </h3>
                                    <p className="mt-2 max-w-sm text-sm text-slate-500">
                                        {sourceMode === 'category' && 'Products are pulled from the categories you selected on the left.'}
                                        {sourceMode === 'tag' && 'Products matching your tags will appear on the home page.'}
                                        {sourceMode === 'latest' && 'Your newest catalog items will fill this section automatically.'}
                                    </p>
                                    <p className="mt-6 text-xs text-slate-400">
                                        Switch to <strong>Manual</strong> to pick individual products.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'design' && (
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="font-semibold text-slate-900">Category Sliders</h3>
                                    <p className="text-sm text-slate-500">Display product categories in a slider</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={designSettings.categorySliders.enabled}
                                        onChange={(e) => setDesignSettings({
                                            ...designSettings,
                                            categorySliders: { ...designSettings.categorySliders, enabled: e.target.checked },
                                        })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                                </label>
                            </div>
                            {designSettings.categorySliders.enabled && (
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        value={designSettings.categorySliders.title}
                                        onChange={(e) => setDesignSettings({
                                            ...designSettings,
                                            categorySliders: { ...designSettings.categorySliders, title: e.target.value },
                                        })}
                                        placeholder="Section Title"
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    />
                                    <textarea
                                        value={designSettings.categorySliders.description}
                                        onChange={(e) => setDesignSettings({
                                            ...designSettings,
                                            categorySliders: { ...designSettings.categorySliders, description: e.target.value },
                                        })}
                                        placeholder="Section Description"
                                        rows="2"
                                        className="w-full rounded-xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={saveDesignSettings}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
                                Save design settings
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
