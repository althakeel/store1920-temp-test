'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import Image from '@/components/SafeNextImage';
import { useDispatch } from 'react-redux';
import { clearCart, setCartEntry } from '@/lib/features/cart/cartSlice';
import { formatVariantOptionsLabel } from '@/lib/productVariantOptions';
import Loading from '@/components/Loading';
import { Gift, ImageIcon, ShoppingCart, Tag } from 'lucide-react';

function formatMoney(amount, currency = 'AED') {
  const value = Number(amount || 0);
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function RecoverCartPage() {
  const { token } = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offer, setOffer] = useState(null);
  const [applying, setApplying] = useState(false);

  const recoveryToken = useMemo(
    () => decodeURIComponent(String(token || '').trim()),
    [token],
  );

  useEffect(() => {
    if (!recoveryToken) return;

    (async () => {
      try {
        const { data } = await axios.get(`/api/abandoned-cart-recovery/${encodeURIComponent(recoveryToken)}`);
        setOffer(data);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('abandonedCartRecoveryToken', recoveryToken);
        }
      } catch (err) {
        setError(err?.response?.data?.error || 'This recovery link is invalid or expired');
      } finally {
        setLoading(false);
      }
    })();
  }, [recoveryToken]);

  const savings = useMemo(() => {
    if (!offer?.cart) return 0;
    return Math.max(0, Number(offer.cart.originalTotal || 0) - Number(offer.cart.offerTotal || 0));
  }, [offer]);

  const handleContinue = async () => {
    if (!offer?.cart?.items?.length || !recoveryToken) return;

    setApplying(true);
    try {
      dispatch(clearCart());

      for (const item of offer.cart.items) {
        const productId = String(item.productId || '');
        if (!productId) continue;

        dispatch(setCartEntry({
          productId,
          entry: {
            quantity: Math.max(1, Number(item.quantity || 1)),
            price: Number(item.offerUnitPrice || item.price || 0),
            ...(item.variantOptions ? { variantOptions: item.variantOptions } : {}),
            recoveryToken,
          },
        }));
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('abandonedCartRecoveryToken', recoveryToken);
        const cartState = { cartItems: {}, total: 0 };
        offer.cart.items.forEach((item) => {
          const productId = String(item.productId || '');
          if (!productId) return;
          const quantity = Math.max(1, Number(item.quantity || 1));
          cartState.cartItems[productId] = {
            quantity,
            price: Number(item.offerUnitPrice || item.price || 0),
            ...(item.variantOptions ? { variantOptions: item.variantOptions } : {}),
            recoveryToken,
          };
          cartState.total += quantity;
        });
        localStorage.setItem('cartState', JSON.stringify(cartState));
      }

      router.push('/checkout?recovery=1');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <Loading />;

  if (error || !offer?.cart) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <Tag className="mb-4 text-slate-300" size={48} />
        <h1 className="text-2xl font-bold text-slate-900">Offer unavailable</h1>
        <p className="mt-2 text-slate-600">{error || 'This private cart offer could not be loaded.'}</p>
        <p className="mt-4 text-sm text-slate-500">
          If you received this link by email, ask the store to send a fresh discount link from Abandoned checkout.
        </p>
      </div>
    );
  }

  const { cart, store } = offer;
  const currency = cart.currency || 'AED';
  const discountLabel = cart.discountType === 'percent' && cart.discountValue
    ? `${cart.discountValue}% off your cart`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl">
          <div className="bg-slate-900 px-6 py-8 text-center text-white">
            <Gift className="mx-auto mb-3 text-emerald-300" size={36} />
            <h1 className="text-2xl font-bold">Your private cart offer</h1>
            <p className="mt-2 text-sm text-slate-300">
              {store?.name ? `From ${store.name}` : 'Exclusive pricing just for you'}
            </p>
          </div>

          <div className="space-y-5 px-4 py-6 sm:px-6">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-center">
              <p className="text-sm font-medium text-emerald-800">Your offer total</p>
              <p className="mt-1 text-3xl font-bold text-emerald-900">{formatMoney(cart.offerTotal, currency)}</p>
              <p className="mt-2 text-sm text-emerald-700">
                <span className="line-through text-slate-500">{formatMoney(cart.originalTotal, currency)}</span>
                {savings > 0 ? (
                  <>
                    {' '}
                    · You save {formatMoney(savings, currency)}
                  </>
                ) : null}
              </p>
              {discountLabel ? (
                <p className="mt-1 text-sm font-semibold text-emerald-800">{discountLabel}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              {cart.items.map((item) => {
                const originalUnit = Number(item.originalUnitPrice ?? item.originalPrice ?? 0);
                const offerUnit = Number(item.offerUnitPrice ?? item.price ?? 0);
                const quantity = Math.max(1, Number(item.quantity || 1));
                const hasDiscount = originalUnit > offerUnit + 0.001;

                return (
                  <div
                    key={`${item.productId}-${quantity}`}
                    className="flex gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name || 'Product'}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="text-slate-300" size={28} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {item.slug ? (
                        <Link
                          href={`/product/${item.slug}`}
                          className="line-clamp-2 font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          {item.name || 'Product'}
                        </Link>
                      ) : (
                        <p className="line-clamp-2 font-semibold text-slate-900">{item.name || 'Product'}</p>
                      )}
                      {formatVariantOptionsLabel(item.variantOptions) ? (
                        <p className="mt-0.5 text-xs text-slate-500">{formatVariantOptionsLabel(item.variantOptions)}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-slate-500">Qty {quantity}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {hasDiscount ? (
                          <span className="text-sm text-slate-400 line-through">
                            {formatMoney(originalUnit, currency)}
                          </span>
                        ) : null}
                        <span className="text-lg font-bold text-emerald-700">
                          {formatMoney(offerUnit, currency)}
                        </span>
                        {hasDiscount ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            Offer price
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {hasDiscount ? (
                        <p className="text-xs text-slate-400 line-through">
                          {formatMoney(item.originalLineTotal ?? originalUnit * quantity, currency)}
                        </p>
                      ) : null}
                      <p className="text-base font-bold text-slate-900">
                        {formatMoney(item.offerLineTotal ?? offerUnit * quantity, currency)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-slate-500">
              These discounted prices are only visible through this private link.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleContinue}
                disabled={applying}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                <ShoppingCart size={18} />
                {applying ? 'Loading checkout...' : 'Continue to checkout'}
              </button>
              <Link
                href="/shop"
                className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Browse more products
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
