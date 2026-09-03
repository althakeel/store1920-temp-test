'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { withImageKitDelivery } from '@/lib/imageKitDelivery'

const MOBILE_AUTO_SCROLL_MS = 3500

function ProductBannerCard({ banner, className = '' }) {
  const link = String(banner?.link || '').trim()
  const Card = link ? Link : 'div'
  const original = String(banner?.image || '').trim()
  const image = original
    ? withImageKitDelivery(original, { width: 640, quality: 72 })
    : ''
  const imageSrcSet = original
    ? [
      `${withImageKitDelivery(original, { width: 360, quality: 72 })} 360w`,
      `${withImageKitDelivery(original, { width: 640, quality: 72 })} 640w`,
    ].join(', ')
    : undefined
  const hasImage = Boolean(image)
  const hasTextOverlay =
    !hasImage &&
    (String(banner?.title || '').trim() ||
      String(banner?.subtitle || '').trim() ||
      String(banner?.buttonText || '').trim())

  return (
    <Card href={link || undefined} className={`shop-showcase-product-card ${className}`.trim()}>
      <img
        className="shop-showcase-product-image"
        src={image || '/assets/placeholder.png'}
        srcSet={imageSrcSet}
        sizes="(max-width: 639px) 90vw, 280px"
        alt={banner?.title || 'Promotional banner'}
        loading="lazy"
        decoding="async"
      />
      {hasTextOverlay ? (
        <>
          <div className="shop-showcase-product-overlay" />
          <div className="shop-showcase-product-content">
            {String(banner?.title || '').trim() ? (
              <div className="shop-showcase-product-title">{banner.title}</div>
            ) : null}
            {String(banner?.subtitle || '').trim() ? (
              <div className="shop-showcase-product-subtitle">{banner.subtitle}</div>
            ) : null}
            {String(banner?.buttonText || '').trim() ? (
              <span className="shop-showcase-product-button">{banner.buttonText}</span>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  )
}

export default function ShowcaseProductBanners({ banners = [] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

  const visibleBanners = useMemo(
    () =>
      (Array.isArray(banners) ? banners : [])
        .slice(0, 4)
        .filter((banner) => String(banner?.image || '').trim()),
    [banners]
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)')

    const syncViewport = () => setIsMobile(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)

    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [visibleBanners.length])

  const bannersSignature = useMemo(
    () => visibleBanners.map((banner) => `${banner?.image || ''}:${banner?.link || ''}`).join('|'),
    [visibleBanners],
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [bannersSignature])

  const safeIndex = visibleBanners.length
    ? Math.min(activeIndex, visibleBanners.length - 1)
    : 0

  useEffect(() => {
    if (!isMobile || visibleBanners.length <= 1) return undefined

    const timerId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % visibleBanners.length)
    }, MOBILE_AUTO_SCROLL_MS)

    return () => window.clearInterval(timerId)
  }, [isMobile, visibleBanners.length])

  if (visibleBanners.length === 0) return null

  if (isMobile) {
    return (
      <div className="shop-showcase-product-mobile-carousel" aria-roledescription="carousel" dir="ltr">
        <div
          className="shop-showcase-product-mobile-track"
          dir="ltr"
          style={{ transform: `translate3d(-${safeIndex * 100}%, 0, 0)` }}
        >
          {visibleBanners.map((banner, index) => (
            <div key={`mobile-showcase-banner-${index}`} className="shop-showcase-product-mobile-slide">
              <ProductBannerCard banner={banner} className="shop-showcase-product-mobile-card" />
            </div>
          ))}
        </div>

        {visibleBanners.length > 1 ? (
          <div className="shop-showcase-product-mobile-dots">
            {visibleBanners.map((_, index) => (
              <button
                key={`mobile-showcase-dot-${index}`}
                type="button"
                aria-label={`Go to banner ${index + 1}`}
                className={`shop-showcase-product-mobile-dot ${
                  index === safeIndex ? 'shop-showcase-product-mobile-dot-active' : ''
                }`}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`shop-showcase-product-grid shop-showcase-product-grid--count-${visibleBanners.length}`}>
      {visibleBanners.map((banner, index) => (
        <ProductBannerCard key={`desktop-showcase-banner-${index}`} banner={banner} />
      ))}
    </div>
  )
}
