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

let guardInstalled = false;

function dismissDomReconcileOverlay() {
  document.querySelectorAll('nextjs-portal').forEach((portal) => {
    const text = `${portal.textContent || ''} ${portal.shadowRoot?.textContent || ''}`;
    if (!isDomReconcileError(text)) return;
    portal.remove();
  });
}

/** Swallow DOM races so Next.js does not replace the page with an overlay. */
export function installDomReconcileGuard() {
  if (guardInstalled || typeof window === 'undefined') return;
  guardInstalled = true;

  const swallow = (event) => {
    const error = event?.error || event?.reason || event?.message;
    if (!isDomReconcileError(error)) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    dismissDomReconcileOverlay();
  };

  window.addEventListener('error', swallow, true);
  window.addEventListener('unhandledrejection', swallow, true);

  const observer = new MutationObserver(() => {
    dismissDomReconcileOverlay();
  });
  observer.observe(document.documentElement, { childList: true });
  if (document.body) observer.observe(document.body, { childList: true });
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
