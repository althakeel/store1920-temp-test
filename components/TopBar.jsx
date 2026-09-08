'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, Check, Globe2, Phone } from 'lucide-react';
import { isProductDetailPath } from '@/lib/productUrl';
import {
  STORE1920_CUSTOMER_SUPPORT_PHONE,
  STORE1920_CUSTOMER_SUPPORT_TEL,
  formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
// import tabbyLogo from '@/assets/payments/tabby.webp';
import tamaraLogo from '@/assets/payments/tamara.webp';
import {
  STOREFRONT_LANGUAGE_EVENT,
  normalizeStorefrontLanguage,
  persistStorefrontLanguage,
  readPersistedStorefrontLanguage,
} from '@/lib/storefrontLanguage';
import { translateStaticText } from '@/lib/useStorefrontI18n';

const GCC_MARKETS = [
  { code: 'AE', countryName: 'United Arab Emirates', countryNameAr: 'الإمارات العربية المتحدة', currency: 'AED', flag: '🇦🇪' },
  { code: 'SA', countryName: 'Saudi Arabia', countryNameAr: 'المملكة العربية السعودية', currency: 'SAR', flag: '🇸🇦' },
  { code: 'QA', countryName: 'Qatar', countryNameAr: 'قطر', currency: 'QAR', flag: '🇶🇦' },
  { code: 'KW', countryName: 'Kuwait', countryNameAr: 'الكويت', currency: 'KWD', flag: '🇰🇼' },
  { code: 'OM', countryName: 'Oman', countryNameAr: 'عُمان', currency: 'OMR', flag: '🇴🇲' },
  { code: 'BH', countryName: 'Bahrain', countryNameAr: 'البحرين', currency: 'BHD', flag: '🇧🇭' },
];

const BNPL_PARTNERS = [
  { key: 'tamara', name: 'Tamara', nameAr: 'تمارا', logoUrl: tamaraLogo.src, logoWidth: 74 },
  // { key: 'tabby', name: 'Tabby', nameAr: 'تابي', logoUrl: tabbyLogo.src, logoWidth: 62 },
];

export default function TopBar({ initialLanguage = 'en' }) {
  const router = useRouter();
  const pathname = usePathname();
  const hideBnplBanner = isProductDetailPath(pathname);
  const { market: storefrontMarket, setMarketCode } = useStorefrontMarket();
  const [storefrontLanguage, setStorefrontLanguage] = useState(() => normalizeStorefrontLanguage(initialLanguage));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeBnplIndex, setActiveBnplIndex] = useState(0);
  const [bnplLogoError, setBnplLogoError] = useState({ tamara: false, tabby: false });
  const dropdownRef = useRef(null);
  const suppressToggleRef = useRef(false);
  const dropdownLeaveTimerRef = useRef(null);

  const clearDropdownLeaveTimer = () => {
    if (dropdownLeaveTimerRef.current) {
      window.clearTimeout(dropdownLeaveTimerRef.current);
      dropdownLeaveTimerRef.current = null;
    }
  };

  const closeDropdown = () => {
    clearDropdownLeaveTimer();
    suppressToggleRef.current = true;
    setDropdownOpen(false);
    window.setTimeout(() => {
      suppressToggleRef.current = false;
    }, 250);
  };

  const toggleDropdown = () => {
    if (suppressToggleRef.current) return;
    setDropdownOpen((value) => !value);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncLanguage = () => {
      setStorefrontLanguage(readPersistedStorefrontLanguage(initialLanguage));
    };

    const handleLanguageChange = (event) => {
      const nextLanguage = event?.detail?.language;
      setStorefrontLanguage(normalizeStorefrontLanguage(nextLanguage));
    };

    syncLanguage();
    window.addEventListener(STOREFRONT_LANGUAGE_EVENT, handleLanguageChange);

    return () => {
      window.removeEventListener(STOREFRONT_LANGUAGE_EVENT, handleLanguageChange);
    };
  }, [initialLanguage]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeDropdown();
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearDropdownLeaveTimer();
    };
  }, [dropdownOpen]);

  const handleDropdownMouseEnter = () => {
    clearDropdownLeaveTimer();
  };

  const handleDropdownMouseLeave = () => {
    if (!dropdownOpen) return;
    clearDropdownLeaveTimer();
    dropdownLeaveTimerRef.current = window.setTimeout(() => {
      closeDropdown();
    }, 120);
  };

  useEffect(() => {
    if (hideBnplBanner) return undefined;
    const flipIntervalId = window.setInterval(() => {
      setActiveBnplIndex((current) => (current + 1) % BNPL_PARTNERS.length);
    }, 3500);
    return () => window.clearInterval(flipIntervalId);
  }, [hideBnplBanner]);

  const handleLanguageChange = (lang) => {
    const nextLanguage = normalizeStorefrontLanguage(lang);
    setStorefrontLanguage(nextLanguage);
    if (typeof window !== 'undefined') {
      persistStorefrontLanguage(nextLanguage, { userChosen: true });
    }
    closeDropdown();
  };

  const handleMarketChange = (code) => {
    setMarketCode(code);
    closeDropdown();
  };

  const activeBnplPartner = BNPL_PARTNERS[activeBnplIndex];
  const isArabic = storefrontLanguage === 'ar';
  const t = (key) => translateStaticText(key, storefrontLanguage);
  const activeBnplPartnerName = isArabic ? activeBnplPartner.nameAr : activeBnplPartner.name;
  const paymentCount = activeBnplPartner.key === 'tabby' ? 12 : 4;
  const bnplBannerDesktop = isArabic
    ? (activeBnplPartner.key === 'tabby'
      ? `قسّم مشترياتك إلى ${paymentCount} دفعة شهرية مع ${activeBnplPartnerName}`
      : `قسّم مشترياتك إلى ${paymentCount} دفعات مع ${activeBnplPartnerName}`)
    : (activeBnplPartner.key === 'tabby'
      ? `Split your purchase into ${paymentCount} monthly payments with ${activeBnplPartnerName}`
      : `Split your purchase into ${paymentCount} payments with ${activeBnplPartnerName}`);
  const bnplBannerMobile = isArabic
    ? `ادفع على ${paymentCount} دفعات مع ${activeBnplPartnerName}`
    : `Pay in ${paymentCount} with ${activeBnplPartnerName}`;
  const languageLabel = isArabic ? 'العربية' : 'English';
  const languageShort = isArabic ? 'AR' : 'EN';
  const activeMarket = GCC_MARKETS.find((market) => market.code === storefrontMarket?.code) || GCC_MARKETS[0];
  const activeCountryName = isArabic ? activeMarket.countryNameAr : activeMarket.countryName;

  const copy = isArabic
    ? {
        language: 'اللغة',
        shopIn: 'تسوّق في',
        currency: 'العملة',
        shoppingIn: `أنت تتسوق في ${activeCountryName}.`,
      }
    : {
        language: 'Language',
        shopIn: 'Shop in',
        currency: 'Currency',
        shoppingIn: `You are shopping in ${activeCountryName}.`,
      };

  return (
    <div className="relative z-[1000] w-full border-b border-[#e7e7e7] bg-white text-xs">
      <div className="mx-auto flex max-w-[1400px] flex-nowrap items-center justify-between gap-1.5 px-2 py-1.5 sm:gap-3 sm:px-5 sm:py-1">
        <a
          href={STORE1920_CUSTOMER_SUPPORT_TEL}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-50/80 px-2 py-1 no-underline transition hover:border-slate-300 hover:bg-white sm:gap-2 sm:px-2.5 sm:py-1"
          aria-label={`${t('topbar.support')} ${STORE1920_CUSTOMER_SUPPORT_PHONE}`}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/15 sm:h-[18px] sm:w-[18px]">
            <Phone className="h-2.5 w-2.5 text-amber-600 sm:h-3 sm:w-3" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none tracking-[0.04em] text-slate-800 sm:text-xs">
            {formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE)}
          </span>
        </a>

        <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2.5">
          <div
            className="relative"
            ref={dropdownRef}
            onMouseEnter={handleDropdownMouseEnter}
            onMouseLeave={handleDropdownMouseLeave}
          >
            <button
              type="button"
              onClick={toggleDropdown}
              className="flex flex-nowrap items-center gap-1 rounded-md border border-[#e2e2e2] bg-white px-1.5 py-1 text-[11px] font-medium whitespace-nowrap sm:gap-2 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
              aria-expanded={dropdownOpen}
              aria-haspopup="true"
            >
              <Globe2 className="h-3.5 w-3.5 shrink-0 text-amber-600 sm:h-4 sm:w-4" />
              <span className="hidden font-semibold sm:inline">{languageLabel}</span>
              <span className="font-semibold sm:hidden">{languageShort}</span>
              <ChevronDown className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
              <span className="hidden items-center gap-1 border-l border-[#e2e2e2] pl-2 font-normal text-[#888] sm:inline-flex sm:pl-3">
                {storefrontMarket?.flag} {storefrontMarket?.currency}
              </span>
              <span className="text-[10px] font-normal text-[#888] sm:hidden">
                {storefrontMarket?.currency}
              </span>
            </button>

            {dropdownOpen && (
              <div className="absolute top-full end-0 z-[1001] w-[min(320px,calc(100vw-24px))] pt-2 sm:start-0 sm:end-auto sm:w-[320px]">
                <div
                  dir={isArabic ? 'rtl' : 'ltr'}
                  className="max-h-[min(72vh,520px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="border-b border-gray-100 px-4 py-4">
                    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                      {copy.language}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { value: 'ar', label: 'العربية' },
                        { value: 'en', label: 'English' },
                      ].map((option) => {
                        const isActive = storefrontLanguage === option.value;
                        return (
                          <label
                            key={option.value}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleLanguageChange(option.value);
                            }}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition ${
                              isActive
                                ? 'bg-orange-50 font-semibold text-orange-700 ring-1 ring-orange-200'
                                : 'text-gray-800 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-sm">{option.label}</span>
                            <input
                              type="radio"
                              name="lang"
                              checked={isActive}
                              readOnly
                              className="h-4 w-4 shrink-0 accent-orange-600 pointer-events-none"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-b border-gray-100 px-4 py-4">
                    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                      {copy.shopIn}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {GCC_MARKETS.map((market) => {
                        const isActive = storefrontMarket?.code === market.code;
                        const countryName = isArabic ? market.countryNameAr : market.countryName;
                        return (
                          <button
                            key={market.code}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              handleMarketChange(market.code);
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition ${
                              isActive
                                ? 'border-orange-300 bg-orange-50 text-orange-800 ring-1 ring-orange-200'
                                : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-lg leading-none">{market.flag}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                {market.code}
                              </span>
                              <span className="block truncate text-sm font-semibold">{countryName}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              <span className="text-sm font-semibold">{market.currency}</span>
                              {isActive ? <Check size={16} className="text-orange-600" strokeWidth={2.5} /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="px-4 py-3.5 text-sm text-gray-600">
                    <div className="font-semibold text-gray-800">
                      {copy.currency}: {storefrontMarket?.currency}
                    </div>
                    <div className="mt-1 leading-snug">{copy.shoppingIn}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.push('/track-order')}
            className="flex shrink-0 items-center rounded-md border border-[#e2e2e2] bg-white px-1.5 py-1 text-[11px] font-medium whitespace-nowrap sm:gap-1.5 sm:px-2.5 sm:py-1.5 sm:text-xs"
          >
            <span className="hidden sm:inline" role="img" aria-label="track order">🛒</span>
            <span className="sm:hidden">{t('topbar.track')}</span>
            <span className="hidden sm:inline">{t('topbar.trackOrder')}</span>
          </button>
        </div>
      </div>

      {!hideBnplBanner ? (
      <div className="overflow-hidden border-y border-[#ececec] bg-white">
        <div
          key={activeBnplPartner.key}
          className="mx-auto flex w-full max-w-[1400px] animate-[bnplFlip_560ms_ease-out] items-center justify-center gap-2 px-3 py-2 text-center sm:gap-2.5 sm:px-5"
        >
          {!bnplLogoError[activeBnplPartner.key] ? (
            <img
              src={activeBnplPartner.logoUrl}
              alt={activeBnplPartner.name}
              className="h-auto shrink-0"
              style={{ width: activeBnplPartner.logoWidth }}
              onError={() => setBnplLogoError((current) => ({ ...current, [activeBnplPartner.key]: true }))}
            />
          ) : (
            <span className="text-xs font-bold text-gray-900">{activeBnplPartner.name}</span>
          )}
          <span className="min-w-0 text-[11px] leading-snug text-gray-700 sm:text-xs">
            <span className="hidden sm:inline">{bnplBannerDesktop}</span>
            <span className="sm:hidden">{bnplBannerMobile}</span>
          </span>
        </div>
      </div>
      ) : null}

      <style>{`
        @keyframes bnplFlip {
          0% { opacity: 0; transform: rotateX(58deg) translateY(-4px); }
          100% { opacity: 1; transform: rotateX(0deg) translateY(0); }
        }
      `}</style>
    </div>
  );
}
