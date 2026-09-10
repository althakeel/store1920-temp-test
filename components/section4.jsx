'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import ProductCarousel from '@/components/ProductCarousel'
import {
  CAROUSEL_PRODUCT_CARD_CLASS,
  CATEGORY_SLIDER_SIDE_IMAGE_CLASS,
  CATEGORY_SLIDER_LAYOUT_CLASS,
  HOME_SECTION_CLASS,
  HOME_SECTION_GRID_INNER_CLASS,
  CATEGORY_SLIDER_PANEL_CLASS,
  SIDE_IMAGE_SLIDER_PANEL_CLASS,
  getSideImageLayoutCardsPerRow,
  getCategorySliderProductCardClass,
} from '@/lib/storefrontCarousel'
import { normalizeCategorySliderBackground, normalizeCategorySliderSideImagePosition, normalizeCategorySliderAutoSlide, normalizeCategorySliderAutoSlideInterval } from '@/lib/categorySliderTheme'
import { HomeSideImageSliderSkeleton } from '@/components/home/HomeSectionSkeletons'
import BannerSlider from '@/components/BannerSlider'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'
import { getContentDirection } from '@/lib/storefrontLanguage'
import { getLocalizedCategorySliderSubtitle, getLocalizedCategorySliderTitle } from '@/lib/categorySliderCopy'

