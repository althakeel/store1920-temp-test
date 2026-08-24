"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackTikTokPageView } from "@/lib/tiktokPixelTracking";

export default function TikTokPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    const pathOnly = pathname.split('?')[0];
    if (pathOnly === '/order-success') return;
    if (
      pathOnly.startsWith('/store')
      || pathOnly.startsWith('/admin')
      || pathOnly.startsWith('/dashboard')
    ) return;
    trackTikTokPageView({ pagePath: pathOnly });
  }, [pathname]);

  return null;
}
