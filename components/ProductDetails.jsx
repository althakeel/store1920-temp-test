'use client'

import { StarIcon, HeartIcon, MinusIcon, PlusIcon, ShoppingCartIcon, Trash2, Check, ChevronLeft, ChevronRight, ChevronDown, X, Truck } from "lucide-react";
import Image from "@/components/SafeNextImage";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import { useRouter } from "next/navigation";
import axios from "axios";
import { useDispatch, useSelector } from "react-redux";

import { addToCart, removeFromCart, deleteItemFromCart, setCartItemQuantity, setCartEntry, uploadCart } from "@/lib/features/cart/cartSlice";
import {
  findBulkBundleVariant,
  resolveCartLinePricing,
  resolveCartDisplayQuantity,
  resolveBulkBundleCartFromUiQty,
  bundleCartSelectionMatches,
  adjustBundleCartTier,
} from "@/lib/bulkBundleCart";
import {
  buildFbtBundleCartMeta,
  calculateFbtBundleTotal,
  distributeFbtLinePrices,
} from "@/lib/fbtCart";
import { decrementCartItem, incrementCartItem } from "@/lib/bundleCartActions";
import MobileProductActions from "./MobileProductActions";
import ProductShareButton from "./ProductShareButton";
import ProductWhatsAppWidget from "./ProductWhatsAppWidget";
import ProductCard from "./ProductCard";
import ProductCarousel from "./ProductCarousel";
import ProductDescription from "./ProductDescription";
import ProductReviewsSection from "./ProductReviewsSection";
import StorefrontActionToast from "./StorefrontActionToast";
import { useAuth } from '@/lib/useAuth';
import { trackMetaEvent } from "@/lib/metaPixelClient";
import { trackViewContentDual, trackProductAddToCart } from "@/lib/ecommerceTracking";
import { productToGa4Item } from "@/lib/ga4Item";
import { getStorefrontLocale, formatLocalizedNumber } from '@/lib/storefrontMarket';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { trackCustomerEvent } from '@/lib/trackingClient';
import { pushGtmEcommerceEvent } from '@/lib/pushGtmEcommerceEvent';
import { GTM_EVENTS } from '@/lib/gtmEvents';
import {
  buildProductMediaGallery,
  getProductImageAspectRatioClass,
} from '@/lib/productMedia';
import { useHorizontalCarouselDrag } from '@/lib/useHorizontalCarouselDrag';
import { resolveCategoryHref } from '@/lib/categoryTreeUtils';
import { getProductPageHeading, resolveProductCategoryChainFromMap } from '@/lib/productSeo';
import { getAdjustedDeliveryDate } from '@/lib/deliveryEstimate';
import { fetchShippingSettings } from '@/lib/shipping';
import { getDefaultShippingOption } from '@/lib/shippingOptions';
import ProductVariantPicker from './ProductVariantPicker';
import {
  buildVariantOptionGroups,
  cartVariantOptionsMatch,
  findVariantBySelectedOptions,
  formatVariantOptionsLabel,
  getInitialSelectedOptions,
  getVariantMediaIndex,
  isBulkBundleVariantOption,
  isVariantOptionValueAvailable,
  sanitizeSelectedOptions,
  sanitizeVariantOptionsForCart,
  variantOptionKeyInUse,
  isMatrixVariant,
  getProductBundleMode,
  formatBundleTierLabel,
  isMatrixVariantProduct,
  getMatrixBundleTiers,
  matchMatrixVariant,
  normalizeSellerVariantOptions,
} from '@/lib/productVariantOptions';

const PLACEHOLDER_IMAGE = 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png';
const GALLERY_CROSSFADE = { duration: 0.55, ease: [0.22, 1, 0.36, 1] };

