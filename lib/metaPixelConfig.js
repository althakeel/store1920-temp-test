import { getMetaPurchaseGuardInlineScript } from '@/lib/metaPurchaseGuard';

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID
  || process.env.META_PIXEL_ID
  || '794381109763677';

export { getMetaPurchaseGuardInlineScript };

export function getMetaPixelBootstrapScript(pixelId = META_PIXEL_ID) {
  const safeId = String(pixelId).replace(/'/g, "\\'");
  return `(function(f,b,e,v,n,t,s){
if(f.__store1920MetaBootstrapped)return;
f.__store1920MetaBootstrapped=true;
if(!f.fbq){
n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
}
if(!b.querySelector('script[src*="connect.facebook.net"][src*="fbevents.js"]')){
t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s);
}
if(!f.__store1920MetaInited){f.fbq('init','${safeId}',{},{autoConfig:false});f.__store1920MetaInited=true;}
f.fbq('set','autoConfig',false,'${safeId}');
})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`;
}

export function getMetaPixelNoscriptSrc(pixelId = META_PIXEL_ID) {
  return `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
}
