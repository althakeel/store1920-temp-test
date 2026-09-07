"use client"

import React, { useEffect, useRef, useState } from 'react'
import Image from '@/components/SafeNextImage'
import Link from 'next/link'
import { FaStar } from 'react-icons/fa'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'
import { addToCart, uploadCart, removeFromCart } from '@/lib/features/cart/cartSlice'
import { useStorefrontMarket } from '@/lib/useStorefrontMarket'
import { useStorefrontI18n } from '@/lib/useStorefrontI18n'

import { getLocalizedProductName } from '@/lib/displayText'
import { showStorefrontActionToast } from '@/lib/storefrontActionToast'
import { PLACEHOLDER_IMAGE as PLACEHOLDER } from '@/lib/mediaUrls'
import {
  getImageUrlAt,
  getProductThumbnailUrl,
  normalizeProductImages,
  resolveCardVideoPreview,
} from '@/lib/productMedia'
import { PRODUCT_CARD_CELL_CLASS, PRODUCT_CARD_SHELL_CLASS } from '@/lib/storefrontCarousel'
import { trackProductAddToCart } from '@/lib/ecommerceTracking'
import { registerItemListImpression, trackSelectItem } from '@/lib/ga4Ecommerce'
import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent'
import { productToGa4Item } from '@/lib/ga4Item'
import { GTM_EVENTS } from '@/lib/gtmEvents'
import { STORE_CURRENCY } from '@/lib/storeCurrency'
import { getProductPath } from '@/lib/productUrl'

const parseAmount = (value) => {
  const num = Number(String(value ?? '').replace(/[^0-9.]/g, ''))
  return Number.isNaN(num) ? 0 : num
}

const getSalePrice = (product) => parseAmount(
  product.price ??
  product.salePrice ?? product.sale_price ??
  product.discountedPrice ?? product.discounted_price ??
  product.sellingPrice ?? product.selling_price ??
  product.offerPrice ?? product.offer_price ??
  product.currentPrice ?? product.current_price
)

const getAEDPrice = (product) => parseAmount(
  product.AED ??
  product.compareAtPrice ?? product.compare_at_price ??
  product.originalPrice ?? product.original_price ??
  product.listPrice ?? product.list_price ??
  product.basePrice ?? product.base_price ??
  product.regularPrice ?? product.regular_price
)

function getAspectRatioClass(ratio) {
  switch (ratio) {
    case '1:1': return 'aspect-square'
    case '4:6': return 'aspect-[2/3]'
    case '2:3': return 'aspect-[2/3]'
    case '3:4': return 'aspect-[3/4]'
    case '16:9': return 'aspect-[16/9]'
    case '9:16': return 'aspect-[9/16]'
    case '4:5': return 'aspect-[4/5]'
    case '5:7': return 'aspect-[5/7]'
    case '7:10': return 'aspect-[7/10]'
    case '5:8': return 'aspect-[5/8]'
    case '3:2': return 'aspect-[3/2]'
    case '8:10': return 'aspect-[8/10]'
    case '11:14': return 'aspect-[11/14]'
    default: return 'aspect-square'
  }
}

