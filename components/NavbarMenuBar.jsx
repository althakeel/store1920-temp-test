'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  filterParentCategories,
  getCategoryDisplayName,
  getDirectChildCategories,
  getCategoryRecordId,
  buildCategoryShopLink,
  resolveStoreNavMenuItems,
} from '@/lib/categoryNavigation';
import {
  readPersistedStorefrontLanguage,
  STOREFRONT_LANGUAGE_EVENT,
} from '@/lib/storefrontLanguage';
import { translateStaticText } from '@/lib/useStorefrontI18n';
import { normalizeStorefrontCategoryHref } from '@/lib/categorySlug';

const MENU_CACHE_KEY = 'nav:menu:v1';
const CATEGORIES_CACHE_KEY = 'nav:categories:v2';
const MENU_ENABLED_CACHE_KEY = 'nav:menu:enabled:v1';
const ACTIONS_VISIBILITY_CACHE_KEY = 'nav:actions:visibility:v1';
const MENU_STYLE_CACHE_KEY = 'nav:menu:style:v1';
const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache';
const REFRESH_MS = 10 * 60 * 1000;

const defaultActionsVisibility = {
  store: true,
  orders: true,
  wishlist: true,
  cart: true,
};

const DEFAULT_NAVBAR_BG = '#8f3404';
const NAVBAR_CONTAINER_CLASS = 'mx-auto w-full max-w-[1400px] px-4 sm:px-6';

const defaultMenuStyle = {
  barBackgroundColor: DEFAULT_NAVBAR_BG,
  barTextColor: '#ffffff',
  barHoverBackgroundColor: 'rgba(0,0,0,0.15)',
  dropdownBackgroundColor: '#ffffff',
  dropdownTextColor: '#334155',
  dropdownMutedTextColor: '#64748b',
  dropdownBorderColor: '#e2e8f0',
};

const safeJsonParse = (value, fallback) => {
  try {
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const readCachedNavbarBg = () => {
  if (typeof window === 'undefined') return DEFAULT_NAVBAR_BG;

  const cachedAppearance = safeJsonParse(window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY), null);
  const cachedBg = typeof cachedAppearance?.backgroundColor === 'string' ? cachedAppearance.backgroundColor.trim() : '';
  return cachedBg || DEFAULT_NAVBAR_BG;
};

const getContrastColor = (hexColor) => {
  const hex = String(hexColor || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.65 ? '#111827' : '#ffffff';
};

const getMenuBarBorderColor = (textColor) => {
  return textColor === '#111827' ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.14)';
};

const getMenuBarHoverColor = (textColor) => {
  return textColor === '#111827' ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.08)';
};

const sanitizeMenuItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const name = String(item?.name || item?.label || '').trim();
      const link = normalizeStorefrontCategoryHref(String(item?.link || item?.url || '').trim() || '#');
      const icon = String(item?.icon || '').trim();
      const hasDropdown = Boolean(item?.hasDropdown);
      const categoryId = String(item?.categoryId || '').trim();
      const megaMenu = item?.megaMenu && typeof item.megaMenu === 'object' ? item.megaMenu : {};

      const numericCols = Number(megaMenu.linkColumns);
      const linkColumns = [1, 2, 3].includes(numericCols) ? numericCols : 1;
      const links = Array.isArray(megaMenu.links)
        ? megaMenu.links
            .map((entry) => ({
              name: String(entry?.name || '').trim(),
              link: normalizeStorefrontCategoryHref(String(entry?.link || '').trim() || '#'),
            }))
            .filter((entry) => entry.name)
        : [];

      const images = Array.isArray(megaMenu.images)
        ? megaMenu.images
            .map((entry) => ({
              url: String(entry?.url || '').trim(),
              label: String(entry?.label || '').trim(),
              link: normalizeStorefrontCategoryHref(String(entry?.link || '').trim() || '#'),
            }))
            .filter((entry) => entry.url)
        : [];

      return {
        name,
        link,
        icon,
        hasDropdown,
        categoryId,
        megaMenu: {
          linkColumns,
          links,
          images,
        },
      };
    })
    .filter((item) => item.name);
};

