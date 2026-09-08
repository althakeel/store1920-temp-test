const DOM_RELOAD_KEY = 'store1920-dom-reload';

export function getErrorText(error) {
  return [
    error?.message,
    error?.cause?.message,
    error?.digest,
    error?.stack,
    typeof error === 'string' ? error : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function isDomReconcileError(error) {
  return /removeChild|insertBefore|not a child of this node|The node before which the new node is to be inserted is not a child of this node/i.test(
    getErrorText(error),
  );
}

/** Full reload once for a DOM race. Returns false if a reload was already tried. */
export function reloadOnceForDomRace() {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(DOM_RELOAD_KEY) === '1') return false;
    sessionStorage.setItem(DOM_RELOAD_KEY, '1');
  } catch {
    // Still reload if storage is blocked.
  }
  window.location.reload();
  return true;
}
