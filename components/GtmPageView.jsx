'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pushGtmEvent } from '@/lib/pushGtmEcommerceEvent';
import { hasTrackedOnce, markTrackedOnce } from '@/lib/trackingDedupe';
import { GTM_EVENTS, gtmDedupeKey, shouldSkipGtmPageView } from '@/lib/gtmEvents';
import { ensureGa4CategoryCache } from '@/lib/ga4CategoryLookup';

export default function GtmPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;
    ensureGa4CategoryCache();

    if (shouldSkipGtmPageView(pathname)) return;

    const query = searchParams?.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;
    const dedupeKey = gtmDedupeKey(GTM_EVENTS.PAGE_VIEW, pagePath);
    if (hasTrackedOnce(dedupeKey)) return;

    pushGtmEvent(GTM_EVENTS.PAGE_VIEW, {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });

    markTrackedOnce(dedupeKey);
  }, [pathname, searchParams]);

  return null;
}
