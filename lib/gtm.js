/** Only Google container on the storefront. GA4 G-NQ4S0938P7 fires from this GTM workspace. */
export const GTM_ID = 'GTM-5W3VLWS6';
export const GA4_MEASUREMENT_ID = 'G-NQ4S0938P7';

/**
 * Always GTM-5W3VLWS6. Leftover env values and invalid GA-as-GTM ids
 * (GTM-NB8H4RK9, GTM-NQ4S0938P) must never load another container.
 */
export function resolveGtmId() {
  return GTM_ID;
}

export function getGtmHeadScript() {
  return `window.dataLayer=window.dataLayer||[];
(function(w,d,s,l,i){
  w.__store1920GtmLoaded=w.__store1920GtmLoaded||{};
  if(w.__store1920GtmLoaded[i]) return;
  if(d.querySelector('script[src*="googletagmanager.com/gtm.js?id='+i+'"]')){
    w.__store1920GtmLoaded[i]=true;
    return;
  }
  w.__store1920GtmLoaded[i]=true;
  w[l]=w[l]||[];
  w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
  var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
  j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
  f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`;
}

export function getGtmNoscriptSrc() {
  return `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
}
