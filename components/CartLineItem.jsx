'use client';

import Image from '@/components/SafeNextImage';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import Counter from '@/components/Counter';
import { getProductSubtitle } from '@/lib/productDisplay';
import { resolveCartLinePriceDisplay } from '@/lib/cartPriceDisplay';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { AedText } from '@/components/CurrencySymbol';
import NewProductTagBadge from '@/components/NewProductTagBadge';

const LINE_TOTAL_CLASS =
  'shrink-0 min-w-[7.5rem] text-right tabular-nums text-base font-bold text-slate-900 sm:text-lg';

function getItemSubtitle(item) {
  if (item._isFreeGift) {
    return item._freeGiftTitle ? `Free gift • ${item._freeGiftTitle}` : 'Free gift';
  }
  return getProductSubtitle(item, {
    variantOptions: item.variantOptions || item._variantOptions,
    quantity: item.quantity,
  });
}

function formatMoney(currency, amount) {
  return (
    <AedText currency={currency}>
      {`${currency} ${Number(amount || 0).toLocaleString()}`}
    </AedText>
  );
}

export default function CartLineItem({
  item,
  maxQty,
  currency = 'AED',
  onRemove,
  onDecrease,
  isRemoving = false,
  isOutOfStock = false,
  productHref,
}) {
  const cartKey = item._cartKey || item._id;
  const pricing = resolveCartLinePriceDisplay(item);
  const subtitle = getItemSubtitle(item);
  const imageSrc = getProductThumbnailUrl(item) || item.images?.[0] || '/placeholder.png';

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 ${
        isOutOfStock ? 'border-red-100 bg-red-50/30' : 'border-slate-200'
      }`}
    >
      <div className="flex gap-4 sm:gap-5">
        <Link
          href={productHref || `/product/${item.slug || item._productId || item._id}`}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 sm:h-28 sm:w-28"
        >
          <Image
            src={imageSrc}
            alt={item.name}
            fill
            sizes="112px"
            className="object-contain p-2"
          />
          <NewProductTagBadge product={item} size="thumb" />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 pr-1">
            <div className="min-w-0 flex-1">
              <Link
                href={productHref || `/product/${item.slug || item._productId || item._id}`}
                className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 transition-colors hover:text-orange-600 sm:text-base"
              >
                {item.name}
              </Link>

              {subtitle ? (
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">{subtitle}</p>
              ) : null}

              {isOutOfStock ? (
                <span className="mt-2 inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">
                  Out of stock
                </span>
              ) : null}

              {!item._isFreeGift ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-orange-600 sm:text-base">
                    {formatMoney(currency, pricing.saleUnit)}
                    <span className="ml-1 text-xs font-medium text-slate-400">each</span>
                  </p>
                  {pricing.hasDiscount ? (
                    <>
                      <span className="text-sm text-slate-400 line-through tabular-nums">
                        {formatMoney(currency, pricing.regularUnit)}
                      </span>
                      <span className="inline-flex rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-600">
                        {pricing.discountPercent}% off
                      </span>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-emerald-600">FREE</p>
              )}
            </div>

            {!item._isFreeGift ? (
              <button
                type="button"
                onClick={() => onRemove?.(cartKey)}
                disabled={isRemoving}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                aria-label="Remove item"
              >
                <Trash2 size={18} />
              </button>
            ) : (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Auto-added
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="min-w-0">
              {item._isFreeGift ? (
                <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  Qty 1 gift
                </span>
              ) : (
                <Counter
                  productId={cartKey}
                  maxQty={maxQty}
                  product={item}
                  variant="cart"
                  onDecrease={onDecrease ? () => onDecrease(cartKey, item) : undefined}
                />
              )}
            </div>

            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">
                Subtotal
              </p>
              {item._isFreeGift ? (
                <p className={LINE_TOTAL_CLASS}>FREE</p>
              ) : (
                <>
                  <p className={LINE_TOTAL_CLASS}>
                    {formatMoney(currency, pricing.saleLineTotal)}
                  </p>
                  {pricing.hasDiscount ? (
                    <p className="text-xs text-slate-400 line-through tabular-nums">
                      {formatMoney(currency, pricing.regularLineTotal)}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
