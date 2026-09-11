"use client";

import React from "react";
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
import { AedText } from '@/components/CurrencySymbol';

const DEFAULT_AUTO_DISMISS_SECONDS = 15;

export default function PrepaidUpsellModal({
  open,
  onClose,
  onNoThanks,
  onPayNow,
  onAutoDismiss,
  loading = false,
  orderTotal = 0,
  discountAmount = 0,
  autoDismissSeconds = DEFAULT_AUTO_DISMISS_SECONDS,
}) {
  const { market, formatAmount } = useStorefrontMarket();
  const currency = market.currency;
  const [navigating, setNavigating] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(autoDismissSeconds);
  const [payAttempted, setPayAttempted] = React.useState(false);
  const dismissedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      dismissedRef.current = false;
      setNavigating(false);
      setPayAttempted(false);
      setSecondsLeft(autoDismissSeconds);
      return undefined;
    }

    if (!autoDismissSeconds || !onAutoDismiss || loading || payAttempted) {
      return undefined;
    }

    setSecondsLeft(autoDismissSeconds);
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          if (!dismissedRef.current) {
            dismissedRef.current = true;
            setNavigating(true);
            onAutoDismiss();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [open, autoDismissSeconds, onAutoDismiss, loading, payAttempted]);

  if (!open) return null;

  const handleNoThanks = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setNavigating(true);
    onNoThanks();
  };

  const handlePayNow = () => {
    if (dismissedRef.current || navigating) return;
    setPayAttempted(true);
    onPayNow();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div className="relative bg-gradient-to-b from-green-200 to-green-100 rounded-2xl shadow-2xl w-[92vw] max-w-md p-0" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white flex items-center justify-center shadow">
            <svg className="w-9 h-9 text-green-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow">
            <h3 className="text-center text-xl font-bold text-slate-900">Your order is confirmed! <span role="img" aria-label="celebrate">🎉</span></h3>
            <p className="text-center text-slate-600 mt-2">Get an extra <span className="text-green-600 font-bold">5% OFF</span> when you pay now!</p>

            {autoDismissSeconds > 0 && !loading && !navigating ? (
              <p className="mt-3 text-center text-xs font-medium text-slate-500">
                Continuing with your COD order in {secondsLeft}s...
              </p>
            ) : null}

            {orderTotal > 0 && (
              <div className="mt-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-300">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600 text-sm">Original Amount:</span>
                  <span className="text-slate-900 font-semibold line-through"><AedText currency={currency}>{`${currency}${formatAmount(orderTotal)}`}</AedText></span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-green-700 font-semibold text-sm">5% Discount:</span>
                  <span className="text-green-700 font-bold">- <AedText currency={currency}>{`${currency}${formatAmount(discountAmount)}`}</AedText></span>
                </div>
                <div className="border-t border-green-300 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-900 font-bold">Pay Now:</span>
                    <span className="text-green-600 font-bold text-xl"><AedText currency={currency}>{`${currency}${formatAmount(orderTotal - discountAmount)}`}</AedText></span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <button
                type="button"
                className={`w-full rounded-xl py-3.5 font-bold text-slate-900 bg-yellow-400 hover:bg-yellow-500 shadow-lg flex items-center justify-center gap-2 ${loading || navigating ? 'opacity-70 cursor-not-allowed' : ''}`}
                onClick={handlePayNow}
                disabled={loading || navigating}
              >
                <span>⚡</span>
                <span>PAY NOW</span>
                <span className="inline-flex gap-1">
                  <span className="text-xs bg-white/30 px-1 rounded">💳</span>
                  <span className="text-xs bg-white/30 px-1 rounded">🏧</span>
                </span>
              </button>
              <button
                type="button"
                className={`w-full rounded-xl py-3.5 font-semibold text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 ${navigating ? 'opacity-70 cursor-not-allowed' : ''}`}
                onClick={handleNoThanks}
                disabled={loading || navigating}
              >
                {navigating ? 'REDIRECTING...' : 'NO, THANKS'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
