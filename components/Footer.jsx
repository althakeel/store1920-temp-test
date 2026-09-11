"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { HOME_SECTION_INNER_CLASS } from '@/lib/storefrontCarousel';
import {
    STORE1920_SUPPORT_EMAIL,
    STORE1920_CUSTOMER_SUPPORT_PHONE,
    STORE1920_CUSTOMER_SUPPORT_TEL,
    formatCustomerSupportPhoneDisplay,
} from '@/lib/storeContact';
import {
    STORE1920_LEGAL_NAME,
    getRegisteredOfficeLines,
    getFulfilmentAddressLines,
    STORE1920_SOCIAL_LINKS,
} from '@/lib/businessIdentity';

const FOOTER_PAYMENT_METHODS = [
    { id: 'visa', label: 'Visa', src: '/payments/visa.png' },
    { id: 'mastercard', label: 'Mastercard', src: '/payments/mastercard.png' },
    { id: 'tabby', label: 'Tabby', src: '/payments/tabby.png' },
    { id: 'tamara', label: 'Tamara', src: '/payments/tamara.png' },
    { id: 'cod', label: 'Cash on Delivery', src: '/payments/cod.png' },
];

/** Same key as Navbar — never flash a bundled static logo while loading. */
const NAVBAR_APPEARANCE_CACHE_KEY = 'navbarAppearanceCache';

function resolveFooterLogoFromAppearance(data = {}) {
    const sameAsNavbar = data?.footerLogoSameAsNavbar !== false;
    const customFooterUrl = String(data?.footerLogoUrl || '').trim();
    const navbarLogoUrl = String(data?.logoUrl || '').trim();
    const resolvedFromApi = String(data?.resolvedFooterLogoUrl || '').trim();
    const logoUrl = resolvedFromApi
        || (sameAsNavbar ? navbarLogoUrl : (customFooterUrl || navbarLogoUrl));
    const widthSource = sameAsNavbar ? data?.logoWidth : (data?.footerLogoWidth ?? data?.logoWidth);
    const heightSource = sameAsNavbar ? data?.logoHeight : (data?.footerLogoHeight ?? data?.logoHeight);
    return {
        logoUrl,
        logoWidth: Number(widthSource) > 0 ? Number(widthSource) : 160,
        logoHeight: Number(heightSource) > 0 ? Number(heightSource) : 40,
    };
}

