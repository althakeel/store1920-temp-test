const MEMORY = new Set();

function storageKey(key) {
  return `track_once:${key}`;
}

export function hasTrackedOnce(key) {
  if (!key || typeof window === 'undefined') return false;
  if (MEMORY.has(key)) return true;
  try {
    return sessionStorage.getItem(storageKey(key)) === '1';
  } catch {
    return MEMORY.has(key);
  }
}

export function markTrackedOnce(key) {
  if (!key || typeof window === 'undefined') return;
  MEMORY.add(key);
  try {
    sessionStorage.setItem(storageKey(key), '1');
  } catch {
    // Ignore storage failures; in-memory dedupe still applies this session.
  }
}

/** Atomically claim a session key — returns false if already claimed (Strict Mode safe). */
export function claimTrackedOnce(key) {
  if (!key || typeof window === 'undefined') return false;
  if (hasTrackedOnce(key)) return false;
  markTrackedOnce(key);
  return true;
}

export function runTrackedOnce(key, fn) {
  if (!key || !claimTrackedOnce(key)) return false;
  try {
    if (fn() === false) {
      // Allow a clean retry if the sender explicitly failed.
      MEMORY.delete(key);
      try {
        sessionStorage.removeItem(storageKey(key));
      } catch {
        // ignore
      }
      return false;
    }
  } catch {
    MEMORY.delete(key);
    try {
      sessionStorage.removeItem(storageKey(key));
    } catch {
      // ignore
    }
    return false;
  }
  return true;
}

function persistentStorageKey(key) {
  return `track_persist:${key}`;
}

/** Survives tab close — used for Meta Purchase (must fire exactly once per order). */
export function hasTrackedPersistently(key) {
  if (!key || typeof window === 'undefined') return false;
  if (MEMORY.has(`persist:${key}`)) return true;
  try {
    return localStorage.getItem(persistentStorageKey(key)) === '1';
  } catch {
    return MEMORY.has(`persist:${key}`);
  }
}

export function markTrackedPersistently(key) {
  if (!key || typeof window === 'undefined') return;
  MEMORY.add(`persist:${key}`);
  try {
    localStorage.setItem(persistentStorageKey(key), '1');
  } catch {
    // Ignore storage failures; in-memory guard still applies this session.
  }
}

/** Atomically claim a persistent key — returns false if already claimed. */
export function claimPersistentTrack(key) {
  if (!key || typeof window === 'undefined') return false;
  if (hasTrackedPersistently(key)) return false;
  markTrackedPersistently(key);
  return true;
}

export function unmarkTrackedPersistently(key) {
  if (!key || typeof window === 'undefined') return;
  MEMORY.delete(`persist:${key}`);
  try {
    localStorage.removeItem(persistentStorageKey(key));
  } catch {
    // Ignore storage failures.
  }
}

const PURCHASE_IN_FLIGHT = new Set();

/** Prevents parallel Purchase sends before persistent dedupe is written. */
export function claimPurchaseInFlight(key) {
  if (!key || typeof window === 'undefined') return false;
  if (hasTrackedPersistently(key)) return false;
  if (PURCHASE_IN_FLIGHT.has(key)) return false;
  PURCHASE_IN_FLIGHT.add(key);
  return true;
}

export function releasePurchaseInFlight(key) {
  if (!key || typeof window === 'undefined') return;
  PURCHASE_IN_FLIGHT.delete(key);
}

const BURST_CLAIMED = new Map();

/**
 * Allow an event again after `windowMs`.
 * Use for PageView / AddToCart / ViewContent / ViewCart so React Strict Mode does not
 * double-fire, but real revisits and extra adds still track.
 *
 * Callers must pass a *stable* dedupeKey (path or product id), not a Date.now() eventID.
 */
export function claimBurstDedupe(key, windowMs = 600) {
  if (!key || typeof window === 'undefined') return false;
  const now = Date.now();
  const prev = Number(BURST_CLAIMED.get(key) || 0);
  if (now - prev < windowMs) return false;
  BURST_CLAIMED.set(key, now);
  if (BURST_CLAIMED.size > 400) {
    for (const [entryKey, timestamp] of BURST_CLAIMED) {
      if (now - timestamp > 60 * 1000) BURST_CLAIMED.delete(entryKey);
    }
  }
  return true;
}
