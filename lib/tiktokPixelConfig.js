export const TIKTOK_PIXEL_ID =
  process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID
  || process.env.TIKTOK_PIXEL_ID
  || 'D3AH1CBC77U15FSVOM1G';

export function getTikTokPixelBootstrapScript(pixelId = TIKTOK_PIXEL_ID) {
  const id = String(pixelId).replace(/'/g, "\\'");
  return `!function(w,d,t){
w.TiktokAnalyticsObject=t;
var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
ttq.setAndDefer=function(obj,method){obj[method]=function(){obj.push([method].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(pixel){for(var e=ttq._i[pixel]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){
  var r="https://analytics.tiktok.com/i18n/pixel/events.js";
  ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};
  var s=document.createElement("script");s.type="text/javascript";s.async=!0;s.src=r+"?sdkid="+e+"&lib="+t;
  var first=document.getElementsByTagName("script")[0];first.parentNode.insertBefore(s,first);
};
if(!w.__store1920TikTokLoaded){w.__store1920TikTokLoaded=true;ttq.load('${id}');}
}(window,document,'ttq');`;
}
