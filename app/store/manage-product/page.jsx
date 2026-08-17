
'use client'
import { useAuth } from '@/lib/useAuth';

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { useDispatch } from "react-redux"
import { useSearchParams } from "next/navigation"
import { fetchProducts as fetchProductsAction, STOREFRONT_CATALOG_FETCH } from "@/lib/features/product/productSlice"
import { toast } from "react-hot-toast"
import Loading from "@/components/Loading"

import axios from "axios"
import nextDynamic from "next/dynamic"
import { ChevronDown } from 'lucide-react'
import ProductDetailCompletenessDots from '@/components/store/ProductDetailCompletenessDots'
import {
    buildCategoryLookup,
    getProductCategoryLabels,
    resolveCategoryName,
} from '@/lib/categoryLookup'
import { getProductThumbnailUrl } from '@/lib/productMedia'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 500]

const DETAILS_PROGRESS_FILTERS = [
    { value: 'all', label: 'All details' },
    { value: 'lte5', label: '≤ 5/10' },
    { value: 'lte7', label: '≤ 7/10' },
    { value: 'incomplete', label: 'Incomplete' },
]

const MANAGE_PRODUCT_SELECT_CLASS =
    'h-10 w-full appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 text-sm leading-none text-slate-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500'

function ManageProductSelect({ wrapperClassName = '', className = '', ...props }) {
    return (
        <div className={`relative ${wrapperClassName}`}>
            <select
                {...props}
                className={`${MANAGE_PRODUCT_SELECT_CLASS} ${className}`.trim()}
            />
            <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                aria-hidden
            />
        </div>
    )
}

const ProductForm = nextDynamic(() => import('../add-product/page'), {
    ssr: false,
    loading: () => (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
            <div className="rounded-xl bg-white px-6 py-8 text-sm font-medium text-slate-700 shadow-xl">
                Loading product editor...
            </div>
        </div>
    ),
})

const MAX_VISIBLE_CATEGORIES = 2

function CompactPills({ items = [], maxVisible = 2, pillClassName, moreClassName }) {
    if (!items.length) return null

    const visibleItems = items.slice(0, maxVisible)
    const hiddenItems = items.slice(maxVisible)

    return (
        <div className="flex max-w-[220px] flex-wrap items-center gap-1">
            {visibleItems.map((item, index) => (
                <span key={`${item}-${index}`} className={pillClassName}>
                    {item}
                </span>
            ))}
            {hiddenItems.length > 0 ? (
                <span
                    className={moreClassName}
                    title={hiddenItems.join(', ')}
                >
                    +{hiddenItems.length}
                </span>
            ) : null}
        </div>
    )
}

