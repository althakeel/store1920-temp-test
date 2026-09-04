/** GA4 measurement ID — gtag('config', 'G-NQ4S0938P7') */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_ID
  || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
  || 'G-NQ4S0938P7';

export const GOOGLE_ADS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID
  || process.env.GOOGLE_ADS_ID
  || 'AW-18265876413';

export function getGoogleAdsGtagSrc(adsId = GA_MEASUREMENT_ID) {
  const id = encodeURIComponent(String(adsId).trim());
  return `https://www.googletagmanager.com/gtag/js?id=${id}`;
}

export function getGoogleAdsGtagInitScript(
  adsId = GOOGLE_ADS_ID,
  gaId = GA_MEASUREMENT_ID,
) {
  const analyticsId = String(gaId || '').replace(/'/g, "\\'");
  const ads = String(adsId || '').replace(/'/g, "\\'");
  const configs = [
    analyticsId ? `gtag('config', '${analyticsId}');` : '',
    ads && ads !== analyticsId ? `gtag('config', '${ads}');` : '',
  ].filter(Boolean).join('\n');

  return `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs}`;
}
