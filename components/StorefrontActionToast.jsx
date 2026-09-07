'use client';

import Link from 'next/link';
import { Check, Heart, Package, ShoppingCart, X } from 'lucide-react';

const VARIANTS = {
  cart: {
    icon: ShoppingCart,
    iconClass: 'text-slate-700',
  },
  wishlist: {
    icon: Heart,
    iconClass: 'text-slate-700',
  },
  'wishlist-removed': {
    icon: Heart,
    iconClass: 'text-slate-500',
  },
  orders: {
    icon: Package,
    iconClass: 'text-slate-700',
  },
  success: {
    icon: Check,
    iconClass: 'text-emerald-700',
  },
};

export default function StorefrontActionToast({
  visible = true,
  variant = 'cart',
  title,
  subtitle,
  actionLabel,
  actionHref,
  onDismiss,
  floating = false,
}) {
  const config = VARIANTS[variant] || VARIANTS.cart;
  const Icon = config.icon;

  const card = (
    <div
      role="status"
      aria-live="polite"
      className={`flex w-[min(92vw,320px)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg ${
        visible ? '' : 'opacity-0 transition-opacity duration-200'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <Icon
          size={18}
          className={config.iconClass}
          fill={variant === 'wishlist' ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {actionLabel && actionHref ? (
          <Link
            href={actionHref}
            onClick={onDismiss}
            className="mt-0.5 inline-block text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            {actionLabel}
          </Link>
        ) : subtitle ? (
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );

  if (!floating) return card;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[2147483000] flex justify-center px-4 md:inset-x-auto md:bottom-8 md:end-8 md:start-auto md:justify-end">
      <div className="pointer-events-auto animate-[storefrontToastIn_0.25s_ease-out]">{card}</div>
    </div>
  );
}
