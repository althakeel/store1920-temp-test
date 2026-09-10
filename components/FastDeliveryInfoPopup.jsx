'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import FastDeliveryInfoSection from '@/components/FastDeliveryInfoSection';
import { FAST_DELIVERY_COPY } from '@/lib/fastDeliveryCopy';

export default function FastDeliveryInfoPopup({
  open,
  onClose,
  isArabic = false,
  children,
}) {
  const copy = isArabic ? FAST_DELIVERY_COPY.ar : FAST_DELIVERY_COPY.en;

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fast-delivery-dialog-title"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-transparent"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute end-3 top-3 z-10 rounded-full bg-white/90 p-2 text-slate-700 shadow hover:bg-white"
          aria-label={isArabic ? 'إغلاق' : 'Close'}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="fast-delivery-dialog-title" className="sr-only">
          {copy.conditionsTitle}
        </h2>
        <FastDeliveryInfoSection copy={copy} />
        {children ? (
          <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">{children}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
