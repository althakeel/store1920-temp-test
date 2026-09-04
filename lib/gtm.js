const DEFAULT_GTM_ID = 'GTM-NB8H4RK9';

export function resolveGtmId(value = process.env.NEXT_PUBLIC_GTM_ID) {
  const raw = String(value || '').trim().toUpperCase();
  if (!/^GTM-[A-Z0-9]+$/.test(raw)) return DEFAULT_GTM_ID;

  // GTM-NQ4S0938P is not a container — it is the GA id with a GTM- prefix.
  const gaBody = String(
    process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '',
  )
    .trim()
    .toUpperCase()
    .replace(/^G-/, '');
  if (gaBody && raw.replace(/^GTM-/, '').startsWith(gaBody.slice(0, 8))) {
    return DEFAULT_GTM_ID;
  }

  return raw;
}

export const GTM_ID = resolveGtmId();

export function getGtmHeadScript(gtmId = GTM_ID) {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`;
}

export function getGtmNoscriptSrc(gtmId = GTM_ID) {
  return `https://www.googletagmanager.com/ns.html?id=${gtmId}`;
}