function CrossfadeProductMedia({
  mediaKey,
  type = 'image',
  src,
  poster,
  alt,
  sizes,
  imageClassName = 'object-contain bg-white pointer-events-none',
  priority = false,
}) {
  const displaySrc = src || poster || PLACEHOLDER_IMAGE;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={mediaKey}
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={GALLERY_CROSSFADE}
      >
        {type === 'video' ? (
          <video
            src={src}
            poster={poster || PLACEHOLDER_IMAGE}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain bg-white"
          />
        ) : (
          <Image
            src={displaySrc}
            alt={alt}
            fill
            sizes={sizes}
            quality={90}
            className={imageClassName}
            priority={priority}
            onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMAGE; }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

const sanitizeDisplayText = (value) => String(value ?? '')
  .replace(/\u00C2\u00A0/g, ' ')
  .replace(/\u00A0/g, ' ')
  .replace(/\u00C2/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Extract a string URL from a raw image entry (string or object)
const getImageSrc = (image) => {
  if (!image) return null;
  if (typeof image === 'string') return image.trim() || null;
  if (typeof image === 'object') {
    return (
      image.url || image.src || image.path || image.data || null
    );
  }
  return null;
};

// Normalize images to array format
const normalizeImages = (images) => {
  // Handle array
  if (Array.isArray(images)) {
    return images.filter(img => {
      // Accept strings with content
      if (typeof img === 'string') return img.trim().length > 0
      // Accept objects with url/src
      if (typeof img === 'object' && img !== null) {
        return img.url || img.src || img.path || img.data || false
      }
      return false
    })
  }
  
  // Handle null/undefined
  if (images === null || images === undefined) return []
  
  // Handle object - only if it has image data properties
  if (typeof images === 'object') {
    if (images.url || images.src || images.path || images.data) {
      return [images]
    }
    return [] // Empty object has no valid image data
  }
  
  // Handle string
  if (typeof images === 'string') {
    return images.trim().length > 0 ? [images] : []
  }
  
  return []
}

const DEFAULT_BADGE_STYLES = [
  { label: 'Price Lower Than Usual', backgroundColor: '#007600', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Hot Deal', backgroundColor: '#cc0c39', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Best Seller', backgroundColor: '#c45500', textColor: '#ffffff', borderRadius: 0 },
  { label: 'New Arrival', backgroundColor: '#0066c0', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Limited Stock', backgroundColor: '#b12704', textColor: '#ffffff', borderRadius: 0 },
  { label: 'Free Shipping', backgroundColor: '#007185', textColor: '#ffffff', borderRadius: 0 }
];

function ProductQuantitySelector({
  quantity,
  maxOrderQty,
  onChange,
  quantityLabel,
  variant = 'buybox',
  className = '',
  isArabic = false,
  formatCount,
  formatOptionLabel,
  options,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const quantityOptions = useMemo(
    () => (
      Array.isArray(options) && options.length > 0
        ? options
        : Array.from({ length: Math.max(1, maxOrderQty) }, (_, i) => i + 1)
    ),
    [maxOrderQty, options]
  );
  const isBuyBox = variant === 'buybox';

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (value) => {
    onChange(value);
    setOpen(false);
  };

  const getOptionLabel = (val) => (
    formatOptionLabel ? formatOptionLabel(val) : formatCount(val)
  );

  const currentQty = Number(quantity) || 1;
  const canDecrease = currentQty > 1;
  const canIncrease = currentQty < Math.max(1, maxOrderQty);

  if (!isBuyBox) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 ${className}`.trim()}
        dir={isArabic ? 'rtl' : 'ltr'}
      >
        <span className="shrink-0 text-sm font-semibold text-gray-900">
          {quantityLabel}
        </span>

        <div className="flex h-11 w-[150px] shrink-0 items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => canDecrease && onChange(currentQty - 1)}
            disabled={!canDecrease}
            aria-label={isArabic ? 'إنقاص الكمية' : 'Decrease quantity'}
            className="flex w-12 shrink-0 items-center justify-center text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <MinusIcon size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>

          <div
            className="flex min-w-0 flex-1 items-center justify-center border-x border-slate-200 px-2 text-sm font-semibold text-slate-900"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="truncate text-center">{formatCount(currentQty)}</span>
          </div>

          <button
            type="button"
            onClick={() => canIncrease && onChange(currentQty + 1)}
            disabled={!canIncrease}
            aria-label={isArabic ? 'زيادة الكمية' : 'Increase quantity'}
            className="flex w-12 shrink-0 items-center justify-center text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <PlusIcon size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={
        isBuyBox
          ? `mt-5 space-y-2 ${className}`.trim()
          : `space-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 ${className}`.trim()
      }
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      <span
        className={
          isBuyBox
            ? 'block text-xs font-semibold uppercase tracking-wide text-slate-500'
            : 'block text-sm font-semibold text-gray-900'
        }
      >
        {quantityLabel}
      </span>

      <div className="relative w-full">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={quantityLabel}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          <span className="min-w-0 truncate text-left">{getOptionLabel(quantity)}</span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {open ? (
          <ul
            role="listbox"
            aria-label={quantityLabel}
            className="absolute left-0 right-0 z-30 mt-1.5 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {quantityOptions.map((val) => {
              const isSelected = Number(quantity) === val;
              return (
                <li key={val} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => handleSelect(val)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium transition ${
                      isSelected
                        ? 'bg-orange-50 text-orange-700'
                        : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1 text-left">{getOptionLabel(val)}</span>
                    {isSelected ? <Check size={14} className="text-orange-600" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

const ProductDetails = ({ product, reviews = [], loadingReviews = false, onReviewAdded, hideTitle = false, offerData = null, recommendedProducts = [], initialFbt = null, reviewsPreloaded = false, fbtPreloaded = false }) => {
  const { market, convertPrice, formatMoney: formatMarketMoney, formatNumber, formatDisplay, formatSplitPrice } = useStorefrontMarket();
  const { t, isArabic, language } = useStorefrontI18n();
  const currency = market.currency;
  const formatMoney = (amount, alreadyConverted = false) => formatMarketMoney(amount, { language, alreadyConverted });
  const formatCount = (value, options) => formatNumber(value, language, options);

  const renderSplitPrice = (amount, options = {}) => {
    const {
      currencyClass = 'text-[14px] font-medium',
      mainClass = 'text-[42px] font-semibold',
      decimalClass = 'text-[16px] font-semibold',
      wrapperClass = 'inline-flex items-start leading-none tracking-[-0.01em]'
    } = options;

    if (isArabic) {
      const label = options.useRegular
        ? (storedRegularPriceAr || formatMoney(amount, true))
        : (storedSalePriceAr || formatMoney(amount, true));
      return (
        <bdi dir="rtl" className={wrapperClass}>
          <span className={`${mainClass} text-slate-900`}>
            {label}
          </span>
        </bdi>
      );
    }

    const { integerPart: mainPart, decimalPart } = formatSplitPrice(amount, language);

    return (
      <bdi dir="ltr" className={wrapperClass}>
        <span className={`${currencyClass} me-1 self-start mt-1.5`}>{currency}</span>
        <span className={mainClass}>{mainPart}</span>
        <span className={`${decimalClass} self-start mt-1`}>{decimalPart}</span>
      </bdi>
    );
  };

  const [productPageInfo, setProductPageInfo] = useState({
    returnsText: 'Easy Returns',
    vatText: 'All prices include VAT.',
    deliveryPrefix: 'Estimated delivery',
    deliverySuffix: '— timelines are estimates.',
    cutoffHour: 23,
    cutoffMinute: 0,
    deliveryMinDays: 2,
    deliveryMaxDays: 3,
    badgeSettings: {
      badges: DEFAULT_BADGE_STYLES
    }
  });
  const [whatsappProductWidget, setWhatsappProductWidget] = useState(null);
  const [timeNow, setTimeNow] = useState(() => new Date());
  const [cartUiReady, setCartUiReady] = useState(false);
  const [shippingPreview, setShippingPreview] = useState({
    freeShippingMin: 100,
    flatRate: 15,
  });
  const mediaGallery = useMemo(() => buildProductMediaGallery(product?.images), [product?.images]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const activeMedia = mediaGallery[activeMediaIndex] || mediaGallery[0] || null;
  const mainImage = activeMedia?.type === 'image' ? activeMedia.src : (activeMedia?.poster || null);
  const mobileCarouselRef = useRef(null);
  const mobileThumbnailsRef = useRef(null);
  const desktopMainImageRef = useRef(null);
  const desktopThumbnailsRef = useRef(null);
  const [desktopGalleryHeight, setDesktopGalleryHeight] = useState(null);
  const mobileCarouselScrollRaf = useRef(null);
  const [quantity, setQuantity] = useState(1);
  const prevSelectedOptionsKeyRef = useRef(null);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [actionToast, setActionToast] = useState(null);
  const actionToastTimerRef = useRef(null);
  const [isOrderingNow, setIsOrderingNow] = useState(false);
  const [showRatingBreakdown, setShowRatingBreakdown] = useState(false);
  const ratingBreakdownRef = useRef(null);

  const scrollToProductReviews = useCallback(() => {
    setShowRatingBreakdown(false);

    const reviewSectionIds = ['product-reviews-desktop', 'product-reviews-mobile', 'product-reviews'];
    const target = reviewSectionIds
      .map((id) => document.getElementById(id))
      .find((element) => element && element.getClientRects().length > 0);

    if (!target) return;

    const headerOffset = 88;
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: 'smooth',
    });
  }, []);
  const [categoryMap, setCategoryMap] = useState({});
  const { user, getToken } = useAuth();
  const isSignedIn = Boolean(user);
  const userId = user?.uid || null;

  useEffect(() => {
    let mounted = true;
    let idleId;
    let timerId;

    const loadProductPageInfo = async () => {
      try {
        const { data } = await axios.get('/api/store/appearance/sections/public');
        if (!mounted) return;
        setProductPageInfo((prev) => ({
          ...prev,
          ...(data?.productPageInfo || {})
        }));
        if (data?.whatsappProductWidget) {
          setWhatsappProductWidget(data.whatsappProductWidget);
        }
      } catch {
        // keep defaults
      }
    };

    const scheduleLoad = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => loadProductPageInfo(), { timeout: 3000 });
      } else {
        timerId = window.setTimeout(loadProductPageInfo, 1500);
      }
    };

    scheduleLoad();
    return () => {
      mounted = false;
      if (idleId && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setCartUiReady(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    const storeId = product?.storeId;

    fetchShippingSettings(storeId).then((setting) => {
      if (!mounted || !setting) return;

      const option = getDefaultShippingOption(setting);
      const freeShippingMin = Number(setting.freeShippingMin);
      const flatRate = option?.shippingType === 'FLAT_RATE'
        ? Number(option.flatRate)
        : Number(setting.flatRate ?? 15);

      setShippingPreview({
        freeShippingMin: Number.isFinite(freeShippingMin) && freeShippingMin > 0 ? freeShippingMin : 100,
        flatRate: Number.isFinite(flatRate) && flatRate >= 0 ? flatRate : 15,
      });
    });

    return () => {
      mounted = false;
    };
  }, [product?.storeId]);

  const deliveryWindow = useMemo(() => {
    const isFastDelivery = Boolean(product?.fastDelivery);
    const baseMinDays = isFastDelivery ? 1 : 3;
    const baseMaxDays = isFastDelivery ? 1 : 7;

    const today = new Date(timeNow);
    today.setHours(0, 0, 0, 0);

    const minDelivery = getAdjustedDeliveryDate(today, baseMinDays);
    const maxDelivery = getAdjustedDeliveryDate(today, baseMaxDays);
    const startDate = minDelivery.arrival;
    const endDate = maxDelivery.arrival;

    const locale = getStorefrontLocale(market.code, language);
    const startDay = formatLocalizedNumber(startDate.getDate(), market.code, language, { maximumFractionDigits: 0 });
    const endDay = formatLocalizedNumber(endDate.getDate(), market.code, language, { maximumFractionDigits: 0 });
    const startMonth = startDate.toLocaleDateString(locale, { month: 'short' });
    const endMonth = endDate.toLocaleDateString(locale, { month: 'short' });

    let rangeText;
    if (startDate.getTime() === endDate.getTime()) {
      rangeText = `${startDay} ${startMonth}`;
    } else if (startMonth === endMonth) {
      rangeText = `${startDay}-${endDay} ${startMonth}`;
    } else {
      rangeText = `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
    }

    return {
      // Keep promised window as marketing copy (2-5 / 3-6), not Sunday-shifted days.
      minDays: baseMinDays,
      maxDays: baseMaxDays,
      rangeText,
      primaryArrivalText: `${startDay} ${startMonth}`,
      baseMinDays,
      baseMaxDays,
      isFastDelivery,
    };
  }, [product?.fastDelivery, timeNow, language, market.code]);

  const deliverySummary = useMemo(() => {
    const { minDays, maxDays, rangeText } = deliveryWindow;
    // Only claim free shipping when the product itself is marked eligible
    // (order-threshold free shipping is shown separately in the fee row).
    const qualifiesForFreeDelivery = Boolean(product?.freeShippingEligible);

    if (deliveryWindow.isFastDelivery) {
      return {
        primary: isArabic
          ? `توصيل سريع — يقدّر بحلول ${rangeText}`
          : `Fast delivery — estimated by ${rangeText}`,
        secondary: t('product.fastDeliveryQualifier'),
      };
    }

    if (isArabic) {
      const daysText = minDays === maxDays
        ? `خلال حوالي ${minDays} أيام`
        : `خلال حوالي ${minDays}-${maxDays} أيام`;
      return {
        primary: qualifiesForFreeDelivery
          ? `شحن مجاني — يقدّر بحلول ${rangeText}`
          : `توصيل تقديري بحلول ${rangeText}`,
        secondary: `اطلب الآن — ${daysText} (تقديري)`,
      };
    }

    const daysText = minDays === maxDays
      ? `within about ${minDays} days`
      : `in about ${minDays}-${maxDays} days`;

    return {
      primary: qualifiesForFreeDelivery
        ? `Free shipping — estimated by ${rangeText}`
        : `Estimated delivery by ${rangeText}`,
      secondary: `Order now — get it ${daysText} (estimate)`,
    };
  }, [deliveryWindow, isArabic, product?.freeShippingEligible, t]);

  const buyboxCopy = useMemo(() => {
    if (isArabic) {
      return {
        returnsText: t('product.freeReturns'),
        vatText: t('product.vatIncluded'),
        deliveryPrefix: t('product.freeDelivery'),
        deliverySuffix: t('product.firstOrderDelivery'),
      };
    }

    return {
      returnsText: productPageInfo.returnsText || t('product.freeReturns'),
      vatText: productPageInfo.vatText || t('product.vatIncluded'),
      deliveryPrefix: productPageInfo.deliveryPrefix || t('product.freeDelivery'),
      deliverySuffix: productPageInfo.deliverySuffix || t('product.firstOrderDelivery'),
    };
  }, [isArabic, productPageInfo, t]);

  const badgeStyleMap = useMemo(() => {
    const configuredBadges = Array.isArray(productPageInfo?.badgeSettings?.badges) && productPageInfo.badgeSettings.badges.length
      ? productPageInfo.badgeSettings.badges
      : DEFAULT_BADGE_STYLES;

    return configuredBadges.reduce((accumulator, badge) => {
      const label = String(badge?.label || '').trim().toLowerCase();
      if (!label) return accumulator;
      accumulator[label] = {
        backgroundColor: badge.backgroundColor || '#565959',
        color: badge.textColor || '#ffffff',
        borderRadius: `${Math.max(0, Math.min(24, Number(badge.borderRadius) || 0))}px`
      };
      return accumulator;
    }, {});
  }, [productPageInfo?.badgeSettings?.badges]);

  // Fetch all categories once to resolve IDs → {name, parentId}
  useEffect(() => {
    let mounted = true;
    const cacheKey = `product-category-map:v2:${language}`;
    const cacheTtlMs = 10 * 60 * 1000;

    try {
      const cachedRaw = sessionStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.expiresAt > Date.now() && cached?.map) {
          setCategoryMap(cached.map);
          return () => {
            mounted = false;
          };
        }
      }
    } catch {
      // Ignore cache read failures.
    }

    fetch('/api/categories', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !data?.categories) return;
        const map = {};
        const visitCategory = (category) => {
          if (!category?._id) return;
          map[String(category._id)] = {
            name: category.name,
            nameAr: category.nameAr || '',
            parentId: category.parentId || null,
            slug: category.slug || '',
            url: category.url || '',
          };
          (Array.isArray(category.children) ? category.children : []).forEach(visitCategory);
        };
        (Array.isArray(data.categories) ? data.categories : []).forEach(visitCategory);
        setCategoryMap(map);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({
            map,
            expiresAt: Date.now() + cacheTtlMs,
          }));
        } catch {
          // Ignore cache write failures.
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [language]);
  const router = useRouter();
  const dispatch = useDispatch();
  const cartCount = useSelector((state) => state.cart.total);
  const allProducts = useSelector((state) => state.product.list || []);

  const cartItems = useSelector((state) => state.cart.cartItems);
  const cartProductId = String(product?._id || product?.id || '');
  const cartEntry = cartItems?.[cartProductId] ?? null;

  // Always read qty directly from Redux so product page matches sidebar
  const cartQty = (() => {
    if (!cartEntry) return 0;
    if (typeof cartEntry === 'number') return cartEntry;
    return Number(cartEntry?.quantity || 0);
  })();

  const relatedProducts = useMemo(() => {
    if (Array.isArray(recommendedProducts) && recommendedProducts.length > 0) {
      return recommendedProducts
        .filter((candidate) => candidate && candidate.name && candidate.slug && normalizeImages(candidate.images).length > 0)
        .slice(0, 8);
    }

    const currentProductId = String(product?._id || '');
    const productTags = Array.isArray(product?.tags) ? product.tags : [];

    return allProducts
      .filter((candidate) => {
        if (!candidate || String(candidate._id || '') === currentProductId) return false;
        if (!candidate.name || !candidate.slug || normalizeImages(candidate.images).length === 0) return false;
        if (product?.category && candidate.category && String(candidate.category) === String(product.category)) return true;

        const candidateTags = Array.isArray(candidate.tags) ? candidate.tags : [];
        return productTags.length > 0 && candidateTags.length > 0 && productTags.some((tag) => candidateTags.includes(tag));
      })
      .slice(0, 8);
  }, [recommendedProducts, allProducts, product?._id, product?.category, product?.tags]);

  const pushDataLayerEvent = (event, ecommerce) => {
    pushGtmEcommerceEvent(event, ecommerce);
  };

  const trackCustomerBehavior = async (eventType, metadata = {}) => {
    if (typeof window === 'undefined') return;
    if (!product?.storeId) return;

    await trackCustomerEvent({
      storeId: String(product.storeId),
      eventType,
      firebaseUid: userId || null,
      userId: userId || null,
      productId: String(product._id || ''),
      pageType: 'product_detail',
      pagePath: window.location.pathname,
      value: Number(bundleTotal || effPrice || 0),
      currency: 'AED',
      metadata,
    });
  };

  // FBT (Frequently Bought Together) state
  const [fbtProducts, setFbtProducts] = useState(() => (fbtPreloaded && initialFbt?.products ? initialFbt.products : []));
  const [fbtEnabled, setFbtEnabled] = useState(() => Boolean(fbtPreloaded && initialFbt?.enableFBT));
  const [fbtBundlePrice, setFbtBundlePrice] = useState(() => (fbtPreloaded ? Number(initialFbt?.bundlePrice || 0) : 0));
  const [fbtBundleDiscount, setFbtBundleDiscount] = useState(() => (fbtPreloaded ? Number(initialFbt?.bundleDiscount || 0) : 0));
  const [selectedFbtProducts, setSelectedFbtProducts] = useState(() => {
    if (!fbtPreloaded || !initialFbt?.products?.length) return {};
    const initialSelection = {};
    initialFbt.products.forEach((item) => {
      initialSelection[item._id] = true;
    });
    return initialSelection;
  });
  const [loadingFbt, setLoadingFbt] = useState(() => !fbtPreloaded);
  const [showFbtPopup, setShowFbtPopup] = useState(false);
  const fbtViewedEventSent = useRef(false);
  const {
    scrollRef: fbtScrollRef,
    handlePointerDown: handleFbtPointerDown,
    handleCardClick: handleFbtCardClick,
    isDragging: fbtIsDragging,
    trackStyle: fbtTrackStyle,
  } = useHorizontalCarouselDrag({ enableSnap: false });
  const {
    scrollRef: fbtMobileScrollRef,
    handlePointerDown: handleFbtMobilePointerDown,
    handleCardClick: handleFbtMobileCardClick,
    isDragging: fbtMobileIsDragging,
    trackStyle: fbtMobileTrackStyle,
  } = useHorizontalCarouselDrag({ enableSnap: false });
  const {
    scrollRef: fbtPopupScrollRef,
    handlePointerDown: handleFbtPopupPointerDown,
    handleCardClick: handleFbtPopupCardClick,
    isDragging: fbtPopupIsDragging,
    trackStyle: fbtPopupTrackStyle,
  } = useHorizontalCarouselDrag({ enableSnap: false });

  const isValidFbtPrice = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;

  // Review state and fetching logic
  const [fetchedReviews, setFetchedReviews] = useState(() => (reviewsPreloaded ? reviews : []));
  const [loadingReviewsLocal, setLoadingReviewsLocal] = useState(false);

  // Use fetched reviews if available, else prop
  const reviewsToUse = reviewsPreloaded
    ? reviews
    : (fetchedReviews.length > 0 ? fetchedReviews : reviews);
  const averageRating = reviewsToUse.length > 0
    ? reviewsToUse.reduce((acc, item) => acc + (item.rating || 0), 0) / reviewsToUse.length
    : (typeof product.averageRating === 'number' ? product.averageRating : 0);

  const reviewCount = reviewsToUse.length > 0
    ? reviewsToUse.length
    : (typeof product.ratingCount === 'number' ? product.ratingCount : 0);

  useEffect(() => {
    if (!product?._id) return;
    if (typeof window === 'undefined') return;

    const eventPrice = Number(product?.price || 0);

    trackViewContentDual({
      productId: product._id,
      name: product.name || product.title || 'Product',
      price: eventPrice,
      currency: 'AED',
      gtmItem: productToGa4Item(product, { price: eventPrice, quantity: 1 }),
    });
  }, [product?._id, product?.id, product?.name, product?.title, product?.price]);

  useEffect(() => {
    router.prefetch('/checkout');
    router.prefetch('/cart');
  }, [router]);

  useEffect(() => {
    if (reviewsPreloaded) return;

    const fetchReviews = async () => {
      try {
        setLoadingReviewsLocal(true);
        const { data } = await axios.get(`/api/review?productId=${product._id}`);
        setFetchedReviews(data.reviews || []);
      } catch (error) {
        console.error('Failed to fetch reviews:', error);
      } finally {
        setLoadingReviewsLocal(false);
      }
    };
    fetchReviews();
  }, [product._id, reviewsPreloaded]);

  // Fetch FBT products
  useEffect(() => {
    if (fbtPreloaded) return;

    fbtViewedEventSent.current = false;

    const fetchFbtProducts = async () => {
      // Only fetch if product has a valid ID
      if (!product?._id) {
        console.warn('No product ID available for FBT fetch');
        return;
      }
      
      try {
        setFbtEnabled(false);
        setFbtProducts([]);
        setSelectedFbtProducts({});
        setLoadingFbt(true);
        const { data } = await axios.get(`/api/products/${product._id}/fbt`);
        if (data.enableFBT && data.products && data.products.length > 0) {
          setFbtEnabled(true);
          setFbtProducts(data.products);
          setFbtBundlePrice(data.bundlePrice);
          setFbtBundleDiscount(data.bundleDiscount || 0);
          
          // Initially select all FBT products
          const initialSelection = {};
          data.products.forEach(p => {
            initialSelection[p._id] = true;
          });
          setSelectedFbtProducts(initialSelection);

          if (!fbtViewedEventSent.current) {
            pushDataLayerEvent('fbt_viewed', {
              currency: 'AED',
              items: data.products.map((p) => ({
                item_id: String(p._id),
                item_name: p.name || 'Product',
                price: Number(p.price || 0),
                quantity: 1,
              })),
            });
            trackCustomerBehavior('fbt_viewed', {
              relatedProductIds: data.products.map((p) => String(p._id)),
            });
            fbtViewedEventSent.current = true;
          }
        }
      } catch (error) {
        console.error('Failed to fetch FBT products:', error);
        // Silently fail - FBT is optional feature
      } finally {
        setLoadingFbt(false);
      }
    };
    
    fetchFbtProducts();
  }, [product._id, fbtPreloaded]);

  useEffect(() => {
    if (!fbtPreloaded || !fbtEnabled || fbtProducts.length === 0 || fbtViewedEventSent.current) return;

    pushDataLayerEvent('fbt_viewed', {
      currency: 'AED',
      items: fbtProducts.map((p) => ({
        item_id: String(p._id),
        item_name: p.name || 'Product',
        price: Number(p.price || 0),
        quantity: 1,
      })),
    });
    trackCustomerBehavior('fbt_viewed', {
      relatedProductIds: fbtProducts.map((p) => String(p._id)),
    });
    fbtViewedEventSent.current = true;
  }, [fbtPreloaded, fbtEnabled, fbtProducts, product?.storeId]);

  // Variants support — promote misplaced Option Label values so the picker shows them
  const variants = useMemo(
    () => (Array.isArray(product?.variants)
      ? product.variants.map((variant) => ({
          ...variant,
          options: normalizeSellerVariantOptions(variant?.options),
        }))
      : []),
    [product?._id, product?.variants]
  );
  const isBulkBundleVariant = isBulkBundleVariantOption;
  const isMatrixProduct = useMemo(() => getProductBundleMode(product) === 'matrix', [product]);
  const isBulkBundleProduct = useMemo(() => getProductBundleMode(product) === 'bulk', [product]);
  const bulkVariants = useMemo(() => {
    if (isBulkBundleProduct) {
      return variants.filter((v) => {
        const qty = Number(v?.options?.bundleQty);
        return Number.isFinite(qty) && qty > 0;
      });
    }
    return variants.filter(isBulkBundleVariant);
  }, [variants, isBulkBundleProduct, isBulkBundleVariant]);
  const bulkBundleTiers = useMemo(() => {
    const all = bulkVariants
      .map((v) => Number(v.options?.bundleQty) || 1)
      .sort((a, b) => a - b);
    const inStock = bulkVariants
      .filter((v) => Number(v.stock) > 0)
      .map((v) => Number(v.options?.bundleQty) || 1)
      .sort((a, b) => a - b);
    return inStock.length ? inStock : [...new Set(all)];
  }, [bulkVariants]);
  const matrixBundleTiers = useMemo(() => {
    const all = getMatrixBundleTiers(variants, { product });
    const inStock = getMatrixBundleTiers(variants, { inStockOnly: true, product });
    return inStock.length ? inStock : all;
  }, [variants, product]);
  const isBundleModeActive = isBulkBundleProduct || isMatrixProduct;
  const variantOptionGroups = useMemo(() => {
    if (isBulkBundleProduct) return [];
    const groups = buildVariantOptionGroups(variants, { isBulkBundleVariant });
    if (!isMatrixProduct) return groups;
    // Hide promo tags only; keep title/color/size — they are real product options in matrix mode.
    return groups.filter((g) => g.key !== 'tag');
  }, [variants, isMatrixProduct, isBulkBundleProduct]);
  const showVariantPicker = !isBulkBundleProduct && variantOptionGroups.length > 0;
  const productImagesArray = useMemo(() => normalizeImages(product.images), [product.images]);
  const [selectedOptions, setSelectedOptions] = useState(() => {
    const initial = getInitialSelectedOptions(variantOptionGroups);
    if (!initial.color && product.colors?.[0] && variantOptionKeyInUse(variants, 'color', { isBulkBundleVariant })) {
      initial.color = product.colors[0];
    }
    if (!initial.size && product.sizes?.[0] && variantOptionKeyInUse(variants, 'size', { isBulkBundleVariant })) {
      initial.size = product.sizes[0];
    }
    return sanitizeSelectedOptions(variants, initial, { isBulkBundleVariant });
  });
  const [selectedBundleQty, setSelectedBundleQty] = useState(
    isBulkBundleProduct
      ? bulkBundleTiers[0]
      : (isMatrixProduct
        ? (matrixBundleTiers[0] || null)
        : (bulkVariants.length ? Number(bulkVariants[0].options.bundleQty) : null))
  );
  const activeBundleTier = useMemo(() => {
    if (!isBulkBundleProduct && !isMatrixProduct) return null;
    if (isMatrixProduct) {
      return Number(selectedBundleQty) || matrixBundleTiers[0] || 1;
    }
    return Number(selectedBundleQty) || bulkBundleTiers[0] || 1;
  }, [isBulkBundleProduct, isMatrixProduct, selectedBundleQty, bulkBundleTiers, matrixBundleTiers]);
  const handleSelectVariantOption = useCallback((key, value) => {
    setSelectedOptions((prev) => ({ ...prev, [key]: value }));
  }, []);
  const cartVariantOptions = useMemo(() => sanitizeVariantOptionsForCart({
    ...selectedOptions,
    bundleQty: selectedBundleQty || null,
  }, variants, { isBulkBundleVariant }), [selectedOptions, selectedBundleQty, variants, isBulkBundleVariant]);

  const selectBulkBundleTier = useCallback((tier) => {
    const qty = Number(tier) || 1;
    const tiers = isMatrixProduct ? matrixBundleTiers : bulkBundleTiers;
    if (!tiers.includes(qty)) return;
    setSelectedBundleQty(qty);
    if (isMatrixProduct) {
      setQuantity(1);
    } else if (isBulkBundleProduct) {
      setQuantity(qty);
    }
  }, [bulkBundleTiers, matrixBundleTiers, isMatrixProduct, isBulkBundleProduct]);

  const handleBundleTierSelect = useCallback((tier) => {
    selectBulkBundleTier(tier);
  }, [selectBulkBundleTier]);

  const cartLinePricing = useMemo(() => {
    if (!cartEntry || !Number.isFinite(cartQty) || cartQty <= 0) {
      return { displayQuantity: 0, isBulkBundle: false, bundleTier: null };
    }
    return resolveCartLinePricing(product, cartEntry, cartQty);
  }, [cartEntry, cartQty, product]);

  const isCartMatrixLine = Boolean(cartLinePricing.isMatrix);
  const isCartBundleLine = Boolean(cartLinePricing.isBulkBundle) && !isCartMatrixLine;
  const cartDisplayQty = useMemo(() => {
    if (!Number.isFinite(cartQty) || cartQty <= 0) return 0;
    if (isBulkBundleProduct || isMatrixProduct) {
      return resolveCartDisplayQuantity(product, cartEntry, cartQty, activeBundleTier);
    }
    const display = Number(cartLinePricing.displayQuantity);
    return Number.isFinite(display) && display > 0 ? display : cartQty;
  }, [
    cartQty,
    cartEntry,
    product,
    isBulkBundleProduct,
    isMatrixProduct,
    activeBundleTier,
    cartLinePricing.displayQuantity,
  ]);
  const cartBundleTier = Number(cartLinePricing.bundleTier)
    || Number(cartEntry?.variantOptions?.bundleQty)
    || null;

  const selectedVariant = (isBulkBundleProduct
    ? bulkVariants.find((v) => Number(v.options?.bundleQty) === Number(activeBundleTier))
    : (isMatrixProduct
      ? matchMatrixVariant(variants, selectedOptions, activeBundleTier)
      : findVariantBySelectedOptions(variants, selectedOptions, { isBulkBundleVariant }))
  ) || null;

  const variantMediaIndex = useMemo(() => {
    if (!selectedVariant || isBulkBundleProduct) return -1;
    return getVariantMediaIndex(selectedVariant, mediaGallery, productImagesArray);
  }, [selectedVariant, isBulkBundleProduct, mediaGallery, productImagesArray]);

  const getBundleOptionImage = useCallback((variant) => {
    if (!variant?.options) return null;
    if (variant.options.image) return variant.options.image;
    const slot = Number(variant.options.imageSlot);
    const productImagesArray = normalizeImages(product.images);
    if (Number.isFinite(slot) && slot > 0 && productImagesArray.length > 0) {
      return productImagesArray[slot - 1] || null;
    }
    return null;
  }, [product.images]);

  const basePrice = selectedVariant?.price ?? product.price;
  const baseAED = selectedVariant?.AED ?? product.AED ?? basePrice;
  const isSpecialOffer = !!product.specialOffer?.isSpecialOffer;
  const specialDiscountPercent = Number(product.specialOffer?.discountPercent);
  let effPrice = basePrice;
  let effAED = baseAED;

  if (isSpecialOffer && Number.isFinite(specialDiscountPercent) && specialDiscountPercent > 0) {
    const offerBase = Number(basePrice) > 0 ? Number(basePrice) : Number(baseAED) || 0;
    const discounted = offerBase * (1 - (specialDiscountPercent / 100));
    effAED = offerBase || effAED;
    effPrice = Number.isFinite(discounted) ? Math.round(discounted * 100) / 100 : effPrice;
  }
  
  // Debug logging for special offers
  if (product.specialOffer?.isSpecialOffer) {
    console.log('ProductDetails - Special Offer Prices:', {
      product_price: product.price,
      product_AED: product.AED,
      effPrice,
      effAED,
      specialOffer: product.specialOffer
    });
  }
  
  const availableStock = useMemo(() => {
    const productStockFallback = typeof product.stockQuantity === 'number'
      ? Math.max(0, product.stockQuantity)
      : 0;
    const anyVariantHasStock = variants.some((v) => Number(v?.stock || 0) > 0);

    if (isMatrixProduct) {
      const match = matchMatrixVariant(variants, selectedOptions, activeBundleTier);
      if (match) {
        const rowStock = Number(match.stock);
        if (Number.isFinite(rowStock) && rowStock > 0) return rowStock;
        // Legacy matrix rows: stock often sits on product Stock Qty only.
        if (!anyVariantHasStock && productStockFallback > 0) return productStockFallback;
        return Math.max(0, rowStock || 0);
      }
      return productStockFallback;
    }

    if (isBulkBundleProduct) {
      const uiQty = Number(quantity) || 1;
      const stockTier = bulkBundleTiers.includes(uiQty) ? uiQty : bulkBundleTiers[0];
      const bundleVariant = bulkVariants.find(
        (v) => Number(v.options?.bundleQty) === Number(stockTier),
      ) || findBulkBundleVariant(product, stockTier);
      if (typeof bundleVariant?.stock === 'number') {
        return Math.max(0, bundleVariant.stock);
      }
      return 0;
    }

    if (!isBulkBundleProduct && variants.length > 0) {
      const match = findVariantBySelectedOptions(variants, selectedOptions, { isBulkBundleVariant });
      if (match) {
        const rowStock = Number(match.stock);
        if (Number.isFinite(rowStock) && rowStock > 0) return rowStock;
        if (!anyVariantHasStock && productStockFallback > 0) return productStockFallback;
        return Math.max(0, rowStock || 0);
      }
    }

    if (typeof product.stockQuantity === 'number') {
      return Math.max(0, product.stockQuantity);
    }

    return product.inStock === false ? 0 : 999;
  }, [
    isBulkBundleProduct,
    isMatrixProduct,
    activeBundleTier,
    quantity,
    bulkBundleTiers,
    bulkVariants,
    variants,
    selectedOptions,
    product.stockQuantity,
    product.inStock,
  ]);
  const maxOrderQty = availableStock;

  const upsertProductCartLines = useCallback((requestedQty) => {
    const normalizedQty = Math.max(1, Number(requestedQty) || 1);

    if (isMatrixProduct) {
      const tier = matrixBundleTiers.includes(Number(selectedBundleQty))
        ? Number(selectedBundleQty)
        : matrixBundleTiers[0];
      const variant = matchMatrixVariant(variants, selectedOptions, tier);
      const anyVariantHasStock = variants.some((v) => Number(v?.stock || 0) > 0);
      const productStockFallback = Number(product.stockQuantity) || 0;
      const rowStock = Number(variant?.stock) || 0;
      const safeMax = rowStock > 0
        ? rowStock
        : (!anyVariantHasStock && productStockFallback > 0 ? productStockFallback : 0);
      if (!variant || safeMax <= 0) return 0;

      const offerFields = product.specialOffer?.offerToken
        ? {
            offerToken: product.specialOffer.offerToken,
            discountPercent: product.specialOffer.discountPercent,
          }
        : {};

      dispatch(setCartEntry({
        productId: cartProductId,
        entry: {
          quantity: Math.min(safeMax, normalizedQty),
          price: Number(variant.price),
          sku: String(variant.sku || product.sku || '').trim(),
          productName: product.name || product.title || 'Product',
          variantOptions: {
            ...cartVariantOptions,
            bundleQty: tier,
          },
          ...offerFields,
        },
      }));
      return Math.min(safeMax, normalizedQty);
    }

    if (isBulkBundleProduct) {
      const { bundleTier, packQty } = resolveBulkBundleCartFromUiQty(
        normalizedQty,
        product,
        bulkBundleTiers,
      );
      const variant = bulkVariants.find((v) => Number(v.options?.bundleQty) === bundleTier)
        || findBulkBundleVariant(product, bundleTier);
      const safeMax = Math.max(0, Number(variant?.stock) || 0);
      if (!variant || safeMax <= 0) return 0;

      const offerFields = product.specialOffer?.offerToken
        ? {
            offerToken: product.specialOffer.offerToken,
            discountPercent: product.specialOffer.discountPercent,
          }
        : {};

      const packs = Math.min(safeMax, packQty);

      dispatch(setCartEntry({
        productId: cartProductId,
        entry: {
          quantity: packs,
          price: Number(variant.price),
          sku: String(variant.sku || product.sku || '').trim(),
          productName: product.name || product.title || 'Product',
          variantOptions: {
            ...cartVariantOptions,
            bundleQty: bundleTier,
          },
          ...offerFields,
        },
      }));
      return packs;
    }

    const safeMax = Math.max(0, maxOrderQty);
    if (safeMax <= 0) return 0;

    const targetQty = Math.min(safeMax, normalizedQty);

    const offerFields = product.specialOffer?.offerToken
      ? {
          offerToken: product.specialOffer.offerToken,
          discountPercent: product.specialOffer.discountPercent,
        }
      : {};

    dispatch(setCartEntry({
      productId: cartProductId,
      entry: {
        quantity: targetQty,
        price: effPrice,
        sku: String(selectedVariant?.sku || product.sku || '').trim(),
        productName: product.name || product.title || 'Product',
        variantOptions: cartVariantOptions,
        ...offerFields,
      },
    }));
    return targetQty;
  }, [
    isBulkBundleProduct,
    isMatrixProduct,
    matrixBundleTiers,
    variants,
    selectedOptions,
    bulkBundleTiers,
    maxOrderQty,
    selectedBundleQty,
    cartVariantOptions,
    effPrice,
    product,
    cartProductId,
    dispatch,
  ]);

  const handleProductQuantityChange = useCallback((value) => {
    const next = Math.max(1, Number(value) || 1);
    if (isBulkBundleProduct) {
      const capped = Math.max(1, Math.min(maxOrderQty || 1, next));
      if (bulkBundleTiers.includes(capped)) {
        setSelectedBundleQty(capped);
      } else {
        setSelectedBundleQty(bulkBundleTiers[0] || 1);
      }
      setQuantity(capped);
      return;
    }
    setQuantity(Math.max(1, Math.min(maxOrderQty || 1, next)));
  }, [maxOrderQty, isBulkBundleProduct, bulkBundleTiers]);

  const hasAnyVariantStock = variants.some((v) => Number(v?.stock || 0) > 0);
  const hasProductStockQty = Number(product.stockQuantity) > 0;
  const hasBaseStock = typeof product.stockQuantity === 'number' ? product.stockQuantity > 0 : true;
  // Matrix / variant products: treat as in-stock if any row has stock, or Stock Qty is set
  // (legacy rows often have stock 0 while Stock Qty still holds inventory).
  const isGloballyOutOfStock = variants.length > 0
    ? !(hasAnyVariantStock || hasProductStockQty)
    : product.inStock === false || !hasBaseStock;
  const discountPercent = effAED > effPrice
    ? Math.round(((effAED - effPrice) / effAED) * 100)
    : 0;
  const convertedEffPrice = convertPrice(effPrice);
  const convertedEffAED = convertPrice(effAED);
  const savingsAmount = Math.max(0, Number(convertedEffAED || 0) - Number(convertedEffPrice || 0));
  const pricingQuantity = isBulkBundleProduct
    ? (bulkBundleTiers.includes(Number(quantity)) ? 1 : Math.max(1, Number(quantity) || 1))
    : Math.max(1, Number(quantity) || 1);
  const convertedLineTotal = Number(convertedEffPrice || 0) * pricingQuantity;
  const convertedLineRegularTotal = Number(convertedEffAED || 0) * pricingQuantity;
  const buyBoxSalePrice = pricingQuantity > 1 ? convertedLineTotal : convertedEffPrice;
  const buyBoxRegularPrice = pricingQuantity > 1 ? convertedLineRegularTotal : convertedEffAED;
  const storedSalePriceAr = String(product?.attributes?.priceAr || '').trim();
  const storedRegularPriceAr = String(product?.attributes?.AEDAr || '').trim();
  const lineSavingsAmount = Math.max(0, convertedLineRegularTotal - convertedLineTotal);
  const displaySalePrice = isArabic && storedSalePriceAr
    ? storedSalePriceAr
    : formatMoney(convertedEffPrice, true);
  const displayRegularPrice = isArabic && storedRegularPriceAr
    ? storedRegularPriceAr
    : formatMoney(convertedEffAED, true);
  const displayMobileSalePrice = (isArabic && storedSalePriceAr && pricingQuantity <= 1)
    ? storedSalePriceAr
    : formatMoney(buyBoxSalePrice, true);
  const displayMobileRegularPrice = (isArabic && storedRegularPriceAr && pricingQuantity <= 1)
    ? storedRegularPriceAr
    : formatMoney(buyBoxRegularPrice, true);
  const displaySavingsAmount = formatMoney(savingsAmount, true);
  const displayMobileSavingsAmount = formatMoney(
    pricingQuantity > 1 ? lineSavingsAmount : savingsAmount,
    true,
  );

  const bundleOptionsPanel = useMemo(() => {
    if (!isBundleModeActive) return null;

    const getBundleTagLabel = (tag) => {
      if (tag === 'MOST_POPULAR') return t('product.mostPopular');
      if (tag === 'BEST_VALUE') return t('product.bestValue');
      return '';
    };

    let bundleRowVariants = [];

    if (isMatrixProduct) {
      const tiers = matrixBundleTiers.length
        ? matrixBundleTiers
        : [...new Set(
          variants
            .map((v) => Number(v?.options?.bundleQty))
            .filter((qty) => Number.isFinite(qty) && qty > 0),
        )].sort((a, b) => a - b);

      bundleRowVariants = tiers
        .map((qty) => matchMatrixVariant(variants, selectedOptions, qty)
          || { options: { bundleQty: qty }, price: product.price, sku: '', stock: 0 })
        .filter((row) => Number(row?.price) > 0);

      if (!bundleRowVariants.length) return null;
    } else if (bulkVariants.length) {
      bundleRowVariants = bulkVariants.slice();
      if (bulkBundleTiers.length) {
        bundleRowVariants = bundleRowVariants.filter(
          (v) => bulkBundleTiers.includes(Number(v.options?.bundleQty)),
        );
      }
    } else {
      return null;
    }

    if (!bundleRowVariants.length) return null;

    return (
      <div className="space-y-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-700">
          {t('product.bundleAndSave')}
        </p>
        {bundleRowVariants
          .sort((a, b) => Number(a.options.bundleQty) - Number(b.options.bundleQty))
          .map((v, idx) => {
            const qty = Number(v.options.bundleQty) || 1;
            const isSelected = Number(activeBundleTier) === qty;
            const price = Number(v.price);
            const convertedBundlePrice = convertPrice(price);
            const tag = v.tag || v.options?.tag || '';
            const tagLabel = getBundleTagLabel(tag);
            const bundleImage = getBundleOptionImage(v);
            const label = String(v.options?.bundleTitle || '').trim()
              || (isMatrixProduct
                ? formatBundleTierLabel(qty)
                : (String(v.options?.title || '').trim() || formatBundleTierLabel(qty)));
            const rowOutOfStock = Number(v.stock) <= 0;

            return (
              <button
                key={`${qty}-${idx}`}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleBundleTierSelect(qty);
                }}
                disabled={rowOutOfStock}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-all ${
                  rowOutOfStock
                    ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
                    : isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {bundleImage ? (
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                      <Image
                        src={bundleImage}
                        alt={label}
                        fill
                        sizes="56px"
                        className="object-contain p-0.5"
                      />
                    </div>
                  ) : null}
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected ? 'border-orange-500' : 'border-gray-400'
                    }`}>
                      {isSelected ? <div className="h-2.5 w-2.5 rounded-full bg-orange-500" /> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{label}</p>
                        {tagLabel ? (
                          <span
                            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-white ${
                              tag === 'BEST_VALUE' ? 'bg-emerald-600' : 'bg-orange-600'
                            }`}
                          >
                            {tagLabel}
                          </span>
                        ) : null}
                      </div>
                      {qty === 2 && !tag ? <p className="mt-0.5 text-xs text-gray-500">{t('product.perfectFor2Pack')}</p> : null}
                      {qty === 3 && !tag ? <p className="mt-0.5 text-xs text-gray-500">{t('product.bestValue')}</p> : null}
                      {rowOutOfStock ? <p className="mt-0.5 text-xs text-red-600">{t('common.outOfStock')}</p> : null}
                      {v.sku ? <p className="mt-0.5 text-[11px] text-gray-400">SKU: {v.sku}</p> : null}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-bold text-gray-900">{currency} {formatDisplay(convertedBundlePrice, language)}</div>
                </div>
              </button>
            );
          })}
      </div>
    );
  }, [
    isBundleModeActive,
    isMatrixProduct,
    matrixBundleTiers,
    variants,
    selectedOptions,
    bulkVariants,
    bulkBundleTiers,
    activeBundleTier,
    product.price,
    t,
    convertPrice,
    currency,
    formatDisplay,
    language,
    getBundleOptionImage,
    handleBundleTierSelect,
  ]);

  const localizedProductName = (isArabic && String(product?.nameAr || '').trim())
    ? product.nameAr
    : (product?.name || product?.title || '');
  const safeProductName = sanitizeDisplayText(localizedProductName || t('common.untitledProduct'));
  const productHeading = sanitizeDisplayText(
    getProductPageHeading(product, language) || safeProductName,
  );
  const localizedShortDescription = sanitizeDisplayText(
    (isArabic && String(product?.shortDescriptionAr || '').trim())
      ? product.shortDescriptionAr
      : (product?.shortDescription || product?.attributes?.shortDescription || '')
  );
  const localizedShortDescription2 = sanitizeDisplayText(
    (isArabic
      ? (product?.attributes?.shortDescription2Ar || product?.shortDescription2Ar || product?.shortDescription2 || product?.attributes?.shortDescription2 || '')
      : (product?.shortDescription2 || product?.attributes?.shortDescription2 || '')
    ).replace(/<[^>]*>/g, ' ')
  );
  const mobileShortDescription = localizedShortDescription || localizedShortDescription2;

  const renderSoldByLine = (className = '', mobile = false) => (
    <p
      dir={isArabic ? 'rtl' : 'ltr'}
      className={`w-full text-start leading-snug text-gray-600 ${mobile ? 'text-xs' : 'text-sm'} ${className}`.trim()}
    >
      {t('product.trustLine')}
    </p>
  );

  const displaySoldCount = Math.max(0, Number(product?.soldCount) || 0);

  const soldProgressPercent = useMemo(() => {
    // Always show a strong "selling fast" fill (80–90%).
    const seed = String(product?._id || product?.slug || displaySoldCount || '0');
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return 80 + (Math.abs(hash) % 11);
  }, [product?._id, product?.slug, displaySoldCount]);

  const renderSoldCountLine = (className = '') => {
    if (displaySoldCount <= 0) return null;

    return (
      <div
        dir={isArabic ? 'rtl' : 'ltr'}
        className={`w-full max-w-[280px] ${className}`.trim()}
      >
        <div className="mb-1.5 flex items-center justify-end">
          <span
            className="inline-flex items-baseline gap-1.5 text-[13px] font-extrabold leading-none tracking-tight"
            style={{ color: '#E52721' }}
          >
            <span className="tabular-nums">{formatCount(displaySoldCount)}</span>
            <span className="uppercase tracking-[0.12em]">
              {isArabic ? 'مباعة' : 'SOLD'}
            </span>
          </span>
        </div>

        <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#eceef2]">
          <div
            className="product-sold-progress-fill absolute inset-y-0 start-0 rounded-full bg-[#E52721]"
            style={{ width: `${soldProgressPercent}%` }}
            role="progressbar"
            aria-valuenow={soldProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('product.soldCount', { count: formatCount(displaySoldCount) })}
          />
        </div>
      </div>
    );
  };

  const mobileProductBrand = sanitizeDisplayText(
    (isArabic && String(product?.brandAr || '').trim())
      ? product.brandAr
      : (product?.brand || '')
  );
  const mobileArrivalDate = deliveryWindow.primaryArrivalText;
  const qualifiesForFreeMobileDelivery = Boolean(product?.freeShippingEligible)
    || (
      !product?.freeShippingEligible
      && Number(effPrice || 0) >= shippingPreview.freeShippingMin
    );
  const mobileDeliveryFeeLabel = qualifiesForFreeMobileDelivery
    ? t('product.mobile.freeDeliveryFee')
    : t('product.mobile.deliveryFee', {
      amount: formatMoney(convertPrice(shippingPreview.flatRate), true),
    });
  const selectedVariantLabel = formatVariantOptionsLabel(cartVariantOptions)
    || (selectedBundleQty ? `Bundle ${selectedBundleQty}` : 'Default');

  const isSelectionInStock = (() => {
    if (isGloballyOutOfStock) return false;
    if (!variants.length) {
      const hasStockQty = typeof product.stockQuantity === 'number' ? product.stockQuantity > 0 : true;
      return product.inStock !== false && hasStockQty;
    }
    if (!selectedVariant) return false;
    const variantStock = Number(selectedVariant.stock || 0);
    if (variantStock > 0) return true;
    // Legacy matrix rows often have stock 0 while product Stock Qty still holds inventory.
    return !hasAnyVariantStock && hasProductStockQty;
  })();

  useEffect(() => {
    if (variantMediaIndex < 0) return;
    setActiveMediaIndex(variantMediaIndex);
    const carousel = mobileCarouselRef.current;
    if (carousel) {
      carousel.scrollTo({
        left: variantMediaIndex * carousel.clientWidth,
        behavior: 'auto',
      });
    }
  }, [variantMediaIndex]);

  useEffect(() => {
    const initial = getInitialSelectedOptions(variantOptionGroups);
    if (!initial.color && product.colors?.[0] && variantOptionKeyInUse(variants, 'color', { isBulkBundleVariant })) {
      initial.color = product.colors[0];
    }
    if (!initial.size && product.sizes?.[0] && variantOptionKeyInUse(variants, 'size', { isBulkBundleVariant })) {
      initial.size = product.sizes[0];
    }

    const availableVariants = variants.filter((variant) => !isBulkBundleVariant(variant) && (variant?.stock ?? 0) > 0);
    if (availableVariants.length === 1) {
      const variant = availableVariants[0];
      variantOptionGroups.forEach((group) => {
        if (variant.options?.[group.key]) initial[group.key] = variant.options[group.key];
      });
      setSelectedOptions(sanitizeSelectedOptions(variants, initial, { isBulkBundleVariant }));
      return;
    }

    variantOptionGroups.forEach((group) => {
      const availableValues = group.values.filter((value) => isVariantOptionValueAvailable(
        variants,
        initial,
        group.key,
        value,
        { isBulkBundleVariant },
      ));
      if (availableValues.length === 1) initial[group.key] = availableValues[0];
    });
    setSelectedOptions(sanitizeSelectedOptions(variants, initial, { isBulkBundleVariant }));
  }, [product?._id]);

  const imageContainerRef = useRef(null);
  const [showZoom, setShowZoom] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 0.5, y: 0.5 });
  const [zoomPanelPos, setZoomPanelPos] = useState({ top: 0, left: 0, height: 0, width: 0, panelSize: 420 });
  const [zoomPortalReady, setZoomPortalReady] = useState(false);
  const [showFullViewGallery, setShowFullViewGallery] = useState(false);
  const [fullViewIndex, setFullViewIndex] = useState(0);

  useEffect(() => {
    setZoomPortalReady(true);
  }, []);

  useEffect(() => {
    if (!showFbtPopup) return undefined;

    setShowZoom(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setShowFbtPopup(false);
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showFbtPopup]);

  const isRtlLayout = useCallback(() => {
    if (typeof document === 'undefined') return isArabic;
    return document.documentElement.getAttribute('dir') === 'rtl' || isArabic;
  }, [isArabic]);

  const computeZoomPanelPosition = useCallback((rect) => {
    const panelSize = Math.min(Math.max(rect.height, 360), 520);
    const gap = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rtl = isRtlLayout();

    const spaceOnLeft = rect.left - gap;
    const spaceOnRight = viewportWidth - rect.right - gap;

    let left;
    if (rtl) {
      left = spaceOnLeft >= panelSize
        ? rect.left - panelSize - gap
        : rect.right + gap;
    } else {
      left = spaceOnRight >= panelSize
        ? rect.right + gap
        : rect.left - panelSize - gap;
    }

    left = Math.max(gap, Math.min(left, viewportWidth - panelSize - gap));
    const top = Math.max(gap, Math.min(rect.top, viewportHeight - panelSize - gap));

    return { top, left, height: rect.height, width: rect.width, panelSize };
  }, [isRtlLayout]);

  const handleImageMouseMove = (e) => {
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    setZoomPos({ x, y });
    setZoomPanelPos(computeZoomPanelPosition(rect));
  };

  const renderZoomPanel = () => {
    if (!showZoom || showFbtPopup || !mainImage || activeMedia?.type === 'video' || !zoomPortalReady) return null;

    const panelSize = zoomPanelPos.panelSize || Math.min(Math.max(zoomPanelPos.height, 360), 520);

    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: zoomPanelPos.top,
          left: zoomPanelPos.left,
          width: panelSize,
          height: panelSize,
          backgroundImage: `url(${mainImage})`,
          backgroundSize: '400% 400%',
          backgroundPosition: `${zoomPos.x * 100}% ${zoomPos.y * 100}%`,
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#fff',
          zIndex: 99999,
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}
      />,
      document.body
    );
  };

  const renderFbtPopup = () => {
    if (!showFbtPopup || !fbtEnabled || fbtProducts.length === 0 || !zoomPortalReady) return null;

    const closeFbtPopup = () => setShowFbtPopup(false);

    return createPortal(
      <div
        className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[1px] sm:items-center sm:bg-black/60 sm:p-4 sm:backdrop-blur-[2px]"
        onClick={closeFbtPopup}
        role="dialog"
        aria-modal="true"
        aria-label={isArabic ? 'يُشترى معًا غالبًا' : 'Frequently bought together'}
      >
        <div
          className="flex w-full max-w-md max-h-[82vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[min(88vh,720px)] sm:max-w-4xl sm:rounded-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-snug text-gray-900 sm:text-xl">
                {isArabic ? 'يُشترى معًا غالبًا' : 'Frequently Bought Together'}
              </h3>
              <p className="mt-0.5 text-[11px] text-gray-500 sm:mt-1 sm:text-sm">
                {isArabic
                  ? `${totalBundleItems} عناصر · ${currency} ${formatDisplay(convertPrice(bundleTotal), language)}`
                  : `${totalBundleItems} items · ${currency} ${formatDisplay(convertPrice(bundleTotal), language)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={closeFbtPopup}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 sm:h-9 sm:w-9"
              aria-label={isArabic ? 'إغلاق' : 'Close'}
            >
              <X size={18} className="sm:hidden" />
              <X size={20} className="hidden sm:block" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:overflow-hidden sm:px-6 sm:py-5">
            <div className="space-y-2 sm:hidden">
              {allFbtCards.map((card) => (
                <label
                  key={`popup-mobile-${card._id}`}
                  onClick={handleFbtPopupCardClick}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
                    card.checked
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-gray-200 bg-white opacity-80'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={card.checked}
                    readOnly={card.isMain}
                    onChange={card.isMain ? undefined : () => toggleFbtProduct(card._id)}
                    className="h-4 w-4 shrink-0 rounded accent-blue-600"
                  />
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
                    <div className="relative h-11 w-11">
                      <Image
                        src={card.image || PLACEHOLDER_IMAGE}
                        alt={card.name}
                        fill
                        className="pointer-events-none object-contain"
                        draggable={false}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12px] leading-snug text-gray-800">{card.name}</p>
                    {card.isMain ? (
                      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                        {isArabic ? 'هذا المنتج' : 'This item'}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[13px] font-bold text-gray-900">
                      {currency} {formatDisplay(convertPrice(card.price), language)}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <div
              ref={fbtPopupScrollRef}
              role="region"
              aria-label={isArabic ? 'منتجات الحزمة' : 'Bundle products'}
              onPointerDown={handleFbtPopupPointerDown}
              className={`hidden overflow-x-auto scrollbar-hide overscroll-x-contain select-none sm:block ${
                fbtPopupIsDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={fbtPopupTrackStyle}
            >
              <div className="flex min-w-max items-stretch gap-2 pb-1">
                {allFbtCards.map((card, index, arr) => (
                  <div key={card._id} className="flex items-center gap-2">
                    <label
                      onClick={handleFbtPopupCardClick}
                      className={`relative flex w-[164px] flex-col rounded-xl border-2 p-3 transition ${
                        card.checked
                          ? 'border-slate-900 bg-slate-50 shadow-sm'
                          : 'border-gray-200 bg-white opacity-80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={card.checked}
                        readOnly={card.isMain}
                        onChange={card.isMain ? undefined : () => toggleFbtProduct(card._id)}
                        className="absolute left-3 top-3 h-4 w-4 rounded accent-blue-600"
                      />
                      <div className="mx-auto mt-2 flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-lg bg-gray-50">
                        <div className="relative h-[72px] w-[72px]">
                          <Image
                            src={card.image || PLACEHOLDER_IMAGE}
                            alt={card.name}
                            fill
                            className="pointer-events-none object-contain"
                            draggable={false}
                          />
                        </div>
                      </div>
                      <p className="mt-3 min-h-[36px] text-[12px] leading-snug text-gray-700 line-clamp-2">
                        {card.name}
                      </p>
                      {card.isMain ? (
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          {isArabic ? 'هذا المنتج' : 'This item'}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[15px] font-bold text-gray-900">
                        {currency} {formatDisplay(convertPrice(card.price), language)}
                      </p>
                    </label>
                    {index < arr.length - 1 ? (
                      <span className="px-1 text-2xl font-light text-gray-300" aria-hidden="true">+</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 shrink-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[11px]">
                  {isArabic ? 'الإجمالي' : 'Total'}
                </p>
                <p className="text-[17px] font-bold text-gray-900 sm:text-xl">
                  {currency} {formatDisplay(convertPrice(bundleTotal), language)}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await handleAddBundleToCart();
                  closeFbtPopup();
                }}
                disabled={selectedAddonProducts.length === 0}
                className="h-10 min-w-0 flex-1 rounded-lg bg-yellow-400 px-4 text-[13px] font-bold text-gray-900 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50 sm:h-12 sm:flex-none sm:rounded-xl sm:px-6 sm:text-sm sm:min-w-[220px]"
              >
                {isArabic
                  ? `اشترِ ${totalBundleItems} معًا`
                  : `Buy ${totalBundleItems} together`}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const openFullViewGallery = useCallback(() => {
    setFullViewIndex(activeMediaIndex);
    setShowZoom(false);
    setShowFullViewGallery(true);
  }, [activeMediaIndex]);

  const closeFullViewGallery = useCallback(() => {
    setActiveMediaIndex(fullViewIndex);
    setShowFullViewGallery(false);
  }, [fullViewIndex]);

  const goToPreviousFullView = useCallback(() => {
    if (mediaGallery.length <= 1) return;
    setFullViewIndex((prev) => (prev - 1 + mediaGallery.length) % mediaGallery.length);
  }, [mediaGallery.length]);

  const goToNextFullView = useCallback(() => {
    if (mediaGallery.length <= 1) return;
    setFullViewIndex((prev) => (prev + 1) % mediaGallery.length);
  }, [mediaGallery.length]);

  useEffect(() => {
    if (!showFullViewGallery) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeFullViewGallery();
      if (event.key === 'ArrowLeft') goToPreviousFullView();
      if (event.key === 'ArrowRight') goToNextFullView();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showFullViewGallery, closeFullViewGallery, goToPreviousFullView, goToNextFullView]);

  const renderFullViewGallery = () => {
    if (!showFullViewGallery || !zoomPortalReady || mediaGallery.length === 0) return null;

    const current = mediaGallery[fullViewIndex] || mediaGallery[0];

    return createPortal(
      <div
        className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/92 p-4"
        onClick={closeFullViewGallery}
        role="dialog"
        aria-modal="true"
        aria-label="Product image gallery"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            closeFullViewGallery();
          }}
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close gallery"
        >
          <X size={22} />
        </button>

        {mediaGallery.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                goToPreviousFullView();
              }}
              className="absolute left-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:left-6"
              aria-label="Previous image"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                goToNextFullView();
              }}
              className="absolute right-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-6"
              aria-label="Next image"
            >
              <ChevronRight size={28} />
            </button>
          </>
        ) : null}

        <div
          className="relative flex h-[min(85vh,900px)] w-full max-w-5xl items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          {current?.type === 'video' ? (
            <video
              key={current.src}
              src={current.src}
              poster={current.poster || PLACEHOLDER_IMAGE}
              controls
              playsInline
              preload="metadata"
              className="max-h-[85vh] max-w-full rounded-lg"
            />
          ) : (
            <Image
              src={current?.src || PLACEHOLDER_IMAGE}
              alt={`${safeProductName} ${fullViewIndex + 1}`}
              width={1200}
              height={1200}
              quality={95}
              className="max-h-[85vh] w-auto max-w-full object-contain"
              priority
              onError={(event) => { event.currentTarget.src = PLACEHOLDER_IMAGE; }}
            />
          )}

          {mediaGallery.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden flex-col items-center bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-14 lg:flex">
              <div className="pointer-events-auto mb-3 rounded-full bg-black/45 px-4 py-1 text-sm font-medium text-white">
                {fullViewIndex + 1} / {mediaGallery.length}
              </div>
              <div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto px-1 py-1 scrollbar-hide">
                {mediaGallery.map((item, index) => (
                  <button
                    key={`fullview-thumb-${item.src}-${index}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFullViewIndex(index);
                    }}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition ${
                      fullViewIndex === index ? 'border-orange-500' : 'border-white/35 hover:border-white/70'
                    }`}
                    aria-label={`View image ${index + 1}`}
                  >
                    <Image
                      src={item.poster || item.src || PLACEHOLDER_IMAGE}
                      alt=""
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                      onError={(event) => { event.currentTarget.src = PLACEHOLDER_IMAGE; }}
                    />
                    {item.type === 'video' ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {mediaGallery.length > 1 ? (
          <>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-sm font-medium text-white lg:hidden">
              {fullViewIndex + 1} / {mediaGallery.length}
            </div>
            <div className="absolute bottom-16 left-1/2 flex max-w-[min(90vw,640px)] -translate-x-1/2 gap-2 overflow-x-auto px-2 py-1 scrollbar-hide lg:hidden">
              {mediaGallery.map((item, index) => (
                <button
                  key={`fullview-thumb-mobile-${item.src}-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFullViewIndex(index);
                  }}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 transition ${
                    fullViewIndex === index ? 'border-orange-500' : 'border-white/30 hover:border-white/60'
                  }`}
                  aria-label={`View image ${index + 1}`}
                >
                  <Image
                    src={item.poster || item.src || PLACEHOLDER_IMAGE}
                    alt=""
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    onError={(event) => { event.currentTarget.src = PLACEHOLDER_IMAGE; }}
                  />
                  {item.type === 'video' ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>,
      document.body
    );
  };

  const aspectRatioClass = getProductImageAspectRatioClass(product.imageAspectRatio);

  const activeImageIndex = useMemo(() => {
    if (!mediaGallery.length) return 0;
    return activeMediaIndex;
  }, [mediaGallery.length, activeMediaIndex]);

  const goToMobileImage = (index, smooth = true) => {
    if (!mediaGallery.length) return;
    const safeIndex = Math.max(0, Math.min(index, mediaGallery.length - 1));
    setShowZoom(false);
    setActiveMediaIndex(safeIndex);
    const carousel = mobileCarouselRef.current;
    if (carousel) {
      carousel.scrollTo({
        left: safeIndex * carousel.clientWidth,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  const handleMobileCarouselScroll = () => {
    if (mobileCarouselScrollRaf.current) {
      cancelAnimationFrame(mobileCarouselScrollRaf.current);
    }
    mobileCarouselScrollRaf.current = requestAnimationFrame(() => {
      const carousel = mobileCarouselRef.current;
      if (!carousel || !mediaGallery.length) return;
      const index = Math.round(carousel.scrollLeft / carousel.clientWidth);
      const safeIndex = Math.max(0, Math.min(index, mediaGallery.length - 1));
      setActiveMediaIndex(safeIndex);
    });
  };

  useEffect(() => {
    setActiveMediaIndex(0);
    const carousel = mobileCarouselRef.current;
    if (carousel) {
      carousel.scrollLeft = 0;
    }
  }, [product._id]);

  const selectGalleryIndex = useCallback((index) => {
    if (!mediaGallery.length) return;
    const safeIndex = Math.max(0, Math.min(index, mediaGallery.length - 1));
    setShowZoom(false);
    setActiveMediaIndex(safeIndex);
  }, [mediaGallery.length]);

  useEffect(() => {
    const container = mobileThumbnailsRef.current;
    if (!container) return;
    const thumb = container.children[activeImageIndex];
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeImageIndex]);

  useEffect(() => {
    const mainImageEl = desktopMainImageRef.current;
    if (!mainImageEl || typeof ResizeObserver === 'undefined') return undefined;

    const syncGalleryHeight = () => {
      const nextHeight = Math.round(mainImageEl.getBoundingClientRect().height);
      if (nextHeight > 0) setDesktopGalleryHeight(nextHeight);
    };

    syncGalleryHeight();
    const observer = new ResizeObserver(syncGalleryHeight);
    observer.observe(mainImageEl);
    window.addEventListener('resize', syncGalleryHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncGalleryHeight);
    };
  }, [product?._id, aspectRatioClass, mediaGallery.length]);

  useEffect(() => {
    const container = desktopThumbnailsRef.current;
    if (!container) return;
    const thumb = container.children[activeMediaIndex];
    if (thumb) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeMediaIndex, desktopGalleryHeight]);

  useEffect(() => () => {
    if (mobileCarouselScrollRaf.current) {
      cancelAnimationFrame(mobileCarouselScrollRaf.current);
    }
  }, []);

  // Check wishlist status
  useEffect(() => {
    checkWishlistStatus();
  }, [isSignedIn, product._id]);

  useEffect(() => {
    const handleWishlistUpdate = () => {
      checkWishlistStatus();
    };

    window.addEventListener('wishlistUpdated', handleWishlistUpdate);
    return () => window.removeEventListener('wishlistUpdated', handleWishlistUpdate);
  }, [isSignedIn, product._id, user]);

  const checkWishlistStatus = async () => {
    const productId = String(product?._id || product?.id || '').trim();
    if (!productId) {
      setIsInWishlist(false);
      return;
    }

    try {
      if (isSignedIn) {
        // Check server wishlist for signed-in users
        const token = await getToken();
        if (!token) return;
        const { data } = await axios.get('/api/wishlist', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const isInList = data.wishlist?.some((item) => String(item?.productId) === productId);
        setIsInWishlist(isInList);
      } else {
        // Check localStorage for guests
        const guestWishlist = JSON.parse(localStorage.getItem('guestWishlist') || '[]');
        const isInList = guestWishlist.some((item) => item && String(item.productId) === productId);
        setIsInWishlist(isInList);
      }
    } catch (error) {
      console.error('Error checking wishlist status:', error);
    }
  };

  const showActionToast = (payload) => {
    if (actionToastTimerRef.current) {
      clearTimeout(actionToastTimerRef.current);
    }
    setActionToast(payload);
    actionToastTimerRef.current = setTimeout(() => {
      setActionToast(null);
      actionToastTimerRef.current = null;
    }, payload.duration || 4500);
  };

  const notifyCartAdded = () => {
    showActionToast({
      variant: 'cart',
      title: t('product.addedToCartToast'),
      subtitle: t('product.addedToCartSubtitle'),
      actionLabel: t('product.viewCart'),
      actionHref: '/cart',
      duration: 4500,
    });
  };

  const notifyWishlistUpdate = (type) => {
    if (type === 'added') {
      showActionToast({
        variant: 'wishlist',
        title: t('product.addedToWishlistToast'),
        subtitle: t('product.addedToWishlistSubtitle'),
        actionLabel: t('product.viewWishlist'),
        actionHref: '/wishlist',
        duration: 4500,
      });
      return;
    }

    if (type === 'removed') {
      showActionToast({
        variant: 'wishlist-removed',
        title: t('product.removedFromWishlistToast'),
        duration: 4500,
      });
      return;
    }

    showActionToast({
      variant: 'wishlist-removed',
      title: t('common.wishlistUpdateFailed'),
      duration: 4500,
    });
  };

  const handleWishlist = async () => {
    if (wishlistLoading) return;

    try {
      setWishlistLoading(true);

      if (isSignedIn) {
        // Handle server wishlist for signed-in users
        const action = isInWishlist ? 'remove' : 'add';
        const token = await getToken();
        if (!token) throw new Error('No auth token');
        await axios.post('/api/wishlist', { 
          productId: String(product._id || product.id), 
          action 
        }, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        setIsInWishlist(!isInWishlist);
        notifyWishlistUpdate(isInWishlist ? 'removed' : 'added');
        window.dispatchEvent(new Event('wishlistUpdated'));
      } else {
        // Handle localStorage wishlist for guests
        const guestWishlist = JSON.parse(localStorage.getItem('guestWishlist') || '[]');
        
        if (isInWishlist) {
          // Remove from wishlist
          const productId = String(product._id || product.id);
          const updatedWishlist = guestWishlist.filter((item) => item && String(item.productId) !== productId);
          localStorage.setItem('guestWishlist', JSON.stringify(updatedWishlist));
          setIsInWishlist(false);
          notifyWishlistUpdate('removed');
        } else {
          // Add to wishlist with product details
          const wishlistItem = {
            productId: String(product._id || product.id),
            slug: product.slug,
            name: product.name,
            price: effPrice,
            AED: effAED,
            images: normalizeImages(product.images),
            discount: discountPercent,
            inStock: product.inStock,
            addedAt: new Date().toISOString()
          };
          guestWishlist.push(wishlistItem);
          localStorage.setItem('guestWishlist', JSON.stringify(guestWishlist));
          setIsInWishlist(true);
          notifyWishlistUpdate('added');
        }
        
        window.dispatchEvent(new Event('wishlistUpdated'));
      }
    } catch (error) {
      console.error('Error updating wishlist:', error);
      notifyWishlistUpdate('error');
    } finally {
      setWishlistLoading(false);
    }
  };

  const handleOrderNow = () => {
    if (isOrderingNow || !isSelectionInStock || maxOrderQty <= 0) return;
    setIsOrderingNow(true);
    try {
      const qtyToAdd = quantity;
      upsertProductCartLines(qtyToAdd);
      router.push('/checkout');
    } catch (error) {
      console.error('Order now failed:', error);
    } finally {
      setIsOrderingNow(false);
    }
  };

  const handleAddToCart = async () => {
    if (!isSelectionInStock || maxOrderQty <= 0) return;

    const qtyToAdd = quantity;
    upsertProductCartLines(qtyToAdd);
    const gtmQty = isBulkBundleProduct
      ? (Number(activeBundleTier) || 1)
      : Math.min(Math.max(1, Number(quantity) || 1), maxOrderQty);
    const gtmLinePrice = isBulkBundleProduct
      ? Number(findBulkBundleVariant(product, activeBundleTier)?.price ?? effPrice ?? product.price ?? 0)
      : (isMatrixProduct
        ? Number(matchMatrixVariant(variants, selectedOptions, activeBundleTier)?.price ?? effPrice ?? product.price ?? 0)
        : Number(effPrice || product.price || 0));

    trackProductAddToCart({
      product,
      productId: product._id || product.id,
      name: product.name || product.title || 'Product',
      price: gtmLinePrice,
      quantity: gtmQty,
      currency: 'AED',
      variantOptions: selectedOptions,
    });

    if (isSignedIn) {
      try {
        await dispatch(uploadCart()).unwrap();
      } catch (error) {
        console.error('Error uploading cart:', error);
      }
    }

    notifyCartAdded();
  };

  const cartMatchesSelection = useMemo(() => {
    if (!Number.isFinite(cartQty) || cartQty <= 0) return false;
    if (isBulkBundleProduct) {
      if (!bundleCartSelectionMatches(cartEntry, product, selectedBundleQty)) {
        return false;
      }
      const lineDisplay = resolveCartDisplayQuantity(
        product,
        cartEntry,
        cartQty,
        selectedBundleQty,
      );
      if (Number(quantity) !== lineDisplay) return false;
    }
    return cartVariantOptionsMatch(cartEntry?.variantOptions, cartVariantOptions);
  }, [
    cartQty,
    cartEntry,
    cartVariantOptions,
    isBulkBundleProduct,
    product,
    selectedBundleQty,
    quantity,
  ]);

  const showCartMatchedUi = cartUiReady && cartMatchesSelection;

  // Reset quantity/tier when switching products — not when the user picks a bundle tier.
  useEffect(() => {
    prevSelectedOptionsKeyRef.current = null;
    if (isBulkBundleProduct && bulkBundleTiers.length > 0) {
      const initialTier = bulkBundleTiers[0];
      setSelectedBundleQty(initialTier);
      setQuantity(initialTier);
    } else if (isMatrixProduct && matrixBundleTiers.length > 0) {
      setSelectedBundleQty(matrixBundleTiers[0]);
      setQuantity(1);
    } else {
      setQuantity(1);
    }
  }, [product?._id]);

  // Matrix only: reset bundle tier when color/size (or other option) changes.
  const selectedOptionsKey = useMemo(
    () => JSON.stringify(selectedOptions),
    [selectedOptions],
  );

  useEffect(() => {
    if (!isMatrixProduct || matrixBundleTiers.length === 0) return;
    if (prevSelectedOptionsKeyRef.current === null) {
      prevSelectedOptionsKeyRef.current = selectedOptionsKey;
      return;
    }
    if (prevSelectedOptionsKeyRef.current === selectedOptionsKey) return;
    prevSelectedOptionsKeyRef.current = selectedOptionsKey;
    setSelectedBundleQty(matrixBundleTiers[0]);
    setQuantity(1);
  }, [isMatrixProduct, selectedOptionsKey, matrixBundleTiers]);

  // Keep the selected pack tier when only stock/availability recalculates tiers.
  useEffect(() => {
    if (!isMatrixProduct || matrixBundleTiers.length === 0) return;
    setSelectedBundleQty((prev) => {
      const current = Number(prev);
      if (current && matrixBundleTiers.includes(current)) return prev;
      return matrixBundleTiers[0];
    });
  }, [isMatrixProduct, matrixBundleTiers]);

  useEffect(() => {
    if (!isBulkBundleProduct || bulkBundleTiers.length === 0) return;
    setSelectedBundleQty((prev) => {
      const current = Number(prev);
      if (current && bulkBundleTiers.includes(current)) return prev;
      return bulkBundleTiers[0];
    });
  }, [isBulkBundleProduct, bulkBundleTiers]);

  useEffect(() => {
    if (!cartMatchesSelection) return;
    if (isBulkBundleProduct && cartBundleTier) {
      setSelectedBundleQty(cartBundleTier);
      setQuantity(cartDisplayQty);
      return;
    }
    if (isCartMatrixLine && cartBundleTier) {
      setSelectedBundleQty(cartBundleTier);
      setQuantity(cartQty);
      return;
    }
    setQuantity(cartQty);
  }, [
    cartMatchesSelection,
    product?._id,
    cartQty,
    cartDisplayQty,
    isCartMatrixLine,
    isBulkBundleProduct,
    cartBundleTier,
  ]);

  const isBulkSingleTierPack = isBulkBundleProduct
    && cartQty === 1
    && bulkBundleTiers.includes(Number(cartEntry?.variantOptions?.bundleQty));

  const stepProductBulkTier = useCallback(async (direction) => {
    if (!isBulkBundleProduct || !cartEntry || cartQty <= 0) return;

    const result = adjustBundleCartTier(cartEntry, product, direction === 1 ? 'up' : 'down');
    if (result === 'remove') {
      dispatch(deleteItemFromCart({ productId: cartProductId }));
    } else if (result) {
      dispatch(setCartEntry({ productId: cartProductId, entry: result }));
    }

    if (isSignedIn) {
      try { await dispatch(uploadCart()).unwrap(); } catch (_) {}
    }
  }, [
    isBulkBundleProduct,
    cartEntry,
    cartQty,
    product,
    cartProductId,
    dispatch,
    isSignedIn,
  ]);

  const isAtMaxBulkTier = isBulkBundleProduct
    && bulkBundleTiers.length > 0
    && Number(activeBundleTier) >= bulkBundleTiers[bulkBundleTiers.length - 1]
    && isBulkSingleTierPack;

  // Toggle FBT product selection
  const toggleFbtProduct = (productId) => {
    const nextSelected = !selectedFbtProducts[productId];
    const selectedProduct = fbtProducts.find((p) => String(p._id) === String(productId));
    pushDataLayerEvent(nextSelected ? 'fbt_item_selected' : 'fbt_item_unselected', {
      currency: 'AED',
      items: selectedProduct ? [{
        item_id: String(selectedProduct._id),
        item_name: selectedProduct.name || 'Product',
        price: Number(selectedProduct.price || 0),
        quantity: 1,
      }] : [],
    });
    trackCustomerBehavior(nextSelected ? 'fbt_item_selected' : 'fbt_item_unselected', {
      selectedProductId: selectedProduct?._id ? String(selectedProduct._id) : null,
      selectedProductPrice: selectedProduct?.price ?? null,
    });

    setSelectedFbtProducts(prev => ({
      ...prev,
      [productId]: nextSelected
    }));
  };

  // Calculate FBT bundle total
  const calculateFbtTotal = () => calculateFbtBundleTotal({
    mainPrice: effPrice,
    addonProducts: fbtProducts.filter((p) => selectedFbtProducts[p._id] && isValidFbtPrice(p.price)),
    bundlePrice: fbtBundlePrice,
    bundleDiscount: fbtBundleDiscount,
  });

  // Add all selected FBT products to cart
  const handleAddBundleToCart = async () => {
    const selectedBundleProducts = fbtProducts.filter((p) => selectedFbtProducts[p._id] && isValidFbtPrice(p.price));
    if (selectedBundleProducts.length === 0) return;

    const bundleTotal = calculateFbtTotal();

    pushDataLayerEvent('fbt_add_bundle_clicked', {
      currency: 'AED',
      value: Number(bundleTotal || 0),
      items: [
        {
          item_id: String(product._id || ''),
          item_name: product.name || 'Main product',
          price: Number(effPrice || 0),
          quantity: 1,
        },
        ...selectedBundleProducts.map((p) => ({
            item_id: String(p._id),
            item_name: p.name || 'Product',
            price: Number(p.price || 0),
            quantity: 1,
          })),
      ],
    });
    trackCustomerBehavior('fbt_add_bundle_clicked', {
      relatedProductIds: selectedBundleProducts.map((p) => String(p._id)),
    });

    const priceByProductId = distributeFbtLinePrices({
      mainProductId: cartProductId,
      mainPrice: effPrice,
      addonProducts: selectedBundleProducts,
      bundleTotal,
    });
    const fbtBundle = buildFbtBundleCartMeta(
      cartProductId,
      selectedBundleProducts.map((p) => p._id),
    );

    trackProductAddToCart({
      product,
      productId: cartProductId,
      name: product.name || product.title || 'Product',
      price: Number(priceByProductId.get(cartProductId) ?? effPrice ?? 0),
      quantity: 1,
      currency: 'AED',
    });

    dispatch(setCartEntry({
      productId: cartProductId,
      entry: {
        quantity: 1,
        price: priceByProductId.get(cartProductId) ?? effPrice,
        variantOptions: cartVariantOptions,
        maxQty: maxOrderQty,
        fbtBundle,
      },
    }));

    selectedBundleProducts.forEach((p) => {
      const productId = String(p._id);
      trackProductAddToCart({
        product: p,
        productId,
        name: p.name || 'Product',
        price: Number(priceByProductId.get(productId) ?? p.price ?? 0),
        quantity: 1,
        currency: 'AED',
      });
      dispatch(setCartEntry({
        productId,
        entry: {
          quantity: 1,
          price: priceByProductId.get(productId) ?? p.price,
          fbtBundle,
        },
      }));
    });
    
    // Upload to server if signed in
    if (isSignedIn) {
      try {
        await dispatch(uploadCart()).unwrap();
      } catch (error) {
        console.error('Error uploading cart:', error);
      }
    }
    
    notifyCartAdded();

    pushDataLayerEvent('fbt_add_bundle_success', {
      currency: 'AED',
      value: Number(bundleTotal || 0),
      items: [
        {
          item_id: String(product._id || ''),
          item_name: product.name || 'Main product',
          price: Number(effPrice || 0),
          quantity: 1,
        },
        ...selectedBundleProducts.map((p) => ({
            item_id: String(p._id),
            item_name: p.name || 'Product',
            price: Number(p.price || 0),
            quantity: 1,
          })),
      ],
    });
    trackCustomerBehavior('fbt_add_bundle_success', {
      relatedProductIds: selectedBundleProducts.map((p) => String(p._id)),
    });

    // Send customer directly to checkout with the selected bundle in cart
    router.push('/checkout');
  };

  const selectedAddonProducts = fbtProducts.filter(p => selectedFbtProducts[p._id]);
  const validSelectedAddonProducts = selectedAddonProducts.filter((p) => {
    const ok = isValidFbtPrice(p.price);
    if (!ok) {
      console.warn('Skipping invalid FBT product from summary total', { productId: p._id, price: p.price });
    }
    return ok;
  });
  const addonTotal = validSelectedAddonProducts.reduce((sum, p) => sum + Number(p.price), 0);
  const baseBundleTotal = effPrice + addonTotal;
  const bundleTotal = calculateFbtTotal();
  const bundleSavings = Math.max(baseBundleTotal - bundleTotal, 0);
  const totalBundleItems = 1 + validSelectedAddonProducts.length;
  const allFbtCards = [{
    _id: 'main-product',
    name: product.name,
    image: normalizeImages(product.images)?.[0],
    price: Number(effPrice || 0),
    isMain: true,
    checked: true,
    badge: product.fastDelivery ? 'express' : null,
  }, ...fbtProducts.map((item) => ({
    _id: item._id,
    name: item.name,
    image: normalizeImages(item.images)?.[0],
    price: Number(item.price || 0),
    isMain: false,
    checked: Boolean(selectedFbtProducts[item._id]),
    badge: item.fastDelivery ? 'express' : (String(item.tags?.[0] || '').toLowerCase() === 'supermall' ? null : (item.tags?.[0] || null)),
  }))];

  const renderFbtSection = (variant = 'desktop') => {
    if (!fbtEnabled || fbtProducts.length === 0) return null;

    const isMobile = variant === 'mobile';
    const scrollRef = isMobile ? fbtMobileScrollRef : fbtScrollRef;
    const handlePointerDown = isMobile ? handleFbtMobilePointerDown : handleFbtPointerDown;
    const handleCardClick = isMobile ? handleFbtMobileCardClick : handleFbtCardClick;
    const isDragging = isMobile ? fbtMobileIsDragging : fbtIsDragging;
    const trackStyle = isMobile ? fbtMobileTrackStyle : fbtTrackStyle;
    const outerClassName = isMobile
      ? 'overflow-hidden rounded-xl border border-gray-200 bg-white lg:hidden'
      : 'pt-4 mt-3 border-t border-gray-200 hidden lg:block';
    const innerClassName = isMobile
      ? 'p-3'
      : 'rounded-lg border border-gray-200 bg-white p-4 sm:p-5';

    return (
      <div className={outerClassName}>
        <div className={innerClassName}>
          <div className={`flex items-start justify-between gap-2 ${isMobile ? '' : 'items-center gap-4'}`}>
            <div className="min-w-0">
              <h2 className={`font-bold text-gray-900 ${isMobile ? 'text-[15px] leading-snug' : 'text-[18px]'}`}>
                {isArabic ? 'يُشترى معًا غالبًا' : 'Frequently Bought Together'}
              </h2>
              <p className={`text-gray-500 ${isMobile ? 'mt-0.5 text-[11px] leading-snug' : 'mt-1 text-sm'}`}>
                {isArabic
                  ? `${totalBundleItems} عناصر · ${currency} ${formatDisplay(convertPrice(bundleTotal), language)}`
                  : `${totalBundleItems} items · ${currency} ${formatDisplay(convertPrice(bundleTotal), language)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFbtPopup(true)}
              className={`shrink-0 rounded-md border border-gray-300 font-semibold text-gray-800 transition hover:bg-gray-50 ${
                isMobile ? 'h-7 px-2.5 text-[11px]' : 'h-10 px-4 text-sm'
              }`}
            >
              {isArabic ? 'عرض الكل' : 'View All'}
            </button>
          </div>

          <div
            ref={scrollRef}
            role="region"
            aria-label={isArabic ? 'يُشترى معًا غالبًا' : 'Frequently bought together products'}
            onPointerDown={handlePointerDown}
            className={`overflow-x-auto scrollbar-hide overscroll-x-contain select-none ${
              isMobile ? 'mt-2.5' : 'mt-4'
            } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={trackStyle}
          >
            <div className={`flex min-w-max items-start ${isMobile ? 'gap-2 pb-1' : 'gap-3 pb-2'}`}>
              {allFbtCards.map((card, index, arr) => (
                <div key={`${variant}-${card._id}`} className={`flex items-center ${isMobile ? 'gap-1.5' : 'gap-3'}`}>
                  <label
                    onClick={handleCardClick}
                    className={`relative flex-shrink-0 cursor-pointer rounded-md border transition ${
                      isMobile ? 'w-[104px] p-2' : 'w-[136px] p-2.5'
                    } ${card.checked ? 'border-gray-300 bg-white' : 'border-gray-200 bg-white opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      checked={card.checked}
                      readOnly={card.isMain}
                      onChange={card.isMain ? undefined : () => toggleFbtProduct(card._id)}
                      className={`absolute rounded accent-blue-600 ${isMobile ? 'left-1.5 top-1.5 h-3 w-3' : 'left-2 top-2 h-3.5 w-3.5'}`}
                    />
                    <div className={`flex items-center justify-center overflow-hidden rounded bg-gray-50 ${
                      isMobile ? 'mb-1.5 mt-0.5 h-[56px]' : 'mb-2 mt-1 h-[82px]'
                    }`}>
                      <div className={`relative ${isMobile ? 'h-[44px] w-[44px]' : 'h-[66px] w-[66px]'}`}>
                        <Image
                          src={card.image || 'https://store1920-images.s3.ap-south-1.amazonaws.com/uploads/placeholder.png'}
                          alt={card.name}
                          fill
                          className="pointer-events-none object-contain"
                          draggable={false}
                        />
                      </div>
                    </div>
                    <p className={`line-clamp-2 leading-snug text-gray-600 ${
                      isMobile ? 'mb-0.5 min-h-[26px] text-[10px]' : 'mb-0.5 min-h-[30px] text-[11px]'
                    }`}>{card.name}</p>
                    <p className={`font-bold text-gray-900 ${isMobile ? 'text-[11px]' : 'text-[13px]'}`}>
                      {currency} {formatDisplay(convertPrice(card.price), language)}
                    </p>
                  </label>
                  {index < arr.length - 1 ? (
                    <span className={`pointer-events-none flex-shrink-0 font-light text-gray-400 ${isMobile ? 'text-lg' : 'text-2xl'}`}>+</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddBundleToCart}
            disabled={selectedAddonProducts.length === 0}
            className={`w-full rounded-md bg-yellow-400 font-bold text-gray-900 transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50 ${
              isMobile ? 'mt-2 h-9 text-[12px]' : 'mt-3 h-11 text-[15px]'
            }`}
          >
            {isArabic
              ? `اشترِ ${totalBundleItems} معًا · ${currency} ${formatDisplay(convertPrice(bundleTotal), language)}`
              : `Buy ${totalBundleItems} together · ${currency} ${formatDisplay(convertPrice(bundleTotal), language)}`}
          </button>
        </div>
      </div>
    );
  };

  if (!product) {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-gray-400 text-lg">Product not found.</div>
    );
  }
  return (
    <div className="bg-white">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-1.5 lg:py-2">
          <nav className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-[11px] sm:text-xs text-gray-500 leading-tight" dir={isArabic ? 'rtl' : 'ltr'}>
            <a href="/" className="hover:underline hover:text-gray-800 whitespace-nowrap">{t('common.home')}</a>
            {(() => {
              const breadcrumbSep = isArabic ? '‹' : '›';
              const getCategoryLabel = (category) => (
                isArabic && String(category?.nameAr || '').trim()
                  ? category.nameAr
                  : category.name
              );
              const chain = resolveProductCategoryChainFromMap(product, categoryMap)
                .map((category) => ({
                  id: category._id || category.id || category.slug,
                  name: getCategoryLabel(category),
                  slug: category.slug || '',
                  url: category.url || '',
                }))
                .filter((category) => category.name);
              if (chain.length === 0 && (product.category || product.categories?.[0]) && !Object.keys(categoryMap).length) {
                return null;
              }
              if (chain.length === 0) {
                return (
                  <>
                    <span className="text-gray-400">{breadcrumbSep}</span>
                    <a href="/shop" className="hover:underline hover:text-gray-800">{t('common.products')}</a>
                  </>
                );
              }
              return chain.map((c, index) => {
                const href = resolveCategoryHref(chain.slice(0, index + 1));
                return (
                <span key={c.id || `${c.slug}-${index}`} className="flex items-center gap-x-1">
                  <span className="text-gray-400">{breadcrumbSep}</span>
                  <Link href={href} className="hover:underline hover:text-gray-800 whitespace-nowrap">{c.name}</Link>
                </span>
                );
              });
            })()}
            <span className="text-gray-400">{isArabic ? '‹' : '›'}</span>
            <span className="text-gray-700 truncate max-w-[160px] sm:max-w-xs md:max-w-sm">{productHeading}</span>
          </nav>
        </div>
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 pt-0 max-lg:pb-6 lg:py-6 overflow-x-visible">
        <div className="product-page-grid gap-0 lg:gap-8 items-start">

          {/* LEFT: Media gallery */}
          <div className="w-full min-w-0 space-y-3 lg:space-y-4 lg:min-w-0 lg:sticky lg:top-24 lg:self-start relative z-20">
            <div className="hidden lg:flex gap-2.5 items-start">
              <div
                ref={desktopThumbnailsRef}
                className="flex w-[48px] flex-shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain scrollbar-hide xl:w-[52px]"
                style={desktopGalleryHeight ? { maxHeight: `${desktopGalleryHeight}px` } : undefined}
              >
                {mediaGallery.map((item, index) => (
                  <button
                    key={`${item.src}-${index}`}
                    onClick={() => selectGalleryIndex(index)}
                    className={`relative w-[44px] h-[44px] xl:w-[48px] xl:h-[48px] border-2 rounded overflow-hidden transition-all duration-300 ease-out bg-white flex-shrink-0 cursor-pointer ${
                      activeMediaIndex === index ? 'border-orange-500' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Image
                      src={item.poster || PLACEHOLDER_IMAGE}
                      alt={`${safeProductName} ${index + 1}`}
                      width={60}
                      height={60}
                      className="object-cover w-full h-full"
                      onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMAGE; }}
                    />
                    {item.type === 'video' && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <svg className="w-5 h-5 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-w-0">
                <div ref={desktopMainImageRef} className={`relative bg-white rounded overflow-visible w-full ${aspectRatioClass}`}>
                {product.attributes?.condition === 'used' && (
                  <div className="absolute top-4 left-16 z-10">
                    <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Used
                    </span>
                  </div>
                )}

                <div className="absolute bottom-3 right-3 z-20">
                  <ProductShareButton
                    productName={safeProductName}
                    productId={product._id}
                    productImage={mainImage || PLACEHOLDER_IMAGE}
                    productBrand={mobileProductBrand || product.store?.name || ''}
                    productPrice={displaySalePrice}
                    variant="overlay"
                  />
                </div>

                <div
                  ref={imageContainerRef}
                  className={`overflow-hidden rounded w-full h-full relative ${activeMedia?.type === 'video' ? '' : 'cursor-crosshair'}`}
                  onMouseEnter={(e) => {
                    if (activeMedia?.type === 'video') return;
                    setShowZoom(true);
                    const rect = imageContainerRef.current?.getBoundingClientRect();
                    if (rect) setZoomPanelPos(computeZoomPanelPosition(rect));
                  }}
                  onMouseLeave={() => setShowZoom(false)}
                  onMouseMove={activeMedia?.type === 'video' ? undefined : handleImageMouseMove}
                >
                  {activeMedia?.type === 'video' ? (
                    <CrossfadeProductMedia
                      mediaKey={`${activeMediaIndex}-${activeMedia.src}`}
                      type="video"
                      src={activeMedia.src}
                      poster={activeMedia.poster || PLACEHOLDER_IMAGE}
                      alt={safeProductName}
                    />
                  ) : (
                    <CrossfadeProductMedia
                      mediaKey={`${activeMediaIndex}-${mainImage}`}
                      type="image"
                      src={mainImage || PLACEHOLDER_IMAGE}
                      alt={safeProductName}
                      sizes="(max-width: 1024px) 100vw, 640px"
                      priority
                    />
                  )}
                </div>

                {renderZoomPanel()}
              </div>
              </div>
            </div>

            {/* Mobile: Swipeable image slider */}
            <div className="lg:hidden relative -mx-4 sm:mx-0 overflow-x-clip">
              <div className={`relative w-full ${aspectRatioClass} bg-white border border-gray-200 rounded-none sm:rounded-lg overflow-hidden`}>
                {product.attributes?.condition === 'used' && (
                  <div className="absolute top-4 left-16 z-10">
                    <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Used
                    </span>
                  </div>
                )}

                <div className="absolute bottom-3 right-3 z-20">
                  <ProductShareButton
                    productName={safeProductName}
                    productId={product._id}
                    productImage={mainImage || PLACEHOLDER_IMAGE}
                    productBrand={mobileProductBrand || product.store?.name || ''}
                    productPrice={displaySalePrice}
                    variant="overlay"
                  />
                </div>

                {mediaGallery.length > 1 ? (
                  <div
                    ref={mobileCarouselRef}
                    onScroll={handleMobileCarouselScroll}
                    className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide touch-pan-x"
                  >
                    {mediaGallery.map((item, index) => (
                      <div
                        key={`${item.src}-${index}`}
                        className="relative h-full w-full flex-shrink-0 snap-center snap-always"
                      >
                        {item.type === 'video' ? (
                          <video
                            src={item.src}
                            poster={item.poster || PLACEHOLDER_IMAGE}
                            controls
                            playsInline
                            preload="metadata"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <Image
                            src={item.src || PLACEHOLDER_IMAGE}
                            alt={`${safeProductName} ${index + 1}`}
                            fill
                            sizes="100vw"
                            quality={90}
                            className="object-cover"
                            priority={index === 0}
                            draggable={false}
                            onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMAGE; }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : activeMedia?.type === 'video' ? (
                  <CrossfadeProductMedia
                    mediaKey={`mobile-${activeMediaIndex}-${activeMedia.src}`}
                    type="video"
                    src={activeMedia.src}
                    poster={activeMedia.poster || PLACEHOLDER_IMAGE}
                    alt={safeProductName}
                  />
                ) : (
                  <CrossfadeProductMedia
                    mediaKey={`mobile-${activeMediaIndex}-${mainImage}`}
                    type="image"
                    src={mainImage || PLACEHOLDER_IMAGE}
                    alt={safeProductName}
                    sizes="100vw"
                    imageClassName="object-cover"
                    priority
                  />
                )}
              </div>
            </div>

            {/* Mobile Thumbnail Gallery */}
            <div className="lg:hidden -mx-4 sm:mx-0 overflow-x-clip">
            <div
              ref={mobileThumbnailsRef}
              className="px-4 sm:px-0 flex gap-2 overflow-x-auto overflow-y-hidden pb-2 scrollbar-hide scroll-smooth"
            >
              {mediaGallery.map((item, index) => (
                <button
                  key={`${item.src}-${index}-thumb`}
                  type="button"
                  onClick={() => goToMobileImage(index)}
                  className={`relative flex-shrink-0 w-14 h-14 border-2 rounded overflow-hidden transition-all duration-300 ease-out bg-white cursor-pointer ${
                    activeImageIndex === index
                      ? 'border-[#E52721] ring-1 ring-red-200'
                      : 'border-gray-200 opacity-80 hover:opacity-100'
                  }`}
                >
                  <Image
                    src={item.poster || PLACEHOLDER_IMAGE}
                    alt={`${safeProductName} ${index + 1}`}
                    width={56}
                    height={56}
                    className="object-cover w-full h-full"
                    onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMAGE; }}
                  />
                  {item.type === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
            </div>

            {/* Mobile: title, price, brand card, services */}
            <div className="lg:hidden relative z-30 mt-3 w-full min-w-0 max-w-full space-y-2" dir={isArabic ? 'rtl' : 'ltr'}>
              <div className="space-y-1.5">
                {renderSoldByLine('mb-0.5', true)}
                <h1 dir={isArabic ? 'rtl' : 'ltr'} className="w-full min-w-0 text-[18px] font-semibold leading-snug text-gray-900 break-words whitespace-normal [overflow-wrap:anywhere]">
                  {productHeading}
                </h1>
                {mobileProductBrand ? (
                  <p className="text-[13px] leading-snug text-gray-600">
                    <span className="text-gray-500">{t('product.brandLabel')}: </span>
                    <span className="font-medium text-gray-800">{mobileProductBrand}</span>
                  </p>
                ) : null}
                {mobileShortDescription ? (
                  <p className="w-full min-w-0 text-[13px] leading-relaxed text-gray-600">
                    {mobileShortDescription}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <bdi dir={isArabic ? 'rtl' : 'ltr'} className="text-[24px] font-semibold leading-none text-[#E52721]">
                    {displayMobileSalePrice}
                  </bdi>
                  {effAED > effPrice ? (
                    <>
                      <bdi dir={isArabic ? 'rtl' : 'ltr'} className="text-sm text-gray-400 line-through">
                        {displayMobileRegularPrice}
                      </bdi>
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-[#E52721]">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
                        </svg>
                        {t('product.mobile.savePercent', { percent: formatCount(discountPercent) })}
                      </span>
                    </>
                  ) : null}
                </div>
                {pricingQuantity > 1 ? (
                  <p className="text-[13px] text-gray-500">
                    {formatMoney(convertedEffPrice, true)} × {formatCount(pricingQuantity)}
                  </p>
                ) : null}
                {(pricingQuantity > 1 ? lineSavingsAmount : savingsAmount) > 0 ? (
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#E52721]">
                    <span aria-hidden="true">🔥</span>
                    {t('product.mobile.saveAmount', { amount: displayMobileSavingsAmount })}
                  </p>
                ) : null}
              </div>

              {showVariantPicker ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <ProductVariantPicker
                    groups={variantOptionGroups}
                    variants={variants}
                    selectedOptions={selectedOptions}
                    onSelect={handleSelectVariantOption}
                    productImages={productImagesArray}
                    isBulkBundleVariant={isBulkBundleVariant}
                  />
                </div>
              ) : null}

              {bundleOptionsPanel ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  {bundleOptionsPanel}
                </div>
              ) : null}

              {renderSoldCountLine('mt-1')}

              {isSelectionInStock ? (
                <ProductQuantitySelector
                  quantity={quantity}
                  maxOrderQty={maxOrderQty}
                  onChange={handleProductQuantityChange}
                  quantityLabel={t('product.quantityLabel').replace(':', '')}
                  variant="card"
                  isArabic={isArabic}
                  formatCount={formatCount}
                />
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <svg className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#E52721]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4 4m-4-4l4-4" />
                    </svg>
                    <span className="text-[12px] font-medium leading-snug text-[#1e293b]">{t('product.mobile.freeReturns')}</span>
                  </div>
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <svg className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#E52721]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-[12px] leading-snug text-[#1e293b]">
                      {t('product.mobile.arrivesInDays', { days: formatCount(deliveryWindow.minDays) })}{' '}
                      <span className="font-semibold text-[#E52721]">{mobileArrivalDate}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <Truck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#E52721]" strokeWidth={1.75} aria-hidden="true" />
                    <span className="text-[12px] leading-snug text-[#1e293b]">{mobileDeliveryFeeLabel}</span>
                  </div>
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <svg className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#E52721]" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="text-[12px] font-medium leading-snug text-[#1e293b]">{t('product.mobile.cashOnDelivery')}</span>
                  </div>
                </div>
              </div>

              {renderFbtSection('mobile')}

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <ProductDescription
                  product={product}
                  reviews={reviews}
                  loadingReviews={loadingReviewsLocal || loadingReviews}
                  onReviewAdded={onReviewAdded}
                  showSuggestedProducts={false}
                  showMainDescription={true}
                  showOverviewSections={true}
                  compactMobile={true}
                  aPlusViewport="mobile"
                />
              </div>

              <div className="mt-2 lg:hidden">
                <ProductReviewsSection
                  product={product}
                  reviews={reviewsToUse}
                  loading={loadingReviewsLocal || loadingReviews}
                  compactMobile
                  sectionId="product-reviews-mobile"
                />
              </div>

              {relatedProducts.length > 0 ? (
                <div className="mt-2 max-lg:mb-2 overflow-visible lg:hidden" dir={isArabic ? 'rtl' : 'ltr'}>
                  <h2 className="mb-2 text-[18px] font-bold text-gray-900">
                    {t('product.relatedProductsTitle')}
                  </h2>
                  <ProductCarousel
                    products={relatedProducts}
                    priorityCount={6}
                    showArrows={false}
                    showMobileArrows
                    edgeBleed
                    compactBottom
                  />
                </div>
              ) : null}
            </div>

          </div>

          {/* MIDDLE: Product details — desktop only */}
          <div className="relative z-0 hidden min-w-0 lg:block">
            <div className="hidden lg:block bg-white space-y-4" dir={isArabic ? 'rtl' : 'ltr'}>
              <div>
                {renderSoldByLine('mb-1.5')}
                <h1 dir={isArabic ? 'rtl' : 'ltr'} className="min-w-0 text-2xl font-medium leading-snug text-gray-900">{productHeading}</h1>
                {mobileProductBrand ? (
                  <p className="mt-1 text-sm leading-snug text-gray-600">
                    <span className="text-gray-500">{t('product.brandLabel')}: </span>
                    <span className="font-medium text-gray-800">{mobileProductBrand}</span>
                  </p>
                ) : null}
              </div>

              <div
                className="relative"
                ref={ratingBreakdownRef}
                onMouseEnter={() => reviewCount > 0 && setShowRatingBreakdown(true)}
                onMouseLeave={() => setShowRatingBreakdown(false)}
              >
                <div
                  className="flex items-center gap-2 text-sm text-gray-700 border-b border-gray-200 pb-3 cursor-pointer hover:bg-gray-50 px-2 -mx-2 rounded transition"
                >
                  <span className={`font-semibold ${reviewCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {Number(averageRating).toFixed(1)}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <StarIcon
                        key={i}
                        size={16}
                        fill={reviewCount > 0 && i < Math.round(averageRating) ? '#f59e0b' : 'none'}
                        className={reviewCount > 0 && i < Math.round(averageRating) ? 'text-amber-500' : 'text-gray-300'}
                        strokeWidth={1.5}
                      />
                    ))}
                  </div>
                  <span className="text-[#007185] font-medium">
                    {reviewCount > 0
                      ? t('product.ratingsCount', {
                          count: reviewCount,
                          label: reviewCount === 1 ? t('product.ratingSingular') : t('product.ratingPlural'),
                        })
                      : t('product.noRatingsYet')}
                  </span>
                </div>

                {showRatingBreakdown && reviewCount > 0 && (
                  <div className="absolute left-0 top-full z-50 w-80 pt-1">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
                    <div className="mb-4">
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <StarIcon
                              key={i}
                              size={18}
                              fill={i < Math.round(averageRating) ? '#f59e0b' : 'none'}
                              className={i < Math.round(averageRating) ? 'text-amber-500' : 'text-gray-300'}
                            />
                          ))}
                        </span>
                        <span className="font-bold text-lg">
                          {t('product.outOf5Stars', { rating: Number(averageRating).toFixed(1) })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {t('product.globalRatings', {
                          count: reviewCount,
                          label: reviewCount === 1 ? t('product.ratingSingular') : t('product.ratingPlural'),
                        })}
                      </p>
                    </div>

                    <div className="space-y-2 mb-4 border-t border-gray-100 pt-4">
                      {[5, 4, 3, 2, 1].map((stars) => {
                        const count = reviewsToUse.filter(r => Math.round(r.rating) === stars).length;
                        const percentage = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
                        return (
                          <div key={stars} className="flex items-center gap-2 text-sm">
                            <span className="w-10 text-gray-600 text-right">{t('product.starLabel', { count: stars })}</span>
                            <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                              <div
                                className="h-full bg-amber-500 transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-gray-600 text-sm">{percentage}%</span>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={scrollToProductReviews}
                      className="w-full text-center text-sm text-[#007185] hover:text-blue-600 font-medium py-2 border-t border-gray-100"
                    >
                      {t('product.seeCustomerReviews')}
                    </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Badges (middle column) */}
              {product.attributes?.badges && product.attributes.badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.attributes.badges.map((badge, index) => {
                    const badgeStyle = badgeStyleMap[String(badge || '').trim().toLowerCase()] || {
                      backgroundColor: '#565959',
                      color: '#ffffff',
                      borderRadius: '0px'
                    };
                    return (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-[3px] text-[12px] font-bold tracking-normal"
                        style={badgeStyle}
                      >
                        {badge}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="text-slate-900">
                  {renderSplitPrice(convertedEffPrice, {
                    currencyClass: 'text-[13px] font-medium text-slate-900',
                    mainClass: 'text-[30px] font-semibold text-slate-900',
                    decimalClass: 'text-[13px] font-semibold text-slate-900',
                    wrapperClass: 'inline-flex items-start leading-none'
                  })}
                </div>
                {discountPercent > 0 && (
                  <bdi dir="ltr" className="text-sm text-gray-500 line-through whitespace-nowrap">
                    {formatMoney(convertedEffAED, true)}
                  </bdi>
                )}
                {discountPercent > 0 && (
                  <span className="text-sm text-green-600 font-semibold whitespace-nowrap">
                    {t('common.offPercent', { discount: discountPercent })}
                  </span>
                )}
              </div>

              {showVariantPicker ? (
                <div className="mt-4">
                  <ProductVariantPicker
                    groups={variantOptionGroups}
                    variants={variants}
                    selectedOptions={selectedOptions}
                    onSelect={handleSelectVariantOption}
                    productImages={productImagesArray}
                    isBulkBundleVariant={isBulkBundleVariant}
                  />
                </div>
              ) : null}

              {bundleOptionsPanel ? (
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                  {bundleOptionsPanel}
                </div>
              ) : null}

              <ProductDescription
                product={product}
                reviews={reviews}
                loadingReviews={loadingReviewsLocal || loadingReviews}
                onReviewAdded={onReviewAdded}
                showSuggestedProducts={false}
                showMainDescription={false}
                showOverviewSections={false}
              />
            </div>

            {renderFbtSection('desktop')}
          </div>

          {/* RIGHT: Product Info (buy box) — desktop/tablet only; mobile uses fixed bar below */}
          <div className="relative z-0 min-w-0 self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm max-lg:hidden lg:sticky lg:top-24 lg:p-5" dir={isArabic ? 'rtl' : 'ltr'}>

            {/* Special Offer - Countdown Timer */}
            {offerData?.countdownTimer && (
              <div className="mb-2">
                {offerData.countdownTimer}
              </div>
            )}

            {/* Store Link with Logo */}
            {/* <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                </svg>
              </div>
              <a 
                href={`/shop/${product.store?.username}`} 
                className="text-orange-500 text-sm font-medium hover:underline"
              >
                Shop for {product.store?.name || 'Seller'} &gt;
              </a>
            </div> */}

            {/* Product Title intentionally hidden in buybox */}


            {/* Special Offer - Discount Badge */}
            {offerData?.discountBadge && (
              <div className="mb-4">
                {offerData.discountBadge}
              </div>
            )}

            {/* Special Offer - Price Comparison */}
            {offerData?.priceComparison && (
              <div className="mb-4">
                {offerData.priceComparison}
              </div>
            )}

            {/* Short Description hidden to match reference layout */}

            {/* Stock Availability */}
              {(typeof product.stockQuantity === 'number' || product.inStock === false) && (
                <div className="flex items-center gap-2">
                  {isGloballyOutOfStock ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-200">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {t('common.outOfStock')}
                    </span>
                  ) : product.stockQuantity < 20 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 text-sm font-medium rounded-lg border border-orange-200">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {t('product.limitedStockAvailable', { count: product.stockQuantity })}
                    </span>
                  ) : null}
                </div>
              )}

            {renderSoldCountLine('mb-2')}

            {/* Price Section */}
            <div className="space-y-3">
              {!isSelectionInStock && !isGloballyOutOfStock && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-200">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {t('common.outOfStock')}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <span className={`${isSpecialOffer ? 'text-green-600' : 'text-gray-900'}`}>
                  {renderSplitPrice(buyBoxSalePrice, {
                    currencyClass: `text-[15px] font-medium ${isSpecialOffer ? 'text-green-600' : 'text-gray-900'}`,
                    mainClass: `text-[52px] font-semibold leading-none ${isSpecialOffer ? 'text-green-600' : 'text-gray-900'}`,
                    decimalClass: `text-[18px] font-semibold leading-none ${isSpecialOffer ? 'text-green-600' : 'text-gray-900'}`,
                    wrapperClass: 'inline-flex items-start leading-none tracking-[-0.01em]'
                  })}
                </span>

                {effAED > effPrice && (
                  <bdi dir="ltr" className="text-sm text-gray-500 line-through whitespace-nowrap pb-1">
                    {formatMoney(buyBoxRegularPrice, true)}
                  </bdi>
                )}

                {effAED > effPrice && (
                  <span className="inline-flex items-center border border-orange-400 bg-orange-50 text-orange-500 text-[12px] font-medium px-2 py-0.5 rounded-sm leading-none whitespace-nowrap">
                    {t('common.offPercent', { discount: discountPercent })} {t('product.limitedTime')}
                  </span>
                )}

                {Number(availableStock) > 0 && Number(availableStock) <= 20 && (
                  <span className="inline-flex items-center border border-orange-400 bg-orange-50 text-orange-500 text-[12px] font-medium px-2 py-0.5 rounded-sm leading-none whitespace-nowrap">
                    {t('product.almostSoldOut')}
                  </span>
                )}
              </div>
              {pricingQuantity > 1 ? (
                <p className="text-[13px] text-gray-500">
                  {formatMoney(convertedEffPrice, true)} × {formatCount(pricingQuantity)}
                </p>
              ) : null}
            </div>

            {/* Delivery & Returns (buybox info) */}
            <div
              className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] leading-relaxed"
              dir={isArabic ? 'rtl' : 'ltr'}
            >
              <p className="font-semibold text-slate-900">{deliverySummary.primary}</p>
              <p className="mt-1 text-slate-700">{deliverySummary.secondary}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                <Link href="/return-policy" className="font-medium text-[#E52721] hover:underline">
                  {buyboxCopy.returnsText}
                </Link>
                <span className="mx-1 text-slate-300" aria-hidden="true">·</span>
                <Link href="/shipping-policy" className="font-medium text-slate-700 hover:underline">
                  {isArabic ? 'سياسة الشحن' : 'Shipping Policy'}
                </Link>
                <span className="mx-1 text-slate-300" aria-hidden="true">·</span>
                {buyboxCopy.vatText}
              </p>
            </div>

            {/* Quantity */}
            {isSelectionInStock && !showCartMatchedUi ? (
              <ProductQuantitySelector
                quantity={quantity}
                maxOrderQty={maxOrderQty}
                onChange={handleProductQuantityChange}
                quantityLabel={t('product.quantityLabel').replace(':', '')}
                variant="buybox"
                isArabic={isArabic}
                formatCount={formatCount}
              />
            ) : null}

            {/* Action Buttons */}
            <div className="mt-5" dir={isArabic ? 'rtl' : 'ltr'}>
              {!showCartMatchedUi ? (
                <div className="space-y-3">
                  <button
                    onClick={handleAddToCart}
                    disabled={!isSelectionInStock}
                    className={`h-11 w-full rounded-lg px-4 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.99] ${
                      !isSelectionInStock
                        ? 'cursor-not-allowed bg-slate-200 text-slate-500 shadow-none'
                        : 'bg-[#E5E5E5] text-slate-900 shadow-sm hover:bg-[#D9D9D9] hover:shadow-[0_6px_16px_rgba(15,23,42,0.12)]'
                    }`}
                  >
                    {!isSelectionInStock
                      ? t('common.outOfStock')
                      : t('common.addToCart')}
                  </button>

                  <button
                    onClick={handleOrderNow}
                    disabled={!isSelectionInStock}
                    className={`h-11 w-full rounded-lg px-4 text-sm font-semibold transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.99] ${
                      !isSelectionInStock
                        ? 'cursor-not-allowed bg-slate-200 text-slate-500 shadow-none'
                        : 'bg-[#E52D27] text-white shadow-sm hover:bg-[#CC261F] hover:shadow-[0_6px_16px_rgba(229,45,39,0.28)]'
                    }`}
                  >
                    {t('common.buyNow')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <p className="text-sm font-medium text-emerald-900">
                      {t('product.addedToCartSummary', {
                        count: cartDisplayQty,
                        items: cartDisplayQty === 1 ? t('product.itemSingular') : t('product.itemPlural'),
                      })}
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
                      <button
                        type="button"
                        onClick={async () => {
                          if (cartQty <= 0) return;
                          if (isBulkBundleProduct) {
                            if (isBulkSingleTierPack) {
                              await stepProductBulkTier(-1);
                            } else if (cartQty > 1) {
                              dispatch(setCartEntry({
                                productId: cartProductId,
                                entry: { ...cartEntry, quantity: cartQty - 1 },
                              }));
                            } else {
                              dispatch(deleteItemFromCart({ productId: cartProductId }));
                            }
                            if (isSignedIn) { try { await dispatch(uploadCart()).unwrap(); } catch (_) {} }
                            return;
                          }
                          const pid = cartProductId;
                          if (cartQty <= 1) {
                            dispatch(deleteItemFromCart({ productId: pid }));
                          } else {
                            decrementCartItem(dispatch, { productId: pid, entry: cartEntry, product });
                          }
                          if (isSignedIn) { try { await dispatch(uploadCart()).unwrap(); } catch (_) {} }
                        }}
                        className="flex h-11 items-center justify-center border-r border-gray-200 text-gray-700 transition hover:bg-gray-50"
                        aria-label={cartQty <= 1 && !isBulkBundleProduct ? 'Remove from cart' : 'Decrease quantity'}
                      >
                        {(cartQty <= 1 && !isBulkBundleProduct)
                          || (isBulkBundleProduct && isBulkSingleTierPack && bulkBundleTiers[0] === Number(activeBundleTier))
                          ? <Trash2 size={16} className="text-red-500" />
                          : <MinusIcon size={16} />}
                      </button>

                      <div className="flex min-w-[88px] flex-col items-center justify-center border-r border-gray-200 bg-gray-50 px-4">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {t('product.qty')}
                        </span>
                        <span className="text-lg font-bold leading-none text-gray-900">
                          {formatCount(cartDisplayQty)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (cartQty <= 0) return;
                          if (isBulkBundleProduct) {
                            if (isBulkSingleTierPack) {
                              await stepProductBulkTier(1);
                            } else if (cartQty < Math.max(1, maxOrderQty)) {
                              dispatch(setCartEntry({
                                productId: cartProductId,
                                entry: { ...cartEntry, quantity: cartQty + 1 },
                              }));
                            }
                            if (isSignedIn) { try { await dispatch(uploadCart()).unwrap(); } catch (_) {} }
                            return;
                          }
                          if (cartQty < Math.max(1, maxOrderQty)) {
                            incrementCartItem(dispatch, {
                              productId: cartProductId,
                              entry: cartEntry,
                              product,
                              price: effPrice,
                              maxQty: maxOrderQty,
                            });
                          }
                          if (isSignedIn) { try { await dispatch(uploadCart()).unwrap(); } catch (_) {} }
                        }}
                        className="flex h-11 items-center justify-center text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Increase quantity"
                        disabled={
                          isBulkBundleProduct
                            ? (isBulkSingleTierPack
                              ? isAtMaxBulkTier
                              : cartQty >= Math.max(1, maxOrderQty))
                            : cartQty >= Math.max(1, maxOrderQty)
                        }
                      >
                        <PlusIcon size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => router.push('/cart')}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    >
                      {t('product.viewCart')}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/checkout')}
                      className="h-10 rounded-lg bg-[#E52D27] px-4 text-sm font-semibold text-white transition hover:bg-[#CC261F]"
                    >
                      {t('cart.checkout')}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleWishlist}
                disabled={wishlistLoading}
                className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium transition ${
                  isInWishlist
                    ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <HeartIcon size={16} fill={isInWishlist ? 'currentColor' : 'none'} />
                {isInWishlist ? t('common.saved') : t('common.save')}
              </button>

            </div>

          </div>
        </div>
      </div>

      {/* Full product description below the grid — desktop only; mobile uses inline card above */}
      <div className="hidden lg:block w-full max-w-[1400px] mx-auto px-4 sm:px-6 pb-8">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none" dir={isArabic ? 'rtl' : 'ltr'}>
          <div className="px-4 py-4 lg:p-0">
            <ProductDescription
              product={product}
              reviews={reviews}
              loadingReviews={loadingReviewsLocal || loadingReviews}
              onReviewAdded={onReviewAdded}
              showSuggestedProducts={false}
              showMainDescription={true}
              showOverviewSections={false}
              aPlusViewport="desktop"
            />
          </div>
        </div>
      </div>

      <div className="hidden w-full max-w-[1400px] mx-auto px-4 sm:px-6 pb-8 lg:block lg:pt-0">
        <ProductReviewsSection
          product={product}
          reviews={reviewsToUse}
          loading={loadingReviewsLocal || loadingReviews}
          sectionId="product-reviews-desktop"
        />
      </div>

      {relatedProducts.length > 0 && (
        <div className="hidden w-full max-w-[1400px] mx-auto px-4 sm:px-6 pb-8 lg:block">
          <div className="pt-8 overflow-visible">
            <div className="mb-5 flex items-start justify-between gap-4" dir={isArabic ? 'rtl' : 'ltr'}>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[18px] sm:text-[20px] font-bold text-gray-900">{t('product.relatedProductsTitle')}</h2>
              </div>
            </div>

            <ProductCarousel products={relatedProducts} priorityCount={6} showArrows />
          </div>
        </div>
      )}


      {actionToast ? (
        <StorefrontActionToast
          floating
          visible
          variant={actionToast.variant}
          title={actionToast.title}
          subtitle={actionToast.subtitle}
          actionLabel={actionToast.actionLabel}
          actionHref={actionToast.actionHref}
          duration={actionToast.duration || 4500}
          onDismiss={() => {
            if (actionToastTimerRef.current) {
              clearTimeout(actionToastTimerRef.current);
              actionToastTimerRef.current = null;
            }
            setActionToast(null);
          }}
        />
      ) : null}

      {renderFullViewGallery()}
      {renderFbtPopup()}

      {/* Mobile Actions Bar */}
      <MobileProductActions
        onOrderNow={handleOrderNow}
        onAddToCart={handleAddToCart}
        isOutOfStock={!isSelectionInStock}
        isOrdering={isOrderingNow}
        quantity={quantity}
        formatQuantity={(value) => formatCount(value)}
      />

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        @keyframes added-cta-pop {
          0% {
            transform: scale(0.98);
            filter: brightness(0.95);
          }
          55% {
            transform: scale(1.015);
            filter: brightness(1.05);
          }
          100% {
            transform: scale(1);
            filter: brightness(1);
          }
        }
        @keyframes added-cta-shine {
          0% {
            transform: translateX(-130%);
            opacity: 0;
          }
          20% {
            opacity: 0.35;
          }
          100% {
            transform: translateX(130%);
            opacity: 0;
          }
        }
        .added-cart-cta {
          animation: added-cta-pop 360ms ease-out;
        }
        .added-cart-cta::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 42%;
          height: 100%;
          background: linear-gradient(
            100deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.42) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: added-cta-shine 720ms ease-out;
          pointer-events: none;
        }
        @keyframes sold-progress-grow {
          from {
            width: 0;
          }
        }
        .product-sold-progress-fill {
          animation: sold-progress-grow 1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 2px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: #d1d5db transparent;
        }
        .product-page-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 1024px) {
          .product-page-grid {
            grid-template-columns: minmax(360px, 460px) minmax(340px, 1fr) minmax(280px, 300px);
            align-items: start;
          }
        }
        @media (min-width: 1280px) {
          .product-page-grid {
            grid-template-columns: minmax(400px, 500px) minmax(360px, 1fr) minmax(300px, 320px);
          }
        }
      `}</style>
      <ProductWhatsAppWidget
        productId={product?._id}
        productSku={product?.sku}
        productName={isArabic ? (product?.nameAr || product?.name) : product?.name}
        widget={whatsappProductWidget}
      />
    </div>
  );
};

export default ProductDetails;
