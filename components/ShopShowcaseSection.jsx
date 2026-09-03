'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { resolveStoreNavMenuItems, buildCategoryShopLink } from '@/lib/categoryNavigation'
import ShowcaseProductBanners from './ShowcaseProductBanners'
import ShowcaseLargeBannerSlider from './ShowcaseLargeBannerSlider'
import { HOME_SECTION_CLASS } from '@/lib/storefrontCarousel'
import { getLargeBannerSlides } from '@/lib/shopShowcaseLargeBanners'
import { cleanDisplayText } from '@/lib/displayText'
import { getProductPath } from '@/lib/productUrl'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Truck,
} from 'lucide-react'
import { useStorefrontMarket } from '@/lib/useStorefrontMarket'
import { getProductThumbnailUrl } from '@/lib/productMedia'
import {
  readPersistedStorefrontLanguage,
  STOREFRONT_LANGUAGE_EVENT,
} from '@/lib/storefrontLanguage'
import { getLocalizedCategoryName } from '@/lib/categoryLocalization'
import { getCategoryIcon } from '@/lib/categoryIcons'

const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache'
const DEFAULT_NAVBAR_BG = '#8f3404'

function readCachedNavbarBg() {
  if (typeof window === 'undefined') return DEFAULT_NAVBAR_BG

  try {
    const raw = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY)
    if (!raw) return DEFAULT_NAVBAR_BG

    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.backgroundColor === 'string' && parsed.backgroundColor.trim()) {
      return parsed.backgroundColor.trim()
    }
  } catch {
    // Ignore cache read failures.
  }

  return DEFAULT_NAVBAR_BG
}

