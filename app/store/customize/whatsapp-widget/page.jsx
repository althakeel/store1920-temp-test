'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, Loader2, MessageCircle, Package, Save, Search, Upload, X } from 'lucide-react'
import { useAuth } from '@/lib/useAuth'
import { getProductThumbnailUrl, normalizeProductImages } from '@/lib/productMedia'
import { PLACEHOLDER_IMAGE } from '@/lib/mediaUrls'
import {
  DEFAULT_WHATSAPP_PRODUCT_WIDGET,
  normalizeWhatsAppPhoneDigits,
  normalizeWhatsAppProductWidget,
} from '@/lib/whatsappProductWidget'

const PRODUCTS_PER_PAGE = 24

function normalizeProductId(productId) {
  return String(productId?._id || productId || '').trim()
}

function ProductThumb({ product, size = 48 }) {
  const [failed, setFailed] = useState(false)
  const mergedImages = [
    ...normalizeProductImages(product?.images),
    ...normalizeProductImages(product?.externalImages),
  ]
  const imageSrc = getProductThumbnailUrl(
    { ...product, images: mergedImages },
    { fallback: PLACEHOLDER_IMAGE },
  )
  const showImage = imageSrc && imageSrc !== PLACEHOLDER_IMAGE && !failed

  if (!showImage) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300"
        style={{ width: size, height: size }}
      >
        <Package size={Math.max(16, Math.round(size * 0.36))} />
      </div>
    )
  }

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-slate-100"
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

