'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  TAWK_PROPERTY_ID,
  TAWK_WIDGET_ID,
  getTawkEmbedSrc,
  isTawkEnabled,
} from '@/lib/tawkConfig';

const HIDDEN_PREFIXES = ['/store', '/admin', '/dashboard'];
const HIDDEN_EXACT = ['/checkout'];
const GREETING_STYLE_ID = 'tawk-hide-greeting-style';

function shouldShowTawk(pathname = '') {
  if (!pathname) return false;
  if (HIDDEN_EXACT.includes(pathname)) return false;
  return !HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function injectGreetingHideStyles() {
  if (document.getElementById(GREETING_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = GREETING_STYLE_ID;
  // Keep the green chat button; hide "We Are Here!" attention grabber.
  style.textContent = `
    div[class*="tawk"] [class*="attention"],
    div[class*="tawk"] [class*="greeting"],
    div[class*="tawk"] [class*="bubble-text"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

function hideIfGreetingNode(node) {
  if (!(node instanceof HTMLElement)) return;
  const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > 48) return;
  if (!/we are here!?/i.test(text)) return;
  const target = node.closest('div') || node;
  target.style.setProperty('display', 'none', 'important');
  target.style.setProperty('visibility', 'hidden', 'important');
  target.style.setProperty('opacity', '0', 'important');
  target.style.setProperty('pointer-events', 'none', 'important');
}

function hideGreetingDomNodes(root = document.body) {
  if (!root) return;
  const candidates = root.querySelectorAll
    ? root.querySelectorAll('div, span, p, strong, em')
    : [];
  candidates.forEach(hideIfGreetingNode);
  hideIfGreetingNode(root);
}

/**
 * Loads Tawk.to live chat on the public storefront only.
 * Hides the "We Are Here!" attention-grabber greeting bubble.
 */
export default function TawkToWidget() {
  const pathname = usePathname();
  const enabled = isTawkEnabled() && shouldShowTawk(pathname);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    injectGreetingHideStyles();

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = window.Tawk_LoadStart || new Date();

    const previousOnLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function onTawkLoad() {
      try {
        hideGreetingDomNodes();
        window.setTimeout(() => hideGreetingDomNodes(), 600);
        window.setTimeout(() => hideGreetingDomNodes(), 2000);
      } catch {
        // ignore
      }
      if (typeof previousOnLoad === 'function') previousOnLoad();
    };

    let hideTimer = null;
    const scheduleHide = () => {
      if (hideTimer) return;
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        hideGreetingDomNodes();
      }, 200);
    };

    const existing = document.getElementById('tawk-to-script');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'tawk-to-script';
      script.async = true;
      script.src = getTawkEmbedSrc(TAWK_PROPERTY_ID, TAWK_WIDGET_ID);
      script.charset = 'UTF-8';
      script.setAttribute('crossorigin', '*');
      document.body.appendChild(script);
    } else {
      try {
        window.Tawk_API?.showWidget?.();
        hideGreetingDomNodes();
      } catch {
        // ignore
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) hideGreetingDomNodes(node);
        });
      }
      scheduleHide();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (hideTimer) window.clearTimeout(hideTimer);
      try {
        window.Tawk_API?.hideWidget?.();
      } catch {
        // ignore
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.Tawk_API) return;
    try {
      if (enabled) {
        window.Tawk_API.showWidget?.();
        hideGreetingDomNodes();
      } else {
        window.Tawk_API.hideWidget?.();
      }
    } catch {
      // ignore
    }
  }, [enabled]);

  return null;
}
