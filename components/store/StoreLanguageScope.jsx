'use client';

import { useEffect } from 'react';

/**
 * Forces English LTR for /store and locks the shell to the viewport
 * so only the main content pane scrolls (not the whole document).
 */
export default function StoreLanguageScope({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousLang = root.getAttribute('lang');
    const previousDir = root.getAttribute('dir');
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    root.setAttribute('lang', 'en');
    root.setAttribute('dir', 'ltr');
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      if (previousLang) {
        root.setAttribute('lang', previousLang);
      } else {
        root.removeAttribute('lang');
      }

      if (previousDir) {
        root.setAttribute('dir', previousDir);
      } else {
        root.removeAttribute('dir');
      }

      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <div lang="en" dir="ltr" className="h-dvh max-h-dvh overflow-hidden">
      {children}
    </div>
  );
}
