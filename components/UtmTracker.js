"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ensureMetaClickId, whenFbqReady } from "@/lib/metaBrowserAttribution";
import { META_PIXEL_ID } from "@/lib/metaPixelConfig";

export default function UtmTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : window.location.search;
    ensureMetaClickId(search);

    const utm_source = searchParams.get('utm_source');
    const utm_medium = searchParams.get('utm_medium');
    const utm_campaign = searchParams.get('utm_campaign');
    const utm_content = searchParams.get('utm_content');
    const utm_id = searchParams.get('utm_id');
    const utm_term = searchParams.get('utm_term');
    const fbclid = searchParams.get('fbclid');

    const hasUtm = Boolean(utm_source || utm_medium || utm_campaign);
    const hasFbclid = Boolean(fbclid);

    if (!hasUtm && !hasFbclid) return;

    const utmData = {
      source: utm_source || (hasFbclid ? 'facebook' : 'direct'),
      medium: utm_medium || (hasFbclid ? 'paid' : 'none'),
      campaign: utm_campaign || (hasFbclid ? 'fbclid' : 'none'),
      content: utm_content || null,
      id: utm_id || null,
      term: utm_term || null,
      fbclid: fbclid || null,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || 'direct',
    };

    localStorage.setItem('utm_data', JSON.stringify(utmData));

    window.attributionData = {
      utm_source: utmData.source,
      utm_medium: utmData.medium,
      utm_campaign: utmData.campaign,
      utm_content: utmData.content,
      utm_id: utmData.id,
      utm_term: utmData.term,
      referrer: utmData.referrer,
      entry_page_url: window.location.href,
    };

    const pageKey = `${window.location.pathname}${window.location.search}`;
    const utmEventKey = `meta_utm_sent_${pageKey}`;

    if (sessionStorage.getItem(utmEventKey)) return;

    whenFbqReady((fbq) => {
      fbq('trackSingleCustom', META_PIXEL_ID, 'UTMAttribution', {
        utm_source: utmData.source,
        utm_campaign: utmData.campaign,
        utm_medium: utmData.medium,
        fbclid: fbclid || undefined,
      });
    });

    sessionStorage.setItem(utmEventKey, '1');

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'utm_attribution',
      utm_source: utmData.source,
      utm_medium: utmData.medium,
      utm_campaign: utmData.campaign,
      utm_content: utmData.content,
      utm_id: utmData.id,
    });
  }, [searchParams]);

  return null;
}