export default function WhatsAppProductWidgetCustomizePage() {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [productsLoading, setProductsLoading] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [hideTawkWhenVisible, setHideTawkWhenVisible] = useState(true)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [messageTemplate, setMessageTemplate] = useState(
    DEFAULT_WHATSAPP_PRODUCT_WIDGET.messageTemplate,
  )
  const [buttonImageUrl, setButtonImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [products, setProducts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PRODUCTS_PER_PAGE,
    total: 0,
    totalPages: 1,
  })
  const productCacheRef = useRef(new Map())
  const abortRef = useRef(null)

  const cacheProducts = useCallback((items = []) => {
    for (const product of items) {
      const id = normalizeProductId(product)
      if (id) productCacheRef.current.set(id, product)
    }
  }, [])

  const selectedProducts = useMemo(
    () => selectedIds.map((id) => productCacheRef.current.get(id)).filter(Boolean),
    [selectedIds, products],
  )

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const { data } = await axios.get('/api/store/appearance/sections', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const widget = normalizeWhatsAppProductWidget(data?.whatsappProductWidget)
      setEnabled(widget.enabled)
      setHideTawkWhenVisible(widget.hideTawkWhenVisible !== false)
      setPhoneNumber(widget.phoneNumber)
      setMessageTemplate(widget.messageTemplate)
      setButtonImageUrl(widget.buttonImageUrl || '')
      setSelectedIds(widget.productIds)

      if (widget.productIds.length) {
        const chunks = []
        for (let i = 0; i < widget.productIds.length; i += 20) {
          chunks.push(widget.productIds.slice(i, i + 20))
        }
        const results = await Promise.all(
          chunks.map(async (ids) => {
            const { data: productData } = await axios.get('/api/store/product', {
              params: { ids: ids.join(',') },
              headers: { Authorization: `Bearer ${token}` },
            })
            return productData?.products || []
          }),
        )
        cacheProducts(results.flat())
      }
    } catch (error) {
      console.error(error)
      toast.error('Failed to load WhatsApp widget settings')
    } finally {
      setLoading(false)
    }
  }, [cacheProducts, getToken])

  const fetchProductsPage = useCallback(async ({
    page = 1,
    search = debouncedSearch,
  } = {}) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

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
      const nextProducts = data.products || []
      setProducts(nextProducts)
      cacheProducts(nextProducts)
      setPagination(data.pagination || {
        page: 1,
        limit: PRODUCTS_PER_PAGE,
        total: nextProducts.length,
        totalPages: 1,
      })
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return
      toast.error('Failed to load products')
    } finally {
      if (!controller.signal.aborted) setProductsLoading(false)
    }
  }, [cacheProducts, debouncedSearch, getToken])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (loading) return
    void fetchProductsPage({ page: 1, search: debouncedSearch })
  }, [debouncedSearch, fetchProductsPage, loading])

  const toggleProduct = (product) => {
    const id = normalizeProductId(product)
    if (!id) return
    cacheProducts([product])
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ))
  }

  const removeSelected = (id) => {
    setSelectedIds((current) => current.filter((item) => item !== id))
  }

  const uploadButtonImage = async (file) => {
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }

    try {
      setUploadingImage(true)
      const token = await getToken()
      const formData = new FormData()
      formData.append('image', file)
      formData.append('type', 'logo')

      const response = await axios.post('/api/store/upload-image', formData, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const url = String(response.data?.url || '').trim()
      if (!url) throw new Error('Upload returned no URL')
      setButtonImageUrl(url)
      toast.success('WhatsApp button image uploaded')
    } catch (error) {
      toast.error(error?.response?.data?.error || error?.message || 'Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  const save = async () => {
    const digits = normalizeWhatsAppPhoneDigits(phoneNumber)
    if (enabled && digits.length < 8) {
      toast.error('Enter a valid WhatsApp number with country code (digits only)')
      return
    }
    if (enabled && selectedIds.length === 0) {
      toast.error('Select at least one product to show the WhatsApp button')
      return
    }

    try {
      setSaving(true)
      const token = await getToken()
      await axios.post('/api/store/appearance/sections', {
        whatsappProductWidget: {
          enabled,
          phoneNumber: digits,
          messageTemplate,
          buttonImageUrl,
          productIds: selectedIds,
          hideTawkWhenVisible,
        },
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success('WhatsApp widget settings saved')
    } catch (error) {
      console.error(error)
      toast.error(error?.response?.data?.error || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500" lang="en" dir="ltr">
        <Loader2 className="animate-spin" size={28} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-slate-800" lang="en" dir="ltr">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/store/customize"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={14} />
            Customize
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <MessageCircle className="text-emerald-600" size={24} />
            WhatsApp product widget
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Choose the WhatsApp number and which products show a chat button on the product page.
            Only selected products display the widget.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Enable WhatsApp widget</span>
            <span className="mt-0.5 block text-sm text-slate-500">
              When on, selected product pages show a floating WhatsApp button.
            </span>
          </span>
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-slate-100 pt-4">
          <input
            type="checkbox"
            checked={hideTawkWhenVisible}
            onChange={(event) => setHideTawkWhenVisible(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Hide Tawk chat on these product pages</span>
            <span className="mt-0.5 block text-sm text-slate-500">
              Keeps Tawk off when the WhatsApp button is visible so the two widgets do not overlap.
            </span>
          </span>
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold text-slate-800">WhatsApp number</span>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="971501234567"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Digits with country code, no spaces or +. Example: 971501234567
            </span>
          </label>

          <div className="block text-sm">
            <span className="mb-1.5 block font-semibold text-slate-800">Widget button image</span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[#25D366] text-white">
                {buttonImageUrl ? (
                  <Image
                    src={buttonImageUrl}
                    alt="WhatsApp button preview"
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <MessageCircle size={26} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {uploadingImage ? 'Uploading...' : 'Upload image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      void uploadButtonImage(file)
                    }}
                  />
                </label>
                {buttonImageUrl ? (
                  <button
                    type="button"
                    onClick={() => setButtonImageUrl('')}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              Optional. Square PNG/JPG works best. Leave empty to use the default WhatsApp icon.
              Click Save after uploading.
            </span>
          </div>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1.5 block font-semibold text-slate-800">Pre-filled message</span>
            <textarea
              value={messageTemplate}
              onChange={(event) => setMessageTemplate(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Use {'{productName}'} and {'{productUrl}'} as placeholders.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Selected products</h2>
            <p className="text-sm text-slate-500">{selectedIds.length} product(s) will show the widget</p>
          </div>
        </div>

        {selectedIds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No products selected yet. Search and tick products below.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {selectedIds.map((id) => {
              const product = productCacheRef.current.get(id)
              return (
                <li
                  key={id}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 py-1 pe-1 ps-1.5 text-sm text-emerald-900"
                >
                  <ProductThumb product={product || { _id: id }} size={28} />
                  <span className="max-w-[14rem] truncate font-medium">
                    {product?.name || id}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSelected(id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100"
                    aria-label="Remove product"
                  >
                    <X size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Choose products</h2>
          <div className="relative w-full max-w-sm">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search products..."
              className="w-full rounded-lg border border-slate-200 py-2 pe-3 ps-9 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>

        {productsLoading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : products.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No products found.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {products.map((product) => {
              const id = normalizeProductId(product)
              const selected = selectedIds.includes(id)
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggleProduct(product)}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-start transition hover:bg-slate-50 ${
                      selected ? 'bg-emerald-50/70' : ''
                    }`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <ProductThumb product={product} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {product.name || 'Untitled product'}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {product.sku || id}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {pagination.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              disabled={pagination.page <= 1 || productsLoading}
              onClick={() => fetchProductsPage({ page: pagination.page - 1 })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || productsLoading}
              onClick={() => fetchProductsPage({ page: pagination.page + 1 })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </section>

      {/* Keep selectedProducts referenced so cache updates re-render chips when products load */}
      <span className="sr-only">{selectedProducts.length} selected loaded</span>
    </div>
  )
}
