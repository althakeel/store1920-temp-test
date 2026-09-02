import "./globals.css";
import Script from "next/script";
import React from "react";
import { cookies, headers } from "next/headers";
import ClientLayout from "./ClientLayout";
import StorefrontLanguageInitScript from "@/components/StorefrontLanguageInitScript";
import EarlyHeadScripts from "@/components/EarlyHeadScripts";
import {
  STOREFRONT_LANGUAGE_COOKIE,
  detectLanguageFromAcceptLanguage,
} from "@/lib/storefrontLanguage";
import { GTM_ID, getGtmHeadScript, getGtmNoscriptSrc } from "@/lib/gtm";
import { META_PIXEL_ID, getMetaPixelBootstrapScript } from "@/lib/metaPixelConfig";
import { TIKTOK_PIXEL_ID, getTikTokPixelBootstrapScript } from "@/lib/tiktokPixelConfig";
import { GOOGLE_ADS_ID, getGoogleAdsGtagInitScript, getGoogleAdsGtagSrc } from "@/lib/googleAdsConfig";
import OrganizationJsonLd from "@/components/OrganizationJsonLd";
import { SITE_URL } from "@/lib/sitemapData";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "store1920 - Shop smarter",
  description:
    "Discover trending gadgets, fashion, home essentials & more at the best price. Fast delivery, secure checkout, and deals you don't want to miss.",
};

// Performance optimization - Prevent auto-zoom on mobile
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
  viewportFit: 'cover',
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const cookieLanguage = cookieStore.get(STOREFRONT_LANGUAGE_COOKIE)?.value;
  const acceptLanguage = String(requestHeaders.get('accept-language') || '');
  const storefrontLanguage = cookieLanguage === 'ar' || cookieLanguage === 'en'
    ? cookieLanguage
    : detectLanguageFromAcceptLanguage(acceptLanguage);
  const isArabic = storefrontLanguage === 'ar';
  const s3PublicUrl = process.env.AWS_S3_PUBLIC_URL || process.env.NEXT_PUBLIC_AWS_S3_PUBLIC_URL;
  let s3Origin = null;
  try {
    if (s3PublicUrl) s3Origin = new URL(s3PublicUrl).origin;
  } catch {}

  const imageKitEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  let imageKitOrigin = null;
  try {
    if (imageKitEndpoint) imageKitOrigin = new URL(imageKitEndpoint).origin;
  } catch {}

  return (
    <html
      lang={storefrontLanguage}
      dir={isArabic ? 'rtl' : 'ltr'}
      suppressHydrationWarning
    >
      <head>
        {/* S3 media preconnect */}
        {s3Origin && (
          <>
            <link rel="dns-prefetch" href={s3Origin} />
            <link rel="preconnect" href={s3Origin} crossOrigin="anonymous" />
          </>
        )}
        {imageKitOrigin && (
          <>
            <link rel="dns-prefetch" href={imageKitOrigin} />
            <link rel="preconnect" href={imageKitOrigin} crossOrigin="anonymous" />
          </>
        )}
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Shadows+Into+Light&display=swap"
        />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="preconnect" href="https://connect.facebook.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://analytics.tiktok.com" />
        <link rel="preconnect" href="https://analytics.tiktok.com" crossOrigin="anonymous" />
        <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml" />
      </head>
      <body className="overflow-x-clip antialiased" suppressHydrationWarning>
        <EarlyHeadScripts />
        <Script
          id="google-tag-manager"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: getGtmHeadScript(GTM_ID),
          }}
        />
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src={getGtmNoscriptSrc(GTM_ID)}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <StorefrontLanguageInitScript />
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: getMetaPixelBootstrapScript(META_PIXEL_ID),
          }}
        />
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: getTikTokPixelBootstrapScript(TIKTOK_PIXEL_ID),
          }}
        />
        <Script
          id="google-ads-gtag-loader"
          src={getGoogleAdsGtagSrc(GOOGLE_ADS_ID)}
          strategy="afterInteractive"
        />
        <Script
          id="google-ads-gtag"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: getGoogleAdsGtagInitScript(GOOGLE_ADS_ID),
          }}
        />
        {/* Add Navbar and Footer globally via ClientLayout */}
        <ClientLayout initialStorefrontLanguage={storefrontLanguage}>{children}</ClientLayout>
        <OrganizationJsonLd />
      </body>
    </html>
  );
}