const ProductCard = ({
  product,
  priorityImages = false,
  className = '',
  onCardClick,
  compact = false,
  compactDesktopOnly = false,
  itemListId,
  itemListName,
  itemListIndex,
}) => {
  if (!product || typeof product !== 'object') return null
  if (!product.name) return null
  if (!product.slug) return null

  if (
    product.hasOwnProperty('quantity') &&
    product.hasOwnProperty('price') &&
    product.hasOwnProperty('variantOptions')
  ) {
    return null
  }

  if (typeof product.quantity === 'number' && product.quantity > 0 && !product.categories) {
    return null
  }

  if (typeof product._id !== 'string' && typeof product._id !== 'object') {
    return null
  }

  const dispatch = useDispatch()
  const pathname = usePathname()
  const { getToken } = useAuth()
  const { market, convertPrice, formatNumber } = useStorefrontMarket()
  const { t, language } = useStorefrontI18n()
  const cartItems = useSelector((state) => state.cart.cartItems)
  const [hovered, setHovered] = useState(false)
  const [showCardVideo, setShowCardVideo] = useState(false)
  const [isCartHydrated, setIsCartHydrated] = useState(false)
  const cardVideoRef = useRef(null)

  const cartEntry = cartItems[product._id]
  const itemQuantity = (() => {
    if (!cartEntry) return 0
    if (typeof cartEntry === 'number') return cartEntry
    if (typeof cartEntry === 'object' && typeof cartEntry.quantity === 'number') return cartEntry.quantity
    return 0
  })()

  useEffect(() => {
    setIsCartHydrated(true)
  }, [])

  useEffect(() => {
    registerItemListImpression(product, {
      itemListId,
      itemListName,
      index: itemListIndex,
      pathname,
    })
  }, [product?._id, itemListId, itemListName, itemListIndex, pathname])

  let priceNum = getSalePrice(product)
  let AEDNum = getAEDPrice(product)
  const explicitDiscount = parseAmount(
    product.discountPercent ?? product.discount_percent ??
    product.discountPercentage ?? product.discount_percentage ??
    product.discount
  )

  if (priceNum === 0 && AEDNum > 0 && explicitDiscount > 0) {
    priceNum = +(AEDNum * (1 - explicitDiscount / 100)).toFixed(2)
  }
  if (AEDNum === 0 && priceNum > 0 && explicitDiscount > 0) {
    AEDNum = +(priceNum / (1 - explicitDiscount / 100)).toFixed(2)
  }

  const discount = AEDNum > priceNum && priceNum > 0
    ? Math.round(((AEDNum - priceNum) / AEDNum) * 100)
    : explicitDiscount > 0
      ? Math.round(explicitDiscount)
      : 0

  const convertedPrice = convertPrice(priceNum)
  const convertedAED = convertPrice(AEDNum)
  const isOutOfStock = product.inStock === false || (typeof product.stockQuantity === 'number' && product.stockQuantity <= 0)

  const ratingValue = Math.round(Number(product.averageRating) || 0)
  const reviewCount = Math.max(0, Number(product.ratingCount) || 0)

  const fallbackName = product.name || product.title || t('common.untitledProduct')
  const productName = getLocalizedProductName(product, language, fallbackName)

  const primaryImage = getProductThumbnailUrl(product)
  const secondaryImage = getImageUrlAt(product?.images, 1)
  const cardPreview = resolveCardVideoPreview(product)
  const hasSecondary = cardPreview.type === 'image' &&
    secondaryImage !== PLACEHOLDER &&
    secondaryImage !== primaryImage &&
    normalizeProductImages(product.images).length > 1

  useEffect(() => {
    setShowCardVideo(false)
  }, [product._id, cardPreview.type, cardPreview.videoSrc])

  useEffect(() => {
    if (cardPreview.type !== 'delayed-video') return undefined

    const video = cardVideoRef.current
    if (!video) return undefined

    let delayTimer

    const startDelayTimer = () => {
      delayTimer = window.setTimeout(() => {
        setShowCardVideo(true)
      }, cardPreview.delayMs)
    }

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      startDelayTimer()
    } else {
      video.addEventListener('canplaythrough', startDelayTimer, { once: true })
      video.load()
    }

    return () => {
      if (delayTimer) window.clearTimeout(delayTimer)
      video.removeEventListener('canplaythrough', startDelayTimer)
    }
  }, [cardPreview.type, cardPreview.delayMs, cardPreview.videoSrc])

  const handleAddToCart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (isOutOfStock) {
      toast.error(t('common.outOfStock'))
      return
    }
    const unitPrice = Number(priceNum > 0 ? priceNum : product.price || 0)
    trackProductAddToCart({
      product,
      productId: product._id,
      name: product.name || product.title || 'Product',
      price: unitPrice,
      quantity: 1,
      currency: STORE_CURRENCY,
    })
    dispatch(addToCart({
      productId: product._id,
      price: priceNum > 0 ? priceNum : undefined,
    }))
    dispatch(uploadCart({ getToken }))
    showStorefrontActionToast({
      variant: 'cart',
      title: t('product.addedToCartToast'),
      subtitle: t('product.addedToCartSubtitle'),
      actionLabel: t('product.viewCart'),
      actionHref: '/cart',
    })
  }

  const renderCartControl = () => {
    if (isOutOfStock) {
      return (
        <div className="absolute bottom-3 end-3 z-20 rounded-full bg-gray-200 px-3 py-1 text-[10px] font-semibold text-gray-600">
          {t('common.outOfStock')}
        </div>
      )
    }

    if (isCartHydrated && itemQuantity > 0) {
      return (
        <>
          <div
            className="absolute bottom-3 end-3 z-20 hidden md:inline-flex h-8 min-w-[32px] items-center justify-center rounded-md px-2 text-xs font-semibold text-white shadow-md transition-all duration-150 ease-out group-hover:opacity-0 group-hover:scale-95"
            style={{ backgroundColor: '#2563eb' }}
          >
            <span className="inline-flex items-center gap-1">
              <ShoppingCart size={12} />
              <span>{itemQuantity}</span>
            </span>
          </div>
          <div
            className="absolute bottom-3 end-3 z-20 inline-flex items-center justify-center gap-2 rounded-md px-2 py-1.5 shadow-md transition-all duration-150 ease-out md:opacity-0 md:scale-95 md:group-hover:opacity-100 md:group-hover:scale-100"
            style={{ backgroundColor: '#2563eb' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const unitPrice = Number(priceNum > 0 ? priceNum : product.price || 0)
                pushGtmEcommerceEvent(GTM_EVENTS.REMOVE_FROM_CART, {
                  currency: STORE_CURRENCY,
                  value: unitPrice,
                  items: [productToGa4Item(product, { price: unitPrice, quantity: 1 })],
                })
                dispatch(removeFromCart({ productId: product._id }))
                dispatch(uploadCart({ getToken }))
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/95 hover:bg-white/15 transition"
              title={itemQuantity === 1 ? 'Delete' : 'Decrease'}
            >
              {itemQuantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
            </button>
            <span className="min-w-[18px] text-center text-xs font-semibold text-white">{itemQuantity}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const unitPrice = Number(priceNum > 0 ? priceNum : product.price || 0)
                trackProductAddToCart({
                  product,
                  productId: product._id,
                  name: product.name || product.title || 'Product',
                  price: unitPrice,
                  quantity: 1,
                  currency: STORE_CURRENCY,
                })
                dispatch(addToCart({
                  productId: product._id,
                  price: priceNum > 0 ? priceNum : undefined,
                }))
                dispatch(uploadCart({ getToken }))
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-white/95 hover:bg-white/15 transition"
              title="Add more"
            >
              <Plus size={14} />
            </button>
          </div>
        </>
      )
    }

    return (
      <button
        type="button"
        onClick={handleAddToCart}
        className="absolute bottom-3 end-3 z-20 inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[10px] border border-[#d1d5db] bg-white/95 shadow-md transition-all duration-300 active:scale-95"
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.95)' }}
        aria-label={t('common.addToCart')}
      >
        <Plus size={16} className="text-slate-600" strokeWidth={2.4} />
      </button>
    )
  }

  const hasCarouselWidth = /flex-\[0_0|flex-shrink-0|shrink-0|w-\[calc|min-w-\[calc|basis-\[calc/.test(className)
  const hasCustomGridWidth = /w-\[calc/.test(className)
  const useCompactLayout = compact && hasCarouselWidth
  const compactLg = useCompactLayout && compactDesktopOnly
  const compactAll = useCompactLayout && !compactDesktopOnly
  const imageAspectClass = compactAll
    ? 'aspect-square w-full shrink-0'
    : hasCarouselWidth
      ? getAspectRatioClass(product.imageAspectRatio || product.aspectRatio)
      : 'aspect-square'

  return (
    <Link
      href={getProductPath(product)}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        trackSelectItem(product, {
          itemListId,
          itemListName,
          index: itemListIndex,
          pathname,
        })
        onCardClick?.(event)
      }}
      onMouseEnter={hasSecondary ? () => setHovered(true) : undefined}
      onMouseLeave={hasSecondary ? () => setHovered(false) : undefined}
      className={`group ${PRODUCT_CARD_SHELL_CLASS} transition-colors duration-200 ${hasCarouselWidth ? 'hover:-translate-y-0.5 hover:shadow-md' : 'shadow-none hover:bg-slate-50/80'} ${hasCarouselWidth ? '' : hasCustomGridWidth ? 'min-w-0' : PRODUCT_CARD_CELL_CLASS} ${compactAll ? 'h-full' : ''} ${className}`.trim()}
    >
      <div className={`relative w-full shrink-0 overflow-hidden bg-white ${imageAspectClass}`}>
        {cardPreview.type === 'delayed-video' && !showCardVideo ? (
          <>
            <Image
              src={cardPreview.imageSrc}
              alt={productName}
              fill
              className="object-cover object-center"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
              priority={priorityImages}
              loading={priorityImages ? undefined : 'lazy'}
              onError={(e) => {
                if (e.currentTarget.src !== PLACEHOLDER) {
                  e.currentTarget.src = PLACEHOLDER
                }
              }}
            />
            <video
              ref={cardVideoRef}
              src={cardPreview.videoSrc}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
            />
          </>
        ) : cardPreview.type === 'video' || (cardPreview.type === 'delayed-video' && showCardVideo) ? (
          <video
            ref={cardPreview.type === 'delayed-video' ? cardVideoRef : undefined}
            src={cardPreview.videoSrc}
            className="absolute inset-0 h-full w-full min-h-full min-w-full object-cover object-center"
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : (
          <>
            <Image
              src={primaryImage}
              alt={productName}
              fill
              className={`object-cover object-center ${hasSecondary ? 'transition-opacity duration-500' : ''} ${hasSecondary && hovered ? 'opacity-0' : 'opacity-100'}`}
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
              priority={priorityImages}
              loading={priorityImages ? undefined : 'lazy'}
              onError={(e) => {
                if (e.currentTarget.src !== PLACEHOLDER) {
                  e.currentTarget.src = PLACEHOLDER
                }
              }}
            />
            {hasSecondary ? (
              <Image
                src={secondaryImage}
                alt={productName}
                fill
                className={`absolute inset-0 object-cover object-center transition-opacity duration-500 ${hovered ? 'opacity-100' : 'opacity-0'}`}
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                loading="lazy"
                onError={(e) => {
                  if (e.currentTarget.src !== PLACEHOLDER) {
                    e.currentTarget.src = PLACEHOLDER
                  }
                }}
              />
            ) : null}
          </>
        )}

        {renderCartControl()}
      </div>

      <div className={`flex min-h-0 flex-col ${compactAll ? 'shrink-0 p-1.5' : compactLg ? 'flex-1 p-2 sm:p-2.5 lg:shrink-0 lg:p-1.5' : 'flex-1 p-2 sm:p-2.5'}`}>
        <h3 className={`text-start font-semibold leading-tight text-slate-900 ${compactAll ? 'mb-1 line-clamp-1 text-[10px]' : compactLg ? 'mb-1.5 line-clamp-2 min-h-[2.5em] text-xs sm:min-h-[2.75em] sm:text-sm lg:mb-1 lg:line-clamp-1 lg:min-h-0 lg:text-[10px]' : 'mb-1.5 line-clamp-2 min-h-[2.5em] text-xs sm:min-h-[2.75em] sm:text-sm'}`}>
          {productName}
        </h3>

        <div className={compactAll || compactLg ? '' : 'mt-auto'}>
          {(priceNum > 0 || AEDNum > 0) ? (
            <div className={`flex flex-wrap items-center gap-1 ${compactAll || compactLg ? '' : 'mb-1'}`}>
              {priceNum > 0 ? (
                <p className={`inline-flex items-center gap-1 font-medium leading-none text-slate-950 ${compactAll ? 'text-xs' : compactLg ? 'text-base sm:text-lg lg:text-xs' : 'gap-1.5 text-base sm:text-lg'}`}>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                    {market.currency}
                  </span>
                  <span>{formatNumber(convertedPrice, language, { maximumFractionDigits: 0 })}</span>
                </p>
              ) : null}
              {AEDNum > 0 && AEDNum > priceNum ? (
                <p className="inline-flex items-center gap-1 text-[10px] leading-none text-slate-400 line-through sm:text-xs">
                  <span className="uppercase tracking-wide">{market.currency}</span>
                  <span>{formatNumber(convertedAED, language, { maximumFractionDigits: 0 })}</span>
                </p>
              ) : null}
              {discount > 0 ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-700 sm:text-xs">
                  {t('common.offPercent', { discount })}
                </span>
              ) : null}
            </div>
          ) : null}

          {!compactAll ? (
            <div className={`flex min-w-0 items-center gap-1 ${compactLg ? 'lg:hidden' : ''}`}>
              {[...Array(5)].map((_, i) => (
                <FaStar
                  key={i}
                  size={9}
                  className={i < ratingValue ? 'text-yellow-400' : 'text-gray-300'}
                />
              ))}
              <span className="min-w-0 truncate text-[9px] text-gray-500 sm:text-xs">
                {reviewCount > 0 ? `(${reviewCount})` : t('common.noReviewsYet')}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export default ProductCard
