"use client";

import { hasTrackedOnce, markTrackedOnce, markTrackedPersistently, hasTrackedPersistently, claimPurchaseInFlight, releasePurchaseInFlight, claimBurstDedupe, claimPersistentTrack, unmarkTrackedPersistently } from '@/lib/trackingDedupe';
import { META_PIXEL_ID } from '@/lib/metaPixelConfig';
import { authorizeMetaPurchase, installMetaPurchaseGuard } from '@/lib/metaPurchaseGuard';
import { getMetaAttributionPayload } from '@/lib/metaBrowserAttribution';
import { getMetaPurchaseDedupeKey } from '@/lib/metaPurchase';

installMetaPurchaseGuard();

const FBQ_QUEUE = [];
const FBQ_QUEUED_KEYS = new Set();
let fbqDrainTimer = null;
const FBQ_DRAIN_TIMEOUT_MS = 10000;

export const getAttributionData = () => {
  if (typeof window === 'undefined') return {};
  return getMetaAttributionPayload();
};

export const normalizeMetaError = (error) => {
  if (!error) return 'Unknown Meta Pixel error';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    return error.message || error.error || error.detail || JSON.stringify(error);
  }
  return String(error);
};

function resolveMetaDedupeKey(eventName, options = {}) {
  // Prefer explicit dedupeKey. Burst events keep a stable key (e.g. path / product id)
  // while eventID stays unique for Meta — otherwise Date.now() in eventID defeats dedupe.
  const explicit = String(options?.dedupeKey || '').trim();
  if (explicit) return explicit;
  if (options?.eventID) {
    return `meta:${eventName}:${options.eventID}`;
  }
  return null;
}

function getBareFbq() {
  if (typeof window === 'undefined') return null;
  const fbq = window.fbq;
  return typeof fbq === 'function' ? fbq : null;
}

function isPurchaseFbqArgs(args = []) {
  const cmd = args[0];
  if (cmd === 'track' && args[1] === 'Purchase') return true;
  if (cmd === 'trackSingle' && args[2] === 'Purchase') return true;
  if (cmd === 'trackCustom' && args[1] === 'Purchase') return true;
  return false;
}