const Section4 = ({ sections: initialSections = null, loading: loadingProp = false }) => {
  const shouldSelfFetch = initialSections == null
  const [sections, setSections] = useState(Array.isArray(initialSections) ? initialSections : [])
  const [loading, setLoading] = useState(loadingProp || shouldSelfFetch)

  useEffect(() => {
    if (Array.isArray(initialSections) && initialSections.length > 0) {
      setSections(initialSections)
      setLoading(false)
      return undefined
    }

    if (initialSections !== null && initialSections !== undefined) {
      return undefined
    }

    let cancelled = false

    const loadSections = () => {
      fetch('/api/public/featured-sections', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : { sections: [] }))
        .then((data) => {
          if (!cancelled) {
            setSections(Array.isArray(data?.sections) ? data.sections : [])
          }
        })
        .catch(() => {
          if (!cancelled) setSections([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    loadSections()

    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') loadSections()
    }
    document.addEventListener('visibilitychange', refreshOnVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [initialSections])

  const bannerInsertAfterIndex = sections.length > 1 ? Math.floor((sections.length - 1) / 2) : -1

  if (loading) {
    return (
      <div className={HOME_SECTION_CLASS}>
        <div className={`${HOME_SECTION_GRID_INNER_CLASS} space-y-4 lg:space-y-8`}>
          {Array.from({ length: 2 }).map((_, index) => (
            <HomeSideImageSliderSkeleton key={`section4-skeleton-${index}`} withSideImage={index === 0} />
          ))}
        </div>
      </div>
    )
  }

  if (!sections || sections.length === 0) return null

  return (
    <div className={HOME_SECTION_CLASS}>
      <div className={`${HOME_SECTION_GRID_INNER_CLASS} space-y-4 lg:space-y-8`}>
        {sections.map((section, sectionIdx) => (
          <React.Fragment key={section._id || sectionIdx}>
            <HorizontalSlider section={section} />
            {sectionIdx === bannerInsertAfterIndex && (
              <BannerSlider className="mt-0 mb-0 !mx-0 !max-w-none !px-0" />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

const SkeletonLoader = ({ hasSideImage = false, cardsPerRow = 6 }) => {
  if (hasSideImage) {
    return <HomeSideImageSliderSkeleton withSideImage cardsPerRow={cardsPerRow} showTitle={false} />
  }

  return (
    <div className="flex gap-3 overflow-hidden pb-2">
      {[...Array(cardsPerRow === 5 ? 5 : 6)].map((_, idx) => (
        <div
          key={idx}
          className={`${getCategorySliderProductCardClass(cardsPerRow)} overflow-hidden rounded-[2px] border border-gray-100 bg-white animate-pulse`}
        >
          <div className="aspect-square w-full bg-gray-100" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-4/5 rounded bg-gray-100" />
            <div className="h-4 w-1/2 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function resolveSectionProducts(section) {
  if (Array.isArray(section?.products) && section.products.length > 0) {
    return section.products
  }
  return []
}

const HorizontalSlider = ({ section }) => {
  const { language } = useStorefrontI18n()
  const title = getLocalizedCategorySliderTitle(section, language)
  const subtitle = getLocalizedCategorySliderSubtitle(section, language)
  const embeddedProducts = useMemo(() => resolveSectionProducts(section), [section.products])
  const [sectionProducts, setSectionProducts] = useState(embeddedProducts)
  const [loading, setLoading] = useState(
    () => embeddedProducts.length === 0 && Array.isArray(section.productIds) && section.productIds.length > 0
  )
  const productIdsKey = useMemo(
    () => (Array.isArray(section.productIds) ? section.productIds.join(',') : ''),
    [section.productIds]
  )

  useEffect(() => {
    if (embeddedProducts.length > 0) {
      setSectionProducts(embeddedProducts)
      setLoading(false)
      return undefined
    }

    let cancelled = false

    const resolveProducts = async () => {
      if (!section.productIds || !Array.isArray(section.productIds) || section.productIds.length === 0) {
        if (!cancelled) {
          setSectionProducts([])
          setLoading(false)
        }
        return
      }

      setLoading(true)

      try {
        const response = await fetch('/api/products/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: section.productIds }),
        })

        if (response.ok) {
          const data = await response.json()
          if (!cancelled) {
            setSectionProducts(Array.isArray(data?.products) ? data.products : [])
            setLoading(false)
          }
          return
        }
      } catch {
        // Fall through to empty state.
      }

      if (!cancelled) {
        setSectionProducts([])
        setLoading(false)
      }
    }

    resolveProducts()

    return () => {
      cancelled = true
    }
  }, [embeddedProducts, productIdsKey, section.productIds])

  if (sectionProducts.length === 0 && !loading) return null

  const sideImage = String(section.sideImage || '').trim()
  const hasSideImage = Boolean(sideImage)
  const sideImagePosition = normalizeCategorySliderSideImagePosition(section.sideImagePosition)
  const imageFirst = sideImagePosition === 'left'
  const cardsPerRow = getSideImageLayoutCardsPerRow(hasSideImage, section.cardsPerRow)
  const panelBackground = normalizeCategorySliderBackground(section.backgroundColor)
  const shouldAutoSlide =
    sectionProducts.length > 1 &&
    normalizeCategorySliderAutoSlide(section.autoSlide)

  const sideImageBlock = hasSideImage ? (
    <div className={CATEGORY_SLIDER_SIDE_IMAGE_CLASS}>
      <Image
        src={sideImage}
        alt={title || 'Featured collection'}
        fill
        className="object-cover"
        sizes="(max-width: 1023px) 100vw, (min-width: 1536px) 320px, (min-width: 1280px) 280px, 240px"
        priority={false}
      />
    </div>
  ) : null

  const sliderPanel = (
    <div
      className={`min-w-0 w-full ${hasSideImage ? SIDE_IMAGE_SLIDER_PANEL_CLASS : CATEGORY_SLIDER_PANEL_CLASS} rounded-2xl px-3 py-3 xl:px-4 xl:py-4`}
      style={{ backgroundColor: panelBackground }}
    >
      <div className={`${hasSideImage ? 'mb-3 lg:mb-2 lg:shrink-0' : 'mb-3 lg:mb-5'}`}>
        <h2 className={`text-start font-bold text-gray-900 ${hasSideImage ? 'text-lg lg:line-clamp-1 lg:text-base xl:text-lg' : 'text-xl lg:text-2xl'}`}>
          <bdi dir={getContentDirection(title)}>{title}</bdi>
        </h2>
        {subtitle ? (
          <p
            className={`text-start text-gray-500 ${hasSideImage ? 'mt-0.5 line-clamp-2 text-xs lg:line-clamp-1 lg:text-[10px] xl:text-xs' : 'mt-0.5 text-xs lg:text-sm'}`}
          >
            <bdi dir={getContentDirection(subtitle)}>{subtitle}</bdi>
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className={`px-0 ${hasSideImage ? 'lg:min-h-0 lg:flex-1' : ''}`}>
          <SkeletonLoader hasSideImage={hasSideImage} cardsPerRow={cardsPerRow} />
        </div>
      ) : (
        <div className={hasSideImage ? 'min-w-0 max-lg:overflow-visible lg:min-h-0 lg:flex-1 lg:w-full lg:overflow-hidden' : 'min-w-0 max-lg:overflow-visible'}>
          <ProductCarousel
            products={sectionProducts}
            priorityCount={hasSideImage ? 5 : 4}
            cardsPerRow={cardsPerRow}
            cardWidthVariant="categorySlider"
            autoSlide={shouldAutoSlide}
            autoSlideIntervalMs={normalizeCategorySliderAutoSlideInterval(section.autoSlideIntervalMs)}
            compact={hasSideImage}
            compactDesktopOnly={hasSideImage}
            compactBottom={hasSideImage}
            showArrows={!shouldAutoSlide}
            showMobileArrows={!shouldAutoSlide}
            edgeBleed
            className="w-full min-w-0 lg:overflow-hidden"
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="w-full min-w-0 max-w-full lg:overflow-hidden">
      <div className={hasSideImage ? CATEGORY_SLIDER_LAYOUT_CLASS : ''}>
        {imageFirst ? sideImageBlock : null}
        {sliderPanel}
        {!imageFirst ? sideImageBlock : null}
      </div>
    </div>
  )
}

export default Section4
