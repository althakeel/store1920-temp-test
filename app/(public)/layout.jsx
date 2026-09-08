
'use client'
import MobileBottomNav from "@/components/MobileBottomNav";
import GuestOrderLinker from "@/components/GuestOrderLinker";
import dynamic from "next/dynamic";
import { useEffect, Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isProductDetailPath } from "@/lib/productUrl";

const UtmTracker = dynamic(() => import("@/components/UtmTracker"), { ssr: false });
const EmailTrackCapture = dynamic(() => import("@/components/EmailTrackCapture"), { ssr: false });
const AdsAttribution = dynamic(() => import("@/components/AdsAttribution"), { ssr: false });
const CustomerSessionTracker = dynamic(() => import("@/components/CustomerSessionTracker"), { ssr: false });
const HeatmapClickTracker = dynamic(() => import("@/components/HeatmapClickTracker"), { ssr: false });

function DeferredTrackers() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const start = () => setReady(true);
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            const id = window.requestIdleCallback(start, { timeout: 2500 });
            return () => window.cancelIdleCallback(id);
        }
        const timer = setTimeout(start, 1500);
        return () => clearTimeout(timer);
    }, []);

    if (!ready) return null;

    return (
        <>
            <UtmTracker />
            <EmailTrackCapture />
            <AdsAttribution />
            <CustomerSessionTracker />
            <HeatmapClickTracker />
        </>
    );
}

function PublicLayoutContent({ children }) {
    const pathname = usePathname();
    const isCheckout = pathname === '/checkout';
    const isCartPage = pathname === '/cart';
    const isProductPage = isProductDetailPath(pathname);
    const isHomePage = pathname === '/';
    const showMobileBottomNav = !isCheckout && !isProductPage;
    const mobileMainPadding = isProductPage
        ? 'pb-0'
        : isCheckout
            ? 'pb-8'
            : isHomePage
                ? 'pb-0'
                : 'pb-[5.25rem]';

    return (
        <div className={`flex flex-col ${isCartPage || isProductPage ? '' : 'min-h-screen'}`}>
            <GuestOrderLinker />
            <DeferredTrackers />
            <main className={`${isProductPage ? '' : 'flex flex-1 flex-col'} min-w-0 overflow-x-clip ${mobileMainPadding} lg:pb-0`}>{children}</main>
            {showMobileBottomNav && <MobileBottomNav />}
        </div>
    );
}

function PublicLayoutAuthed({ children }) {
    return (
        <Suspense fallback={<div className="flex flex-col"><GuestOrderLinker /><main className="flex-1 pb-[5.25rem] lg:pb-0">{children}</main></div>}>
            <PublicLayoutContent>{children}</PublicLayoutContent>
        </Suspense>
    );
}

export default function PublicLayout(props) {
    return <PublicLayoutAuthed {...props} />;
}
