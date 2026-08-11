import { META_PIXEL_ID } from '@/lib/metaPixelConfig';

const AUTHORIZED_IDS_KEY = '__metaAuthorizedPurchaseIds';
const GUARD_FLAG = '__metaPurchaseGuardInstalled';

/** Standard events that must only fire via our authorized trackSingle calls. */
const GATED_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'AddToCart',
  'ViewCart',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
]);

export function authorizeMetaPurchase(eventId) {
  if (typeof window === 'undefined' || !eventId) return;
  const id = String(eventId).trim();
  if (!id) return;

  window[AUTHORIZED_IDS_KEY] = window[AUTHORIZED_IDS_KEY] || new Set();
  window[AUTHORIZED_IDS_KEY].add(id);
}

function getAuthorizedEventIds() {
  if (typeof window === 'undefined') return null;
  const set = window[AUTHORIZED_IDS_KEY];
  return set && typeof set.has === 'function' ? set : null;
}

function readEventIdFromObject(value) {
  if (!value || typeof value !== 'object') return '';
  return String(value.eventID || value.event_id || value.order_id || '').trim();
}

function resolveGatedEventName(args = []) {
  const cmd = args[0];
  if (cmd === 'trackSingle' && GATED_EVENTS.has(args[2])) return args[2];
  if (cmd === 'track' && GATED_EVENTS.has(args[1])) return args[1];
  if (cmd === 'trackCustom' && GATED_EVENTS.has(args[1])) return args[1];
  return '';
}

function resolveGatedEventId(args = []) {
  const cmd = args[0];
  const eventName = resolveGatedEventName(args);
  if (!eventName) return '';

  if (cmd === 'trackSingle' && args[2] === eventName) {
    const fromOptions = readEventIdFromObject(args[4]);
    if (fromOptions) return fromOptions;
    return readEventIdFromObject(args[3]);
  }
  if (cmd === 'track' && args[1] === eventName) {
    const fromOptions = readEventIdFromObject(args[3]);
    if (fromOptions) return fromOptions;
    return readEventIdFromObject(args[2]);
  }
  return '';
}

function invokeFbqCall(original, args) {
  const rooted = original?.__purchaseGuardOriginal || original;
  if (!rooted) return undefined;

  const realCallMethod = rooted.__realCallMethod || rooted.callMethod;
  if (
    typeof realCallMethod === 'function'
    && realCallMethod !== rooted.__guardedCallMethod
  ) {
    return realCallMethod.apply(rooted, args);
  }

  if (typeof rooted.apply === 'function') {
    return rooted.apply(rooted, args);
  }

  return undefined;
}

function isAuthorizedGatedCall(args = []) {
  const eventId = resolveGatedEventId(args);
  if (!eventId) return false;
  const authorized = getAuthorizedEventIds();
  return Boolean(authorized?.has(eventId));
}

function isGatedFbqCall(args = []) {
  return Boolean(resolveGatedEventName(args));
}

function shouldAllowGatedCall(args) {
  if (!isGatedFbqCall(args)) return true;
  // Only our explicit trackSingle on this pixel — block GTM fbq('track', ...) duplicates.
  if (args[0] !== 'trackSingle' || String(args[1]) !== META_PIXEL_ID) return false;
  return isAuthorizedGatedCall(args);
}

function runGuardedFbqCall(original, args) {
  if (!shouldAllowGatedCall(args)) {
    return false;
  }
  const result = invokeFbqCall(original, args);
  if (isGatedFbqCall(args) && result !== false) {
    const eventId = resolveGatedEventId(args);
    if (eventId) getAuthorizedEventIds()?.delete(eventId);
  }
  return result;
}

function wrapFbqInstance(fbq) {
  if (!fbq || fbq.__purchaseGuardWrapped) return fbq;

  const original = fbq;

  const guardedInvoke = (args) => runGuardedFbqCall(original, args);

  const guardedCallMethod = (...callArgs) => runGuardedFbqCall(original, callArgs);

  const wrapped = function purchaseGuardedFbq(...args) {
    return guardedInvoke(args);
  };

  Object.assign(wrapped, original);
  wrapped.push = (...args) => guardedInvoke(args);
  wrapped.callMethod = guardedCallMethod;
  wrapped.__purchaseGuardWrapped = true;
  wrapped.__purchaseGuardOriginal = original;
  wrapped.__guardedCallMethod = guardedCallMethod;
  original.__guardedCallMethod = guardedCallMethod;

  return wrapped;
}