const isCollectionsItem = (item) => {
  const name = String(item?.name || '').toLowerCase();
  return item?.hasDropdown && name.includes('collection');
};

const hasMegaContent = (item) => {
  if (!item?.hasDropdown || !item?.megaMenu) return false;
  const links = Array.isArray(item.megaMenu.links) ? item.megaMenu.links : [];
  const images = Array.isArray(item.megaMenu.images) ? item.megaMenu.images : [];
  return links.length > 0 || images.some((entry) => entry?.url);
};

function MegaDropdown({ item, dropdownLinks, featuredImages, onClose, timerRef, menuStyle }) {
  const columns = item?.megaMenu?.linkColumns || 1;
  const hasLinks = dropdownLinks.length > 0;
  const hasImages = featuredImages.length > 0;

  return (
    <div
      className="absolute left-1/2 top-full z-[80] mt-1 w-[min(92vw,1100px)] min-w-[620px] -translate-x-1/2 rounded-xl border shadow-2xl"
      style={{ borderColor: menuStyle.dropdownBorderColor, backgroundColor: menuStyle.dropdownBackgroundColor }}
      onMouseEnter={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }}
      onMouseLeave={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(onClose, 180);
      }}
    >
      <div className={`mx-auto grid w-full gap-8 px-6 py-6 ${hasLinks && hasImages ? 'lg:grid-cols-[2fr,1fr]' : 'lg:grid-cols-1'}`}>
        {hasLinks ? (
          <div>
            <div className={`grid gap-3 ${columns === 1 ? 'sm:grid-cols-1' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {dropdownLinks.map((entry, idx) => (
                <div key={`${entry.name}-${idx}`} className="space-y-1">
                  <Link
                    href={entry.link || '#'}
                    className="block rounded-lg border px-3 py-2 text-sm font-medium transition"
                    style={{ borderColor: menuStyle.dropdownBorderColor, color: menuStyle.dropdownTextColor }}
                  >
                    {entry.name}
                  </Link>
                  {Array.isArray(entry.children) && entry.children.length > 0 ? (
                    <div className="space-y-0.5 pl-2">
                      {entry.children.map((child) => (
                        <Link
                          key={`${entry.name}-${child.name}`}
                          href={child.link || '#'}
                          className="block rounded px-2 py-1 text-xs transition hover:underline"
                          style={{ color: menuStyle.dropdownMutedTextColor }}
                        >
                          {child.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {item?.link && item.link !== '#' ? (
              <div className="mt-4">
                <Link href={item.link} className="text-sm font-semibold hover:underline" style={{ color: menuStyle.dropdownTextColor }}>
                  {`View all ${item.name}`}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {hasImages ? (
          <div className={`grid gap-3 ${hasLinks ? '' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {featuredImages.map((entry, idx) => (
              <Link
                key={`${entry.url}-${idx}`}
                href={entry.link || '#'}
                className="group block w-full overflow-hidden rounded-xl border"
                style={{ borderColor: menuStyle.dropdownBorderColor }}
              >
                <img
                  src={entry.url}
                  alt={entry.label || item?.name || 'Featured image'}
                  className="h-28 w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {entry.label ? (
                  <div
                    className="border-t px-3 py-2 text-xs font-semibold"
                    style={{
                      borderColor: menuStyle.dropdownBorderColor,
                      backgroundColor: menuStyle.dropdownBackgroundColor,
                      color: menuStyle.dropdownTextColor,
                    }}
                  >
                    {entry.label}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function NavbarMenuBar() {
  const [navMenuItems, setNavMenuItems] = useState([]);
  const [navMenuUseParentCategories, setNavMenuUseParentCategories] = useState(false);
  const [navMenuEnabled, setNavMenuEnabled] = useState(false);
  const [categories, setCategories] = useState([]);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [openMegaIndex, setOpenMegaIndex] = useState(null);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [menuStyle, setMenuStyle] = useState(defaultMenuStyle);
  const [storefrontLanguage, setStorefrontLanguage] = useState('en');

  const megaTimer = useRef(null);
  const categoryTimer = useRef(null);

  const topLevelCategories = useMemo(
    () => filterParentCategories(categories),
    [categories]
  );

  const effectiveMenuItems = useMemo(() => {
    return resolveStoreNavMenuItems(
      { navMenuUseParentCategories, navMenuItems },
      categories,
      storefrontLanguage,
    );
  }, [navMenuUseParentCategories, categories, navMenuItems, storefrontLanguage]);

  const getLocalizedCategoryDisplayName = (category) => getCategoryDisplayName(category, storefrontLanguage);

  const hoveredChildren = useMemo(
    () => getDirectChildCategories(categories, hoveredCategory),
    [categories, hoveredCategory]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncLanguage = () => setStorefrontLanguage(readPersistedStorefrontLanguage());
    syncLanguage();
    window.addEventListener(STOREFRONT_LANGUAGE_EVENT, syncLanguage);

    return () => window.removeEventListener(STOREFRONT_LANGUAGE_EVENT, syncLanguage);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cachedCategories = safeJsonParse(window.sessionStorage.getItem(CATEGORIES_CACHE_KEY), []);
    const cachedMenu = safeJsonParse(window.sessionStorage.getItem(MENU_CACHE_KEY), []);
    const cachedEnabled = safeJsonParse(window.sessionStorage.getItem(MENU_ENABLED_CACHE_KEY), false);
    const cachedActions = safeJsonParse(window.sessionStorage.getItem(ACTIONS_VISIBILITY_CACHE_KEY), defaultActionsVisibility);
    const cachedStyle = safeJsonParse(window.sessionStorage.getItem(MENU_STYLE_CACHE_KEY), defaultMenuStyle);
    const cachedNavbarBg = readCachedNavbarBg();

    if (Array.isArray(cachedCategories)) setCategories(cachedCategories);
    if (Array.isArray(cachedMenu)) setNavMenuItems(sanitizeMenuItems(cachedMenu));
    setNavMenuEnabled(Boolean(cachedEnabled));
    setMenuStyle({ ...defaultMenuStyle, ...(cachedStyle || {}), barBackgroundColor: cachedNavbarBg });
    window.dispatchEvent(new CustomEvent('navActionsVisibilityUpdated', { detail: cachedActions }));

    let active = true;

    const revalidate = async () => {
      try {
        const [categoriesRes, settingsRes] = await Promise.all([
          fetch('/api/categories', { cache: 'no-store' }),
          fetch('/api/store/settings', { cache: 'no-store' }),
        ]);

        const nextCategories = categoriesRes.ok ? await categoriesRes.json() : { categories: [] };
        const nextSettings = settingsRes.ok ? await settingsRes.json() : {};

        if (!active) return;

        const parsedCategories = Array.isArray(nextCategories?.categories) ? nextCategories.categories : [];
        const parsedItems = sanitizeMenuItems(nextSettings?.navMenuItems);
        const parsedEnabled = Boolean(nextSettings?.navMenuEnabled);
        const parsedUseParentCategories = Boolean(nextSettings?.navMenuUseParentCategories);
        const parsedActions = {
          ...defaultActionsVisibility,
          ...(nextSettings?.navActionsVisibility || {}),
        };
        const navbarBg = readCachedNavbarBg();
        const parsedStyle = {
          ...defaultMenuStyle,
          ...(nextSettings?.navMenuStyle || {}),
          barBackgroundColor: navbarBg,
        };

        setCategories(parsedCategories);
        setNavMenuItems(parsedItems);
        setNavMenuEnabled(parsedEnabled);
        setNavMenuUseParentCategories(parsedUseParentCategories);
        setMenuStyle(parsedStyle);

        window.sessionStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(parsedCategories));
        window.sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify(parsedItems));
        window.sessionStorage.setItem(MENU_ENABLED_CACHE_KEY, JSON.stringify(parsedEnabled));
        window.sessionStorage.setItem(ACTIONS_VISIBILITY_CACHE_KEY, JSON.stringify(parsedActions));
        window.sessionStorage.setItem(MENU_STYLE_CACHE_KEY, JSON.stringify(parsedStyle));
        window.dispatchEvent(new CustomEvent('navActionsVisibilityUpdated', { detail: parsedActions }));
      } catch {
        // Ignore transient fetch failures and keep cached values.
      } finally {
        if (active) setLoadedOnce(true);
      }
    };

    revalidate();
    const intervalId = setInterval(revalidate, REFRESH_MS);
    const handleMenuUpdated = () => revalidate();
    const handleNavbarAppearance = (e) => {
      const bg = e?.detail?.backgroundColor;
      if (bg) {
        setMenuStyle((prev) => ({ ...prev, barBackgroundColor: bg }));
      } else {
        setMenuStyle((prev) => ({ ...prev, barBackgroundColor: readCachedNavbarBg() }));
      }
    };
    window.addEventListener('navMenuUpdated', handleMenuUpdated);
    window.addEventListener('navbarAppearanceUpdated', handleNavbarAppearance);

    return () => {
      active = false;
      window.removeEventListener('navMenuUpdated', handleMenuUpdated);
      window.removeEventListener('navbarAppearanceUpdated', handleNavbarAppearance);
      clearInterval(intervalId);
      if (megaTimer.current) clearTimeout(megaTimer.current);
      if (categoryTimer.current) clearTimeout(categoryTimer.current);
    };
  }, []);

  if (loadedOnce && (!navMenuEnabled || effectiveMenuItems.length === 0)) return null;
  if (!loadedOnce && effectiveMenuItems.length === 0) return null;

  const menuBarTextColor = getContrastColor(menuStyle.barBackgroundColor);
  const menuBarBorderColor = getMenuBarBorderColor(menuBarTextColor);
  const menuBarHoverColor = getMenuBarHoverColor(menuBarTextColor);

  const cssVars = {
    '--menu-bar-bg': menuStyle.barBackgroundColor,
    '--menu-bar-text': menuBarTextColor,
    '--menu-bar-hover-bg': menuBarHoverColor,
    '--menu-bar-border': menuBarBorderColor,
    '--menu-dropdown-bg': menuStyle.dropdownBackgroundColor,
    '--menu-dropdown-text': menuStyle.dropdownTextColor,
    '--menu-dropdown-muted': menuStyle.dropdownMutedTextColor,
    '--menu-dropdown-border': menuStyle.dropdownBorderColor,
  };

  return (
    <div
      className="relative hidden w-full lg:block"
      style={{
        ...cssVars,
        backgroundColor: 'var(--menu-bar-bg)',
        boxShadow: 'inset 0 1px 0 var(--menu-bar-border)',
      }}
    >
      <div className={`${NAVBAR_CONTAINER_CLASS} overflow-x-auto scrollbar-hide`}>
        <div className="relative flex items-center py-2 whitespace-nowrap">
          {effectiveMenuItems.map((item, index) => {
            const dropdownLinks = Array.isArray(item?.megaMenu?.links) ? item.megaMenu.links : [];
            const featuredImages = Array.isArray(item?.megaMenu?.images) ? item.megaMenu.images.filter((img) => img?.url) : [];
            const shouldUseCollectionsFlyout = isCollectionsItem(item);
            const shouldUseMega = hasMegaContent(item);
            const itemHref = item.link || '#';

            return (
              <div
                key={`${item.name}-${index}`}
                className="static inline-flex items-center"
                onMouseEnter={() => {
                  if (megaTimer.current) clearTimeout(megaTimer.current);
                  if (categoryTimer.current) clearTimeout(categoryTimer.current);

                  if (shouldUseCollectionsFlyout) {
                    setCategoriesDropdownOpen(true);
                    setOpenMegaIndex(null);
                    if (!hoveredCategory && topLevelCategories.length > 0) {
                      setHoveredCategory(topLevelCategories[0]);
                    }
                  } else if (shouldUseMega) {
                    setOpenMegaIndex(index);
                    setCategoriesDropdownOpen(false);
                  } else {
                    setOpenMegaIndex(null);
                    setCategoriesDropdownOpen(false);
                  }
                }}
                onMouseLeave={() => {
                  if (shouldUseCollectionsFlyout) {
                    categoryTimer.current = setTimeout(() => {
                      setCategoriesDropdownOpen(false);
                    }, 180);
                  }
                  if (shouldUseMega) {
                    megaTimer.current = setTimeout(() => {
                      setOpenMegaIndex(null);
                    }, 180);
                  }
                }}
              >
                {index > 0 && (
                  <span className="px-2 text-xs select-none opacity-40" style={{ color: 'var(--menu-bar-text)' }}>|</span>
                )}
                <Link
                  href={itemHref}
                  className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold uppercase tracking-wide transition-opacity hover:opacity-70"
                  style={{ color: 'var(--menu-bar-text)' }}
                >
                  {item.icon ? <img src={item.icon} alt={item.name} className="h-4 w-4 object-contain" loading="lazy" /> : null}
                  <span>{item.name}</span>
                </Link>

                {shouldUseCollectionsFlyout && categoriesDropdownOpen ? (
                  <div
                    className="absolute left-0 top-full z-[80] mt-0 grid min-w-[560px] grid-cols-[220px,1fr] overflow-hidden rounded-xl border shadow-2xl"
                    style={{ borderColor: 'var(--menu-dropdown-border)', backgroundColor: 'var(--menu-dropdown-bg)' }}
                    onMouseEnter={() => {
                      if (categoryTimer.current) clearTimeout(categoryTimer.current);
                      setCategoriesDropdownOpen(true);
                    }}
                    onMouseLeave={() => {
                      if (categoryTimer.current) clearTimeout(categoryTimer.current);
                      categoryTimer.current = setTimeout(() => setCategoriesDropdownOpen(false), 180);
                    }}
                  >
                    <div className="border-r" style={{ borderColor: 'var(--menu-dropdown-border)', backgroundColor: 'var(--menu-bar-hover-bg)' }}>
                      {topLevelCategories.map((category) => (
                        <button
                          key={category._id || category.slug || category.name}
                          type="button"
                          onMouseEnter={() => setHoveredCategory(category)}
                          className={`block w-full px-4 py-2.5 text-left text-sm transition ${hoveredCategory?._id === category._id ? 'font-semibold' : ''}`}
                          style={getCategoryRecordId(hoveredCategory) === getCategoryRecordId(category)
                            ? { backgroundColor: 'var(--menu-dropdown-bg)', color: 'var(--menu-dropdown-text)' }
                            : { color: 'var(--menu-dropdown-text)' }}
                        >
                          {getLocalizedCategoryDisplayName(category)}
                        </button>
                      ))}
                    </div>

                    <div className="p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--menu-dropdown-muted)' }}>
                        {getLocalizedCategoryDisplayName(hoveredCategory) || translateStaticText('navbar.collections', storefrontLanguage)}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {hoveredChildren.length > 0 ? (
                          hoveredChildren.map((child) => (
                            <Link
                              key={child._id || child.slug || child.name}
                              href={buildCategoryShopLink(child, categories)}
                              className="rounded-lg border px-3 py-2 text-sm transition"
                              style={{ borderColor: 'var(--menu-dropdown-border)', color: 'var(--menu-dropdown-text)' }}
                            >
                              {getLocalizedCategoryDisplayName(child)}
                            </Link>
                          ))
                        ) : (
                          <p className="text-sm" style={{ color: 'var(--menu-dropdown-muted)' }}>No sub-categories yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {shouldUseMega && openMegaIndex === index ? (
                  <MegaDropdown
                    item={item}
                    dropdownLinks={dropdownLinks}
                    featuredImages={featuredImages}
                    onClose={() => setOpenMegaIndex(null)}
                    timerRef={megaTimer}
                    menuStyle={menuStyle}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
