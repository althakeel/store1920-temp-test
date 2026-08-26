'use client'
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useEffect, useState, useRef } from 'react';
import Image from '@/components/SafeNextImage';
import Link from 'next/link';
import {
  CheckCircle2,
  Copy,
  Check,
  Package,
  ShoppingBag,
  MapPin,
  CreditCard,
  Truck,
  Sparkles,
} from 'lucide-react';
import Loading from '@/components/Loading';
import { useAuth } from '@/lib/useAuth';
import { trackPurchase } from '@/lib/tracking';
import { trackOrderSuccessPurchaseOnce } from '@/lib/orderSuccessMetaPurchase';
import { canTrackMetaPurchaseOnOrderSuccess } from '@/lib/orderConfirmationPolicy';
import { hasTrackedPersistently, markTrackedPersistently, hasTrackedOnce, markTrackedOnce } from '@/lib/trackingDedupe';
import { getMetaPurchaseDedupeKey } from '@/lib/metaPurchase';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';
import { resolveOrderLineLineTotal, resolveOrderLinePackQuantity, resolveOrderLineQuantity } from '@/lib/gtmEcommerceHelpers';
import { clearPendingCheckoutOrder } from '@/lib/pendingCheckoutOrder';

export default function OrderSuccess() {
  return (
    <Suspense>
      <OrderSuccessContent />
    </Suspense>
  );
}

function OrderSuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user, getToken } = useAuth();
  const [copied, setCopied] = useState(false);
  const purchaseTrackedRef = useRef(false);

  useEffect(() => {
    const orderId = params.get('orderId');
    if (!orderId) {
      router.replace('/');
      return;
    }

    let cancelled = false;

    const fetchOrder = async () => {
      try {
        // Order success is opened with a specific orderId from checkout — treat that
        // as the access key. Do not attach auth here; a logged-in refetch was wiping
        // a valid guest/unlinked order when ownership did not match yet.
        const fetchOptions = { cache: 'no-store' };
        let data = null;

        for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
          const res = await fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`, fetchOptions);
          if (res.ok) {
            data = await res.json();
            break;
          }
          if (res.status !== 404 || attempt >= 4) {
            if (!cancelled) setOrders(null);
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
        }

        if (!data) {
          if (!cancelled) setOrders(null);
          return;
        }
        let loadedOrders = null;
        if (data.orders && Array.isArray(data.orders)) {
          loadedOrders = data.orders;
        } else if (data.order) {
          loadedOrders = [data.order];
        }
        if (cancelled) return;

        setOrders(loadedOrders);
        clearPendingCheckoutOrder();

        const loadedOrder = loadedOrders?.[0];
        if (loadedOrder?._id) {
          const status = String(loadedOrder.status || '').toUpperCase();
          const paidRedirect = params.get('stripe') === '1'
            || params.get('tabby') === '1'
            || params.get('tamara') === '1';

          // Never bounce to order-failed before verifying provider return params —
          // cancel/expiry can race ahead of the success webhook and leave PAYMENT_FAILED
          // while Tabby/Tamara/Stripe already took the money.
          if (!paidRedirect && (status === 'PAYMENT_FAILED' || status === 'CANCELLED')) {
            router.replace(`/order-failed?orderId=${orderId}&reason=${encodeURIComponent('Payment was not completed')}`);
            return;
          }

          const orderTrulyPaid = loadedOrder.isPaid === true
            || String(loadedOrder.paymentStatus || '').toLowerCase() === 'paid';
          // Prepaid upsell: the base order is COD (often already ORDER_PLACED),
          // so verify strictly by actual payment state instead of order status.
          const isPrepaidReturn = params.get('prepaid') === '1';
          const prepaidDiscountMissing = isPrepaidReturn
            && String(loadedOrder.coupon?.code || '').toUpperCase() !== 'PREPAID5';

          const applyVerifiedOrders = (data) => {
            if (cancelled) return;
            if (data?.order) {
              setOrders([data.order]);
            } else if (Array.isArray(data?.orders) && data.orders.length) {
              setOrders(data.orders);
            }
          };

          const reloadOrders = async () => {
            const refresh = await fetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`, fetchOptions);
            if (!refresh.ok) return null;
            return refresh.json();
          };

          const redirectIfStillFailed = (ordersPayload) => {
            if (cancelled || !paidRedirect) return;
            const refreshed = ordersPayload?.order
              || (Array.isArray(ordersPayload?.orders) ? ordersPayload.orders[0] : null)
              || loadedOrder;
            const refreshedStatus = String(refreshed?.status || '').toUpperCase();
            const refreshedPaid = refreshed?.isPaid === true
              || String(refreshed?.paymentStatus || '').toLowerCase() === 'paid';
            if (!refreshedPaid && (refreshedStatus === 'PAYMENT_FAILED' || refreshedStatus === 'CANCELLED')) {
              router.replace(`/order-failed?orderId=${orderId}&reason=${encodeURIComponent('Payment was not completed')}`);
            }
          };

          if (params.get('tabby') === '1' && !orderTrulyPaid) {
            fetch('/api/orders/verify-tabby', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: loadedOrder._id }),
            })
              .then((res) => (res.ok ? res.json() : null))
              .then(async (result) => {
                if (cancelled) return null;
                if (result?.success) {
                  const data = await reloadOrders();
                  applyVerifiedOrders(data);
                  return data;
                }
                return reloadOrders();
              })
              .then((data) => {
                if (data) applyVerifiedOrders(data);
                redirectIfStillFailed(data);
              })
              .catch(() => {
                redirectIfStillFailed(null);
              });
          } else if (params.get('tamara') === '1' && !orderTrulyPaid) {
            fetch('/api/orders/verify-tamara', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: loadedOrder._id }),
            })
              .then((res) => (res.ok ? res.json() : null))
              .then(async (result) => {
                if (cancelled) return null;
                if (result?.success) {
                  const data = await reloadOrders();
                  applyVerifiedOrders(data);
                  return data;
                }
                return reloadOrders();
              })
              .then((data) => {
                if (data) applyVerifiedOrders(data);
                redirectIfStillFailed(data);
              })
              .catch(() => {
                redirectIfStillFailed(null);
              });
          } else if (
            params.get('stripe') === '1'
            && (prepaidDiscountMissing || !orderTrulyPaid)
          ) {
            fetch('/api/orders/verify-stripe', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                orderId: loadedOrder._id,
                sessionId: params.get('session_id') || '',
              }),
            })
              .then((res) => (res.ok ? res.json() : null))
              .then(async (result) => {
                if (cancelled) return null;
                if (result?.success) {
                  const data = await reloadOrders();
                  applyVerifiedOrders(data);
                  return data;
                }
                return reloadOrders();
              })
              .then((data) => {
                if (data) applyVerifiedOrders(data);
                redirectIfStillFailed(data);
              })
              .catch(() => {
                redirectIfStillFailed(null);
              });
          } else if (paidRedirect && (status === 'PAYMENT_FAILED' || status === 'CANCELLED') && !orderTrulyPaid) {
            redirectIfStillFailed(null);
          }

          if (paidRedirect && orderTrulyPaid) {
            fetch('/api/orders/confirm-paid', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: loadedOrder._id }),
            }).catch(() => {});
          }

        }
      } catch {
        if (!cancelled) setOrders(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOrder();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  const order = orders && orders.length > 0 ? orders[0] : null;
  const orderRef = useRef(order);
  const userRef = useRef(user);
  orderRef.current = order;
  userRef.current = user;

  useEffect(() => {
    if (loading || !order?._id || purchaseTrackedRef.current) return;
    if (!canTrackMetaPurchaseOnOrderSuccess(order)) return;

    const orderId = String(order._id);
    const orderTrackingKey = `order-success:tracked:${orderId}`;
    const purchaseKey = getMetaPurchaseDedupeKey(orderId);
    const purchaseLoopKey = `order-success:purchase-loop:${orderId}`;

    if (hasTrackedPersistently(orderTrackingKey) || hasTrackedPersistently(purchaseKey)) {
      purchaseTrackedRef.current = true;
      return;
    }

    if (hasTrackedOnce(purchaseLoopKey)) {
      return;
    }
    markTrackedOnce(purchaseLoopKey);

    // Do NOT claim a session "started" key here. Auth/payment-verify remounts used to
    // cancel the retry loop and then permanently skip Purchase on the remount.

    let cancelled = false;
    let attempts = 0;

    const run = async () => {
      while (!cancelled && !purchaseTrackedRef.current && attempts < 60) {
        attempts += 1;
        const latestOrder = orderRef.current || order;
        const ok = await trackOrderSuccessPurchaseOnce(latestOrder, {
          onAnalytics: () => trackPurchase(latestOrder, { user: userRef.current, metaSkip: true }),
        });
        if (cancelled) return;
        if (ok || hasTrackedPersistently(purchaseKey)) {
          purchaseTrackedRef.current = true;
          markTrackedPersistently(orderTrackingKey);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    order?._id,
    order?.isPaid,
    order?.paymentStatus,
    order?.status,
    order?.metaPurchaseSentAt,
    user?.uid,
  ]);
  function getOrderNumber(orderObj) {
    return getDisplayOrderNumber(orderObj);
  }
  // Calculate totals
  const products = order ? order.orderItems : [];
  const subtotal = products.reduce((sum, item) => {
    const product = typeof item.productId === 'object' ? item.productId : null;
    return sum + resolveOrderLineLineTotal(item, product);
  }, 0);
  // Use shippingFee from order if available
  const shipping = typeof order?.shippingFee === 'number' ? order.shippingFee : 0;
  const discount = order?.coupon?.discount ? (order.coupon.discountType === 'percentage' ? (order.coupon.discount / 100 * subtotal) : Math.min(order.coupon.discount, subtotal)) : 0;
  const walletDiscount = Number(order?.walletDiscount || 0);
  const total = typeof order?.total === 'number' ? order.total : (subtotal + shipping - discount - walletDiscount);
  const orderDate = order?.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString();
  const currency = order?.currency || 'AED';
  const paymentMethod = String(order?.paymentMethod || 'COD').toUpperCase();
  const isPaid = order?.isPaid === true || paymentMethod === 'WALLET' || paymentMethod === 'CARD' || paymentMethod === 'STRIPE';
  const paidAmount = isPaid ? total : 0;
  const dueAmount = isPaid ? 0 : total;

  const paymentLabel = paymentMethod === 'COD'
    ? 'Cash on Delivery'
    : paymentMethod === 'CARD' || paymentMethod === 'STRIPE'
      ? 'Card Payment'
      : paymentMethod === 'WALLET'
        ? 'Wallet'
        : paymentMethod;

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(getOrderNumber(order));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goToTrackOrder = () => {
    if (!order) return;
    const qs = new URLSearchParams({
      orderNo: getOrderNumber(order),
      auto: '1',
    });
    const phone = String(order.shippingAddress?.phone || '').trim();
    if (phone) {
      const code = String(order.shippingAddress?.phoneCode || '+971').trim();
      qs.set('phone', `${code}${phone}`.replace(/\s/g, ''));
    }
    router.push(`/track-order?${qs.toString()}`);
  };

  // Render logic
  return (
    <>
      {loading ? (
        <Loading />
      ) : !orders || orders.length === 0 ? (
        <div className='min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4'>
          <div className='text-center'>
            <div className='text-red-600 text-6xl mb-4'>⚠️</div>
            <p className='text-xl font-semibold text-slate-700'>Order not found</p>
            <button 
              onClick={() => router.push('/')}
              className='mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition'
            >
              Back to Home
            </button>
          </div>
        </div>
      ) : (
        <div className="relative min-h-screen overflow-hidden bg-[#f4f7fb] py-10 px-4 sm:px-6 lg:py-14 lg:px-8">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-5xl">
            {/* Hero */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="h-11 w-11 text-white" strokeWidth={2.2} />
              </div>
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                Order placed successfully
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Thank you for your order
              </h1>
              <p className="mt-2 text-base text-slate-600">
                We&apos;ve received your order and will start preparing it shortly.
              </p>
            </div>

            {/* Order number */}
            <div className="mb-6 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-sm backdrop-blur sm:p-8">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                <div className="text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Order number
                  </p>
                  <p className="mt-1 font-mono text-3xl font-bold text-slate-900 sm:text-4xl">
                    {getOrderNumber(order)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyOrderNumber}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy number
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              {/* Left column */}
              <div className="space-y-6 lg:col-span-3">
                {/* Order details + address */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <h3 className="font-semibold text-slate-900">Order details</h3>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Date</dt>
                        <dd className="font-medium text-slate-900">{orderDate}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Payment</dt>
                        <dd className="font-medium text-slate-900">{paymentLabel}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                        <dt className="text-slate-500">Paid</dt>
                        <dd className="font-semibold text-emerald-600">
                          {currency} {paidAmount.toLocaleString()}
                        </dd>
                      </div>
                      {dueAmount > 0 && (
                        <div className="flex justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2">
                          <dt className="font-medium text-amber-800">Due on delivery</dt>
                          <dd className="font-bold text-amber-700">
                            {currency} {dueAmount.toLocaleString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {order?.shippingAddress && (
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <h3 className="font-semibold text-slate-900">Delivery address</h3>
                      </div>
                      <div className="space-y-1 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">{order.shippingAddress.name}</p>
                        <p>{order.shippingAddress.street}</p>
                        <p>
                          {order.shippingAddress.city}
                          {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''}
                          {order.shippingAddress.zip ? ` ${order.shippingAddress.zip}` : ''}
                        </p>
                        <p>{order.shippingAddress.country}</p>
                        {order.shippingAddress.phone && (
                          <p className="pt-2 text-slate-500">
                            {(order.shippingAddress.phoneCode || '+971')} {order.shippingAddress.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-5 flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Package className="h-4 w-4" />
                    </div>
                    <h3 className="font-semibold text-slate-900">
                      Items ({products.length})
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {products.map((item, idx) => {
                      const p = typeof item.productId === 'object' ? item.productId : null;
                      const key = (p && p._id) || (typeof item.productId === 'string' ? item.productId : idx);
                      const name = p?.name || item.name || 'Product';
                      const image = Array.isArray(p?.images) && p.images[0] ? p.images[0] : null;
                      const displayQty = resolveOrderLineQuantity(item, p);
                      const lineTotal = resolveOrderLineLineTotal(item, p);

                      return (
                        <div
                          key={key}
                          className="flex gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                        >
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                            {image ? (
                              <Image
                                src={image}
                                alt={name}
                                fill
                                sizes="64px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-300">
                                <Package className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-medium text-slate-900">{name}</p>
                            <p className="mt-1 text-xs text-slate-500">Qty {displayQty}</p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-slate-900">
                            {currency} {lineTotal.toLocaleString()}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right column — summary */}
              <div className="lg:col-span-2">
                <div className="sticky top-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Order summary</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Subtotal</dt>
                      <dd className="font-medium text-slate-900">{currency} {subtotal.toLocaleString()}</dd>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <dt>Discount</dt>
                        <dd>-{currency} {discount.toLocaleString()}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Shipping</dt>
                      <dd className="font-medium text-slate-900">{currency} {shipping.toLocaleString()}</dd>
                    </div>
                    {walletDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <dt>Wallet</dt>
                        <dd>-{currency} {walletDiscount.toLocaleString()}</dd>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-100 pt-4 text-base">
                      <dt className="font-semibold text-slate-900">Total</dt>
                      <dd className="text-xl font-bold text-emerald-600">
                        {currency} {total.toLocaleString()}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 flex items-start gap-3 rounded-xl bg-sky-50 p-4 text-sm text-sky-900">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      {dueAmount > 0
                        ? 'Your order is confirmed. Please keep the due amount ready for delivery.'
                        : 'Payment received. We will notify you when your order ships.'}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={goToTrackOrder}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <Package className="h-4 w-4" />
                      Track order
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/')}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Continue shopping
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {!user && (
              <div className="mt-8 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 text-center sm:flex sm:items-center sm:justify-between sm:text-left">
                <div>
                  <p className="font-semibold text-slate-900">Want to track this order later?</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Sign in to save your order history and get delivery updates.
                  </p>
                </div>
                <Link
                  href="/dashboard/profile"
                  className="mt-4 inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 sm:mt-0"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
