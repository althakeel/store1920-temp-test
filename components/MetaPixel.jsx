"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { META_PIXEL_ID } from "@/lib/metaPixelConfig";
import { trackPageView } from "@/lib/metaPixelTracking";
import { ensureMetaClickId } from "@/lib/metaBrowserAttribution";

export default function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;

    if (window.fbq) {
      window.fbq('set', 'autoConfig', false, META_PIXEL_ID);
    }

    const pathOnly = pathname.split('?')[0];
    if (pathOnly === '/order-success') return;
    if (
      pathOnly.startsWith('/store')
      || pathOnly.startsWith('/admin')
      || pathOnly.startsWith('/dashboard')
    ) return;

    ensureMetaClickId();
    trackPageView({ pagePath: pathOnly });
  }, [pathname]);

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