const Footer = () => {
    const { t, isArabic } = useStorefrontI18n();

    const [footerLogo, setFooterLogo] = useState({
        logoUrl: '',
        logoWidth: 160,
        logoHeight: 40,
    });
    const [footerLogoLoading, setFooterLogoLoading] = useState(true);
    const [appComingSoonOpen, setAppComingSoonOpen] = useState(false);
    const [portalReady, setPortalReady] = useState(false);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!appComingSoonOpen) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') setAppComingSoonOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [appComingSoonOpen]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                const raw = window.localStorage.getItem(NAVBAR_APPEARANCE_CACHE_KEY);
                if (raw) {
                    const cached = JSON.parse(raw);
                    const resolved = resolveFooterLogoFromAppearance(cached);
                    if (resolved.logoUrl) {
                        setFooterLogo(resolved);
                        setFooterLogoLoading(false);
                    }
                }
            } catch {
                // Ignore cache parse issues.
            }
        }

        const fetchNavbarAppearance = async () => {
            try {
                const response = await fetch('/api/store/navbar-menu', {
                    cache: 'no-store',
                });
                if (!response.ok) return;
                const data = await response.json();
                setFooterLogo(resolveFooterLogoFromAppearance(data));
            } catch {
                // Keep skeleton / text — never flash a bundled static logo.
            } finally {
                setFooterLogoLoading(false);
            }
        };

        fetchNavbarAppearance();

        const handleNavbarAppearanceUpdate = (event) => {
            const detail = event?.detail || {};
            setFooterLogo((prev) => resolveFooterLogoFromAppearance({
                logoUrl: typeof detail.logoUrl === 'string' ? detail.logoUrl : prev.logoUrl,
                logoWidth: typeof detail.logoWidth === 'number' ? detail.logoWidth : prev.logoWidth,
                logoHeight: typeof detail.logoHeight === 'number' ? detail.logoHeight : prev.logoHeight,
                footerLogoSameAsNavbar: detail.footerLogoSameAsNavbar,
                footerLogoUrl: detail.footerLogoUrl,
                footerLogoWidth: detail.footerLogoWidth,
                footerLogoHeight: detail.footerLogoHeight,
                resolvedFooterLogoUrl: detail.resolvedFooterLogoUrl,
            }));
            setFooterLogoLoading(false);
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('navbarAppearanceUpdated', handleNavbarAppearanceUpdate);
            }
        };
    }, []);

    const MailIcon = () => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M14.6654 4.66699L8.67136 8.48499C8.46796 8.60313 8.23692 8.66536 8.0017 8.66536C7.76647 8.66536 7.53544 8.60313 7.33203 8.48499L1.33203 4.66699M2.66536 2.66699H13.332C14.0684 2.66699 14.6654 3.26395 14.6654 4.00033V12.0003C14.6654 12.7367 14.0684 13.3337 13.332 13.3337H2.66536C1.92898 13.3337 1.33203 12.7367 1.33203 12.0003V4.00033C1.33203 3.26395 1.92898 2.66699 2.66536 2.66699Z" stroke="#90A1B9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> </svg>)
    const PhoneIcon = () => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M9.22003 11.045C9.35772 11.1082 9.51283 11.1227 9.65983 11.086C9.80682 11.0493 9.93692 10.9636 10.0287 10.843L10.2654 10.533C10.3896 10.3674 10.5506 10.233 10.7357 10.1404C10.9209 10.0479 11.125 9.99967 11.332 9.99967H13.332C13.6857 9.99967 14.0248 10.1402 14.2748 10.3902C14.5249 10.6402 14.6654 10.9794 14.6654 11.333V13.333C14.6654 13.6866 14.5249 14.0258 14.2748 14.2758C14.0248 14.5259 13.6857 14.6663 13.332 14.6663C10.1494 14.6663 7.09719 13.4021 4.84675 11.1516C2.59631 8.90119 1.33203 5.84894 1.33203 2.66634C1.33203 2.31272 1.47251 1.97358 1.72256 1.72353C1.9726 1.47348 2.31174 1.33301 2.66536 1.33301H4.66536C5.01899 1.33301 5.35812 1.47348 5.60817 1.72353C5.85822 1.97358 5.9987 2.31272 5.9987 2.66634V4.66634C5.9987 4.87333 5.9505 5.07749 5.85793 5.26263C5.76536 5.44777 5.63096 5.60881 5.46536 5.73301L5.15336 5.96701C5.03098 6.06046 4.94471 6.1934 4.90923 6.34324C4.87374 6.49308 4.89122 6.65059 4.9587 6.78901C5.86982 8.63959 7.36831 10.1362 9.22003 11.045Z" stroke="#90A1B9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> </svg>)
    const MapPinIcon = () => (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M13.3346 6.66634C13.3346 9.99501 9.64197 13.4617 8.40197 14.5323C8.28645 14.6192 8.14583 14.6662 8.0013 14.6662C7.85677 14.6662 7.71615 14.6192 7.60064 14.5323C6.36064 13.4617 2.66797 9.99501 2.66797 6.66634C2.66797 5.25185 3.22987 3.8953 4.23007 2.89511C5.23026 1.89491 6.58681 1.33301 8.0013 1.33301C9.41579 1.33301 10.7723 1.89491 11.7725 2.89511C12.7727 3.8953 13.3346 5.25185 13.3346 6.66634Z" stroke="#90A1B9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> <path d="M8.0013 8.66634C9.10587 8.66634 10.0013 7.77091 10.0013 6.66634C10.0013 5.56177 9.10587 4.66634 8.0013 4.66634C6.89673 4.66634 6.0013 5.56177 6.0013 6.66634C6.0013 7.77091 6.89673 8.66634 8.0013 8.66634Z" stroke="#90A1B9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> </svg>)
    const FacebookIcon = () => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M14.9987 1.66699H12.4987C11.3936 1.66699 10.3338 2.10598 9.55242 2.88738C8.77102 3.66878 8.33203 4.72859 8.33203 5.83366V8.33366H5.83203V11.667H8.33203V18.3337H11.6654V11.667H14.1654L14.9987 8.33366H11.6654V5.83366C11.6654 5.61265 11.7532 5.40068 11.9094 5.2444C12.0657 5.08812 12.2777 5.00033 12.4987 5.00033H14.9987V1.66699Z" stroke="#90A1B9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> </svg>)
    const InstagramIcon = () => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M14.5846 5.41699H14.593M5.83464 1.66699H14.168C16.4692 1.66699 18.3346 3.53247 18.3346 5.83366V14.167C18.3346 16.4682 16.4692 18.3337 14.168 18.3337H5.83464C3.53345 18.3337 1.66797 16.4682 1.66797 14.167V5.83366C1.66797 3.53247 3.53345 1.66699 5.83464 1.66699ZM13.3346 9.47533C13.4375 10.1689 13.319 10.8772 12.9961 11.4995C12.6732 12.1218 12.1623 12.6265 11.536 12.9417C10.9097 13.2569 10.2 13.3667 9.50779 13.2553C8.81557 13.1439 8.1761 12.8171 7.68033 12.3213C7.18457 11.8255 6.85775 11.1861 6.74636 10.4938C6.63497 9.80162 6.74469 9.0919 7.05991 8.46564C7.37512 7.83937 7.87979 7.32844 8.50212 7.00553C9.12445 6.68261 9.83276 6.56415 10.5263 6.66699C11.2337 6.7719 11.8887 7.10154 12.3944 7.60725C12.9001 8.11295 13.2297 8.76789 13.3346 9.47533Z" stroke="#90A1B9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> </svg>)
    const TikTokIcon = () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14.5 3c.5 2.6 2.1 4.4 4.7 4.8v3.1c-1.6.1-3.1-.4-4.4-1.3v5.7c0 3.6-2.9 6.5-6.5 6.5S1.8 18.9 1.8 15.3 4.7 8.8 8.3 8.8c.4 0 .8 0 1.2.1v3.2c-.4-.1-.8-.2-1.2-.2-1.8 0-3.3 1.5-3.3 3.4s1.5 3.4 3.3 3.4 3.3-1.5 3.3-3.4V3h2.9z" stroke="#90A1B9" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
    const PinterestIcon = () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2.5c-5.2 0-9.5 4.2-9.5 9.5 0 4 2.5 7.4 6 8.7-.1-.7-.2-1.9 0-2.7.2-.7 1.4-5.9 1.4-5.9s-.3-.7-.3-1.7c0-1.6.9-2.8 2.1-2.8 1 0 1.5.7 1.5 1.6 0 1-.6 2.4-.9 3.8-.3 1.1.5 2 1.6 2 2 0 3.4-2.5 3.4-5.5 0-2.3-1.5-3.9-4.3-3.9-3.1 0-5.1 2.3-5.1 4.9 0 .9.3 1.8.7 2.3.1.1.1.2.1.3l-.3 1.1c0 .2-.1.2-.3.1-1.3-.6-1.9-2.1-1.9-3.8 0-2.8 2.4-6.2 7.1-6.2 3.8 0 6.3 2.7 6.3 5.7 0 3.9-2.2 6.8-5.4 6.8-1.1 0-2.1-.6-2.4-1.2l-.7 2.5c-.2.9-.9 2-1.3 2.7 1.1.3 2.3.5 3.5.5 5.2 0 9.5-4.2 9.5-9.5S17.2 2.5 12 2.5z" stroke="#90A1B9" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    )
    const SnapchatIcon = () => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 3.2c2.7 0 4.7 1.9 4.7 4.9v1.3c0 .4.1.8.4 1.1.5.5 1.3.7 2 .5.2 0 .4.2.3.4-.4 1.1-1.5 1.7-2.4 2.2-.4.2-.7.5-.7.9 0 .5.5 1 1.1 1.3.9.4 1.9.7 2.2 1.1.2.3 0 .7-.3.8-1 .4-1.7.2-2.4 0-.3-.1-.6-.1-.9.1-.7.5-1.6 1.2-2.6 1.5-.2.1-.4.1-.6.1h-.8c-.2 0-.4 0-.6-.1-1-.3-1.9-1-2.6-1.5-.3-.2-.6-.2-.9-.1-.7.2-1.4.4-2.4 0-.3-.1-.5-.5-.3-.8.3-.4 1.3-.7 2.2-1.1.6-.3 1.1-.8 1.1-1.3 0-.4-.3-.7-.7-.9-.9-.5-2-1.1-2.4-2.2-.1-.2.1-.4.3-.4.7.2 1.5 0 2-.5.3-.3.4-.7.4-1.1V8.1c0-3 2-4.9 4.7-4.9z" stroke="#90A1B9" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    )
    const GooglePlayIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.25 2.8L13.88 13.43L3.28 20.05C3.1 19.76 3 19.42 3 19.05V3.79C3 3.43 3.09 3.09 3.25 2.8Z" fill="#22D3EE"/><path d="M16.22 10.95L19.8 8.74C20.29 8.44 20.29 7.72 19.8 7.42L15.5 4.75L13.88 13.43L16.22 10.95Z" fill="#F59E0B"/><path d="M15.5 4.75L3.25 2.8C3.42 2.52 3.68 2.29 4 2.11L16.22 10.95L13.88 13.43L15.5 4.75Z" fill="#34D399"/><path d="M16.22 10.95L4 21.73C3.67 21.55 3.41 21.31 3.23 21.02L13.88 13.43L16.22 10.95Z" fill="#F43F5E"/></svg>)
    const AppleIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.93 3.54C16.6 2.73 17.09 1.62 17 0.5C16 0.54 14.8 1.16 14.11 1.97C13.49 2.69 12.94 3.83 13.06 4.92C14.18 5.01 15.25 4.37 15.93 3.54Z" fill="#E2E8F0"/><path d="M20.4 17.15C19.98 18.08 19.79 18.49 19.25 19.32C18.5 20.49 17.45 21.95 16.15 21.97C15 21.98 14.7 21.2 13.15 21.21C11.59 21.22 11.26 21.99 10.1 21.98C8.8 21.96 7.81 20.64 7.06 19.47C4.96 16.2 4.74 12.36 6.03 10.38C6.94 8.96 8.38 8.13 9.74 8.13C11.13 8.13 12 8.93 13.12 8.93C14.22 8.93 14.9 8.13 16.49 8.13C17.7 8.13 18.98 8.79 19.89 9.94C16.91 11.58 17.39 15.83 20.4 17.15Z" fill="#E2E8F0"/></svg>)

    const linkSections = [
        {
            title: t('footer.shop'),
            links: [
                { text: t('footer.allProducts'), path: '/shop' },
                { text: t('footer.todaysDeals'), path: '/offers' },
                { text: t('footer.newArrivals'), path: '/new-arrivals' },
            ],
        },
        {
            title: t('footer.customerCare'),
            links: [
                { text: t('footer.trackOrder'), path: '/track-order' },
                { text: t('footer.myOrders'), path: '/orders' },
                { text: t('footer.myWishlist'), path: '/wishlist' },
                { text: t('footer.faq'), path: '/faq' },
                { text: t('footer.support'), path: '/support' },
                { text: t('footer.contactUs'), path: '/contact-us' },
            ],
        },
        {
            title: t('footer.legalInfo'),
            links: [
                { text: t('footer.termsAndConditions'), path: '/terms-and-conditions' },
                { text: t('footer.termsOfSale'), path: '/terms-of-sale' },
                { text: t('footer.shippingPolicy'), path: '/shipping-policy' },
                { text: t('footer.privacyPolicy'), path: '/privacy-policy' },
                { text: t('footer.returnRefund'), path: '/return-policy' },
                { text: t('footer.warrantyPolicy'), path: '/warranty-policy' },
                { text: t('footer.sitemap'), path: '/sitemap' },
            ],
        },
        {
            title: t('footer.aboutStore'),
            links: [
                { text: t('footer.aboutUs'), path: '/about-us' },
                { text: t('footer.blog'), path: '/blogs' },
                { text: t('footer.businessInformation'), path: '/business-information' },
                { text: t('footer.careers'), path: '/careers' },
            ],
        },
    ];

    const socialIcons = [
        { icon: FacebookIcon, link: STORE1920_SOCIAL_LINKS.facebook, label: 'Facebook' },
        { icon: InstagramIcon, link: STORE1920_SOCIAL_LINKS.instagram, label: 'Instagram' },
        { icon: TikTokIcon, link: STORE1920_SOCIAL_LINKS.tiktok, label: 'TikTok' },
        // Pinterest hidden for now
        { icon: SnapchatIcon, link: STORE1920_SOCIAL_LINKS.snapchat, label: 'Snapchat' },
    ];
    const phoneDisplay = formatCustomerSupportPhoneDisplay(STORE1920_CUSTOMER_SUPPORT_PHONE);
    const registeredOfficeLines = getRegisteredOfficeLines();
    const fulfilmentAddressLines = getFulfilmentAddressLines();

    const appDownloadLinks = [
        {
            icon: GooglePlayIcon,
            title: t('footer.getItOn'),
            platform: t('footer.googlePlay'),
        },
        {
            icon: AppleIcon,
            title: t('footer.downloadOnThe'),
            platform: t('footer.appStore'),
        },
    ];

    const renderAppComingSoonPopup = () => {
        if (!appComingSoonOpen || !portalReady) return null;

        return createPortal(
            <div
                className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4"
                onClick={() => setAppComingSoonOpen(false)}
                role="dialog"
                aria-modal="true"
                aria-label={t('footer.comingSoon')}
            >
                <div
                    className="w-full max-w-[280px] rounded-2xl bg-white px-5 py-4 text-center shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <p className="text-base font-semibold text-slate-900">{t('footer.comingSoon')}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {t('footer.appComingSoonMessage')}
                    </p>
                    <button
                        type="button"
                        onClick={() => setAppComingSoonOpen(false)}
                        className="mt-4 h-10 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                        OK
                    </button>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <footer className="bg-black text-slate-200 border-t border-slate-800 pt-0 pb-[5.25rem] lg:pb-12 lg:pt-12" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className={HOME_SECTION_INNER_CLASS}>
                <div className="py-2 grid grid-cols-2 gap-2 md:grid-cols-2 lg:grid-cols-6 md:gap-4 lg:gap-6">
                    <div className="col-span-2 lg:col-span-2">
                        {footerLogoLoading ? (
                            <div
                                className="mb-4 animate-pulse rounded-md bg-slate-700/80"
                                style={{
                                    width: Math.min(Number(footerLogo.logoWidth) || 160, 180),
                                    height: Math.min(Number(footerLogo.logoHeight) || 40, 48),
                                }}
                                aria-hidden="true"
                            />
                        ) : footerLogo.logoUrl ? (
                            <Link href="/" className="inline-block mb-4">
                                <Image
                                    src={footerLogo.logoUrl}
                                    alt="Store1920 Logo"
                                    width={footerLogo.logoWidth || 160}
                                    height={footerLogo.logoHeight || 40}
                                    className="object-contain"
                                    priority
                                />
                            </Link>
                        ) : (
                            <Link href="/" className="mb-4 inline-block text-lg font-semibold tracking-tight text-white">
                                store1920
                            </Link>
                        )}
                        <p className="text-sm text-slate-400 leading-relaxed mb-3 max-w-sm">
                            {t('footer.description')}
                        </p>
                        <p className="text-xs text-slate-500 mb-6 max-w-sm">
                            {t('footer.operatedBy', { legalName: STORE1920_LEGAL_NAME })}
                        </p>
                        <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-2 text-sm">
                                <PhoneIcon />
                                <a href={STORE1920_CUSTOMER_SUPPORT_TEL} className="text-slate-400 hover:text-white transition">
                                    {phoneDisplay}
                                </a>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <MailIcon />
                                <a href={`mailto:${STORE1920_SUPPORT_EMAIL}`} className="text-slate-400 hover:text-white transition">
                                    {STORE1920_SUPPORT_EMAIL}
                                </a>
                            </div>
                            <div className="flex items-start gap-2 text-sm">
                                <MapPinIcon />
                                <span className="text-slate-400 leading-relaxed">
                                    <span className="block text-[11px] uppercase tracking-wide text-slate-500">
                                        {t('footer.registeredOffice')}
                                    </span>
                                    {registeredOfficeLines.map((line) => (
                                        <span key={`office-${line}`} className="block">{line}</span>
                                    ))}
                                    <span className="mt-2 block text-[11px] uppercase tracking-wide text-slate-500">
                                        {t('footer.fulfilmentReturns')}
                                    </span>
                                    {fulfilmentAddressLines.map((line) => (
                                        <span key={`fulfilment-${line}`} className="block">{line}</span>
                                    ))}
                                </span>
                            </div>
                        </div>
                        <div className="mb-6 flex flex-wrap items-center gap-2.5" aria-label={t('footer.paymentMethods')}>
                            {FOOTER_PAYMENT_METHODS.map((method) => (
                                <span
                                    key={method.id}
                                    className="inline-flex h-8 items-center justify-center sm:h-9"
                                    title={method.label}
                                >
                                    <Image
                                        src={method.src}
                                        alt={method.label}
                                        width={88}
                                        height={36}
                                        className="h-8 w-auto max-w-[96px] object-contain sm:h-9"
                                    />
                                </span>
                            ))}
                        </div>
                        {/* App download buttons hidden for now (coming-soon placeholders). */}
                        {false ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {appDownloadLinks.map((item) => (
                                <button
                                    key={item.platform}
                                    type="button"
                                    onClick={() => setAppComingSoonOpen(true)}
                                    className="group min-w-[156px] h-12 px-3 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition flex items-center gap-2 text-start"
                                    aria-label={item.platform}
                                >
                                    <item.icon />
                                    <span className="flex flex-col leading-tight">
                                        <span className="text-[10px] text-slate-400 group-hover:text-slate-300">{item.title}</span>
                                        <span className="text-sm text-slate-100 font-semibold">{item.platform}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                        ) : null}
                    </div>

                    {linkSections.map((section) => (
                        <div key={section.title}>
                            <h3 className="text-white font-semibold text-sm mb-4 tracking-wider">{section.title}</h3>
                            <ul className="space-y-3">
                                {section.links.map((link) => (
                                    <li key={link.path}>
                                        <Link
                                            href={link.path}
                                            className="text-sm text-slate-400 hover:text-white transition inline-block"
                                        >
                                            {link.text}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="border-t border-slate-800 py-8 mt-4 w-full flex flex-col items-center justify-end">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 w-full">
                        <div className="flex items-center justify-center lg:justify-start gap-3">
                            {socialIcons.map((item) => (
                                <Link
                                    href={item.link}
                                    key={item.label}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={item.label}
                                    title={item.label}
                                    className="flex items-center justify-center w-8 h-8 bg-white/5 hover:bg-white/10 border border-slate-800 hover:border-slate-700 transition rounded-lg"
                                >
                                    <item.icon />
                                </Link>
                            ))}
                        </div>
                        <p className="text-sm text-slate-500 text-center">
                            {t('footer.copyright', { year: new Date().getFullYear() })}
                        </p>
                    </div>
                </div>
            </div>
            {renderAppComingSoonPopup()}
        </footer>
    );
};

export default Footer;