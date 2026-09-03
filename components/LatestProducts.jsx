'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import ProductCard from '@/components/ProductCard'
import ProductCarousel from '@/components/ProductCarousel'
import { HOME_SECTION_CLASS, PRODUCT_CARD_CELL_CLASS } from '@/lib/storefrontCarousel'
import { useAuth } from '@/lib/useAuth'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'
import Title from './Title'

const DEFAULT_ITEMS_PER_ROW = 6
const DEFAULT_ROWS = 2

function clampItemsPerRow(value, fallback = DEFAULT_ITEMS_PER_ROW) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(10, Math.round(n)))
}

function clampRows(value, fallback = DEFAULT_ROWS) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(6, Math.round(n)))
}

function normalizeLayoutStyle(style) {
  if (style === 'carousel' || style === 'horizontal') return 'carousel'
  return 'grid'
}

// Featured selection component (only show admin-selected featured products)
const BestSelling = ({
  initialProducts = null,
  initialSectionTitle = null,
  initialSectionDescription = null,
  initialSectionTitleAr = null,
  initialSectionDescriptionAr = null,
  initialLayout = null,
}) => {
  const hasInitialProducts = Array.isArray(initialProducts) && initialProducts.length > 0
  const { getToken, user, loading: authLoading } = useAuth()
  const { t, isArabic } = useStorefrontI18n()
  const [featuredProducts, setFeaturedProducts] = useState(hasInitialProducts ? initialProducts : [])
  const [isLoading, setIsLoading] = useState(!hasInitialProducts)
  const [error, setError] = useState(null)
  const [sectionTitle, setSectionTitle] = useState(initialSectionTitle || 'Craziest sale of the year!')
  const [sectionDescription, setSectionDescription] = useState(initialSectionDescription || "Grab the best deals before they're gone!")
  const [sectionTitleAr, setSectionTitleAr] = useState(String(initialSectionTitleAr || ''))
  const [sectionDescriptionAr, setSectionDescriptionAr] = useState(String(initialSectionDescriptionAr || ''))
  const [layoutSettings, setLayoutSettings] = useState(() => {
    const homeMenu = initialLayout || {}
    return {
      style: normalizeLayoutStyle(homeMenu.style),
      itemsPerRow: clampItemsPerRow(homeMenu.itemsPerRow, DEFAULT_ITEMS_PER_ROW),
      rows: clampRows(homeMenu.rows, DEFAULT_ROWS),
    }
  })
  const fetchControllerRef = useRef(null)
  const retryTimerRef = useRef(null)
  const featuredProductsLengthRef = useRef(hasInitialProducts ? initialProducts.length : 0)
  const skipInitialFetchRef = useRef(hasInitialProducts)

  const visibleCount = Math.max(
    1,
    Math.min(40, clampItemsPerRow(layoutSettings.itemsPerRow) * clampRows(layoutSettings.rows)),
  )
  const titleAr = String(sectionTitleAr || '').trim()
  const descriptionAr = String(sectionDescriptionAr || '').trim()
  const effectiveSectionTitle =
    (isArabic && titleAr ? titleAr : String(sectionTitle || '').trim()) || t('featured.title')
  const effectiveSectionDescription =
    (isArabic && descriptionAr ? descriptionAr : String(sectionDescription || '').trim()) || t('featured.description')
  const isCarousel = layoutSettings.style === 'carousel'

  const fetchFeaturedAndSectionText = useCallback(async () => {
      fetchControllerRef.current?.abort()
      const controller = new AbortController()
      fetchControllerRef.current = controller
      const shouldShowSectionLoader = featuredProductsLengthRef.current === 0

      try {
        if (shouldShowSectionLoader) {
          setIsLoading(true)
        }
        setError(null)

        let headers = undefined
        try {
          const token = await getToken()
          if (token) {
            headers = { Authorization: `Bearer ${token}` }
          }
        } catch {
          // Public users won't have a token; continue without auth header.
        }

        const appearanceRequest = headers
          ? axios.get('/api/store/appearance/sections', {
              headers,
              signal: controller.signal,
              timeout: 10000
            })
          : axios.get('/api/store/appearance/sections/public', {
              signal: controller.signal,
              timeout: 10000
            })

        const [{ data: featuredData }, { data: appearanceData }] = await Promise.all([
          axios.get('/api/store/featured-products', {
            params: { includeProducts: true, limit: visibleCount },
            headers,
            signal: controller.signal,
            timeout: 15000
          }),
          appearanceRequest.catch(() => ({ data: {} }))
        ])

        if (controller.signal.aborted) return

        const homeMenu = appearanceData?.homeMenuCategories || {}
        setLayoutSettings((prev) => ({
          style: normalizeLayoutStyle(homeMenu.style) || prev.style,
          itemsPerRow: clampItemsPerRow(homeMenu.itemsPerRow, prev.itemsPerRow),
          rows: clampRows(homeMenu.rows, prev.rows),
        }))

        if (typeof featuredData?.sectionTitle === 'string') setSectionTitle(featuredData.sectionTitle)
        if (typeof featuredData?.sectionDescription === 'string') setSectionDescription(featuredData.sectionDescription)
        if (typeof featuredData?.sectionTitleAr === 'string') setSectionTitleAr(featuredData.sectionTitleAr)
        if (typeof featuredData?.sectionDescriptionAr === 'string') {
          setSectionDescriptionAr(featuredData.sectionDescriptionAr)
        }

        const resolvedProducts = Array.isArray(featuredData.products) ? featuredData.products : []
        if (resolvedProducts.length > 0) {
          featuredProductsLengthRef.current = resolvedProducts.length
          setFeaturedProducts(resolvedProducts)
          return
        }

        // Fetch featured product IDs from store settings
        const productIds = featuredData.productIds || []

        if (!productIds.length) {
          setFeaturedProducts([])
          setIsLoading(false)
          return
        }

        // Fetch actual product documents
        const { data: productsData } = await axios.post('/api/products/batch', { productIds }, {
          signal: controller.signal,
          timeout: 15000
        })
        if (controller.signal.aborted) return
        const products = productsData.products || []

        featuredProductsLengthRef.current = products.length
        setFeaturedProducts(products)
      } catch (err) {
        if (axios.isCancel(err) || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
          return
        }

        if (process.env.NODE_ENV !== 'production') {
          console.warn('Failed to load featured products', err)
        }

        // Auto-retry once after 3 seconds (handles cold-start DB timeouts)
        if (featuredProductsLengthRef.current === 0) {
          retryTimerRef.current = setTimeout(() => {
            fetchFeaturedAndSectionText()
          }, 3000)
          return
        }

        setError('Could not load featured products')
      } finally {
        if (fetchControllerRef.current === controller) {
          fetchControllerRef.current = null
          if (!controller.signal.aborted) {
            setIsLoading(false)
          }
        }
      }
    }, [getToken, visibleCount])

  useEffect(() => {
    return () => {
      fetchControllerRef.current?.abort()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (authLoading && !hasInitialProducts) return
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      // SSR already has products; still refresh copy (EN/AR) without blocking.
      fetchFeaturedAndSectionText()
      return
    }
    fetchFeaturedAndSectionText()
  }, [fetchFeaturedAndSectionText, user?.uid, authLoading, hasInitialProducts])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const applyLivePayload = (payload) => {
      const nextTitle = payload?.sectionTitle
      const nextDescription = payload?.sectionDescription
      const nextTitleAr = payload?.sectionTitleAr
      const nextDescriptionAr = payload?.sectionDescriptionAr
      const nextLayout = payload?.layout
      if (typeof nextTitle === 'string' && nextTitle.trim()) {
        setSectionTitle(nextTitle)
      }
      if (typeof nextDescription === 'string' && nextDescription.trim()) {
        setSectionDescription(nextDescription)
      }
      if (typeof nextTitleAr === 'string') {
        setSectionTitleAr(nextTitleAr)
      }
      if (typeof nextDescriptionAr === 'string') {
        setSectionDescriptionAr(nextDescriptionAr)
      }
      if (nextLayout && typeof nextLayout === 'object') {
        setLayoutSettings((prev) => ({
          style: normalizeLayoutStyle(nextLayout.style) || prev.style,
          itemsPerRow: clampItemsPerRow(nextLayout.itemsPerRow, prev.itemsPerRow),
          rows: clampRows(nextLayout.rows, prev.rows),
        }))
      }
    }

    const handleStorage = (event) => {
      if (event.key !== 'featuredSectionLive' || !event.newValue) return
      try {
        applyLivePayload(JSON.parse(event.newValue))
      } catch {
        // ignore malformed storage payload
      }
    }

    const handleLiveUpdate = (event) => {
      applyLivePayload(event?.detail)
      // Also refresh products and canonical API values in background.
      fetchFeaturedAndSectionText()
    }

    // On mount, use latest live payload if present.
    try {
      const cached = window.localStorage.getItem('featuredSectionLive')
      if (cached) applyLivePayload(JSON.parse(cached))
    } catch {
      // ignore malformed cache
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('featuredSectionLiveUpdate', handleLiveUpdate)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('featuredSectionLiveUpdate', handleLiveUpdate)
    }
  }, [fetchFeaturedAndSectionText])

  const visibleProducts = featuredProducts.slice(0, visibleCount)

  return (
    <div className={`${HOME_SECTION_CLASS} relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6`}>
      <Title
        title={effectiveSectionTitle}
        description={effectiveSectionDescription}
        visibleButton={false}
      />

      {isCarousel ? (
        <div className="mt-6">
          {isLoading && featuredProducts.length === 0 ? (
            <div className="flex gap-3 overflow-hidden">
              {Array(Math.min(visibleCount, 6)).fill(0).map((_, idx) => (
                <div
                  key={idx}
                  className={`${PRODUCT_CARD_CELL_CLASS} w-[42%] shrink-0 animate-pulse overflow-hidden rounded-[2px] border border-slate-200 bg-white sm:w-[28%] lg:w-[15%]`}
                >
                  <div className="aspect-square w-full bg-gray-200" />
                  <div className="space-y-2 p-2.5">
                    <div className="h-4 rounded bg-gray-200" />
                    <div className="h-4 w-2/3 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ProductCarousel
              products={visibleProducts}
              priorityCount={4}
              cardsPerRow={clampItemsPerRow(layoutSettings.itemsPerRow)}
              showArrows
              showMobileArrows
              edgeBleed={false}
            />
          )}
        </div>
      ) : (
        <div
          className="featured-products-grid mt-6 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3"
          style={{ '--desktop-cols': String(clampItemsPerRow(layoutSettings.itemsPerRow)) }}
        >
          {isLoading && featuredProducts.length === 0
            ? Array(visibleCount).fill(0).map((_, idx) => (
                <div key={idx} className={`${PRODUCT_CARD_CELL_CLASS} animate-pulse overflow-hidden rounded-[2px] border border-slate-200 bg-white`}>
                  <div className="aspect-square w-full bg-gray-200" />
                  <div className="space-y-2 p-2.5">
                    <div className="h-4 rounded bg-gray-200" />
                    <div className="h-4 w-2/3 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                </div>
              ))
            : visibleProducts.map((product, index) => (
                <ProductCard key={product._id || product.id} product={product} priorityImages={index < 4} />
              ))}
        </div>
      )}

      <style jsx>{`
        @media (min-width: 768px) {
          .featured-products-grid {
            grid-template-columns: repeat(var(--desktop-cols), minmax(0, 1fr)) !important;
          }
        }
      `}</style>

      {!isLoading && !error && featuredProducts.length === 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">{t('featured.empty')}</div>
      )}

      {error && (
        <div className="mt-6 text-center text-sm text-red-500">{error}</div>
      )}
    </div>
  )
}

export default BestSelling
