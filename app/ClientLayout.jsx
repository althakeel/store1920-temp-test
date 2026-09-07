"use client";
import { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import ReduxProvider from "@/lib/ReduxProvider";
import Navbar from "@/components/Navbar";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import DynamicMetaTags from "@/components/DynamicMetaTags";
import MetaPixel from "@/components/MetaPixel";
import TikTokPixel from "@/components/TikTokPixel";
import GtmPageView from "@/components/GtmPageView";
import { Toaster } from "react-hot-toast";

const SpinWheelWidget = dynamic(() => import("@/components/SpinWheelWidget"), { ssr: false });
const GiveawayCartManager = dynamic(() => import("@/components/GiveawayCartManager"), { ssr: false });
const AuthSessionGuard = dynamic(() => import("@/components/AuthSessionGuard"), { ssr: false });
const GoogleOneTap = dynamic(() => import("@/components/GoogleOneTap"), { ssr: false });

function DeferredWidgets() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const start = () => setReady(true);
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(start, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <>
      <GiveawayCartManager />
      <SpinWheelWidget />
    </>
  );
}

const STOREFRONT_HIDDEN_PREFIXES = ["/store", "/admin"];

function shouldHideStorefrontChrome(pathname) {
  return STOREFRONT_HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix));
}

export default function ClientLayout({ children, initialStorefrontLanguage = 'en' }) {
  const pathname = usePathname();
  const hideStorefrontChrome = shouldHideStorefrontChrome(pathname);
  const isCheckoutPage = pathname === '/checkout';

  return (
    <ReduxProvider>
      <Suspense fallback={null}>
        <GtmPageView />
        <MetaPixel />
        <TikTokPixel />
      </Suspense>
      {!hideStorefrontChrome && (
        <>
          <TopBar initialLanguage={initialStorefrontLanguage} />
          <Navbar />
        </>
      )}
      <Toaster
        position="top-center"
        containerClassName={hideStorefrontChrome ? 'store-toaster' : 'storefront-toaster'}
        containerStyle={{
          top: hideStorefrontChrome ? 24 : 0,
          bottom: hideStorefrontChrome ? 24 : 0,
          left: 0,
          right: 0,
          zIndex: 2147483000,
          pointerEvents: 'none',
        }}
        toastOptions={
          hideStorefrontChrome
            ? {
                duration: 2500,
                style: {
                  zIndex: 2147483000,
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  maxWidth: '28rem',
                  pointerEvents: 'auto',
                },
              }
            : {
                style: {
                  zIndex: 2147483000,
                  background: 'transparent',
                  boxShadow: 'none',
                  padding: 0,
                  maxWidth: '28rem',
                  pointerEvents: 'none',
                },
              }
        }
      />
      <DynamicMetaTags />
      <AuthSessionGuard />
      {!hideStorefrontChrome ? <GoogleOneTap /> : null}
      {children}
      {!hideStorefrontChrome && (
        <>
          <DeferredWidgets />
          <Footer />
        </>
      )}
    </ReduxProvider>
  );
}