function invokeBareFbq(...args) {
  const bareFbq = getBareFbq();
  if (!bareFbq || typeof bareFbq !== 'function') return false;

  try {
    const result = bareFbq(...args);
    if (isPurchaseFbqArgs(args) && result === false) {
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[MetaPixel] fbq call failed:', normalizeMetaError(error));
    return false;
  }
}

function resolvePurchasePersistKey(eventId) {
  const id = String(eventId || '').trim();
  return id ? getMetaPurchaseDedupeKey(id) : '';
}

function sendPurchaseViaBareFbq(payload, options = {}) {
  if (!options?.eventID) return false;
  authorizeMetaPurchase(options.eventID);
  return sendStandardMetaEvent('Purchase', payload, options);
}

function sendStandardMetaEvent(eventName, payload, options = {}) {
  // Gated events require authorizeMetaPurchase before trackSingle so GTM
  // fbq('track', ...) duplicates are blocked by the purchase guard.
  if (
    options?.eventID
    && (eventName === 'Purchase'
      || eventName === 'ViewCart'
      || eventName === 'ViewContent'
      || eventName === 'AddToCart'
      || eventName === 'InitiateCheckout'
      || eventName === 'PageView'
      || eventName === 'AddPaymentInfo')
  ) {
    authorizeMetaPurchase(options.eventID);
  }
  if (options?.eventID) {
    return invokeBareFbq('trackSingle', META_PIXEL_ID, eventName, payload, { eventID: options.eventID });
  }
  return invokeBareFbq('trackSingle', META_PIXEL_ID, eventName, payload);
}

function sendMetaEventNow(eventName, params = {}, options = {}) {
  if (typeof window === 'undefined' || !eventName) return false;
  if (!getBareFbq()) return false;

  const isPurchase = eventName === 'Purchase' && options?.eventID;
  const purchasePersistKey = isPurchase
    ? resolvePurchasePersistKey(options.eventID)
    : null;
  const dedupeMode = options.dedupeMode || (isPurchase ? 'persistent' : 'session');

  if (isPurchase && hasTrackedPersistently(purchasePersistKey)) {
    return false;
  }

  const dedupeKey = resolveMetaDedupeKey(eventName, options);
  if (!options.force) {
    if (dedupeMode === 'burst') {
      if (!claimBurstDedupe(dedupeKey || `meta:${eventName}:burst`, options.burstMs || 600)) {
        return false;
      }
    } else if (!isPurchase && dedupeKey && hasTrackedOnce(dedupeKey)) {
      return false;
    }
  }

  if (isPurchase && !claimPurchaseInFlight(purchasePersistKey)) {
    return false;
  }

  let claimedPersistent = false;
  if (isPurchase) {
    if (!claimPersistentTrack(purchasePersistKey)) {
      releasePurchaseInFlight(purchasePersistKey);
      return false;
    }
    claimedPersistent = true;
  }

  try {
    const payload = {
      ...params,
      ...getAttributionData(),
    };

    let sent = false;

    if (eventName === 'Purchase' && options?.eventID) {
      sent = sendPurchaseViaBareFbq(payload, options);
    } else {
      // autoConfig is off — always target our pixel with trackSingle (not fbq('track')).
      sent = sendStandardMetaEvent(eventName, payload, options);
    }

    if (!sent) {
      if (claimedPersistent) {
        unmarkTrackedPersistently(purchasePersistKey);
      }
      if (isPurchase && process.env.NODE_ENV === 'development') {
        console.warn('[Meta] Purchase not sent (guard reject, fbq error, or not ready)', {
          eventID: options.eventID,
        });
      }
      return false;
    }

    if (dedupeKey && !isPurchase && dedupeMode !== 'burst') {
      markTrackedOnce(dedupeKey);
      FBQ_QUEUED_KEYS.delete(dedupeKey);
    }

    if (isPurchase && process.env.NODE_ENV === 'development') {
      console.info('[Meta] Purchase sent', {
        eventID: options.eventID,
        value: payload.value,
        currency: payload.currency,
      });
    }

    return true;
  } catch (error) {
    if (claimedPersistent) {
      unmarkTrackedPersistently(purchasePersistKey);
    }
    console.warn('[MetaPixel] track error:', normalizeMetaError(error));
    return false;
  } finally {
    if (isPurchase) {
      releasePurchaseInFlight(purchasePersistKey);
    }
  }
}

function scheduleFbqDrain() {
  if (typeof window === 'undefined' || fbqDrainTimer) return;

  const started = Date.now();

  const drain = () => {
    if (getBareFbq()) {
      fbqDrainTimer = null;
      const pending = FBQ_QUEUE.splice(0, FBQ_QUEUE.length);
      pending.forEach(({ eventName, params, options }) => {
        const dedupeKey = resolveMetaDedupeKey(eventName, options);
        try {
          // force: queued events were already claimed; must send once fbq is ready.
          sendMetaEventNow(eventName, params, { ...options, force: true });
        } finally {
          if (dedupeKey) {
            FBQ_QUEUED_KEYS.delete(dedupeKey);
          }
        }
      });
      return;
    }

    if (Date.now() - started >= FBQ_DRAIN_TIMEOUT_MS) {
      fbqDrainTimer = null;
      if (FBQ_QUEUE.length > 0) {
        scheduleFbqDrain();
      }
      return;
    }

    fbqDrainTimer = window.setTimeout(drain, 100);
  };

  drain();
}

export const trackMetaEvent = (eventName, params = {}, options = {}) => {
  if (typeof window === 'undefined' || !eventName) return false;

  const isPurchase = eventName === 'Purchase' && options?.eventID;
  const purchasePersistKey = isPurchase
    ? resolvePurchasePersistKey(options.eventID)
    : null;
  const dedupeMode = options.dedupeMode || (isPurchase ? 'persistent' : 'session');

  if (isPurchase && hasTrackedPersistently(purchasePersistKey)) {
    return false;
  }

  const dedupeKey = resolveMetaDedupeKey(eventName, options);
  if (dedupeMode === 'burst') {
    if (!getBareFbq() && dedupeKey && FBQ_QUEUED_KEYS.has(dedupeKey)) {
      return false;
    }
    if (!claimBurstDedupe(dedupeKey || `meta:${eventName}:burst`, options.burstMs || 600)) {
      return false;
    }
  } else if (!isPurchase && dedupeKey && (hasTrackedOnce(dedupeKey) || FBQ_QUEUED_KEYS.has(dedupeKey))) {
    return false;
  }

  if (isPurchase && dedupeKey && FBQ_QUEUED_KEYS.has(dedupeKey)) {
    return false;
  }

  if (eventName === 'Purchase' && options?.eventID) {
    authorizeMetaPurchase(options.eventID);
  }

  if (!getBareFbq()) {
    if (dedupeKey) {
      FBQ_QUEUED_KEYS.add(dedupeKey);
      if (!isPurchase && dedupeMode !== 'burst') {
        markTrackedOnce(dedupeKey);
      }
    }
    FBQ_QUEUE.push({ eventName, params, options });
    scheduleFbqDrain();
    // Purchase must not report success until fbq actually sends (order-success retries).
    return eventName !== 'Purchase';
  }

  if (dedupeKey) {
    FBQ_QUEUED_KEYS.delete(dedupeKey);
  }

  return sendMetaEventNow(eventName, params, { ...options, force: dedupeMode === 'burst' });
};
