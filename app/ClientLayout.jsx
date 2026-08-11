"use client";
import { useEffect, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import ReduxProvider from "@/lib/ReduxProvider";
import Navbar from "@/components/Navbar";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import SupportBar from "@/components/SupportBar";
import DynamicMetaTags from "@/components/DynamicMetaTags";
import MetaPixel from "@/components/MetaPixel";
import TikTokPixel from "@/components/TikTokPixel";
import GtmPageView from "@/components/GtmPageView";
import { Toaster } from "react-hot-toast";

const SpinWheelWidget = dynamic(() => import("@/components/SpinWheelWidget"), { ssr: false });
const GiveawayCartManager = dynamic(() => import("@/components/GiveawayCartManager"), { ssr: false });
const AuthSessionGuard = dynamic(() => import("@/components/AuthSessionGuard"), { ssr: false });

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
        containerClassName="storefront-toaster"
        containerStyle={{
          top: 88,
          zIndex: 2147483000,
          pointerEvents: 'none',
        }}
        toastOptions={{
          style: {
            zIndex: 2147483000,
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
            maxWidth: '28rem',
            pointerEvents: 'none',
          },
        }}
      />
      <DynamicMetaTags />
      <AuthSessionGuard />
      {children}
      {!hideStorefrontChrome && (
        <>
          <DeferredWidgets />
          <SupportBar />
          <Footer />
        </>
      )}
    </ReduxProvider>
  );
}
