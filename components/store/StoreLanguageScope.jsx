'use client';

import { useEffect } from 'react';
import { readPersistedStorefrontLanguage } from '@/lib/storefrontLanguage';

/**
 * Forces English LTR for /store and locks the shell to the viewport
 * so only the main content pane scrolls (not the whole document).
 */
export default function StoreLanguageScope({ children }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    root.setAttribute('lang', 'en');
    root.setAttribute('dir', 'ltr');
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      const restored = readPersistedStorefrontLanguage();
      const isArabic = restored === 'ar';
      root.setAttribute('lang', isArabic ? 'ar' : 'en');
      root.setAttribute('dir', isArabic ? 'rtl' : 'ltr');
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
