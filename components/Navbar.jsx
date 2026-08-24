"use client";

import { Search, ShoppingCart, Menu, X, HeartIcon, StarIcon, ArrowLeft, LogOut, User, MapPin, Package } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { auth } from '../lib/firebase';
import { getAuth } from "firebase/auth";
import Image from 'next/image';
import SafeNextImage from '@/components/SafeNextImage';
import axios from "axios";
import toast from "react-hot-toast";
import WalletIcon from '@/assets/icons/wallet.png';
import { isStorefrontWalletEnabled } from '@/lib/storefrontWallet';
import SignInModal from './SignInModal';
import AddressModal from './AddressModal';
import NavbarMenuBar from './NavbarMenuBar';
import { clearCart, fetchCart, uploadCart } from '@/lib/features/cart/cartSlice';
import { fetchAddress, clearAddresses } from '@/lib/features/address/addressSlice';
import {
  STOREFRONT_LANGUAGE_EVENT,
  STOREFRONT_LANGUAGE_KEY,
  persistStorefrontLanguage,
  readPersistedStorefrontLanguage,
} from '@/lib/storefrontLanguage';
import { translateStaticText } from '@/lib/useStorefrontI18n';
import {
  getCategoryDisplayName as getNavCategoryDisplayName,
  getCategoryRecordId,
  filterParentCategories,
  getDirectChildCategories,
  buildCategoryShopLink,
} from '@/lib/categoryNavigation';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getProductPath } from '@/lib/productUrl';
import { secureSignOut } from '@/lib/authClient';

const NAVBAR_SELECTED_ADDRESS_KEY = 'navbarSelectedAddressId';
const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache';

import { STORE1920_LOGO_PATH } from '@/lib/brandLogo';

const DEFAULT_STORE_LOGO = STORE1920_LOGO_PATH;
const STOREFRONT_BRAND_NAME = 'store1920';
const DEFAULT_NAVBAR_APPEARANCE = {
  logoUrl: DEFAULT_STORE_LOGO,
  logoWidth: 120,
  logoHeight: 40,
  backgroundColor: '#8f3404',
};
const NAVBAR_CONTAINER_CLASS = 'mx-auto w-full max-w-[1400px] px-4 sm:px-6';

const resolveNavbarLogoSrc = (logoUrl) => {
  const trimmed = String(logoUrl || '').trim();
  return trimmed || DEFAULT_STORE_LOGO;
};

const normalizeNavbarAppearance = (appearance = {}) => ({
  logoUrl: resolveNavbarLogoSrc(appearance.logoUrl),
  logoWidth: Number(appearance.logoWidth) > 0 ? Number(appearance.logoWidth) : 120,
  logoHeight: Number(appearance.logoHeight) > 0 ? Number(appearance.logoHeight) : 40,
  backgroundColor: appearance.backgroundColor || '#8f3404',
});

const readCachedNavbarAppearance = () => {
  if (typeof window === 'undefined') return DEFAULT_NAVBAR_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeNavbarAppearance({ ...DEFAULT_NAVBAR_APPEARANCE, ...parsed });
      }
    }
  } catch {
    // Ignore storage read failures.
  }
  return DEFAULT_NAVBAR_APPEARANCE;
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

const getCategoryId = (category) => getCategoryRecordId(category);

const getCategoryDisplayName = (category, language = 'en') => getNavCategoryDisplayName(category, language);

