'use client';

import { useEffect } from 'react';
import { META_PIXEL_ID, getMetaPurchaseGuardInlineScript } from '@/lib/metaPixelConfig';

/**
 * Injects early scripts via the DOM (never as React <script> children).
 * Avoids React 19 "Encountered a script tag while rendering" errors.
 */
export default function EarlyHeadScripts() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const ensureScript = (id, source) => {
      if (document.getElementById(id)) return;
      const el = document.createElement('script');
      el.id = id;
      el.text = source;
      document.head.appendChild(el);
    };

    ensureScript(
      'meta-purchase-guard',
      getMetaPurchaseGuardInlineScript(META_PIXEL_ID),
    );
  }, []);

  return null;
}