function RemoveFromCategoryModal({
    open,
    categoryName,
    items = [],
    onToggle,
    onCancel,
    onConfirm,
    isRemoving = false,
}) {
    if (!open) return null

    const selectedCount = items.filter((item) => item.checked).length

    return (
        <div className="fixed inset-0 z-[1100] flex items-end justify-center p-4 sm:items-center">
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
                aria-label="Close remove from category"
                disabled={isRemoving}
                onClick={onCancel}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-category-title"
                className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="bg-gradient-to-br from-orange-500 to-amber-600 px-5 py-5 text-white">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-100">Category assignment</p>
                    <h3 id="remove-category-title" className="mt-1 text-xl font-semibold">
                        Remove from {categoryName}?
                    </h3>
                    <p className="mt-1 text-sm text-orange-50">
                        Products stay in the store. They will no longer show in this category.
                    </p>
                </div>

                <div className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-800">
                            {selectedCount} of {items.length} selected
                        </p>
                        <p className="text-xs text-slate-500">Uncheck any product to keep it</p>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {items.map((item) => (
                            <label
                                key={item.id}
                                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
                                    item.checked
                                        ? 'border-orange-200 bg-orange-50'
                                        : 'border-slate-200 bg-slate-50 opacity-70'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    onChange={() => onToggle(item.id)}
                                    disabled={isRemoving}
                                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                />
                                {item.image ? (
                                    <img
                                        src={item.image}
                                        alt=""
                                        className="h-10 w-10 rounded-lg border border-white bg-white object-cover"
                                    />
                                ) : (
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-xs font-semibold text-slate-400">
                                        —
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{item.name}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isRemoving}
                        className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                        Keep in category
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isRemoving || selectedCount === 0}
                        className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isRemoving
                            ? 'Removing...'
                            : `Remove ${selectedCount} product${selectedCount === 1 ? '' : 's'}`}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function StoreManageProducts() {
    const dispatch = useDispatch();

    const { user, getToken } = useAuth();
    const searchParams = useSearchParams();

    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED'
    const formatAmount = (value) => {
        const numeric = Number(value)
        return Number.isFinite(numeric) ? numeric.toLocaleString() : '0'
    }

    // Safe Unicode text truncation that doesn't cut multi-byte characters
    const truncateText = (text, maxLength = 100) => {
        if (!text) return ''
        const cleaned = String(text).replace(/<[^>]*>/g, ' ').trim()
        // Safely truncate Unicode text - convert to array of graphemes
        const truncated = [...cleaned].slice(0, maxLength).join('')
        return cleaned.length > maxLength ? `${truncated}...` : truncated
    }

    const getRenderableImageSrc = (value) => {
        const src = String(value || '').trim()
        if (!src) return ''
        if (/^(https?:)?\/\//i.test(src)) return src
        if (src.startsWith('/')) return src
        return ''
    }

    const getProductListImageSrc = (product) => getRenderableImageSrc(
        getProductThumbnailUrl(product, { fallback: '' })
    )

    const [initialLoading, setInitialLoading] = useState(true)
    const [listLoading, setListLoading] = useState(false)
    const hasLoadedOnceRef = useRef(false)
    const [products, setProducts] = useState([])
    const [totalProducts, setTotalProducts] = useState(0)
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const searchDebounceRef = useRef(null)
    const [editingProduct, setEditingProduct] = useState(null)
    const [showEditModal, setShowEditModal] = useState(false)
    const [categoryMap, setCategoryMap] = useState({}) // Map of category ID to name
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('') // Category filter
    const [detailsProgressFilter, setDetailsProgressFilter] = useState('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    useEffect(() => {
        const categoryFromUrl = searchParams.get('category');
        if (categoryFromUrl) {
            setSelectedCategory(categoryFromUrl);
            setCurrentPage(1);
        }
    }, [searchParams]);
    const [showFbtModal, setShowFbtModal] = useState(false)
    const [fbtTargetProduct, setFbtTargetProduct] = useState(null)
    const [fbtConfigLoading, setFbtConfigLoading] = useState(false)
    const [fbtSaving, setFbtSaving] = useState(false)
    const [enableFBT, setEnableFBT] = useState(false)
    const [selectedFbtProducts, setSelectedFbtProducts] = useState([])
    const [fbtPricingMode, setFbtPricingMode] = useState('none')
    const [fbtBundlePrice, setFbtBundlePrice] = useState('')
    const [fbtBundleDiscount, setFbtBundleDiscount] = useState('')
    const [searchFbt, setSearchFbt] = useState('')
    const [debouncedSearchFbt, setDebouncedSearchFbt] = useState('')
    const searchFbtDebounceRef = useRef(null)
    const [fbtSearchResults, setFbtSearchResults] = useState([])
    const [fbtCatalogLoading, setFbtCatalogLoading] = useState(false)
    const [fbtSearchTotal, setFbtSearchTotal] = useState(0)
    const [selectedProductIds, setSelectedProductIds] = useState([])
    const [deletingBulkProducts, setDeletingBulkProducts] = useState(false)
    const [removingFromCategory, setRemovingFromCategory] = useState(false)
    const [removeCategoryModal, setRemoveCategoryModal] = useState({ open: false, items: [] })
    const [showBulkEditModal, setShowBulkEditModal] = useState(false)
    const [bulkEditSaving, setBulkEditSaving] = useState(false)
    const [bulkEditForm, setBulkEditForm] = useState({
        inStock: 'keep',
        fastDelivery: 'keep',
        freeShippingEligible: 'keep',
        stockQuantity: '',
        price: '',
        AED: '',
    })
    const [aiAutofillRunning, setAiAutofillRunning] = useState(false)
    const [aiAutofillProgress, setAiAutofillProgress] = useState(null)
    const [bulkAutofillJob, setBulkAutofillJob] = useState(null)
    const [bulkEligibleCount, setBulkEligibleCount] = useState(null)
    const [bulkAutofillLoading, setBulkAutofillLoading] = useState(false)
    const [bulkNow, setBulkNow] = useState(Date.now())
    const [showImportPanel, setShowImportPanel] = useState(false)
    const [showDetailColumns, setShowDetailColumns] = useState(false)
    const BULK_AUTOFILL_INTERVAL_MS = 60000

    const detailsFilterActive = detailsProgressFilter !== 'all'

    const fetchStoreProducts = useCallback(async ({ page = currentPage, search = debouncedSearch, category = selectedCategory, silent = false, detailsFilter = detailsProgressFilter } = {}) => {
        try {
            if (silent) setListLoading(true)
            else setInitialLoading(true)
             const token = await getToken()
             const { data } = await axios.get('/api/store/product', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    page,
                    limit: pageSize,
                    search: search || undefined,
                    category: category || undefined,
                    manage: 'true',
                    sort: 'newest',
                    detailsProgress: detailsFilter && detailsFilter !== 'all' ? detailsFilter : undefined,
                },
             })
             const nextProducts = Array.isArray(data?.products) ? data.products : []
             setProducts(nextProducts)
             setTotalProducts(Number(data?.pagination?.total) || nextProducts.length)
             if (data?.categoryLookup && typeof data.categoryLookup === 'object') {
                setCategoryMap((current) => ({ ...current, ...data.categoryLookup }))
             }
             setSelectedProductIds((prev) => prev.filter((id) => nextProducts.some((product) => String(product._id) === id)))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        } finally {
            setInitialLoading(false)
            setListLoading(false)
        }
    }, [currentPage, debouncedSearch, selectedCategory, pageSize, detailsProgressFilter, getToken])

    const fetchFbtSearchResults = useCallback(async (search = '') => {
        const query = String(search || '').trim()
        if (query.length < 2) {
            setFbtSearchResults([])
            setFbtSearchTotal(0)
            return
        }

        setFbtCatalogLoading(true)
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/store/product', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    page: 1,
                    limit: 20,
                    search: query,
                    manage: 'true',
                    sort: 'newest',
                },
            })

            const batch = Array.isArray(data?.products) ? data.products : []
            setFbtSearchResults(batch)
            setFbtSearchTotal(Number(data?.pagination?.total) || batch.length)
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to search products for FBT')
            setFbtSearchResults([])
            setFbtSearchTotal(0)
        } finally {
            setFbtCatalogLoading(false)
        }
    }, [getToken])

    const fetchBulkAutofillStatus = useCallback(async () => {
        try {
            const token = await getToken()
            const { data } = await axios.get('/api/store/product/ai-autofill/bulk?preview=true&mode=missing_details', {
                headers: { Authorization: `Bearer ${token}` },
            })
            setBulkAutofillJob(data?.job || null)
            setBulkEligibleCount(Number(data?.preview?.eligibleCount ?? 0))
        } catch (error) {
            console.error('Bulk autofill status error:', error)
        }
    }, [getToken])

    useEffect(() => {
        fetchBulkAutofillStatus()
    }, [fetchBulkAutofillStatus])

    useEffect(() => {
        let cancelled = false

        const tick = async () => {
            if (cancelled) return
            try {
                const token = await getToken()
                const { data: statusData } = await axios.get('/api/store/product/ai-autofill/bulk', {
                    headers: { Authorization: `Bearer ${token}` },
                })
                const job = statusData?.job || null
                if (cancelled) return
                setBulkAutofillJob(job)

                if (job?.status === 'running') {
                    const nextAt = job.nextProcessAt ? new Date(job.nextProcessAt).getTime() : 0
                    if (!nextAt || Date.now() >= nextAt) {
                        const { data: processData } = await axios.post('/api/store/product/ai-autofill/bulk', {
                            action: 'process',
                        }, {
                            headers: { Authorization: `Bearer ${token}` },
                        })
                        if (cancelled) return
                        const nextJob = processData?.job || null
                        setBulkAutofillJob(nextJob)
                        if (nextJob?.status === 'completed') {
                            toast.success(`Bulk AI auto-fill finished: ${nextJob.successCount} updated, ${nextJob.failedCount} failed`)
                            await fetchStoreProducts({ silent: true })
                            dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
                        }
                    }
                }
            } catch (error) {
                console.error('Bulk autofill tick error:', error)
            }
        }

        tick()
        const intervalId = setInterval(tick, 10000)
        return () => {
            cancelled = true
            clearInterval(intervalId)
        }
    }, [dispatch, fetchStoreProducts, getToken])

    useEffect(() => {
        if (bulkAutofillJob?.status !== 'running') return undefined
        const timer = setInterval(() => setBulkNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [bulkAutofillJob?.status])

    const bulkProgressStats = useMemo(() => {
        if (!bulkAutofillJob) {
            return null
        }

        const total = Number(bulkAutofillJob.totalCount || 0)
        const finished = Number(bulkAutofillJob.processedCount || 0)
        const pending = Number(
            bulkAutofillJob.remainingCount ?? Math.max(0, total - finished),
        )
        const success = Number(bulkAutofillJob.successCount || 0)
        const failed = Number(bulkAutofillJob.failedCount || 0)
        const percent = total > 0 ? Math.min(100, Math.round((finished / total) * 100)) : 0
        const inProgress = bulkAutofillJob.status === 'running' && pending > 0

        return {
            total,
            finished,
            pending,
            success,
            failed,
            percent,
            inProgress,
            nextInSeconds: bulkAutofillJob.nextProcessAt
                ? Math.max(0, Math.ceil((new Date(bulkAutofillJob.nextProcessAt).getTime() - bulkNow) / 1000))
                : null,
        }
    }, [bulkAutofillJob, bulkNow])

    const startBulkAutofillAll = async () => {
        const count = bulkEligibleCount ?? 0
        if (!count) {
            toast.error('No products missing details for AI auto-fill')
            return
        }

        const hours = Math.ceil((count * BULK_AUTOFILL_INTERVAL_MS) / 3600000)
        if (!confirm(`Start AI auto-fill for ${count} product(s) that are MISSING details?\n\nOne product every 1 minute.\nEstimated: ~${hours} hour(s).\n\nProducts that already have name/description are NEVER overwritten.`)) {
            return
        }

        try {
            setBulkAutofillLoading(true)
            const token = await getToken()
            const { data } = await axios.post('/api/store/product/ai-autofill/bulk', {
                action: 'start',
                mode: 'missing_details',
                includeArabic: true,
                intervalMs: BULK_AUTOFILL_INTERVAL_MS,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setBulkAutofillJob(data?.job || null)
            toast.success('Bulk AI auto-fill started (missing details only)')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message || 'Failed to start bulk queue')
        } finally {
            setBulkAutofillLoading(false)
        }
    }

    const pauseBulkAutofill = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/store/product/ai-autofill/bulk', { action: 'pause' }, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setBulkAutofillJob(data?.job || null)
            toast.success('Bulk queue paused')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const resumeBulkAutofill = async () => {
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/store/product/ai-autofill/bulk', { action: 'resume' }, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setBulkAutofillJob(data?.job || null)
            toast.success('Bulk queue resumed')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const cancelBulkAutofill = async () => {
        if (!confirm('Stop the bulk AI auto-fill queue?')) return
        try {
            const token = await getToken()
            const { data } = await axios.post('/api/store/product/ai-autofill/bulk', { action: 'cancel' }, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setBulkAutofillJob(data?.job || null)
            toast.success('Bulk queue cancelled')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    // Fetch all categories to map IDs to names
    const fetchCategories = async () => {
        try {
            const { data } = await axios.get('/api/store/categories')
            setCategoryMap((current) => ({
                ...current,
                ...buildCategoryLookup(data.categories || []),
                ...(data.lookup || {}),
            }))
        } catch (error) {
            console.error('Error fetching categories:', error)
        }
    }

    const getDisplayCategoryLabels = (product) => {
        if (Array.isArray(product?.categoryNames) && product.categoryNames.length) {
            return product.categoryNames
        }
        return getProductCategoryLabels(product, categoryMap)
    }

    const selectedCategoryName = selectedCategory
        ? (resolveCategoryName(categoryMap, selectedCategory) || 'this category')
        : ''

    const toggleStock = async (productId) => {
        const token = await getToken()
        const { data } = await axios.post('/api/store/stock-toggle',{ productId }, {headers: { Authorization: `Bearer ${token}` } })
        setProducts(prevProducts => prevProducts.map(product =>  product._id === productId ? {...product, inStock: !product.inStock} : product))
        return data.message
    }

    const confirmToggleStock = (product) => {
        const nextInStock = !product.inStock
        const label = String(product?.name || 'this product').trim()
        const message = nextInStock
            ? `Mark "${label}" as in stock?`
            : `Mark "${label}" as out of stock?`
        if (!confirm(message)) return

        toast.promise(toggleStock(product._id), {
            loading: 'Updating...',
            success: (message) => message || 'Stock updated',
            error: (error) => error?.response?.data?.error || error?.message || 'Failed to update stock',
        })
    }

    const toggleFastDelivery = async (productId) => {
        const token = await getToken()
        const { data } = await axios.post('/api/store/fast-delivery-toggle', { productId }, {headers: { Authorization: `Bearer ${token}` } })
        setProducts(prevProducts => prevProducts.map(product => 
            product._id === productId ? {...product, fastDelivery: !product.fastDelivery} : product
        ))
        return data.message
    }

    const isProductOnline = (product) => product?.published !== false

    const togglePublished = async (productId) => {
        const token = await getToken()
        const { data } = await axios.post('/api/store/product/publish-toggle', { productId }, {
            headers: { Authorization: `Bearer ${token}` },
        })
        setProducts((prevProducts) => prevProducts.map((product) => (
            product._id === productId
                ? { ...product, published: data?.published ?? !isProductOnline(product) }
                : product
        )))
        return data.message
    }

    const confirmTogglePublished = (product) => {
        const nextOnline = !isProductOnline(product)
        const label = String(product?.name || 'this product').trim()
        const message = nextOnline
            ? `Set "${label}" online on the storefront?`
            : `Take "${label}" offline from the storefront?`
        if (!confirm(message)) return

        toast.promise(togglePublished(product._id), {
            loading: 'Updating...',
            success: (message) => message || 'Visibility updated',
            error: (error) => error?.response?.data?.error || error?.message || 'Failed to update visibility',
        })
    }

    const handleEdit = async (product) => {
        try {
            const token = await getToken()
            const { data } = await axios.get(`/api/store/product?productId=${product._id}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setEditingProduct(data.product || product)
            setShowEditModal(true)
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to load product details')
        }
    }

    const handleDelete = async (product) => {
        const productId = product?._id
        const label = String(product?.name || 'this product').trim()
        if (!productId) return
        if (!confirm(`Delete "${label}"? This cannot be undone.`)) return
        
        try {
            const token = await getToken()
            await axios.delete(`/api/store/product?productId=${productId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setProducts(prevProducts => prevProducts.filter(p => p._id !== productId))
            toast.success('Product deleted successfully')
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message)
        }
    }

    const handleOpenFbtModal = async (product) => {
        setFbtTargetProduct(product)
        setShowFbtModal(true)
        setSearchFbt('')
        setFbtConfigLoading(true)

        try {
            const { data } = await axios.get(`/api/products/${product._id}/fbt`)
            setEnableFBT(Boolean(data?.enableFBT))
            setSelectedFbtProducts(Array.isArray(data?.products) ? data.products : [])

            const bundlePrice = Number(data?.bundlePrice)
            const bundleDiscount = Number(data?.bundleDiscount)
            if (Number.isFinite(bundlePrice) && bundlePrice > 0) {
                setFbtPricingMode('fixed')
                setFbtBundlePrice(String(bundlePrice))
                setFbtBundleDiscount('')
            } else if (Number.isFinite(bundleDiscount) && bundleDiscount > 0) {
                setFbtPricingMode('percent')
                setFbtBundleDiscount(String(bundleDiscount))
                setFbtBundlePrice('')
            } else {
                setFbtPricingMode('none')
                setFbtBundlePrice('')
                setFbtBundleDiscount('')
            }
        } catch (error) {
            setEnableFBT(false)
            setSelectedFbtProducts([])
            setFbtPricingMode('none')
            setFbtBundlePrice('')
            setFbtBundleDiscount('')
        } finally {
            setFbtConfigLoading(false)
        }
    }

    const toggleEnableFBT = async (product) => {
        const productId = product?._id
        if (!productId) return

        const token = await getToken()
        try {
            const { data } = await axios.post('/api/store/fbt-toggle', { productId }, {
                headers: { Authorization: `Bearer ${token}` },
            })
            setProducts((prevProducts) => prevProducts.map((item) => (
                item._id === productId ? { ...item, enableFBT: Boolean(data?.enableFBT) } : item
            )))
            return data.message
        } catch (error) {
            if (error?.response?.data?.code === 'FBT_PRODUCTS_REQUIRED') {
                handleOpenFbtModal(product)
                throw new Error('Configure related products first')
            }
            throw error
        }
    }

    const closeFbtModal = () => {
        if (fbtSaving) return
        setShowFbtModal(false)
        setFbtTargetProduct(null)
        setEnableFBT(false)
        setSelectedFbtProducts([])
        setFbtPricingMode('none')
        setFbtBundlePrice('')
        setFbtBundleDiscount('')
        setSearchFbt('')
        setDebouncedSearchFbt('')
        setFbtSearchResults([])
        setFbtSearchTotal(0)
    }

    const addFbtProduct = (product) => {
        const productId = String(product?._id || '')
        if (!productId || productId === String(fbtTargetProduct?._id || '')) return

        setSelectedFbtProducts((prev) => {
            if (prev.some((item) => String(item._id) === productId)) return prev
            if (prev.length >= 10) {
                toast.error('Maximum 10 related products allowed')
                return prev
            }
            return [...prev, product]
        })
    }

    const removeFbtProduct = (productId) => {
        setSelectedFbtProducts((prev) => prev.filter((item) => String(item._id) !== String(productId)))
    }

    const handleSaveFbtConfig = async () => {
        if (!fbtTargetProduct?._id) return

        if (enableFBT && selectedFbtProducts.length === 0) {
            toast.error('Select at least one related product')
            return
        }

        const selectedFbtProductIds = selectedFbtProducts.map((item) => String(item._id))
        const parsedPrice = fbtPricingMode === 'fixed' && fbtBundlePrice !== '' ? Number(fbtBundlePrice) : null
        const parsedDiscount = fbtPricingMode === 'percent' && fbtBundleDiscount !== '' ? Number(fbtBundleDiscount) : null

        if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
            toast.error('Bundle price must be a non-negative number')
            return
        }

        if (parsedDiscount !== null && (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100)) {
            toast.error('Discount must be between 0 and 100')
            return
        }

        setFbtSaving(true)
        try {
            await axios.patch(`/api/products/${fbtTargetProduct._id}/fbt`, {
                enableFBT,
                fbtProductIds: enableFBT ? selectedFbtProductIds : [],
                fbtBundlePrice: enableFBT ? parsedPrice : null,
                fbtBundleDiscount: enableFBT ? parsedDiscount : null,
            })

            setProducts((prev) => prev.map((p) => (
                p._id === fbtTargetProduct._id
                    ? {
                        ...p,
                        enableFBT,
                        fbtProductIds: enableFBT ? selectedFbtProductIds : [],
                        fbtBundlePrice: enableFBT ? parsedPrice : null,
                        fbtBundleDiscount: enableFBT ? parsedDiscount : null,
                    }
                    : p
            )))

            toast.success('FBT configuration saved')
            closeFbtModal()
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to save FBT configuration')
        } finally {
            setFbtSaving(false)
        }
    }

    const handleUpdateSuccess = async (updatedProduct) => {
        if (updatedProduct?._id) {
            setProducts((prevProducts) =>
                prevProducts.map((p) =>
                    String(p._id) === String(updatedProduct._id) ? { ...p, ...updatedProduct } : p
                )
            )
        }
        setShowEditModal(false)
        setEditingProduct(null)
        dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
        await fetchStoreProducts({ silent: true })
    }

    useEffect(() => {
        if(user){
            fetchCategories()
        }
    }, [user])

    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchQuery.trim())
        }, 300)
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        }
    }, [searchQuery])

    useEffect(() => {
        if (searchFbtDebounceRef.current) clearTimeout(searchFbtDebounceRef.current)
        searchFbtDebounceRef.current = setTimeout(() => {
            setDebouncedSearchFbt(searchFbt.trim())
        }, 300)
        return () => {
            if (searchFbtDebounceRef.current) clearTimeout(searchFbtDebounceRef.current)
        }
    }, [searchFbt])

    useEffect(() => {
        if (!showFbtModal) return
        fetchFbtSearchResults(debouncedSearchFbt)
    }, [showFbtModal, debouncedSearchFbt, fetchFbtSearchResults])

    useEffect(() => {
        if (!user) return
        fetchStoreProducts({
            page: currentPage,
            search: debouncedSearch,
            category: selectedCategory,
            detailsFilter: detailsProgressFilter,
            silent: hasLoadedOnceRef.current,
        })
        hasLoadedOnceRef.current = true
    }, [user, currentPage, debouncedSearch, selectedCategory, pageSize, detailsProgressFilter, fetchStoreProducts])

    const handleImportComplete = async () => {
        await fetchStoreProducts({ silent: true, detailsFilter: detailsProgressFilter })
        dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
    }

    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearch, selectedCategory, pageSize, detailsProgressFilter])

    const filteredProducts = products
    const listTotal = totalProducts
    const totalPages = Math.max(1, Math.ceil(listTotal / pageSize))
    const safeCurrentPage = Math.min(currentPage, totalPages)
    const paginatedProducts = filteredProducts
    const paginationStart = listTotal ? ((safeCurrentPage - 1) * pageSize) + 1 : 0
    const paginationEnd = listTotal ? Math.min(safeCurrentPage * pageSize, listTotal) : 0

    const selectedFbtProductIds = useMemo(
        () => selectedFbtProducts.map((item) => String(item._id)),
        [selectedFbtProducts]
    )

    const fbtSearchMatches = fbtSearchResults
        .filter((product) => String(product._id) !== String(fbtTargetProduct?._id || ''))
        .filter((product) => !selectedFbtProductIds.includes(String(product._id)))

    const productNameById = useMemo(
        () => Object.fromEntries(products.map((product) => [String(product._id), product.name || 'Product'])),
        [products]
    )

    useEffect(() => {
        if (currentPage !== safeCurrentPage) {
            setCurrentPage(safeCurrentPage)
        }
    }, [currentPage, safeCurrentPage])

    if (initialLoading && products.length === 0) return <Loading />

    const selectedVisibleProductIds = paginatedProducts
        .map((product) => String(product._id))
        .filter((productId) => selectedProductIds.includes(productId))
    const allVisibleSelected = paginatedProducts.length > 0 && selectedVisibleProductIds.length === paginatedProducts.length
    const hasSelectedProducts = selectedProductIds.length > 0

    const toggleProductSelection = (productId) => {
        const normalizedProductId = String(productId)
        setSelectedProductIds((prev) => (
            prev.includes(normalizedProductId)
                ? prev.filter((id) => id !== normalizedProductId)
                : [...prev, normalizedProductId]
        ))
    }

    const toggleSelectAllVisibleProducts = () => {
        const visibleIds = paginatedProducts.map((product) => String(product._id))
        if (!visibleIds.length) return

        setSelectedProductIds((prev) => {
            if (visibleIds.every((id) => prev.includes(id))) {
                return prev.filter((id) => !visibleIds.includes(id))
            }

            return [...new Set([...prev, ...visibleIds])]
        })
    }

    const exportProductsToCsv = () => {
        if (!filteredProducts.length) {
            toast.error('No products available to export')
            return
        }

        const rows = filteredProducts.map((product) => ({
            id: product._id,
            name: product.name || '',
            slug: product.slug || '',
            sku: product.sku || '',
            categories: getDisplayCategoryLabels(product).join(', '),
            tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
            description: String(product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
            AED: product.AED ?? product.mrp ?? '',
            price: product.price ?? '',
            stockQuantity: product.stockQuantity ?? 0,
            inStock: Boolean(product.inStock),
            fastDelivery: Boolean(product.fastDelivery),
            freeShippingEligible: Boolean(product.freeShippingEligible),
            images: Array.isArray(product.images) ? product.images.join(', ') : '',
            createdAt: product.createdAt || '',
        }))

        const headers = Object.keys(rows[0] || {})
        const escapeCsv = (value) => {
            const text = value === null || value === undefined ? '' : String(value)
            if (/[",\n]/.test(text)) {
                return `"${text.replace(/"/g, '""')}"`
            }
            return text
        }

        const csv = [
            headers.join(','),
            ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
        ].join('\n')

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `store-products-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        toast.success(`Exported ${filteredProducts.length} product(s)`)
    }

    const openRemoveFromCategoryModal = (productIds = []) => {
        if (!selectedCategory) {
            toast.error('Choose a category first')
            return
        }
        const ids = [...new Set(productIds.map((productId) => String(productId || '').trim()).filter(Boolean))]
        if (!ids.length) {
            toast.error('Select products to remove first')
            return
        }

        setRemoveCategoryModal({
            open: true,
            items: ids.map((id) => {
                const product = products.find((item) => String(item._id) === id)
                return {
                    id,
                    name: String(product?.name || 'Product').trim() || 'Product',
                    image: product ? getProductListImageSrc(product) : '',
                    checked: true,
                }
            }),
        })
    }

    const closeRemoveFromCategoryModal = () => {
        if (removingFromCategory) return
        setRemoveCategoryModal({ open: false, items: [] })
    }

    const toggleRemoveModalProduct = (productId) => {
        setRemoveCategoryModal((prev) => ({
            ...prev,
            items: prev.items.map((item) => (
                item.id === productId ? { ...item, checked: !item.checked } : item
            )),
        }))
    }

    const confirmRemoveFromCategory = async () => {
        const productIds = removeCategoryModal.items
            .filter((item) => item.checked)
            .map((item) => item.id)

        if (!selectedCategory) {
            toast.error('Choose a category first')
            return
        }
        if (!productIds.length) {
            toast.error('Select products to remove first')
            return
        }

        try {
            setRemovingFromCategory(true)
            const token = await getToken()
            const { data } = await axios.post('/api/store/product/remove-from-category', {
                productIds,
                categoryId: selectedCategory,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            const skipped = Array.isArray(data?.skipped) ? data.skipped : []
            if (data?.removedCount > 0) {
                toast.success(data?.message || 'Removed from category')
            } else {
                toast.error(data?.message || 'No products were removed from this category')
            }
            if (skipped.length) {
                const firstReason = skipped[0]?.reason || 'Could not remove some products'
                toast.error(skipped.length === 1 ? firstReason : `${skipped.length} product(s) were not removed. ${firstReason}`)
            }

            setSelectedProductIds((prev) => prev.filter((id) => !productIds.includes(id)))
            setRemoveCategoryModal({ open: false, items: [] })
            await fetchStoreProducts({ silent: true })
            dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message || 'Failed to remove products from category')
        } finally {
            setRemovingFromCategory(false)
        }
    }

    const deleteSelectedProducts = async () => {
        if (!selectedProductIds.length) {
            toast.error('Select products to delete first')
            return
        }

        if (!confirm(`Delete ${selectedProductIds.length} selected product(s)? This cannot be undone.`)) return

        try {
            setDeletingBulkProducts(true)
            const token = await getToken()
            const { data } = await axios.post('/api/store/product/bulk-delete', {
                productIds: selectedProductIds,
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })

            toast.success(data?.message || 'Selected products deleted successfully')
            setSelectedProductIds([])
            await fetchStoreProducts({ silent: true })
            dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message || 'Failed to delete selected products')
        } finally {
            setDeletingBulkProducts(false)
        }
    }

    const openBulkEditModal = () => {
        if (!selectedProductIds.length) {
            toast.error('Select products to bulk edit first')
            return
        }
        setShowBulkEditModal(true)
    }

    const closeBulkEditModal = () => {
        if (bulkEditSaving) return
        setShowBulkEditModal(false)
        setBulkEditForm({
            inStock: 'keep',
            fastDelivery: 'keep',
            freeShippingEligible: 'keep',
            stockQuantity: '',
            price: '',
            AED: '',
        })
    }

    const saveBulkEdit = async () => {
        try {
            setBulkEditSaving(true)
            const token = await getToken()
            const payload = {
                productIds: selectedProductIds,
                ...bulkEditForm,
            }

            const { data } = await axios.patch('/api/store/product/bulk-update', payload, {
                headers: { Authorization: `Bearer ${token}` }
            })

            toast.success(data?.message || 'Products updated successfully')
            await fetchStoreProducts({ silent: true })
            dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
            closeBulkEditModal()
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message || 'Failed to bulk update products')
        } finally {
            setBulkEditSaving(false)
        }
    }

    const runAiAutofillQueue = async () => {
        if (!selectedProductIds.length) {
            toast.error('Select products to auto-fill first')
            return
        }

        if (aiAutofillRunning) return

        const queueIds = [...selectedProductIds]
        if (!confirm(`Run AI auto-fill for ${queueIds.length} selected product(s)? Existing titles and descriptions may be overwritten.`)) {
            return
        }

        setAiAutofillRunning(true)
        setAiAutofillProgress({
            current: 0,
            total: queueIds.length,
            currentName: '',
            results: [],
        })

        const results = []
        const token = await getToken()

        for (let index = 0; index < queueIds.length; index += 1) {
            const productId = queueIds[index]
            const currentName = productNameById[productId] || 'Product'

            setAiAutofillProgress((prev) => ({
                ...prev,
                current: index + 1,
                currentName,
            }))

            try {
                const { data } = await axios.post('/api/store/product/ai-autofill', {
                    productId,
                    includeArabic: true,
                }, {
                    headers: { Authorization: `Bearer ${token}` },
                })

                const item = data?.results?.[0] || data
                results.push(item?.success === false
                    ? item
                    : { success: true, productId, name: item?.name || currentName, updatedFields: item?.updatedFields || [] })
            } catch (error) {
                results.push({
                    success: false,
                    productId,
                    name: currentName,
                    error: error?.response?.data?.error || error.message || 'AI autofill failed',
                })
            }

            setAiAutofillProgress((prev) => ({
                ...prev,
                results: [...results],
            }))

            if (index < queueIds.length - 1) {
                await sleep(BULK_AUTOFILL_INTERVAL_MS)
            }
        }

        const successCount = results.filter((item) => item.success).length
        const failedCount = results.length - successCount

        if (failedCount === 0) {
            toast.success(`AI auto-fill finished: ${successCount}/${queueIds.length} updated`)
        } else {
            toast.error(`AI auto-fill finished: ${successCount} updated, ${failedCount} failed`)
        }

        setAiAutofillRunning(false)
        await fetchStoreProducts({ silent: true })
        dispatch(fetchProductsAction(STOREFRONT_CATALOG_FETCH))
    }

    return (
        <div className="w-full max-w-[1920px]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl text-slate-500">
                    {showImportPanel ? (
                        <>Import <span className="text-slate-800 font-medium">Products</span></>
                    ) : (
                        <>Manage <span className="text-slate-800 font-medium">Products</span></>
                    )}
                </h1>
                <button
                    type="button"
                    onClick={() => setShowImportPanel((current) => !current)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        showImportPanel
                            ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            : 'bg-slate-800 text-white hover:bg-slate-900'
                    }`}
                >
                    {showImportPanel ? 'Back to products' : 'Import products'}
                </button>
            </div>

            {showImportPanel ? (
                <ProductBulkImportPanel onImportComplete={handleImportComplete} embedded />
            ) : (
            <>
            {/* Search Bar and Category Filter */}
            <div className="mb-6 flex w-full flex-wrap items-center gap-3">
                <div className="flex-1 min-w-xs">
                    <input
                        type="search"
                        placeholder="Search products by name, SKU, category, tags, or description..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoComplete="off"
                        className="w-full h-10 px-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchQuery ? (
                        <p className="text-sm text-slate-600 mt-2">
                            {listLoading ? 'Searching…' : `Found ${totalProducts} product${totalProducts !== 1 ? 's' : ''}`}
                        </p>
                    ) : null}
                </div>
                
                {/* Category Filter */}
                <ManageProductSelect
                    wrapperClassName="min-w-[11rem] shrink-0"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                >
                    <option value="">All Categories</option>
                    {Object.entries(categoryMap).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                    ))}
                </ManageProductSelect>

                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Per page</span>
                    <ManageProductSelect
                        wrapperClassName="w-[5.5rem]"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value) || 20)}
                        aria-label="Products per page"
                    >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </ManageProductSelect>
                </div>
                <button
                    type="button"
                    onClick={() => setShowDetailColumns((current) => !current)}
                    className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                    {showDetailColumns ? 'Hide extra columns' : 'Show categories & description'}
                </button>
                <button
                    type="button"
                    onClick={exportProductsToCsv}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                >
                    Export CSV
                </button>
                <button
                    type="button"
                    onClick={runAiAutofillQueue}
                    disabled={!hasSelectedProducts || aiAutofillRunning}
                    className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {aiAutofillRunning ? 'AI Auto Fill...' : 'AI Auto Fill Queue'}
                </button>
            </div>
            {selectedCategory ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <p className="text-sm text-orange-950">
                        Showing products in <span className="font-semibold">{selectedCategoryName}</span>. Tick the checkboxes to remove several at once.
                    </p>
                    <button
                        type="button"
                        onClick={() => openRemoveFromCategoryModal(selectedProductIds)}
                        disabled={removingFromCategory || !selectedProductIds.length}
                        className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Remove selected ({selectedProductIds.length})
                    </button>
                </div>
            ) : null}

            <div className="mb-6 flex w-full flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-600">Details progress</span>
                {DETAILS_PROGRESS_FILTERS.map((option) => {
                    const isActive = detailsProgressFilter === option.value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setDetailsProgressFilter(option.value)}
                            className={`h-9 rounded-lg px-3 text-sm font-medium transition ${
                                isActive
                                    ? 'bg-slate-900 text-white'
                                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            {option.label}
                        </button>
                    )
                })}
                {detailsFilterActive ? (
                    <span className="text-xs text-slate-500">
                        {listLoading
                            ? 'Scanning all products by Details score…'
                            : `Found ${listTotal} product${listTotal !== 1 ? 's' : ''} with Details ${
                                detailsProgressFilter === 'lte5'
                                    ? '≤ 5/10'
                                    : detailsProgressFilter === 'lte7'
                                        ? '≤ 7/10'
                                        : 'not fully filled'
                            }`}
                    </span>
                ) : null}
            </div>

            <div className="hidden mb-4 w-full rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900">AI Auto Fill — Bulk Queue</h2>
                        <p className="mt-1 max-w-3xl text-xs text-slate-600">
                            Automatically fill English and Arabic product details from images. Runs in the background with a 1 minute gap between each product.
                            {bulkEligibleCount != null ? ` ${bulkEligibleCount} product(s) with images ready.` : ''}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {!bulkAutofillJob || bulkAutofillJob.status === 'completed' || bulkAutofillJob.status === 'cancelled' ? (
                            <button
                                type="button"
                                onClick={startBulkAutofillAll}
                                disabled={bulkAutofillLoading || !bulkEligibleCount}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {bulkAutofillLoading ? 'Starting...' : 'Auto Fill Missing Details'}
                            </button>
                        ) : null}
                        {bulkAutofillJob?.status === 'running' ? (
                            <>
                                <button type="button" onClick={pauseBulkAutofill} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50">Pause</button>
                                <button type="button" onClick={cancelBulkAutofill} className="px-3 py-2 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50">Stop</button>
                            </>
                        ) : null}
                        {bulkAutofillJob?.status === 'paused' ? (
                            <>
                                <button type="button" onClick={resumeBulkAutofill} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Resume</button>
                                <button type="button" onClick={cancelBulkAutofill} className="px-3 py-2 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50">Stop</button>
                            </>
                        ) : null}
                    </div>
                </div>

                {bulkAutofillJob && ['running', 'paused', 'completed'].includes(bulkAutofillJob.status) && bulkProgressStats ? (
                    <div className="mt-4 rounded-lg border border-blue-100 bg-white/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold capitalize text-slate-900">
                                Status: {bulkAutofillJob.status}
                            </span>
                            <span className="text-sm font-bold text-blue-700">
                                {bulkProgressStats.percent}% complete
                            </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Finished</p>
                                <p className="mt-0.5 text-lg font-bold text-slate-900">{bulkProgressStats.finished}</p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Pending</p>
                                <p className="mt-0.5 text-lg font-bold text-amber-900">{bulkProgressStats.pending}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Success</p>
                                <p className="mt-0.5 text-lg font-bold text-emerald-900">{bulkProgressStats.success}</p>
                            </div>
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">Failed</p>
                                <p className="mt-0.5 text-lg font-bold text-red-900">{bulkProgressStats.failed}</p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
                                <span>{bulkProgressStats.finished} of {bulkProgressStats.total} products done</span>
                                <span>{bulkProgressStats.pending} remaining</span>
                            </div>
                            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                                <div className="flex h-full w-full">
                                    {bulkProgressStats.total > 0 ? (
                                        <>
                                            <div
                                                className="h-full bg-emerald-500 transition-all duration-500"
                                                style={{ width: `${(bulkProgressStats.success / bulkProgressStats.total) * 100}%` }}
                                                title={`${bulkProgressStats.success} succeeded`}
                                            />
                                            <div
                                                className="h-full bg-red-500 transition-all duration-500"
                                                style={{ width: `${(bulkProgressStats.failed / bulkProgressStats.total) * 100}%` }}
                                                title={`${bulkProgressStats.failed} failed`}
                                            />
                                            {bulkProgressStats.inProgress ? (
                                                <div
                                                    className="h-full bg-blue-500 animate-pulse transition-all duration-500"
                                                    style={{ width: `${(1 / bulkProgressStats.total) * 100}%` }}
                                                    title="In progress"
                                                />
                                            ) : null}
                                        </>
                                    ) : null}
                                </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500">
                                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Success</span>
                                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Failed</span>
                                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-200" /> Pending</span>
                                {bulkProgressStats.inProgress ? (
                                    <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> In progress</span>
                                ) : null}
                            </div>
                        </div>

                        {bulkAutofillJob.status === 'running' && bulkAutofillJob.currentProductName ? (
                            <p className="mt-3 text-xs text-slate-600">
                                <span className="font-medium text-slate-800">Now processing:</span> {bulkAutofillJob.currentProductName}
                                {bulkProgressStats.nextInSeconds != null
                                    ? ` · Next product in ~${bulkProgressStats.nextInSeconds}s`
                                    : ''}
                            </p>
                        ) : null}

                        {bulkAutofillJob.recentResults?.length > 0 ? (
                            <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto border-t border-slate-100 pt-3 text-xs">
                                {[...bulkAutofillJob.recentResults].reverse().map((item) => (
                                    <li key={`${item.productId}-${item.at}`} className={item.success ? 'text-emerald-700' : 'text-red-700'}>
                                        {item.success
                                            ? `✓ ${item.name || item.productId}`
                                            : `✕ ${item.name || item.productId}: ${item.error}`}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {aiAutofillProgress && (
                <div className="mb-4 w-full rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-violet-900">
                            Selected products AI queue
                            {aiAutofillProgress.currentName ? ` — ${aiAutofillProgress.currentName}` : ''}
                        </div>
                        {!aiAutofillRunning && (
                            <button
                                type="button"
                                onClick={() => setAiAutofillProgress(null)}
                                className="text-xs font-semibold text-violet-700 hover:text-violet-900"
                            >
                                Dismiss
                            </button>
                        )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-center">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600">Finished</p>
                            <p className="mt-0.5 text-lg font-bold text-violet-900">
                                {aiAutofillProgress.results?.length || 0}
                            </p>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-center">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Pending</p>
                            <p className="mt-0.5 text-lg font-bold text-amber-900">
                                {Math.max(0, aiAutofillProgress.total - (aiAutofillProgress.results?.length || 0))}
                            </p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-center sm:col-span-1 col-span-2">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600">Progress</p>
                            <p className="mt-0.5 text-lg font-bold text-violet-900">
                                {aiAutofillProgress.total
                                    ? Math.round(((aiAutofillProgress.results?.length || 0) / aiAutofillProgress.total) * 100)
                                    : 0}%
                            </p>
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="mb-1.5 flex items-center justify-between text-xs text-violet-700">
                            <span>{aiAutofillProgress.results?.length || 0} of {aiAutofillProgress.total} done</span>
                            <span>{Math.max(0, aiAutofillProgress.total - (aiAutofillProgress.results?.length || 0))} remaining</span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-white">
                            <div
                                className="h-full rounded-full bg-violet-600 transition-all duration-500"
                                style={{
                                    width: `${aiAutofillProgress.total
                                        ? Math.min(100, ((aiAutofillProgress.results?.length || 0) / aiAutofillProgress.total) * 100)
                                        : 0}%`,
                                }}
                            />
                        </div>
                    </div>

                    {aiAutofillRunning && (
                        <p className="mt-2 text-xs text-violet-700">
                            Processing one product every 1 minute. Please keep this page open.
                        </p>
                    )}
                    {aiAutofillProgress.results?.length > 0 && (
                        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">
                            {aiAutofillProgress.results.map((item) => (
                                <li
                                    key={item.productId}
                                    className={item.success ? 'text-emerald-700' : 'text-red-700'}
                                >
                                    {item.success
                                        ? `✓ ${item.name || item.productId}`
                                        : `✕ ${item.name || item.productId}: ${item.error}`}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}


            {hasSelectedProducts && (
                <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                    <div className="text-sm font-medium text-orange-900">
                        {selectedProductIds.length} product(s) selected
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedProductIds([])}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                            Clear Selection
                        </button>
                        <button
                            type="button"
                            onClick={runAiAutofillQueue}
                            disabled={aiAutofillRunning}
                            className="px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {aiAutofillRunning ? 'AI Running...' : 'AI Auto Fill'}
                        </button>
                        <button
                            type="button"
                            onClick={openBulkEditModal}
                            className="px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition"
                        >
                            Bulk Edit
                        </button>
                        {selectedCategory ? (
                            <button
                                type="button"
                                onClick={() => openRemoveFromCategoryModal(selectedProductIds)}
                                disabled={removingFromCategory}
                                className="px-3 py-2 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {removingFromCategory ? 'Removing...' : `Remove from ${selectedCategoryName}`}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={deleteSelectedProducts}
                            disabled={deletingBulkProducts}
                            className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {deletingBulkProducts ? 'Deleting...' : 'Bulk Delete'}
                        </button>
                    </div>
                </div>
            )}

            <div className="relative w-full overflow-x-auto">
            {listLoading ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-white/50 pt-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                </div>
            ) : null}
            <table className={`w-full ${showDetailColumns ? 'min-w-[1100px]' : 'min-w-[900px]'} text-left ring ring-slate-200 rounded overflow-hidden text-sm transition-opacity ${listLoading ? 'opacity-60' : ''}`}>
                <thead className="bg-slate-50 text-gray-700 uppercase tracking-wider">
                    <tr>
                        <th className="px-4 py-3">
                            <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleSelectAllVisibleProducts}
                                className="h-4 w-4 rounded border-gray-300"
                                aria-label="Select all visible products"
                            />
                        </th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3 hidden md:table-cell">Details</th>
                        <th className="px-4 py-3 hidden lg:table-cell">SKU</th>
                        <th className={`px-4 py-3 ${showDetailColumns ? '' : 'hidden'}`}>Categories</th>
                        <th className={`px-4 py-3 ${showDetailColumns ? '' : 'hidden'}`}>Description</th>
                        <th className="px-4 py-3">Sale price</th>
                        <th className="px-4 py-3 hidden sm:table-cell">Fast Delivery</th>
                            <th className="px-4 py-3 hidden sm:table-cell">Frequently</th>
                        <th className="px-4 py-3 hidden sm:table-cell">Online</th>
                        <th className="px-4 py-3">Stock</th>
                        <th className="px-4 py-3">Actions</th>
                    </tr>
                </thead>
                <tbody className="text-slate-700">
                    {paginatedProducts.map((product) => (
                        <tr key={product._id} className="border-t border-gray-200 hover:bg-gray-50">
                            <td className="px-4 py-3">
                                <input
                                    type="checkbox"
                                    checked={selectedProductIds.includes(String(product._id))}
                                    onChange={() => toggleProductSelection(product._id)}
                                    className="h-4 w-4 rounded border-gray-300"
                                    aria-label={`Select product ${product.name}`}
                                />
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex gap-2 items-center max-w-xs">
                                    {getProductListImageSrc(product) ? (
                                        <img
                                            width={40}
                                            height={40}
                                            className='h-10 w-10 rounded border border-slate-200 bg-white object-cover p-1 shadow flex-shrink-0'
                                            src={getProductListImageSrc(product)}
                                            alt={product.name || 'Product image'}
                                            loading="lazy"
                                            referrerPolicy="no-referrer"
                                            onError={(event) => {
                                                event.currentTarget.style.display = 'none'
                                                const placeholder = event.currentTarget.nextElementSibling
                                                if (placeholder) {
                                                    placeholder.classList.remove('hidden')
                                                }
                                            }}
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-[10px] font-medium text-slate-400">
                                            N/A
                                        </div>
                                    )}
                                    {getProductListImageSrc(product) ? (
                                        <div className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-[10px] font-medium text-slate-400">
                                            N/A
                                        </div>
                                    ) : null}
                                    <div className="min-w-0 flex-1">
                                        <span className="break-words line-clamp-2 text-sm font-medium" title={product.name}>{product.name}</span>
                                        <div className="mt-1 md:hidden">
                                            <ProductDetailCompletenessDots product={product} compact />
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell align-top">
                                <ProductDetailCompletenessDots product={product} />
                            </td>
                            <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{product.sku || '-'}</td>
                            <td className={`px-4 py-3 align-top ${showDetailColumns ? '' : 'hidden'}`}>
                                {getDisplayCategoryLabels(product).length > 0 ? (
                                    <CompactPills
                                        items={getDisplayCategoryLabels(product)}
                                        maxVisible={MAX_VISIBLE_CATEGORIES}
                                        pillClassName="inline-block max-w-[160px] truncate px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
                                        moreClassName="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded"
                                    />
                                ) : (
                                    <span className="text-slate-400">-</span>
                                )}
                            </td>
                            <td className={`px-4 py-3 max-w-xs text-slate-600 break-words ${showDetailColumns ? '' : 'hidden'}`} title={product.description?.replace(/<[^>]*>/g, ' ').trim() || '-'}>
                                {truncateText(product.description, 100)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{currency} {formatAmount(product.price)}</td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        onChange={() => toast.promise(toggleFastDelivery(product._id), {
                                            loading: 'Updating...',
                                            success: (message) => message || 'Fast delivery updated',
                                            error: (error) => error?.response?.data?.error || error?.message || 'Failed to update fast delivery',
                                        })} 
                                        checked={product.fastDelivery || false} 
                                    />
                                    <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-blue-600 transition-colors duration-200"></div>
                                    <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                </label>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                                <div className="flex flex-col gap-1">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            onChange={() => toast.promise(toggleEnableFBT(product), {
                                                loading: 'Updating...',
                                                success: (message) => message || 'Frequently bought together updated',
                                                error: (error) => error?.response?.data?.error || error?.message || 'Failed to update frequently bought together',
                                            })}
                                            checked={Boolean(product.enableFBT)}
                                        />
                                        <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-violet-600 transition-colors duration-200"></div>
                                        <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                    </label>
                                    <span className={`text-[11px] font-medium ${product.enableFBT ? 'text-violet-700' : 'text-slate-500'}`}>
                                        {product.enableFBT ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                                <div className="flex flex-col gap-1">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            onChange={() => confirmTogglePublished(product)}
                                            checked={isProductOnline(product)}
                                        />
                                        <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 transition-colors duration-200"></div>
                                        <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                    </label>
                                    <span className={`text-[11px] font-medium ${isProductOnline(product) ? 'text-emerald-700' : 'text-slate-500'}`}>
                                        {isProductOnline(product) ? 'Online' : 'Offline'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" onChange={() => confirmToggleStock(product)} checked={product.inStock} />
                                    <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:bg-green-600 transition-colors duration-200"></div>
                                    <span className="dot absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ease-in-out peer-checked:translate-x-4"></span>
                                </label>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => handleOpenFbtModal(product)}
                                        className="px-3 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 transition"
                                    >
                                        FBT
                                    </button>
                                    <button 
                                        onClick={() => handleEdit(product)}
                                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                                    >
                                        Edit
                                    </button>
                                    {selectedCategory ? (
                                        <button
                                            type="button"
                                            onClick={() => openRemoveFromCategoryModal([String(product._id)])}
                                            disabled={removingFromCategory}
                                            className="px-3 py-1 border border-orange-300 bg-orange-50 text-orange-800 text-xs rounded hover:bg-orange-100 transition disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Remove from category
                                        </button>
                                    ) : null}
                                    <button 
                                        onClick={() => handleDelete(product)}
                                        className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {paginatedProducts.length === 0 && (
                        <tr className="border-t border-gray-200">
                            <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                                No products found for the current filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>

            <div className="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                    Showing {paginationStart}-{paginationEnd} of {listTotal} product{listTotal !== 1 ? 's' : ''}
                </p>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Previous
                    </button>

                    <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, index) => index + 1)
                            .filter((page) => totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - safeCurrentPage) <= 1)
                            .map((page, index, pages) => {
                                const previousPage = pages[index - 1]
                                const shouldInsertGap = previousPage && page - previousPage > 1

                                return (
                                    <div key={page} className="flex items-center gap-1">
                                        {shouldInsertGap ? <span className="px-1 text-slate-400">...</span> : null}
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage(page)}
                                            className={`h-9 min-w-9 rounded-lg px-3 text-sm font-medium transition ${
                                                page === safeCurrentPage
                                                    ? 'bg-slate-900 text-white'
                                                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            {page}
                                        </button>
                                    </div>
                                )
                            })}
                    </div>

                    <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            {showEditModal && (
                <ProductForm 
                    product={editingProduct}
                    onClose={() => {
                        setShowEditModal(false)
                        setEditingProduct(null)
                    }}
                    onSubmitSuccess={handleUpdateSuccess}
                />
            )}

            {showBulkEditModal && (
                <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" onClick={closeBulkEditModal}>
                    <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900">Bulk Edit Products</h2>
                                <p className="text-sm text-slate-600">Update {selectedProductIds.length} selected product(s) at once.</p>
                            </div>
                            <button onClick={closeBulkEditModal} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="block text-sm font-medium text-slate-700">Stock status</span>
                                    <select value={bulkEditForm.inStock} onChange={(e) => setBulkEditForm((prev) => ({ ...prev, inStock: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5">
                                        <option value="keep">Keep current</option>
                                        <option value="enable">Mark in stock</option>
                                        <option value="disable">Mark out of stock</option>
                                    </select>
                                </label>
                                <label className="space-y-2">
                                    <span className="block text-sm font-medium text-slate-700">Fast delivery</span>
                                    <select value={bulkEditForm.fastDelivery} onChange={(e) => setBulkEditForm((prev) => ({ ...prev, fastDelivery: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5">
                                        <option value="keep">Keep current</option>
                                        <option value="enable">Enable</option>
                                        <option value="disable">Disable</option>
                                    </select>
                                </label>
                                <label className="space-y-2">
                                    <span className="block text-sm font-medium text-slate-700">Free shipping</span>
                                    <select value={bulkEditForm.freeShippingEligible} onChange={(e) => setBulkEditForm((prev) => ({ ...prev, freeShippingEligible: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5">
                                        <option value="keep">Keep current</option>
                                        <option value="enable">Enable</option>
                                        <option value="disable">Disable</option>
                                    </select>
                                </label>
                                <label className="space-y-2">
                                    <span className="block text-sm font-medium text-slate-700">Stock quantity</span>
                                    <input type="number" min="0" value={bulkEditForm.stockQuantity} onChange={(e) => setBulkEditForm((prev) => ({ ...prev, stockQuantity: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Leave blank to keep current" />
                                </label>
                                <label className="space-y-2">
                                    <span className="block text-sm font-medium text-slate-700">Price</span>
                                    <input type="number" min="0" step="0.01" value={bulkEditForm.price} onChange={(e) => setBulkEditForm((prev) => ({ ...prev, price: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Leave blank to keep current" />
                                </label>
                                <label className="space-y-2">
                                    <span className="block text-sm font-medium text-slate-700">AED / MRP</span>
                                    <input type="number" min="0" step="0.01" value={bulkEditForm.AED} onChange={(e) => setBulkEditForm((prev) => ({ ...prev, AED: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Leave blank to keep current" />
                                </label>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={closeBulkEditModal} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">Cancel</button>
                                <button type="button" onClick={saveBulkEdit} disabled={bulkEditSaving} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:cursor-not-allowed disabled:opacity-60">
                                    {bulkEditSaving ? 'Saving...' : 'Apply Bulk Edit'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showFbtModal && (
                <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" onClick={closeFbtModal}>
                    <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900">Frequently Bought Together</h2>
                                <p className="text-sm text-slate-600 max-w-[680px] truncate">{fbtTargetProduct?.name}</p>
                            </div>
                            <button onClick={closeFbtModal} className="text-slate-500 hover:text-slate-800 text-sm">Close</button>
                        </div>

                        {fbtConfigLoading ? (
                            <div className="px-5 py-8 text-slate-600">Loading FBT configuration...</div>
                        ) : (
                            <div className="px-5 py-4 space-y-4">
                                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                                    <input
                                        type="checkbox"
                                        checked={enableFBT}
                                        onChange={(e) => setEnableFBT(e.target.checked)}
                                    />
                                    Enable frequently bought together
                                </label>

                                {enableFBT ? (
                                    <>
                                        <div>
                                            <p className="mb-2 text-sm font-medium text-slate-800">Bundle pricing</p>
                                            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name="fbtPricingMode"
                                                        checked={fbtPricingMode === 'none'}
                                                        onChange={() => {
                                                            setFbtPricingMode('none')
                                                            setFbtBundlePrice('')
                                                            setFbtBundleDiscount('')
                                                        }}
                                                    />
                                                    No discount
                                                </label>
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name="fbtPricingMode"
                                                        checked={fbtPricingMode === 'percent'}
                                                        onChange={() => {
                                                            setFbtPricingMode('percent')
                                                            setFbtBundlePrice('')
                                                        }}
                                                    />
                                                    Percentage discount
                                                </label>
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name="fbtPricingMode"
                                                        checked={fbtPricingMode === 'fixed'}
                                                        onChange={() => {
                                                            setFbtPricingMode('fixed')
                                                            setFbtBundleDiscount('')
                                                        }}
                                                    />
                                                    Fixed bundle price
                                                </label>
                                            </div>

                                            {fbtPricingMode === 'percent' ? (
                                                <div className="mt-3">
                                                    <label className="mb-1 block text-sm font-medium text-slate-800">FBT discount (%)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.1"
                                                        value={fbtBundleDiscount}
                                                        onChange={(e) => setFbtBundleDiscount(e.target.value)}
                                                        className="w-full max-w-[220px] rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            ) : null}

                                            {fbtPricingMode === 'fixed' ? (
                                                <div className="mt-3">
                                                    <label className="mb-1 block text-sm font-medium text-slate-800">Fixed bundle price ({currency})</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={fbtBundlePrice}
                                                        onChange={(e) => setFbtBundlePrice(e.target.value)}
                                                        className="w-full max-w-[220px] rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                                        placeholder="e.g. 99.00"
                                                    />
                                                    <p className="mt-1 text-xs text-slate-500">Customers pay this total when buying the bundle together.</p>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div>
                                            <p className="mb-2 text-sm font-medium text-slate-800">Selected products</p>
                                            {selectedFbtProducts.length === 0 ? (
                                                <p className="text-sm text-slate-500">No products selected yet. Search below to add up to 10.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {selectedFbtProducts.map((item) => (
                                                        <div key={item._id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                                            <Image
                                                                src={item.images?.[0] || 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png'}
                                                                alt={item.name}
                                                                width={34}
                                                                height={34}
                                                                className="rounded border border-slate-200 object-cover"
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm text-slate-900">{item.name}</p>
                                                                <p className="text-xs text-slate-500">{currency} {formatAmount(item.price)}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFbtProduct(item._id)}
                                                                className="text-sm font-medium text-red-600 hover:text-red-700"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-slate-800">Add products</label>
                                            <input
                                                type="text"
                                                value={searchFbt}
                                                onChange={(e) => setSearchFbt(e.target.value)}
                                                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
                                                placeholder="Search products by name, SKU or tags"
                                            />
                                            <p className="mt-1 text-xs text-slate-500">
                                                {debouncedSearchFbt.trim().length < 2
                                                    ? 'Type at least 2 characters to search. You can select up to 10 products.'
                                                    : fbtCatalogLoading
                                                        ? 'Searching products...'
                                                        : fbtSearchMatches.length === 0
                                                            ? 'No matching products found.'
                                                            : `Showing ${fbtSearchMatches.length}${fbtSearchTotal > fbtSearchMatches.length ? ` of ${fbtSearchTotal}` : ''} matches.`}
                                            </p>
                                        </div>

                                        {debouncedSearchFbt.trim().length >= 2 ? (
                                            <div className="max-h-[240px] overflow-y-auto rounded-lg border border-slate-200">
                                                {fbtCatalogLoading ? (
                                                    <div className="p-4 text-sm text-slate-500">Searching products...</div>
                                                ) : fbtSearchMatches.length === 0 ? (
                                                    <div className="p-4 text-sm text-slate-500">No products found.</div>
                                                ) : (
                                                    <div className="divide-y divide-slate-100">
                                                        {fbtSearchMatches.map((item) => (
                                                            <button
                                                                key={item._id}
                                                                type="button"
                                                                onClick={() => addFbtProduct(item)}
                                                                className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                                                            >
                                                                <Image
                                                                    src={item.images?.[0] || 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png'}
                                                                    alt={item.name}
                                                                    width={34}
                                                                    height={34}
                                                                    className="rounded border border-slate-200 object-cover"
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="truncate text-sm text-slate-900">{item.name}</p>
                                                                    <p className="text-xs text-slate-500">{currency} {formatAmount(item.price)}</p>
                                                                </div>
                                                                <span className="text-xs font-semibold text-emerald-700">Add</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </>
                                ) : null}
                            </div>
                        )}

                        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
                            <p className="text-sm text-slate-600">Selected: {selectedFbtProducts.length} / 10</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={closeFbtModal}
                                    disabled={fbtSaving}
                                    className="px-4 py-2 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveFbtConfig}
                                    disabled={fbtSaving || fbtConfigLoading}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {fbtSaving ? 'Saving...' : 'Save FBT'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <RemoveFromCategoryModal
                open={removeCategoryModal.open}
                categoryName={selectedCategoryName || 'this category'}
                items={removeCategoryModal.items}
                onToggle={toggleRemoveModalProduct}
                onCancel={closeRemoveFromCategoryModal}
                onConfirm={confirmRemoveFromCategory}
                isRemoving={removingFromCategory}
            />
            </>
            )}
        </div>
    )
}