const Navbar = () => {
  const dispatch = useDispatch();

  // State for categories
  const [categories, setCategories] = useState([]);
  // State for animated search placeholder
  const [searchPlaceholder, setSearchPlaceholder] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [productIndex, setProductIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const categoryTimer = useRef(null);
  const categoriesTriggerRef = useRef(null);
  const categoriesDropdownPanelRef = useRef(null);
  const userDropdownRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [wishlistCount, setWishlistCount] = useState(0);
  const addressList = useSelector((state) => state.address?.list || []);
  const cartItems = useSelector((state) => state.cart.cartItems || {});
  const cartCount = useMemo(() => {
    return Object.values(cartItems || {}).reduce((acc, entry) => {
      const qty = typeof entry === 'number' ? entry : entry?.quantity || 0;
      return acc + (Number.isFinite(qty) ? qty : 0);
    }, 0);
  }, [cartItems]);
  const [navActionsVisibility, setNavActionsVisibility] = useState({
    store: true,
    orders: true,
    wishlist: true,
    cart: true,
  });
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMode, setSignInMode] = useState('login');
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signOutAllDevices, setSignOutAllDevices] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [walletCoins, setWalletCoins] = useState(0);
  const storefrontWalletEnabled = isStorefrontWalletEnabled();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestionResults, setSearchSuggestionResults] = useState([]);
  const [searchSuggestionTotal, setSearchSuggestionTotal] = useState(0);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);
  const searchDebounceRef = useRef(null);
  const mobileSearchInputRef = useRef(null);
  const SEARCH_SUGGESTIONS_PREVIEW = 3;
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  // Initialize with safe defaults to avoid hydration mismatch
  // Will be updated from localStorage in useEffect after mount
  const [storefrontLanguage, setStorefrontLanguage] = useState('en');
  const [languageHydrated, setLanguageHydrated] = useState(false);
  // Initialize with default appearance to avoid hydration mismatch
  // Will be updated from localStorage in useEffect after mount
  const [navbarAppearance, setNavbarAppearance] = useState(DEFAULT_NAVBAR_APPEARANCE);
  // Render the navbar with the default appearance on both server and client initially
  // to avoid hydration mismatches. Loading state is set false initially and toggled
  // by the fetch effect when data is retrieved.
  const [navbarAppearanceLoading, setNavbarAppearanceLoading] = useState(false);
  const t = (key, replacements = {}) => translateStaticText(key, storefrontLanguage, replacements);

  const getShortName = (value) => {
    const name = (value || '').trim();
    if (!name) return '';
    return name.length > 6 ? `${name.slice(0, 6)}..` : name;
  };

  const getUserGreetingName = (user) => {
    const raw = String(user?.displayName || user?.email?.split('@')[0] || '').trim();
    if (!raw) return 'there';
    return raw.length > 16 ? `${raw.slice(0, 16)}…` : raw;
  };

  const formatWalletAmount = (amount) => {
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return '0';
    return Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const renderWalletAmount = ({ size = 16, amountClassName = '', showAmount = true, tone = 'light' }) => {
    const amountLabel = formatWalletAmount(walletCoins);
    const textClass = tone === 'light' ? 'text-white/85' : 'text-gray-600';

    return (
      <span className={`inline-flex min-w-0 items-center gap-1.5 ${textClass}`}>
        <Image
          src={WalletIcon}
          alt=""
          width={size}
          height={size}
          className="shrink-0 object-contain"
          aria-hidden="true"
        />
        {showAmount ? (
          <span className={`truncate ${amountClassName}`.trim()}>{amountLabel}</span>
        ) : null}
      </span>
    );
  };

  const renderAccountMenuTrigger = ({ signedIn, onClick, tone = 'light', variant = 'full', className = '', compactIcon = false }) => {
    const isLightTone = tone === 'light';
    const iconOnlyClass = isLightTone
      ? 'text-white hover:bg-white/12'
      : 'text-gray-800 hover:bg-gray-100';

    const accountIcon = (
      <User size={22} strokeWidth={1.85} aria-hidden="true" />
    );

    if (variant === 'icon') {
      const iconButtonSizeClass = compactIcon ? 'h-7 w-7' : 'h-9 w-9';
      const iconUserSize = compactIcon ? 16 : 18;

      return (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex ${iconButtonSizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full transition ${iconOnlyClass} ${className}`.trim()}
          aria-label={signedIn ? t('navbar.account') : t('navbar.signInRegister')}
        >
          {signedIn && firebaseUser?.photoURL ? (
            <Image
              src={firebaseUser.photoURL}
              alt=""
              width={compactIcon ? 28 : 32}
              height={compactIcon ? 28 : 32}
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={iconUserSize} strokeWidth={2.25} aria-hidden="true" />
          )}
        </button>
      );
    }

    const shellClass = isLightTone
      ? 'text-white hover:opacity-90'
      : 'text-gray-900 hover:opacity-90';

    const topLine = signedIn
      ? getUserGreetingName(firebaseUser)
      : t('navbar.signInRegister');

    const bottomLine = storefrontWalletEnabled && signedIn && walletCoins > 0
      ? renderWalletAmount({ size: 16, amountClassName: 'text-[11px] font-normal leading-none', tone: isLightTone ? 'light' : 'dark' })
      : t('navbar.ordersAndAccount');

    return (
      <button
        type="button"
        onClick={onClick}
        className={`group inline-flex max-w-[148px] items-center gap-2 rounded-md px-1 py-1 text-left transition xl:max-w-[168px] xl:gap-2.5 ${shellClass} ${className}`.trim()}
        aria-label={signedIn ? (storefrontWalletEnabled && walletCoins > 0 ? `Wallet balance ${formatWalletAmount(walletCoins)}` : t('navbar.ordersAndAccount')) : t('navbar.signInRegister')}
        aria-haspopup="true"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          {accountIcon}
        </span>
        <span className="min-w-0 flex flex-col leading-[1.15]">
          <span className={`truncate text-[13px] font-bold leading-none xl:text-[14px] ${isLightTone ? 'text-white' : 'text-gray-900'}`}>
            {topLine}
          </span>
          <span className={`mt-1 truncate text-[11px] font-normal leading-none ${isLightTone ? 'text-white/85' : 'text-gray-600'}`}>
            {bottomLine}
          </span>
        </span>
      </button>
    );
  };

  const renderTodaysDealsButton = ({ variant = 'desktop', className = '' }) => {
    const isDesktop = variant === 'desktop';
    const useLightText = isDesktop || mobileNavbarUsesBrandColor;

    return (
      <Link
        href="/offers"
        className={`navbar-deals-btn shrink-0 font-extrabold uppercase tracking-[0.06em] transition hover:opacity-90 ${
          isDesktop
            ? 'hidden lg:inline-flex h-[44px] shrink-0 items-center px-1 text-[12px] leading-none'
            : 'inline-flex h-8 max-w-[54px] flex-col items-center justify-center px-1 text-[9px] leading-[1.05]'
        } ${className}`.trim()}
      >
        <span className={`navbar-deals-text-shine ${useLightText ? '' : 'navbar-deals-text-shine-dark'} flex flex-col items-center leading-[1.05]`}>
        {isDesktop ? (
          t('navbar.todaysDeals')
        ) : (
          <>
            <span>{t('navbar.todaysDealsTop')}</span>
            <span>{t('navbar.todaysDealsBottom')}</span>
          </>
        )}
        </span>
      </Link>
    );
  };

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHomePage = pathname === '/';

  const mobileNavbarUsesBrandColor = isHomePage;
  const mobileNavbarBackgroundColor = mobileNavbarUsesBrandColor
    ? navbarAppearance.backgroundColor
    : '#ffffff';
  const mobileNavbarControlClass = mobileNavbarUsesBrandColor
    ? 'text-white/95 hover:bg-white/15'
    : 'text-gray-900 hover:bg-gray-100';
  const navbarTextColor = getContrastColor(navbarAppearance.backgroundColor);
  const navbarLogoSrc = resolveNavbarLogoSrc(navbarAppearance.logoUrl);
  const mobileLogoSrc = navbarLogoSrc;

  useEffect(() => {
    if (!navbarAppearanceLoading) {
      console.log('[Navbar] Logo Debug:', {
        navbarAppearance_logoUrl: navbarAppearance.logoUrl || '(empty)',
        navbarLogoSrc: navbarLogoSrc || '(null)',
        willShowLogo: !!navbarLogoSrc
      });
    }
  }, [navbarAppearance.logoUrl, navbarLogoSrc, navbarAppearanceLoading]);

  const selectedDeliveryAddress = useMemo(() => {
    if (!addressList.length) return null;
    return addressList.find((address) => address?._id === selectedAddressId) || addressList[0] || null;
  }, [addressList, selectedAddressId]);

  const getLocalizedCategoryDisplayName = useCallback(
    (category) => getCategoryDisplayName(category, storefrontLanguage),
    [storefrontLanguage],
  );

  const mainCategories = useMemo(() => (
    filterParentCategories(Array.isArray(categories) ? categories : [])
      .sort((left, right) => getLocalizedCategoryDisplayName(left).localeCompare(getLocalizedCategoryDisplayName(right)))
  ), [categories, getLocalizedCategoryDisplayName]);

  const activeCategory = useMemo(() => {
    const defaultCategory = mainCategories[0] || null;
    if (!hoveredCategory) return defaultCategory;

    const hoveredId = getCategoryId(hoveredCategory);
    return mainCategories.find((item) => getCategoryId(item) === hoveredId) || defaultCategory;
  }, [mainCategories, hoveredCategory]);

  const activeSubcategories = useMemo(() => (
    getDirectChildCategories(Array.isArray(categories) ? categories : [], activeCategory)
  ), [activeCategory, categories]);

  const getCategoryHref = useCallback(
    (category) => buildCategoryShopLink(category, categories),
    [categories],
  );

  const selectedDeliveryLabel = useMemo(() => {
    if (!firebaseUser) return t('navbar.signInToChoose');
    if (!selectedDeliveryAddress) return addressList.length ? t('navbar.selectAddress') : t('navbar.addAddress');

    const primary = [selectedDeliveryAddress.city, selectedDeliveryAddress.state]
      .filter(Boolean)
      .join(' . ');

    return primary || selectedDeliveryAddress.country || t('navbar.selectAddress');
  }, [addressList.length, firebaseUser, selectedDeliveryAddress, storefrontLanguage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedAddressId = window.localStorage.getItem(NAVBAR_SELECTED_ADDRESS_KEY);
      if (savedAddressId) {
        setSelectedAddressId(savedAddressId);
      }
    } catch {
      // Ignore storage read failures.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const readLanguage = () => {
      setStorefrontLanguage(readPersistedStorefrontLanguage());
      setLanguageHydrated(true);
    };

    const handleLanguageChange = (event) => {
      const nextLanguage = event?.detail?.language;
      setStorefrontLanguage(nextLanguage === 'ar' ? 'ar' : 'en');
    };

    const handleStorage = (event) => {
      if (!event || event.key === STOREFRONT_LANGUAGE_KEY) {
        readLanguage();
      }
    };

    readLanguage();
    window.addEventListener(STOREFRONT_LANGUAGE_EVENT, handleLanguageChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(STOREFRONT_LANGUAGE_EVENT, handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!languageHydrated) return;

    persistStorefrontLanguage(storefrontLanguage, { dispatchEvent: false });
  }, [storefrontLanguage, languageHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.sessionStorage.getItem('nav:actions:visibility:v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        setNavActionsVisibility({
          store: parsed.store !== false,
          orders: parsed.orders !== false,
          wishlist: parsed.wishlist !== false,
          cart: parsed.cart !== false,
        });
      }
    } catch {
      // Ignore cache parse failures.
    }

    const handleVisibilityUpdate = (event) => {
      const detail = event?.detail || {};
      setNavActionsVisibility({
        store: detail.store !== false,
        orders: detail.orders !== false,
        wishlist: detail.wishlist !== false,
        cart: detail.cart !== false,
      });
    };

    window.addEventListener('navActionsVisibilityUpdated', handleVisibilityUpdate);
    return () => window.removeEventListener('navActionsVisibilityUpdated', handleVisibilityUpdate);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    try {
      const cached = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          const normalized = normalizeNavbarAppearance({ ...DEFAULT_NAVBAR_APPEARANCE, ...parsed });
          setNavbarAppearance(normalized);
          // Defer so sibling listeners are mounted before they receive the event.
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navbarAppearanceUpdated', { detail: normalized }));
          }, 0);
        }
      }
    } catch {
      // Ignore storage read failures
    }

    return undefined;
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchNavbarAppearance = async () => {
      try {
        const response = await fetch('/api/store/navbar-menu', {
          // Always use public storefront navbar appearance.
          // Passing auth headers can switch to user-scoped settings and clear the logo.
          headers: {},
          signal: controller.signal,
        });
        if (!response.ok) {
          console.warn('[Navbar] API returned status:', response.status);
          return;
        }
        const data = await response.json();
        console.log('[Navbar] Backend Response:', { 
          logoUrl: data.logoUrl || '(empty - will use default)', 
          logoWidth: data.logoWidth, 
          logoHeight: data.logoHeight, 
          backgroundColor: data.backgroundColor 
        });
        
        const nextAppearance = normalizeNavbarAppearance({
          logoUrl: data.logoUrl || DEFAULT_STORE_LOGO,
          logoWidth: data.logoWidth ?? 120,
          logoHeight: data.logoHeight ?? 40,
          backgroundColor: data.backgroundColor || '#8f3404',
        });
        
        setNavbarAppearance(nextAppearance);
        try {
          window.localStorage.setItem(NAVBAR_APPEARANCE_CACHE_KEY, JSON.stringify(nextAppearance));
        } catch {
          // Ignore storage write failures.
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('navbarAppearanceUpdated', { detail: nextAppearance }));
        }
        console.log('[Navbar] Applied Appearance:', { 
          usingCustomLogo: !!data.logoUrl, 
          dims: `${nextAppearance.logoWidth}x${nextAppearance.logoHeight}` 
        });
      } catch (error) {
        // Ignore AbortError on cleanup
        if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
          console.log('[Navbar] Fetch cancelled (cleanup)');
          return;
        }
        console.error('[Navbar] Failed to load appearance:', error?.message || error);
      } finally {
        setNavbarAppearanceLoading(false);
      }
    };

    fetchNavbarAppearance();

    const handleNavbarAppearanceUpdate = (event) => {
      const detail = event?.detail || {};
      console.log('[Navbar] Event received:', { logoUrl: detail.logoUrl || '(empty)', source: 'navbarAppearanceUpdated' });
      
      // Only apply event if it has meaningful data (preserve existing logo if empty event received)
      const hasValidLogoUrl = typeof detail.logoUrl === 'string' && detail.logoUrl.trim();
      const hasValidDimensions = (typeof detail.logoWidth === 'number' && detail.logoWidth > 0) || 
                                 (typeof detail.logoHeight === 'number' && detail.logoHeight > 0);
      const hasValidBgColor = typeof detail.backgroundColor === 'string' && detail.backgroundColor.trim();
      
      if (!hasValidLogoUrl && !hasValidDimensions && !hasValidBgColor) {
        console.log('[Navbar] Ignoring empty appearance update event (preserving current logo)');
        return;
      }
      
      setNavbarAppearance((prev) => normalizeNavbarAppearance({
        logoUrl: hasValidLogoUrl ? detail.logoUrl : prev.logoUrl,
        logoWidth: (typeof detail.logoWidth === 'number' && detail.logoWidth > 0) ? detail.logoWidth : prev.logoWidth,
        logoHeight: (typeof detail.logoHeight === 'number' && detail.logoHeight > 0) ? detail.logoHeight : prev.logoHeight,
        backgroundColor: hasValidBgColor ? detail.backgroundColor : prev.backgroundColor,
      }));
      setNavbarAppearanceLoading(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate);
    }

    return () => {
      controller.abort();
      if (typeof window !== 'undefined') {
        window.removeEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate);
      }
    };
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!firebaseUser) {
      setShowAddressModal(false);
      setSelectedAddressId(null);
      return;
    }

    dispatch(fetchAddress({ getToken: async () => firebaseUser.getIdToken() }));
  }, [firebaseUser, dispatch]);

  useEffect(() => {
    if (!firebaseUser || !addressList.length) return;

    const hasSelectedAddress = addressList.some((address) => address?._id === selectedAddressId);
    const nextSelectedAddressId = hasSelectedAddress ? selectedAddressId : addressList[0]?._id || null;

    if (nextSelectedAddressId && nextSelectedAddressId !== selectedAddressId) {
      setSelectedAddressId(nextSelectedAddressId);
    }

    if (nextSelectedAddressId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(NAVBAR_SELECTED_ADDRESS_KEY, nextSelectedAddressId);
      } catch {
        // Ignore storage write failures.
      }
    }
  }, [addressList, firebaseUser, selectedAddressId]);

  const openSignOutConfirm = (context = 'desktop') => {
    setSignOutAllDevices(false);
    setSignOutConfirmOpen(true);
    setUserDropdownOpen(false);
    if (context === 'mobile') {
      setMobileMenuOpen(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    const allDevices = signOutAllDevices;
    const userEmail = firebaseUser?.email;
    const userName = firebaseUser?.displayName || 'Customer';

    try {
      await secureSignOut(auth, { allDevices });

      setUserDropdownOpen(false);
      setMobileMenuOpen(false);
      setSignOutConfirmOpen(false);
      setSignOutAllDevices(false);
      dispatch(clearCart());
      dispatch(clearAddresses());
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cartState');
      }

      if (userEmail) {
        window.setTimeout(() => {
          axios.post('/api/send-signout-email', {
            email: userEmail,
            name: userName,
            skipAuth: true,
          }).catch((err) => {
            console.error('[Sign Out] Email failed:', err.response?.data || err.message);
          });
        }, 100);
      }

      toast.success(allDevices ? 'Signed out of all devices' : 'Signed out successfully');
      window.location.assign('/');
    } catch (error) {
      console.error('Sign out error:', error);
      try {
        await secureSignOut(auth, { allDevices: false });
        setUserDropdownOpen(false);
        setMobileMenuOpen(false);
        setSignOutConfirmOpen(false);
        setSignOutAllDevices(false);
        dispatch(clearCart());
        dispatch(clearAddresses());
        if (typeof window !== 'undefined') {
          localStorage.removeItem('cartState');
        }
        window.location.assign('/');
      } catch (finalError) {
        console.error('Sign out fallback failed:', finalError);
        toast.error('Please refresh the page to complete sign out.');
        window.setTimeout(() => window.location.reload(), 1000);
      }
    } finally {
      setSigningOut(false);
    }
  };

  // (already declared above)

  // Fetch categories from API
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const fetchCategories = async () => {
      try {
        const endpoints = ['/api/categories', '/api/store/categories'];

        for (const endpoint of endpoints) {
          try {
            const res = await fetch(endpoint, {
              method: 'GET',
              cache: 'no-store',
              signal: controller.signal,
            });

            if (!res.ok) {
              continue;
            }

            const data = await res.json();
            if (active && Array.isArray(data?.categories)) {
              setCategories(data.categories);
              return;
            }
          } catch (innerError) {
            if (innerError?.name === 'AbortError') return;
          }
        }

        if (active) setCategories([]);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('Categories could not be loaded right now.');
        }
      }
    };

    fetchCategories();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  // Product names for animated placeholder
  const productNames = storefrontLanguage === 'ar'
    ? [
        'سماعات لاسلكية',
        'ساعة ذكية',
        'حذاء رياضي',
        'ماكينة قهوة',
        'فأرة ألعاب',
        'حصيرة يوغا',
        'نظارات شمسية',
        'حقيبة لابتوب',
        'زجاجة ماء',
        'غطاء هاتف',
      ]
    : [
        'Wireless Headphones',
        'Smart Watch',
        'Running Shoes',
        'Coffee Maker',
        'Gaming Mouse',
        'Yoga Mat',
        'Sunglasses',
        'Laptop Bag',
        'Water Bottle',
        'Phone Case',
      ];

  // Typewriter effect for search placeholder
  useEffect(() => {
    const currentProduct = productNames[productIndex];
    const typingSpeed = isDeleting ? 50 : 100;
    
    const timer = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (searchPlaceholder.length < currentProduct.length) {
          setSearchPlaceholder(currentProduct.substring(0, searchPlaceholder.length + 1));
        } else {
          // Wait before deleting
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        // Deleting
        if (searchPlaceholder.length > 0) {
          setSearchPlaceholder(searchPlaceholder.substring(0, searchPlaceholder.length - 1));
        } else {
          // Move to next product
          setIsDeleting(false);
          setProductIndex((prev) => (prev + 1) % productNames.length);
        }
      }
    }, typingSpeed);

    return () => clearTimeout(timer);
  }, [searchPlaceholder, isDeleting, productIndex, productNames]);

  useEffect(() => {
    return () => {
      if (categoryTimer.current) {
        window.clearTimeout(categoryTimer.current);
      }
    };
  }, []);

  const closeCategoriesDropdownNow = useCallback(() => {
    if (categoryTimer.current) {
      window.clearTimeout(categoryTimer.current);
      categoryTimer.current = null;
    }
    setCategoriesDropdownOpen(false);
  }, []);

  const openCategoriesDropdown = useCallback(() => {
    if (categoryTimer.current) {
      window.clearTimeout(categoryTimer.current);
      categoryTimer.current = null;
    }
    setCategoriesDropdownOpen(true);
    if (!hoveredCategory && mainCategories.length > 0) {
      setHoveredCategory(mainCategories[0]);
    }
  }, [hoveredCategory, mainCategories]);

  const closeCategoriesDropdown = useCallback(() => {
    if (categoryTimer.current) {
      window.clearTimeout(categoryTimer.current);
    }
    categoryTimer.current = window.setTimeout(() => {
      closeCategoriesDropdownNow();
    }, 280);
  }, [closeCategoriesDropdownNow]);

  useEffect(() => {
    if (!categoriesDropdownOpen) return undefined;

    const handleScroll = (event) => {
      const panel = categoriesDropdownPanelRef.current;
      if (panel && event.target instanceof Node && panel.contains(event.target)) {
        return;
      }
      closeCategoriesDropdownNow();
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [categoriesDropdownOpen, closeCategoriesDropdownNow]);

  useEffect(() => {
    const syncGuestWishlistToDatabase = async (user) => {
      try {
        if (typeof window === 'undefined' || !user) return;
        const raw = localStorage.getItem('guestWishlist');
        if (!raw) return;

        let guestWishlist = [];
        try {
          guestWishlist = JSON.parse(raw);
        } catch {
          guestWishlist = [];
        }

        const productIds = Array.isArray(guestWishlist)
          ? [...new Set(
              guestWishlist
                .map((item) => item?.productId || item?.id)
                .filter((id) => typeof id === 'string' && id.trim().length > 0)
            )]
          : [];

        if (productIds.length === 0) {
          localStorage.removeItem('guestWishlist');
          return;
        }

        const token = await user.getIdToken();
        await Promise.all(
          productIds.map((productId) =>
            axios.post(
              '/api/wishlist',
              { productId, action: 'add' },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );

        localStorage.removeItem('guestWishlist');
        window.dispatchEvent(new Event('wishlistUpdated'));
      } catch (error) {
        console.error('Error syncing guest wishlist:', error);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
      if (user) {
        dispatch(fetchCart({ getToken: async () => user.getIdToken() }));
        syncGuestWishlistToDatabase(user);
      }
    });
    return () => unsubscribe();
  }, [dispatch]);

  // Keep signed-in cart synced to DB so navbar count and refresh remain accurate
  useEffect(() => {
    if (!firebaseUser) return;

    const timer = setTimeout(() => {
      dispatch(uploadCart({ getToken: async () => firebaseUser.getIdToken() }));
    }, 350);

    return () => clearTimeout(timer);
  }, [cartItems, firebaseUser, dispatch]);

  const fetchWalletCoins = async () => {
    try {
      if (!auth.currentUser) {
        setWalletCoins(0);
        return;
      }
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/wallet', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setWalletCoins(Number(data.rupeesValue ?? data.coins ?? 0));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!storefrontWalletEnabled) {
      setWalletCoins(0);
      return undefined;
    }

    if (!firebaseUser) {
      setWalletCoins(0);
      return undefined;
    }

    fetchWalletCoins();

    const handleFocus = () => fetchWalletCoins();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchWalletCoins();
    };
    const handleWalletUpdate = () => fetchWalletCoins();

    const intervalId = setInterval(() => {
      fetchWalletCoins();
    }, 10000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('walletUpdated', handleWalletUpdate);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('walletUpdated', handleWalletUpdate);
      clearInterval(intervalId);
    };
  }, [firebaseUser, storefrontWalletEnabled]);

  // Listen for custom event to open sign in modal
  useEffect(() => {
    const handleOpenSignInModal = (event) => {
      const mode = event?.detail?.mode || 'login';
      setSignInMode(mode);
      setSignInOpen(true);
    };
    window.addEventListener('openSignInModal', handleOpenSignInModal);
    return () => window.removeEventListener('openSignInModal', handleOpenSignInModal);
  }, []);

  useEffect(() => {
    const syncWishlistCount = () => {
      if (auth.currentUser) {
        fetchWishlistCount();
        return;
      }

      // Guest wishlist count from localStorage (only valid entries)
      try {
        const guestWishlist = JSON.parse(localStorage.getItem('guestWishlist') || '[]');
        const validGuestItems = Array.isArray(guestWishlist)
          ? guestWishlist.filter((item) => item && (item.productId || item.id))
          : [];
        setWishlistCount(validGuestItems.length);
      } catch {
        setWishlistCount(0);
      }
    };

    syncWishlistCount();

    const handleWishlistUpdate = () => syncWishlistCount();
    const handleFocus = () => syncWishlistCount();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncWishlistCount();
    };
    const handleStorage = (e) => {
      if (!e || e.key === 'guestWishlist') syncWishlistCount();
    };

    window.addEventListener('wishlistUpdated', handleWishlistUpdate);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('wishlistUpdated', handleWishlistUpdate);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [firebaseUser, pathname]);

  const fetchWishlistCount = async () => {
    try {
      if (!auth.currentUser) {
        // Get guest wishlist count from localStorage
        try {
          const guestWishlist = JSON.parse(localStorage.getItem('guestWishlist') || '[]');
          setWishlistCount(Array.isArray(guestWishlist) ? guestWishlist.length : 0);
        } catch {
          setWishlistCount(0);
        }
        return;
      }
      const token = await auth.currentUser.getIdToken();
      try {
        const { data } = await axios.get('/api/wishlist/count', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setWishlistCount(Number(data?.count) || 0);
      } catch (countError) {
        // Fallback: fetch full wishlist to get count if endpoint doesn't exist
        try {
          const { data } = await axios.get('/api/wishlist', {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          setWishlistCount(Array.isArray(data?.wishlist) ? data.wishlist.length : 0);
        } catch {
          setWishlistCount(0);
        }
      }
    } catch (error) {
      const isRequestCanceled =
        axios.isCancel(error) ||
        error?.name === 'CanceledError' ||
        error?.name === 'AbortError' ||
        error?.code === 'ERR_CANCELED' ||
        String(error?.message || '').toLowerCase().includes('aborted');

      if (isRequestCanceled) {
        return;
      }

      if (error?.response?.status !== 401) {
        console.error('Error fetching wishlist count:', error);
        if (error?.response?.data) {
          console.error('API Error Response:', error.response.data);
        }
      }
      setWishlistCount(0);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const query = search.trim();
    if (!query) return;
    setSearchFocused(false);
    router.push(`/shop?search=${encodeURIComponent(query)}`);
  };

  const clearSearchState = useCallback(() => {
    setSearch('');
    setSearchFocused(false);
    setSearchSuggestionResults([]);
    setSearchSuggestionTotal(0);
    setSearchSuggestionsLoading(false);
  }, []);

  useEffect(() => {
    if (pathname.startsWith('/shop')) {
      const queryFromUrl = String(searchParams.get('search') || '').trim();
      setSearch(queryFromUrl);
      setSearchFocused(false);
      setSearchSuggestionResults([]);
      setSearchSuggestionTotal(0);
      return;
    }

    clearSearchState();
  }, [pathname, searchParams, clearSearchState]);

  useEffect(() => {
    const query = search.trim();
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (query.length < 1) {
      setSearchSuggestionResults([]);
      setSearchSuggestionTotal(0);
      setSearchSuggestionsLoading(false);
      return undefined;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setSearchSuggestionsLoading(true);
      try {
        const { data } = await axios.get('/api/search-products', {
          params: { keyword: query, limit: SEARCH_SUGGESTIONS_PREVIEW, includeOutOfStock: true },
        });
        setSearchSuggestionResults(Array.isArray(data?.products) ? data.products : []);
        setSearchSuggestionTotal(Number(data?.total) || 0);
      } catch {
        setSearchSuggestionResults([]);
        setSearchSuggestionTotal(0);
      } finally {
        setSearchSuggestionsLoading(false);
      }
    }, 220);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [search]);

  const searchSuggestions = searchSuggestionResults;

  const renderSearchSuggestionsDropdown = (wrapperClassName, onSelect) => {
    const query = search.trim();
    if (!searchFocused || query.length < 1) return null;

    if (searchSuggestionsLoading) {
      return (
        <div className={wrapperClassName}>
          <div className="px-4 py-3 text-sm text-gray-500">{t('navbar.searchSearching')}</div>
        </div>
      );
    }

    if (!searchSuggestions.length) {
      return (
        <div className={wrapperClassName}>
          <div className="px-4 py-3 text-sm text-gray-500">{t('navbar.searchNoProducts')}</div>
        </div>
      );
    }

    const previewSuggestions = searchSuggestions.slice(0, SEARCH_SUGGESTIONS_PREVIEW);
    const hasMoreResults = searchSuggestionTotal > SEARCH_SUGGESTIONS_PREVIEW;

    return (
      <div className={wrapperClassName}>
        {previewSuggestions.map((product) => (
          <Link
            key={product._id || product.slug}
            href={getProductPath(product)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              clearSearchState();
              onSelect?.();
            }}
          >
            <div className="relative h-9 w-9 overflow-hidden rounded-lg bg-gray-100">
              {getProductThumbnailUrl(product, { fallback: '' }) ? (
                <SafeNextImage
                  src={getProductThumbnailUrl(product)}
                  alt={product.name || 'Product'}
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <span className="block truncate font-medium">{product.name}</span>
              <span className="truncate text-xs text-gray-500">
                {[product.brand, product.sku ? `SKU: ${product.sku}` : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
          </Link>
        ))}
        {hasMoreResults ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const queryValue = search.trim();
              if (!queryValue) return;
              setSearchFocused(false);
              onSelect?.();
              router.push(`/shop?search=${encodeURIComponent(queryValue)}`);
            }}
            className="w-full border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('navbar.searchShowMore')}
          </button>
        ) : null}
      </div>
    );
  };

  const handleOrdersClick = (e) => {
    if (!firebaseUser) {
      e.preventDefault();
      setSignInMode('login');
      setSignInOpen(true);
    }
  };

  const renderLabeledNavAction = ({
    href,
    onClick,
    icon: Icon,
    label,
    badgeCount = 0,
    ariaLabel,
    tone = 'light',
    compact = false,
    iconOnly = false,
  }) => {
    const isLightTone = tone === 'light';
    const textClass = isLightTone ? 'text-white' : 'text-gray-900';
    const iconOnlyClass = isLightTone
      ? 'text-white hover:bg-white/12'
      : 'text-gray-900 hover:bg-gray-100';
    const className = iconOnly
      ? `relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${iconOnlyClass}`
      : `relative inline-flex shrink-0 items-center ${
          compact ? 'gap-1 px-0.5' : 'gap-2 px-1'
        } py-1 ${textClass} transition hover:opacity-85`;
    const iconSize = iconOnly ? 20 : compact ? 18 : 22;

    const content = (
      <>
        <span className={`relative inline-flex shrink-0 items-center justify-center ${iconOnly ? '' : ''}`}>
          <Icon size={iconSize} strokeWidth={1.5} aria-hidden="true" />
          {badgeCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </span>
        {!iconOnly ? (
          <span className={`${compact ? 'text-[10px]' : 'text-[14px]'} font-normal leading-none whitespace-nowrap`}>
            {label}
          </span>
        ) : null}
      </>
    );

    if (onClick && !href) {
      return (
        <button type="button" onClick={onClick} className={className} aria-label={ariaLabel || label}>
          {content}
        </button>
      );
    }

    return (
      <Link href={href || '#'} onClick={onClick} className={className} aria-label={ariaLabel || label}>
        {content}
      </Link>
    );
  };

  const handleCartClick = (e) => {
    e.preventDefault();
    if (!cartCount || cartCount === 0) {
      toast.error(t('navbar.emptyCartToast'), {
        duration: 3000,
        icon: '🛒',
      });
      return;
    }
    router.push("/cart");
  };

  const handleLogoNavigation = () => {
    setMobileMenuOpen(false);
    setShowSearchModal(false);
    setUserDropdownOpen(false);
    router.push('/');
  };

  const handleDeliveryLocationClick = () => {
    if (!firebaseUser) {
      setSignInMode('login');
      setSignInOpen(true);
      return;
    }

    dispatch(fetchAddress({ getToken: async () => firebaseUser.getIdToken() }));
    setShowAddressModal(true);
  };

  const handleDeliveryAddressSelect = (addressId) => {
    setSelectedAddressId(addressId);

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(NAVBAR_SELECTED_ADDRESS_KEY, addressId);
      } catch {
        // Ignore storage write failures.
      }
    }
  };

  // Seller approval check (fetch from backend) - Only check, don't show toast
  const [isSeller, setIsSeller] = useState(false);
  const [isSellerLoading, setIsSellerLoading] = useState(false);
  const lastCheckedUidRef = useRef(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
    };
    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userDropdownOpen]);

  useEffect(() => {
    const uid = firebaseUser?.uid || null;
    if (!uid) {
      setIsSeller(false);
      setIsSellerLoading(false);
      lastCheckedUidRef.current = null;
      return;
    }
    if (lastCheckedUidRef.current === uid) {
      // Already checked for this UID; no need to re-call API
      return;
    }
    lastCheckedUidRef.current = uid;
    const checkSeller = async () => {
      setIsSellerLoading(true);
      try {
        const token = await firebaseUser.getIdToken(true);
        const { data } = await axios.get('/api/store/is-seller', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsSeller(!!data.isSeller);
        setIsSellerLoading(false);
      } catch (err) {
        try {
          const token2 = await firebaseUser.getIdToken(true);
          const { data } = await axios.get('/api/store/is-seller', {
            headers: { Authorization: `Bearer ${token2}` },
          });
          setIsSeller(!!data.isSeller);
          setIsSellerLoading(false);
        } catch {
          setIsSeller(false);
          setIsSellerLoading(false);
        }
      }
    };
    checkSeller();
  }, [firebaseUser?.uid]);

  const navbarSkeleton = (
    <>
      <div className="lg:hidden sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="h-8 w-28 animate-pulse rounded-md bg-gray-200" />
          <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
        </div>
      </div>

      <div className="relative z-50 hidden lg:block border-b border-gray-200 bg-white shadow-sm">
        <div className={`${NAVBAR_CONTAINER_CLASS} flex items-center justify-between gap-4 py-3`}>
          <div className="h-9 w-32 animate-pulse rounded-md bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="h-4 w-28 animate-pulse rounded-full bg-gray-100" />
            <div className="h-4 w-16 animate-pulse rounded-full bg-gray-100" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-gray-100" />
            <div className="h-4 w-20 animate-pulse rounded-full bg-gray-100" />
          </div>
          <div className="h-10 w-full max-w-[420px] animate-pulse rounded-full bg-gray-100" />
          <div className="flex items-center gap-3">
            <div className="h-4 w-16 animate-pulse rounded-full bg-gray-100" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-gray-100" />
            <div className="h-9 w-28 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>
      </div>
    </>
  );

  const desktopCategoriesDropdown = categoriesDropdownOpen && mainCategories.length > 0 ? (
    <div className="pointer-events-none absolute left-1/2 top-full z-[120] hidden -translate-x-1/2 lg:block">
      <div
        ref={categoriesDropdownPanelRef}
        className="pointer-events-auto relative mx-auto w-[min(1040px,calc(100vw-2rem))] pt-6 -mt-6"
        onMouseEnter={openCategoriesDropdown}
        onMouseLeave={closeCategoriesDropdown}
      >
        <div className="mt-0.5 overflow-hidden rounded-b-[28px] border border-slate-200 bg-white shadow-[0_20px_44px_rgba(15,23,42,0.16)]">
        <div className="grid min-h-0 max-h-[420px] grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div className="category-dropdown-scroll min-h-0 max-h-[420px] w-full max-w-[220px] shrink-0 overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white py-2">
            {mainCategories.map((category) => {
              const isActive = getCategoryId(activeCategory) === getCategoryId(category);
              return (
                <button
                  key={getCategoryId(category) || category?.slug || category?.name}
                  type="button"
                  onMouseEnter={() => setHoveredCategory(category)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] transition ${
                    isActive ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{getLocalizedCategoryDisplayName(category)}</span>
                  <span className="shrink-0 text-slate-400">›</span>
                </button>
              );
            })}
          </div>

          <div className="flex max-h-[420px] min-h-0 min-w-0 flex-col bg-white">
            <div className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[22px] font-semibold leading-tight text-slate-900">{getLocalizedCategoryDisplayName(activeCategory) || t('navbar.categories')}</p>
                <Link
                  href={getCategoryHref(activeCategory)}
                  className="text-xs font-semibold uppercase tracking-wide text-rose-600 hover:text-rose-700"
                >
                  {t('navbar.viewAll')}
                </Link>
              </div>
            </div>

            <div className="category-dropdown-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {activeSubcategories.length > 0 ? (
                <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3">
                  {activeSubcategories.map((subcategory) => {
                    const childCategories = getDirectChildCategories(categories, subcategory);
                    return (
                      <div key={getCategoryId(subcategory) || subcategory?.slug || subcategory?.name}>
                        <Link
                          href={getCategoryHref(subcategory)}
                          className="block text-sm font-semibold text-slate-900 transition hover:text-rose-600"
                        >
                          {getLocalizedCategoryDisplayName(subcategory)}
                        </Link>
                        {childCategories.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {childCategories.map((child) => (
                              <li key={getCategoryId(child) || child?.slug || child?.name}>
                                <Link
                                  href={getCategoryHref(child)}
                                  className="block text-sm text-slate-600 transition hover:text-rose-600"
                                >
                                  {getLocalizedCategoryDisplayName(child)}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                  <span>No child categories yet. Open this category to browse products.</span>
                  <Link
                    href={getCategoryHref(activeCategory)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Shop now
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {navbarAppearanceLoading ? navbarSkeleton : (
        <>
      {/* Mobile Header */}
      <nav
        className="lg:hidden sticky top-0 z-50 border-b shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
        style={{
          backgroundColor: mobileNavbarBackgroundColor,
          borderColor: 'rgba(15, 23, 42, 0.12)',
        }}
      >
        <div className="flex min-w-0 items-center gap-1 overflow-visible px-2 py-2 sm:gap-1.5 sm:px-3 sm:py-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mobileNavbarControlClass}`}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link
            href="/"
            onClick={handleLogoNavigation}
            className="flex shrink-0 items-center"
          >
            <Image
              src={mobileLogoSrc}
              alt={`${STOREFRONT_BRAND_NAME} logo`}
              width={navbarAppearance.logoWidth}
              height={navbarAppearance.logoHeight}
              className="h-7 w-auto max-w-[72px] object-contain sm:max-w-[96px]"
              style={{ maxHeight: '32px' }}
              priority
            />
          </Link>

          <form onSubmit={handleSearch} className="relative z-[70] min-w-0 flex-1">
            <div
              className={`relative flex h-9 min-w-0 items-center rounded-full pl-2.5 pr-1 sm:pl-3 ${
                mobileNavbarUsesBrandColor
                  ? 'bg-white shadow-[0_2px_10px_rgba(15,23,42,0.12)]'
                  : 'border border-gray-200 bg-gray-50'
              }`}
            >
              <input
                ref={mobileSearchInputRef}
                type="search"
                enterKeyHint="search"
                placeholder={searchPlaceholder || t('navbar.searchFragrances')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
              {search.trim() ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="mr-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200/70"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              ) : null}
              <button
                type="submit"
                aria-label="Search"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-90"
                style={{ backgroundColor: navbarAppearance.backgroundColor }}
              >
                <Search size={14} strokeWidth={2.5} />
              </button>
            </div>

            {renderSearchSuggestionsDropdown(
              'absolute left-0 right-0 top-full z-[80] mt-2 max-h-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl',
            )}
          </form>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {!isHomePage && (
            firebaseUser ? (
              renderAccountMenuTrigger({
                signedIn: true,
                onClick: () => setMobileMenuOpen(true),
                tone: mobileNavbarUsesBrandColor ? 'light' : 'dark',
                variant: 'icon',
                compactIcon: true,
              })
            ) : (
              renderAccountMenuTrigger({
                signedIn: false,
                onClick: () => {
                  setSignInMode('login');
                  setSignInOpen(true);
                },
                tone: mobileNavbarUsesBrandColor ? 'light' : 'dark',
                variant: 'icon',
                compactIcon: true,
              })
            )
          )}

          {navActionsVisibility.wishlist && renderLabeledNavAction({
            href: firebaseUser ? '/dashboard/wishlist' : '/wishlist',
            icon: HeartIcon,
            label: t('navbar.wishlist'),
            badgeCount: wishlistCount,
            tone: mobileNavbarUsesBrandColor ? 'light' : 'dark',
            iconOnly: true,
          })}

          {!isHomePage && navActionsVisibility.cart && renderLabeledNavAction({
            onClick: handleCartClick,
            icon: ShoppingCart,
            label: t('navbar.cart'),
            badgeCount: isClient ? cartCount : 0,
            tone: mobileNavbarUsesBrandColor ? 'light' : 'dark',
            iconOnly: true,
          })}
          </div>
        </div>
      </nav>

      {/* Original Full Navbar (Desktop only) */}
      <div
        className="relative z-50 hidden overflow-visible lg:block"
        onMouseLeave={categoriesDropdownOpen ? closeCategoriesDropdown : undefined}
      >
      <nav
        className="overflow-visible border-b text-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
        style={{
          backgroundColor: navbarAppearance.backgroundColor,
          borderColor: 'rgba(15, 23, 42, 0.18)',
        }}
      >
      <div className={NAVBAR_CONTAINER_CLASS}>
        <div className="flex min-w-0 items-center gap-2 py-2.5 lg:gap-3">
          {/* Left — logo */}
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {/* Hamburger Menu - Mobile Only on Home Page */}
            {isHomePage && (
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
                className="lg:hidden p-2 hover:bg-gray-100 rounded-full transition"
              >
                {mobileMenuOpen ? <X size={24} className="text-gray-900" /> : <Menu size={24} className="text-gray-900" />}
              </button>
            )}
            
            <Link
              href="/"
              onClick={handleLogoNavigation}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <Image
                src={navbarLogoSrc}
                alt={`${STOREFRONT_BRAND_NAME} logo`}
                width={navbarAppearance.logoWidth}
                height={navbarAppearance.logoHeight}
                className="h-auto w-auto max-w-[88px] object-contain flex-shrink-0 xl:max-w-[180px]"
                style={{ maxHeight: '50px' }}
                priority
              />
            </Link>

            <button
              type="button"
              onClick={handleDeliveryLocationClick}
              className="hidden items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition"
              style={{ borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full shadow-sm" style={{ backgroundColor: 'rgba(255,255,255,0.92)', color: '#111827' }}>
                <MapPin size={14} />
              </span>
              <span className="flex flex-col leading-tight min-w-0">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] opacity-70">{t('navbar.deliverTo')}</span>
                <span className="max-w-[130px] truncate text-xs font-semibold">{selectedDeliveryLabel}</span>
              </span>
            </button>
          </div>

          {/* Center — today's deals + search */}
          <div className="relative hidden min-w-0 flex-1 items-center justify-center gap-3 lg:flex xl:gap-4">
            {renderTodaysDealsButton({ variant: 'desktop' })}
            <div className="relative z-[70] min-w-0 w-full max-w-[440px] lg:max-w-[min(48vw,540px)] xl:max-w-[min(44vw,600px)] 2xl:max-w-[640px]">
            <form
              onSubmit={handleSearch}
              className="w-full"
            >
              <div
                className="flex h-[44px] w-full min-w-0 items-center overflow-hidden rounded-2xl border px-2 shadow-sm xl:px-3"
                style={{
                  borderColor: 'rgba(255,255,255,0.92)',
                  backgroundColor: '#ffffff',
                }}
              >
                <div
                  ref={categoriesTriggerRef}
                  className="flex shrink-0 items-center"
                  onMouseEnter={openCategoriesDropdown}
                >
                  <button
                    type="button"
                    className="group inline-flex items-center gap-1 rounded-xl px-1.5 py-1 text-[13px] font-medium leading-none text-slate-700 transition hover:bg-slate-50 xl:gap-1.5 xl:px-2"
                  >
                    <span className="hidden xl:inline">{t('navbar.categories')}</span>
                    <span className="xl:hidden">Cat</span>
                    <span className="text-[11px] text-slate-400 transition group-hover:translate-y-[1px]">▾</span>
                  </button>
                  <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200 xl:mx-2" />
                </div>
                <input
                  type="text"
                  placeholder={searchPlaceholder || t('navbar.searchFragrances')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  className="min-w-0 flex-1 bg-transparent text-[14px] leading-none text-slate-800 outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-slate-100"
                  style={{ color: navbarAppearance.backgroundColor }}
                  aria-label="Search"
                >
                  <Search size={15} />
                </button>
              </div>
            </form>
            {renderSearchSuggestionsDropdown(
              'absolute left-0 right-0 top-full z-[80] mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl',
            )}
            </div>
          </div>

          {/* Right — account + actions */}
          <div className="hidden min-w-0 shrink-0 items-center justify-end gap-1 lg:flex xl:gap-2">
            {firebaseUser ? (
              <div className="flex items-center">
              <div
                className="relative"
                ref={userDropdownRef}
              >
                {renderAccountMenuTrigger({
                  signedIn: true,
                  onClick: () => setUserDropdownOpen((prev) => !prev),
                  tone: 'light',
                })}
                {userDropdownOpen && (
                  <div className="absolute right-0 top-12 min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2">
                    {isSeller && (
                      <button
                        className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm"
                        onClick={() => router.push('/store')}
                      >
                        {t('navbar.sellerDashboard')}
                      </button>
                    )}
                    <Link href="/dashboard/profile" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>{t('navbar.profile')}</Link>
                    <Link href="/dashboard/security" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>Security</Link>
                    <Link href="/dashboard/orders" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>{t('navbar.orders')}</Link>
                    {storefrontWalletEnabled ? (
                    <Link href="/wallet" className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>
                      <Image src={WalletIcon} alt="" width={18} height={18} className="shrink-0 object-contain" aria-hidden="true" />
                      <span>{walletCoins > 0 ? formatWalletAmount(walletCoins) : t('navbar.wallet')}</span>
                    </Link>
                    ) : null}
                    <Link href="/dashboard/wishlist" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>{t('navbar.wishlist')}</Link>
                    <Link href="/dashboard/addresses" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>{t('navbar.addresses')}</Link>
                    <div className="my-1 border-t border-gray-200" />
                    <Link href="/dashboard/settings" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition text-sm" onClick={() => setUserDropdownOpen(false)}>{t('navbar.accountSettings')}</Link>
                    <button
                      className="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 transition text-sm font-medium"
                      onClick={() => openSignOutConfirm('desktop')}
                    >
                      {t('navbar.signOut')}
                    </button>
                  </div>
                )}
              </div>
              </div>
            ) : (
              renderAccountMenuTrigger({
                signedIn: false,
                onClick: () => {
                  setSignInMode('login');
                  setSignInOpen(true);
                },
                tone: 'light',
              })
            )}

            <span className="mx-1 hidden h-7 w-px shrink-0 bg-white/25 xl:mx-2 xl:block" aria-hidden="true" />

            <div className="flex min-w-0 shrink-0 items-center gap-3 xl:gap-4">
            {navActionsVisibility.orders && renderLabeledNavAction({
              href: '/dashboard/orders',
              onClick: handleOrdersClick,
              icon: Package,
              label: t('navbar.orders'),
              ariaLabel: t('navbar.orders'),
              tone: 'light',
            })}

            {navActionsVisibility.wishlist && renderLabeledNavAction({
              href: firebaseUser ? '/dashboard/wishlist' : '/wishlist',
              icon: HeartIcon,
              label: t('navbar.wishlist'),
              badgeCount: wishlistCount,
              ariaLabel: t('navbar.wishlist'),
              tone: 'light',
            })}

            {navActionsVisibility.cart && renderLabeledNavAction({
              onClick: handleCartClick,
              icon: ShoppingCart,
              label: t('navbar.cart'),
              badgeCount: isClient ? cartCount : 0,
              ariaLabel: t('navbar.cart'),
              tone: 'light',
            })}
            </div>
          </div>
        </div>
      </div>
      </nav>

      {desktopCategoriesDropdown}
      </div>



        {/* Mobile Overlay Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/60 z-[9999]" onClick={() => setMobileMenuOpen(false)}>
            <div 
              className="absolute top-0 left-0 w-3/4 max-w-sm h-full bg-white shadow-2xl p-6 flex flex-col gap-4 overflow-y-auto animate-slideIn" 
              onClick={(e) => e.stopPropagation()}
              style={{ animation: 'slideInLeft 0.3s ease-out' }}
            >
              {/* Header with Logo and Close Button */}
              <div className="flex items-center justify-between border-b border-gray-200 pb-4">
                <button type="button" onClick={handleLogoNavigation} className="flex min-w-0 max-w-[130px] items-center overflow-hidden">
                  <Image
                    src={mobileLogoSrc || navbarLogoSrc}
                    alt={`${STOREFRONT_BRAND_NAME} logo`}
                    width={navbarAppearance.logoWidth || 120}
                    height={navbarAppearance.logoHeight || 40}
                    className="h-8 w-auto max-w-[120px] object-contain"
                    style={{ maxHeight: '32px', maxWidth: '120px' }}
                  />
                </button>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 hover:bg-gray-100 rounded-full transition">
                  <X size={24} className="text-gray-600" />
                </button>
              </div>

              {/* User Section */}
              {firebaseUser === undefined ? null : !firebaseUser ? (
                <button
                  type="button"
                  className="w-full px-4 py-3 bg-white hover:bg-gray-100 text-black text-sm font-semibold rounded-full transition mb-4 flex items-center justify-center gap-2 shadow-md"
                  onClick={() => {
                    setSignInOpen(true);
                    setMobileMenuOpen(false);
                  }}
                >
                  <User className="w-5 h-5" />
                  <div className="flex flex-col leading-tight text-left">
                    <span>{t('navbar.login')} /</span>
                    <span>{t('navbar.signUp')}</span>
                  </div>
                </button>
              ) : (
                <div className="w-full px-4 py-3 bg-blue-50 text-blue-700 text-sm font-semibold rounded-full mb-4 flex items-center gap-2">
                  {firebaseUser.photoURL ? (
                    <Image src={firebaseUser.photoURL} alt="User" width={28} height={28} className="rounded-full object-cover" />
                  ) : (
                    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-600 text-white font-bold text-base">
                      {firebaseUser.displayName?.[0]?.toUpperCase() || firebaseUser.email?.[0]?.toUpperCase() || 'U'}
                    </span>
                  )}
                  <div className="flex flex-col leading-tight">
                    <span className="font-medium">Hi, {getUserGreetingName(firebaseUser)}</span>
                    {storefrontWalletEnabled && walletCoins > 0 ? (
                    <Link
                      href="/wallet"
                      className="mt-0 inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 border border-amber-200 rounded-full text-amber-800 text-[10px] font-semibold w-fit"
                      onClick={() => setMobileMenuOpen(false)}
                      aria-label={`Wallet balance ${formatWalletAmount(walletCoins)}`}
                    >
                      <Image src={WalletIcon} alt="" width={17} height={17} className="shrink-0 object-contain" aria-hidden="true" />
                      <span>{formatWalletAmount(walletCoins)}</span>
                    </Link>
                    ) : null}
                  </div>
                </div>
              )}

              {firebaseUser ? null : storefrontWalletEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setSignInMode('register');
                    setSignInOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 bg-amber-50 text-amber-800 text-sm font-semibold rounded-full mb-4 flex items-center gap-2"
                >
                  <Image src={WalletIcon} alt="" width={20} height={20} className="shrink-0 object-contain" aria-hidden="true" />
                  <span>{t('navbar.wallet')}</span>
                </button>
              ) : null}

              {/* Links */}
              <div className="flex flex-col gap-1">
                {firebaseUser && (
                  <>
                    <Link 
                      href="/dashboard/profile" 
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span>{t('navbar.profile')}</span>
                    </Link>
                    <Link 
                      href="/dashboard/security"
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span>Security</span>
                    </Link>
                    <Link
                      href="/dashboard/orders" 
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Package size={18} className="text-gray-600" />
                      <span>{t('navbar.myOrders')}</span>
                    </Link>
                    <Link 
                      href="/browse-history" 
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span>{t('navbar.browseHistory')}</span>
                    </Link>
                    <div className="px-4"><div className="h-px bg-gray-200 my-2" /></div>
                  </>
                )}
                <Link 
                  href="/top-selling" 
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.topSellingItems')}
                </Link>
                <Link 
                  href="/new" 
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.newArrivals')}
                </Link>

                <Link 
                  href="/5-star-rated" 
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <StarIcon size={18} className="text-white" fill="white" />
                  {t('navbar.fiveStarRated')}
                </Link>

                <Link 
                  href="/fast-delivery" 
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                  </svg>
                  {t('navbar.fastDelivery')}
                </Link>

                <Link 
                  href={firebaseUser ? "/dashboard/wishlist" : "/wishlist"}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <HeartIcon size={18} className="text-orange-500" />
                    <span>{t('navbar.wishlist')}</span>
                  </div>
                  {wishlistCount > 0 && (
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
                <Link 
                  href="/cart" 
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <ShoppingCart size={18} className="text-blue-600" />
                    <span>{t('navbar.cart')}</span>
                  </div>
                  {isClient && cartCount > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {cartCount}
                    </span>
                  )}
                </Link>
                {isSeller && navActionsVisibility.store && (
                  <Link 
                    href="/store" 
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-100 rounded-lg transition text-gray-700 font-medium"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full">Seller</span>
                    <span>{t('navbar.dashboard')}</span>
                  </Link>
                )}
              </div>

              {/* Support Section */}
              <div className="mt-auto pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2 px-4">{t('navbar.support')}</p>
                <Link 
                  href="/faq" 
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 rounded-lg transition text-gray-700 text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.faq')}
                </Link>
                <Link 
                  href="/support" 
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 rounded-lg transition text-gray-700 text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.support')}
                </Link>
                <Link 
                  href="/terms" 
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 rounded-lg transition text-gray-700 text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.termsAndConditions')}
                </Link>
                <Link 
                  href="/privacy-policy" 
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 rounded-lg transition text-gray-700 text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.privacyPolicy')}
                </Link>
                <Link 
                  href="/return-policy" 
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-100 rounded-lg transition text-gray-700 text-sm"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('navbar.returnPolicy')}
                </Link>
                
                {/* Sign Out Button - At Bottom */}
                {firebaseUser && (
                  <button
                    className="w-full text-left px-4 py-3 bg-red-50 hover:bg-red-100 rounded-lg transition text-red-600 font-medium mt-4"
                    onClick={() => openSignOutConfirm('mobile')}
                  >
                    {t('navbar.signOut')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}


          {signOutConfirmOpen && (
            <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={() => {
                  if (signingOut) return;
                  setSignOutConfirmOpen(false);
                  setSignOutAllDevices(false);
                }}
              />
              <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="absolute -left-12 -top-16 h-48 w-48 bg-rose-400/25 blur-3xl" />
                <div className="absolute -right-12 -bottom-16 h-48 w-48 bg-amber-300/25 blur-3xl" />
                <div className="relative p-6">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <LogOut size={26} />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 text-center">{t('navbar.readyToSignOut')}</h3>
                  <p className="mt-2 text-sm text-slate-600 text-center">{t('navbar.saveCartWishlist')}</p>
                  <label className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={signOutAllDevices}
                      disabled={signingOut}
                      onChange={(e) => setSignOutAllDevices(e.target.checked)}
                    />
                    <span>
                      Sign out of all devices
                      <span className="block text-xs text-slate-500">
                        Ends sessions everywhere and invalidates refresh tokens.
                      </span>
                    </span>
                  </label>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition disabled:opacity-60"
                      disabled={signingOut}
                      onClick={() => {
                        setSignOutConfirmOpen(false);
                        setSignOutAllDevices(false);
                      }}
                    >
                      {t('navbar.staySignedIn')}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200/50 hover:brightness-105 transition disabled:opacity-70"
                      disabled={signingOut}
                      onClick={handleSignOut}
                    >
                      {signingOut ? 'Signing out…' : t('navbar.signOut')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


      {/* Sign In Modal (always at Navbar root) */}
      {!firebaseUser && (
        <SignInModal
          open={signInOpen}
          onClose={() => setSignInOpen(false)}
          defaultMode={signInMode}
          bonusMessage="Register now and get 20 coins free bonus!"
        />
      )}
      {showAddressModal && firebaseUser && (
        <AddressModal
          open={showAddressModal}
          setShowAddressModal={setShowAddressModal}
          addressList={addressList}
          selectedAddressId={selectedAddressId}
          onSelectAddress={handleDeliveryAddressSelect}
          onAddressAdded={(address) => {
            const nextId = address?._id || address?.id || null;
            if (nextId) {
              handleDeliveryAddressSelect(nextId);
            }
            dispatch(fetchAddress({ getToken: async () => firebaseUser.getIdToken() }));
          }}
          onAddressUpdated={() => {
            dispatch(fetchAddress({ getToken: async () => firebaseUser.getIdToken() }));
          }}
        />
      )}
        </>
      )}
    </>
  );
};

export default Navbar;