export function installMetaPurchaseGuard() {
  if (typeof window === 'undefined') return;

  window[AUTHORIZED_IDS_KEY] = window[AUTHORIZED_IDS_KEY] || new Set();

  const apply = () => {
    if (!window.fbq) return;

    if (window.fbq.__purchaseGuardWrapped) {
      const original = window.fbq.__purchaseGuardOriginal;
      const guarded = window.fbq.__guardedCallMethod;
      const liveMethod = window.fbq.callMethod;
      if (original && liveMethod && guarded && liveMethod !== guarded) {
        original.__realCallMethod = liveMethod;
        window.fbq.callMethod = guarded;
      }
      return;
    }

    window.fbq = wrapFbqInstance(window.fbq);
  };

  if (!window[GUARD_FLAG]) {
    window[GUARD_FLAG] = true;
    apply();

    let attempts = 0;
    const timer = window.setInterval(() => {
      apply();
      attempts += 1;
      if (attempts >= 240) {
        window.clearInterval(timer);
        window.setInterval(apply, 2000);
      }
    }, 50);
  } else {
    apply();
  }
}

/** Inline script for layout bootstrap — must stay in sync with installMetaPurchaseGuard. */
export function getMetaPurchaseGuardInlineScript(pixelId = META_PIXEL_ID) {
  const id = String(pixelId).replace(/'/g, "\\'");
  return `(function(pixelId){
var k='${AUTHORIZED_IDS_KEY}',g='${GUARD_FLAG}';
var gated={PageView:1,ViewContent:1,AddToCart:1,ViewCart:1,InitiateCheckout:1,AddPaymentInfo:1,Purchase:1};
window[k]=window[k]||new Set();
function readId(o){
  if(!o||typeof o!=='object')return '';
  return String(o.eventID||o.event_id||o.order_id||'').trim();
}
function gatedName(args){
  if(args[0]==='trackSingle'&&gated[args[2]])return args[2];
  if(args[0]==='track'&&gated[args[1]])return args[1];
  if(args[0]==='trackCustom'&&gated[args[1]])return args[1];
  return '';
}
function gatedEventId(args){
  var name=gatedName(args);
  if(!name)return '';
  if(args[0]==='trackSingle'&&args[2]===name){
    var fromOpts=readId(args[4]);
    if(fromOpts)return fromOpts;
    return readId(args[3]);
  }
  if(args[0]==='track'&&args[1]===name){
    var fromTrackOpts=readId(args[3]);
    if(fromTrackOpts)return fromTrackOpts;
    return readId(args[2]);
  }
  return '';
}
function invokeFbq(orig,args){
  var rooted=orig&&orig.__purchaseGuardOriginal?orig.__purchaseGuardOriginal:orig;
  if(!rooted)return;
  var real=rooted.__realCallMethod||rooted.callMethod;
  if(typeof real==='function'&&real!==rooted.__guardedCallMethod)return real.apply(rooted,args);
  if(typeof rooted.apply==='function')return rooted.apply(rooted,args);
}
function isGated(args){return !!gatedName(args);}
function allow(args){
  if(!isGated(args))return true;
  if(args[0]!=='trackSingle'||String(args[1])!==pixelId)return false;
  var eid=gatedEventId(args);
  return !!(eid&&window[k]&&window[k].has(eid));
}
function wrap(fbq){
  if(!fbq||fbq.__purchaseGuardWrapped)return fbq;
  var orig=fbq;
  function invoke(args){
    if(!allow(args))return false;
    var result=invokeFbq(orig,args);
    if(isGated(args)&&result!==false){
      var eid=gatedEventId(args);
      if(eid&&window[k])window[k].delete(eid);
    }
    return result;
  }
  var guardedCallMethod=function(){return invoke(Array.prototype.slice.call(arguments));};
  var w=function(){return invoke(Array.prototype.slice.call(arguments));};
  for(var p in orig){try{w[p]=orig[p];}catch(e){}}
  w.push=function(){return invoke(Array.prototype.slice.call(arguments));};
  w.callMethod=guardedCallMethod;
  w.__purchaseGuardWrapped=true;
  w.__purchaseGuardOriginal=orig;
  w.__guardedCallMethod=guardedCallMethod;
  orig.__guardedCallMethod=guardedCallMethod;
  return w;
}
function apply(){
  if(!window.fbq)return;
  if(window.fbq.__purchaseGuardWrapped){
    var orig=window.fbq.__purchaseGuardOriginal;
    var guarded=window.fbq.__guardedCallMethod;
    var live=window.fbq.callMethod;
    if(orig&&live&&guarded&&live!==guarded){
      orig.__realCallMethod=live;
      window.fbq.callMethod=guarded;
    }
    return;
  }
  if(!window.fbq.__purchaseGuardWrapped)window.fbq=wrap(window.fbq);
}
if(!window[g]){
  window[g]=true;
  apply();
  var n=0,t=setInterval(function(){apply();if(++n>=240){clearInterval(t);setInterval(apply,2000);}},50);
}else{apply();}
})('${id}');`;
}