function useNavbarBackgroundColor() {
  const [navbarBg, setNavbarBg] = useState(DEFAULT_NAVBAR_BG)

  useEffect(() => {
    setNavbarBg(readCachedNavbarBg())

    const controller = new AbortController()

    fetch(`/api/store/navbar-menu?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const nextBg = String(data?.backgroundColor || '').trim()
        if (nextBg) setNavbarBg(nextBg)
      })
      .catch(() => {})

    const handleNavbarAppearanceUpdate = (event) => {
      const nextBg = event?.detail?.backgroundColor
      if (typeof nextBg === 'string' && nextBg.trim()) {
        setNavbarBg(nextBg.trim())
        return
      }
      setNavbarBg(readCachedNavbarBg())
    }

    window.addEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate)
    return () => {
      controller.abort()
      window.removeEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate)
    }
  }, [])

  return navbarBg
}

function getCategoryHref(category, allCategories = []) {
  return buildCategoryShopLink(category, allCategories)
}

function getProductHref(product) {
  return getProductPath(product)
}

function getProductImage(product) {
  return getProductThumbnailUrl(product, { fallback: '' })
}

function isIconImageUrl(value) {
  const icon = String(value || '').trim()
  if (!icon) return false
  return icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/') || icon.startsWith('data:image/')
}

function ShopShowcaseSkeleton({ navbarBg = DEFAULT_NAVBAR_BG }) {
  return (
    <section className={`${HOME_SECTION_CLASS} max-w-[1400px] mx-auto px-0 sm:px-6`} aria-label="Loading shop showcase">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch">
        <div className="relative hidden h-full min-h-0 lg:col-start-1 lg:row-start-1 lg:block">
          <aside className="absolute inset-0 flex min-h-0 flex-col overflow-hidden rounded-none border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 text-white" style={{ backgroundColor: navbarBg }}>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-[2px] bg-white/25" />
                <div className="h-3 w-24 rounded-[2px] bg-white/35" />
              </div>
              <div className="h-3 w-3 rounded-[2px] bg-white/25" />
            </div>
            <div className="shop-showcase-left-menu-scroll animate-pulse">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                  <div className="h-4 w-4 rounded-[2px] bg-slate-200" />
                  <div className="h-3 flex-1 rounded-[2px] bg-slate-200" />
                  <div className="h-3 w-3 rounded-[2px] bg-slate-200" />
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className="shop-showcase-banner-grid lg:col-start-2 lg:row-start-1">
          <div className="shop-showcase-banner-row shop-showcase-banner-row--main relative overflow-hidden rounded-[2px] border border-slate-200 bg-slate-100 shadow-sm">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
            <div className="absolute inset-0 flex items-center px-8">
              <div className="space-y-3">
                <div className="h-8 w-48 rounded-[2px] bg-white/60" />
                <div className="h-4 w-32 rounded-[2px] bg-white/60" />
                <div className="h-8 w-28 rounded-[2px] bg-white/60" />
              </div>
            </div>
          </div>

          <div className="shop-showcase-banner-row shop-showcase-banner-row--secondary relative overflow-hidden rounded-[2px] border border-slate-200 bg-slate-100 shadow-sm">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-5 w-56 rounded-[2px] bg-white/65" />
            </div>
          </div>
        </div>

        <div className="hidden lg:col-span-2 lg:row-start-2 lg:grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[1225/639] animate-pulse rounded-[2px] border border-slate-200 bg-slate-100" />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function ShopShowcaseSection({
  initialShowcaseData = null,
  initialStoreSettings = null,
  skipInitialFetch = false,
}) {
  const hasInitialData = Boolean(initialShowcaseData);
  const useParentCategoriesInitially = Boolean(initialStoreSettings?.navMenuUseParentCategories);
  const [loading, setLoading] = useState(!hasInitialData && !skipInitialFetch);
  const [data, setData] = useState(initialShowcaseData || { config: null, sectionProducts: [], products: [], categories: [] });
  const [storeMenuItems, setStoreMenuItems] = useState(() => {
    if (useParentCategoriesInitially) {
      return Array.isArray(initialStoreSettings?.resolvedNavMenuItems)
        ? initialStoreSettings.resolvedNavMenuItems
        : [];
    }
    return Array.isArray(initialStoreSettings?.navMenuItems) ? initialStoreSettings.navMenuItems : [];
  });
  const [settingsNavMenuItems, setSettingsNavMenuItems] = useState(
    () => (Array.isArray(initialStoreSettings?.navMenuItems) ? initialStoreSettings.navMenuItems : []),
  );
  const [navMenuUseParentCategories, setNavMenuUseParentCategories] = useState(useParentCategoriesInitially);
  const [catalogCategories, setCatalogCategories] = useState([]);
  const [menuStyle, setMenuStyle] = useState({
    showcaseFlyoutBackgroundColor: '#ffffff',
    showcaseFlyoutTitleColor: '#0f172a',
    showcaseFlyoutLinkColor: '#1f2937',
    showcaseFlyoutHoverColor: '#f8fafc',
    showcaseFlyoutBorderColor: '#dbe3ee',
  })
  const [hoveredMenuIndex, setHoveredMenuIndex] = useState(null)
  const [flyoutPosition, setFlyoutPosition] = useState({ top: 0, maxHeight: 360 })
  const closeFlyoutTimerRef = useRef(null)
  const menuContainerRef = useRef(null)
  const menuScrollRef = useRef(null)
  const menuItemRefs = useRef([])
  const { market, convertPrice } = useStorefrontMarket()
  const navbarBg = useNavbarBackgroundColor()
  const [language, setLanguage] = useState('en')
  const isArabic = language === 'ar'
  const MenuChevron = isArabic ? ChevronLeft : ChevronRight

  const clearFlyoutCloseTimer = () => {
    if (closeFlyoutTimerRef.current) {
      window.clearTimeout(closeFlyoutTimerRef.current)
      closeFlyoutTimerRef.current = null
    }
  }

  const scheduleFlyoutClose = () => {
    clearFlyoutCloseTimer()
    closeFlyoutTimerRef.current = window.setTimeout(() => {
      setHoveredMenuIndex(null)
    }, 120)
  }

  const closeCategoryFlyout = () => {
    clearFlyoutCloseTimer()
    setHoveredMenuIndex(null)
  }

  const updateFlyoutPosition = (index) => {
    const row = menuItemRefs.current[index]
    const container = menuContainerRef.current
    if (!row || !container) {
      setFlyoutPosition({ top: 0, maxHeight: 360 })
      return
    }

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const containerHeight = container.offsetHeight || containerRect.height
    const preferredHeight = 360
    const minVisibleHeight = 220

    let top = Math.max(0, rowRect.top - containerRect.top)
    let maxHeight = Math.min(preferredHeight, containerHeight - top)

    if (maxHeight < minVisibleHeight) {
      top = Math.max(0, containerHeight - preferredHeight)
      maxHeight = Math.min(preferredHeight, containerHeight - top)
    }

    setFlyoutPosition({ top, maxHeight })
  }

  const handleMenuItemHover = (index) => {
    clearFlyoutCloseTimer()
    setHoveredMenuIndex(index)
    window.requestAnimationFrame(() => updateFlyoutPosition(index))
  }

  useEffect(() => {
    setLanguage(readPersistedStorefrontLanguage())

    const handleLanguageChange = () => {
      setLanguage(readPersistedStorefrontLanguage())
    }

    window.addEventListener(STOREFRONT_LANGUAGE_EVENT, handleLanguageChange)
    return () => window.removeEventListener(STOREFRONT_LANGUAGE_EVENT, handleLanguageChange)
  }, [])

  useEffect(() => {
    const applyMenuStyle = (settings = {}) => {
      const resolvedMenuStyle = settings?.navMenuStyle && typeof settings.navMenuStyle === 'object'
        ? settings.navMenuStyle
        : {};
      setMenuStyle((prev) => ({
        ...prev,
        showcaseFlyoutBackgroundColor: String(resolvedMenuStyle.showcaseFlyoutBackgroundColor || prev.showcaseFlyoutBackgroundColor),
        showcaseFlyoutTitleColor: String(resolvedMenuStyle.showcaseFlyoutTitleColor || prev.showcaseFlyoutTitleColor),
        showcaseFlyoutLinkColor: String(resolvedMenuStyle.showcaseFlyoutLinkColor || prev.showcaseFlyoutLinkColor),
        showcaseFlyoutHoverColor: String(resolvedMenuStyle.showcaseFlyoutHoverColor || prev.showcaseFlyoutHoverColor),
        showcaseFlyoutBorderColor: String(resolvedMenuStyle.showcaseFlyoutBorderColor || prev.showcaseFlyoutBorderColor),
      }));
    };

    const applyNavigation = (settings = {}, catalog = [], legacyItems = []) => {
      const useParentCategories = Boolean(settings?.navMenuUseParentCategories);
      setNavMenuUseParentCategories(useParentCategories);
      setCatalogCategories(catalog);
      setSettingsNavMenuItems(Array.isArray(settings?.navMenuItems) ? settings.navMenuItems : []);

      if (!useParentCategories) {
        if (legacyItems.length) {
          setStoreMenuItems(legacyItems);
          return;
        }

        setStoreMenuItems(Array.isArray(settings?.navMenuItems) ? settings.navMenuItems : []);
      }
    };

    const loadNavigation = async () => {
      const [settingsRes, navbarRes, categoriesRes] = await Promise.all([
        axios.get('/api/store/settings').catch(() => ({ data: {} })),
        axios.get('/api/store/navbar-menu').catch(() => ({ data: {} })),
        axios.get('/api/categories').catch(() => ({ data: { categories: [] } })),
      ]);

      const parsedCategories = Array.isArray(categoriesRes.data?.categories)
        ? categoriesRes.data.categories
        : [];
      const legacyItems = Array.isArray(navbarRes.data?.items)
        ? navbarRes.data.items.map((item) => ({
            name: String(item?.name || item?.label || '').trim(),
            link: String(item?.link || item?.url || '#').trim() || '#',
            icon: String(item?.icon || '').trim(),
            hasDropdown: false,
            categoryId: String(item?.categoryId || '').trim(),
            megaMenu: { linkColumns: 1, links: [], images: [] },
          }))
        : [];

      applyNavigation(settingsRes.data || {}, parsedCategories, legacyItems);
      applyMenuStyle(settingsRes.data || {});
    };

    const load = async () => {
      try {
        const [showcaseRes] = await Promise.all([
          initialShowcaseData
            ? Promise.resolve({ data: initialShowcaseData })
            : axios.get('/api/public/shop-showcase'),
          loadNavigation(),
        ]);

        const showcaseData = showcaseRes.data || { config: null, sectionProducts: [], products: [], categories: [] };
        setData(showcaseData);

        if (!showcaseData.config || showcaseData.config.enabled === false) {
          setStoreMenuItems([]);
        }
      } catch {
        setData({ config: null, sectionProducts: [], products: [], categories: [] });
        setStoreMenuItems([]);
      } finally {
        setLoading(false);
      }
    };

    const handleMenuUpdated = () => {
      loadNavigation().catch(() => {});
    };

    window.addEventListener('navMenuUpdated', handleMenuUpdated);

    if (skipInitialFetch && initialShowcaseData) {
      applyMenuStyle(initialStoreSettings || {});
      setLoading(false);

      const hasInitialNavigation =
        (useParentCategoriesInitially && initialStoreSettings?.resolvedNavMenuItems?.length) ||
        (!useParentCategoriesInitially && initialStoreSettings?.navMenuItems?.length);

      if (!hasInitialNavigation) {
        loadNavigation()
          .catch(() => {})
          .finally(() => setLoading(false));
      } else {
        const scheduleNavigationRefresh = () => {
          loadNavigation().catch(() => {});
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          const idleId = window.requestIdleCallback(scheduleNavigationRefresh, { timeout: 5000 });
          return () => {
            window.removeEventListener('navMenuUpdated', handleMenuUpdated);
            window.cancelIdleCallback(idleId);
          };
        }

        const timerId = window.setTimeout(scheduleNavigationRefresh, 2500);
        return () => {
          window.removeEventListener('navMenuUpdated', handleMenuUpdated);
          window.clearTimeout(timerId);
        };
      }
    } else {
      load();
    }

    return () => {
      window.removeEventListener('navMenuUpdated', handleMenuUpdated);
    };
  }, [initialShowcaseData, initialStoreSettings, skipInitialFetch]);

  const config = data.config
  const categoryMenuItems = useMemo(() => {
    const categories = Array.isArray(data?.categories) ? data.categories : []

    return categories
      .filter((category) => String(category?.name || category?.nameAr || '').trim())
      .slice(0, 12)
      .map((category) => ({
        title: getLocalizedCategoryName(category, language),
        href: getCategoryHref(category, categories),
        iconImage: String(category?.icon || category?.image || category?.iconUrl || '').trim(),
        icon: getCategoryIcon({ slug: category?.slug, name: category?.name, href: getCategoryHref(category, categories) }),
      }))
  }, [data?.categories, language])

  const storeNavigationItems = useMemo(() => {
    const resolvedItems = resolveStoreNavMenuItems(
      {
        navMenuUseParentCategories,
        navMenuItems: settingsNavMenuItems,
      },
      catalogCategories,
      language,
    );

    const navItems = (resolvedItems.length ? resolvedItems : storeMenuItems)
      .map((item) => ({
        title: cleanDisplayText(String(item?.name || item?.label || '').trim()),
        href: String(item?.link || item?.url || '#').trim() || '#',
        hasDropdown: Boolean(item?.hasDropdown),
        dropdownLinks: Array.isArray(item?.megaMenu?.links) ? item.megaMenu.links : [],
        dropdownImages: Array.isArray(item?.megaMenu?.images) ? item.megaMenu.images : [],
        linkColumns: Number(item?.megaMenu?.linkColumns) > 0 ? Number(item.megaMenu.linkColumns) : 1,
        iconImage: String(item?.icon || item?.image || item?.iconUrl || '').trim(),
        icon: getCategoryIcon({
          slug: item?.slug || item?.categorySlug,
          name: item?.name || item?.label,
          href: String(item?.link || item?.url || '#').trim() || '#',
        }),
      }))
      .filter((item) => item.title)

    if (navMenuUseParentCategories) return navItems

    return navItems.length ? navItems : categoryMenuItems
  }, [catalogCategories, categoryMenuItems, language, navMenuUseParentCategories, settingsNavMenuItems, storeMenuItems])

  const bannerBlocks = useMemo(() => ([
    {
      type: 'top',
      href: config?.topBannerLink || '/shop',
      slides: getLargeBannerSlides(config, 'top'),
      sliderEnabled: config?.topBannerSliderEnabled !== false,
      sliderInterval: Number(config?.topBannerSliderInterval) || 4000,
      title: config?.topBannerTitle || '',
      showTitle: typeof config?.topBannerTitleEnabled === 'boolean' ? config.topBannerTitleEnabled : true,
      subtitle: config?.topBannerSubtitle || '',
      showSubtitle: typeof config?.topBannerSubtitleEnabled === 'boolean' ? config.topBannerSubtitleEnabled : true,
      ctaText: config?.topBannerCtaText || '',
      showCta: typeof config?.topBannerCtaEnabled === 'boolean' ? config.topBannerCtaEnabled : true,
      ctaBgColor: config?.topBannerCtaBgColor || '#ef2d2d',
      ctaTextColor: config?.topBannerCtaTextColor || '#ffffff',
      accent: 'from-sky-200 via-sky-100 to-white',
      gridRow: '1 / 2',
      showTruckIcon: true,
    },
    {
      type: 'bottom',
      href: config?.bottomBannerLink || '/shop',
      slides: getLargeBannerSlides(config, 'bottom'),
      sliderEnabled: config?.bottomBannerSliderEnabled !== false,
      sliderInterval: Number(config?.bottomBannerSliderInterval) || 4000,
      title: config?.bottomBannerTitle || '',
      showTitle: typeof config?.bottomBannerTitleEnabled === 'boolean' ? config.bottomBannerTitleEnabled : true,
      subtitle: config?.bottomBannerSubtitle || '',
      showSubtitle: typeof config?.bottomBannerSubtitleEnabled === 'boolean' ? config.bottomBannerSubtitleEnabled : true,
      ctaText: config?.bottomBannerCtaText || '',
      showCta: typeof config?.bottomBannerCtaEnabled === 'boolean' ? config.bottomBannerCtaEnabled : true,
      ctaBgColor: config?.bottomBannerCtaBgColor || '#ef2d2d',
      ctaTextColor: config?.bottomBannerCtaTextColor || '#ffffff',
      accent: 'from-[#180000] via-[#520000] to-[#d61f1f]',
      gridRow: '2 / 3',
      showTruckIcon: false,
    }
  ]), [config])

  const hoveredMenuItem = useMemo(() => {
    if (hoveredMenuIndex == null) return null
    return storeNavigationItems[hoveredMenuIndex] || null
  }, [hoveredMenuIndex, storeNavigationItems])

  const hoveredDropdownLinks = useMemo(() => {
    const links = Array.isArray(hoveredMenuItem?.dropdownLinks) ? hoveredMenuItem.dropdownLinks : []
    return links
      .map((dropdownItem, dropdownIndex) => ({
        title: cleanDisplayText(
          String(
            dropdownItem?.title || dropdownItem?.label || dropdownItem?.name || `Option ${dropdownIndex + 1}`,
          ).trim(),
        ),
        href: String(dropdownItem?.link || dropdownItem?.url || '#').trim() || '#',
      }))
      .filter((dropdownItem) => dropdownItem.title)
  }, [hoveredMenuItem])

  const hoveredDropdownImages = useMemo(() => {
    const images = Array.isArray(hoveredMenuItem?.dropdownImages) ? hoveredMenuItem.dropdownImages : []
    return images
      .map((imageItem) => ({
        src: String(imageItem?.url || imageItem?.image || imageItem?.src || '').trim(),
        alt: cleanDisplayText(String(imageItem?.label || '').trim()),
        href: String(imageItem?.link || '#').trim() || '#',
      }))
      .filter((imageItem) => imageItem.src)
  }, [hoveredMenuItem])

  useEffect(() => {
    return () => {
      clearFlyoutCloseTimer()
    }
  }, [])

  useEffect(() => {
    const scroll = menuScrollRef.current
    if (!scroll || hoveredMenuIndex == null) return undefined

    const handleScroll = () => updateFlyoutPosition(hoveredMenuIndex)
    scroll.addEventListener('scroll', handleScroll, { passive: true })
    return () => scroll.removeEventListener('scroll', handleScroll)
  }, [hoveredMenuIndex])

  useEffect(() => {
    if (hoveredMenuIndex == null) return undefined

    const handleResize = () => updateFlyoutPosition(hoveredMenuIndex)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [hoveredMenuIndex])

  if (loading) return <ShopShowcaseSkeleton navbarBg={navbarBg} />
  if (!config || config.enabled === false) return null

  const showCategoryFlyout = Boolean(hoveredMenuItem?.hasDropdown && hoveredDropdownLinks.length)

  const renderShowcaseBanner = (banner) => (
    <ShowcaseLargeBannerSlider
      key={banner.type}
      slides={banner.slides}
      enabled={banner.sliderEnabled}
      interval={banner.sliderInterval}
      gridRow={banner.gridRow}
      bannerVariant={banner.type === 'top' ? 'main' : 'secondary'}
      showTruckIcon={banner.showTruckIcon}
      fallback={{
        href: banner.href,
        title: banner.title,
        showTitle: banner.showTitle,
        subtitle: banner.subtitle,
        showSubtitle: banner.showSubtitle,
        ctaText: banner.ctaText,
        showCta: banner.showCta,
        ctaBgColor: banner.ctaBgColor,
        ctaTextColor: banner.ctaTextColor,
        accent: banner.accent,
      }}
    />
  )

  return (
    <section className={`${HOME_SECTION_CLASS} max-w-[1400px] mx-auto px-4 sm:px-6`}>
      <div className="grid grid-cols-1 gap-3 overflow-visible lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch">
        <div className="relative z-30 hidden h-full min-h-0 lg:col-start-1 lg:row-start-1 lg:block">
          <div
            ref={menuContainerRef}
            className="relative h-full min-h-0 overflow-visible"
            style={{ width: showCategoryFlyout ? 560 : 280 }}
            onMouseEnter={clearFlyoutCloseTimer}
            onMouseLeave={scheduleFlyoutClose}
          >
          <aside
            dir={isArabic ? 'rtl' : 'ltr'}
            className="absolute inset-0 flex min-h-0 w-[280px] flex-col overflow-hidden rounded-none border border-slate-200 bg-white shadow-sm"
          >
            <div
              className={`flex items-center justify-between px-4 py-3 text-white ${isArabic ? 'flex-row-reverse' : ''}`}
              style={{ backgroundColor: navbarBg }}
              onMouseEnter={() => {
                clearFlyoutCloseTimer()
                setHoveredMenuIndex(null)
              }}
            >
              <div className={`flex items-center gap-2 text-[14px] font-semibold ${isArabic ? 'flex-row-reverse' : ''}`}>
                <span className="text-lg leading-none">☰</span>
                <span>{isArabic ? 'جميع الفئات' : 'All Categories'}</span>
              </div>
              <MenuChevron size={18} className="text-white/70" />
            </div>

            <div
              ref={menuScrollRef}
              className="shop-showcase-left-menu-scroll"
              onMouseEnter={(event) => {
                if (event.target === event.currentTarget) {
                  clearFlyoutCloseTimer()
                  setHoveredMenuIndex(null)
                }
              }}
            >
              {storeNavigationItems.map((menuItem, index) => {
                const isActive = hoveredMenuIndex === index
                const hasFlyout = Boolean(menuItem.hasDropdown && menuItem.dropdownLinks.length)

                return (
                  <div
                    key={`${menuItem.title}-${menuItem.href}-${index}`}
                    ref={(element) => {
                      menuItemRefs.current[index] = element
                    }}
                    className="border-b border-slate-200"
                    onMouseEnter={() => handleMenuItemHover(index)}
                  >
                    <Link
                      href={menuItem.href}
                      className={`flex items-center gap-3 px-4 py-3 text-[13px] text-slate-800 transition-colors duration-200 ${
                        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                      } ${isArabic ? 'flex-row-reverse text-right' : ''}`}
                    >
                      {isIconImageUrl(menuItem.iconImage) ? (
                        <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-sm">
                          <img
                            src={menuItem.iconImage}
                            alt={menuItem.title}
                            className="h-4 w-4 object-contain"
                            loading="lazy"
                          />
                        </span>
                      ) : (
                        <span className="flex h-5 w-5 items-center justify-center text-slate-700">
                          <menuItem.icon size={16} />
                        </span>
                      )}
                      <span className={`min-w-0 flex-1 ${isArabic ? 'pl-2 pr-0' : 'pr-2'}`}>
                        <span className="block text-[13px] leading-5 font-medium">{menuItem.title}</span>
                      </span>
                      <MenuChevron
                        size={16}
                        className={`${hasFlyout ? 'text-slate-700' : 'text-slate-400'}`}
                      />
                    </Link>
                  </div>
                )
              })}
            </div>
          </aside>

          {showCategoryFlyout ? (
            <>
              <div
                className="absolute z-10"
                style={{
                  ...(isArabic ? { right: 276 } : { left: 276 }),
                  top: flyoutPosition.top,
                  width: 8,
                  height: flyoutPosition.maxHeight,
                }}
                onMouseEnter={clearFlyoutCloseTimer}
                aria-hidden
              />
              <div
                dir={isArabic ? 'rtl' : 'ltr'}
                className={`absolute z-20 flex w-[280px] flex-col overflow-hidden rounded-none border border-slate-200 shadow-sm ${isArabic ? 'right-[279px]' : 'left-[279px]'}`}
                style={{
                  top: flyoutPosition.top,
                  maxHeight: flyoutPosition.maxHeight,
                  backgroundColor: menuStyle.showcaseFlyoutBackgroundColor,
                  borderColor: menuStyle.showcaseFlyoutBorderColor,
                }}
                onMouseEnter={clearFlyoutCloseTimer}
                onMouseLeave={scheduleFlyoutClose}
              >
                <div className={`grid min-h-0 flex-1 ${hoveredDropdownImages.length ? 'grid-cols-[minmax(0,1fr)_120px]' : 'grid-cols-1'}`}>
                  <div className="min-h-0 min-w-0 overflow-y-auto">
                    {hoveredDropdownLinks.map((dropdownItem, dropdownIndex) => (
                      <Link
                        key={`${dropdownItem.title}-${dropdownItem.href}-${dropdownIndex}`}
                        href={dropdownItem.href}
                        className={`group flex items-center border-b px-4 py-3 text-[13px] font-medium leading-5 transition-colors ${isArabic ? 'flex-row-reverse text-right' : ''}`}
                        style={{
                          color: menuStyle.showcaseFlyoutLinkColor,
                          borderColor: menuStyle.showcaseFlyoutBorderColor,
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.backgroundColor = menuStyle.showcaseFlyoutHoverColor
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        <span className="truncate">{dropdownItem.title}</span>
                      </Link>
                    ))}
                  </div>

                  {hoveredDropdownImages.length ? (
                    <div
                      className={`space-y-2 p-2 ${isArabic ? 'border-r' : 'border-l'}`}
                      style={{
                        borderColor: menuStyle.showcaseFlyoutBorderColor,
                        backgroundColor: menuStyle.showcaseFlyoutHoverColor,
                      }}
                    >
                      {hoveredDropdownImages.slice(0, 2).map((imageItem, imageIndex) => (
                        <Link
                          key={`${imageItem.src}-${imageIndex}`}
                          href={imageItem.href}
                          className="group relative block overflow-hidden rounded-lg border"
                          style={{ borderColor: menuStyle.showcaseFlyoutBorderColor }}
                        >
                          <img
                            src={imageItem.src}
                            alt={imageItem.alt || hoveredMenuItem?.title || 'Featured image'}
                            className="h-[88px] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          {imageItem.alt ? (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-1.5">
                              <p className="truncate text-[10px] font-semibold text-white">{imageItem.alt}</p>
                            </div>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
          </div>
        </div>

        <div className="shop-showcase-banner-grid lg:col-start-2 lg:row-start-1" onMouseEnter={closeCategoryFlyout}>
          {bannerBlocks.map((banner) => renderShowcaseBanner(banner))}
        </div>

        {/* 4-grid product/banner section below main banners */}
        <div className="lg:col-span-2 lg:row-start-2" onMouseEnter={closeCategoryFlyout}>
          <ShowcaseProductBanners banners={data.config?.productBanners} />
        </div>
      </div>
    </section>
  )
}


