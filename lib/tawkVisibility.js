export const TAWK_HIDDEN_ROUTE_CLASS = 'tawk-route-hidden';

const hiddenReasons = new Set();

export function applyTawkVisibility() {
  if (typeof document === 'undefined') return;

  const hidden = hiddenReasons.size > 0;
  document.documentElement.classList.toggle(TAWK_HIDDEN_ROUTE_CLASS, hidden);

  try {
    if (!window.Tawk_API) return;
    if (hidden) {
      window.Tawk_API.hideWidget?.();
      window.Tawk_API.minimize?.();
    } else {
      window.Tawk_API.showWidget?.();
    }
  } catch {
    // Widget may still be loading.
  }
}

export function setTawkHiddenBy(reason, hidden) {
  const key = String(reason || '').trim();
  if (!key) return;
  if (hidden) hiddenReasons.add(key);
  else hiddenReasons.delete(key);
  applyTawkVisibility();
}

export function isTawkForcedHidden() {
  return hiddenReasons.size > 0;
}
