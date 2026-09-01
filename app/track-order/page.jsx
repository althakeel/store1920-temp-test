"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { toast } from "react-hot-toast";
import TrackingTimeline from "@/components/TrackingTimeline";
import AnimatedProgressTracker from "@/components/AnimatedProgressTracker";
import styles from "./tracking.module.css";
import { CheckCircle2, Clock3, PackageSearch, RefreshCw, SearchCheck } from "lucide-react";
import { getDisplayOrderNumber, getDisplayOrderLabel, getPublicTrackingDisplayId, extractTrackingReferenceFromInput } from "@/lib/orderDisplay";
import { isWaslahCourierTerminal } from "@/lib/waslahTracking";

const LIVE_TRACKING_POLL_MS = 30 * 1000;

function buildTrackingParams(phoneNumber, awbNumber) {
  const params = new URLSearchParams();
  const contact = String(phoneNumber || '').trim();
  const reference = extractTrackingReferenceFromInput(awbNumber);

  if (contact.includes('@')) {
    params.append('email', contact);
  } else if (contact) {
    params.append('phone', contact);
  }

  if (reference) {
    if (!contact && reference.includes('@')) {
      params.append('email', reference);
    } else {
      params.append('awb', reference);
    }
  }

  return params;
}

function getTrackingOrderKey(order = {}) {
  return String(
    order?._id
    || order?.waslahReturn?.trackingNumber
    || order?.waslah?.emxTrackingNumber
    || order?.trackingId
    || order?.waslah?.trackingNumber
    || '',
  ).trim();
}

function mergePublicLiveTracking(current, incoming) {
  if (!current || !incoming) return incoming || current;
  const currentId = String(current._id || '');
  const incomingId = String(incoming._id || '');
  if (currentId && currentId !== incomingId) return current;
  if (!currentId && incomingId) return incoming;

  return {
    ...current,
    status: incoming.status ?? current.status,
    courier: incoming.courier ?? current.courier,
    trackingId: incoming.trackingId ?? current.trackingId,
    trackingUrl: incoming.trackingUrl ?? current.trackingUrl,
    trackingKind: incoming.trackingKind ?? current.trackingKind,
    linkedOriginalTrackingNumber: incoming.linkedOriginalTrackingNumber ?? current.linkedOriginalTrackingNumber,
    linkedReturnTrackingNumber: incoming.linkedReturnTrackingNumber ?? current.linkedReturnTrackingNumber,
    waslahReturn: incoming.waslahReturn
      ? { ...(current.waslahReturn || {}), ...incoming.waslahReturn }
      : current.waslahReturn,
    waslah: incoming.waslah
      ? { ...(current.waslah || {}), ...incoming.waslah }
      : current.waslah,
    warehousePacking: incoming.warehousePacking || current.warehousePacking,
    c3x: incoming.c3x
      ? { ...(current.c3x || {}), ...incoming.c3x }
      : current.c3x,
    delhivery: incoming.delhivery
      ? { ...(current.delhivery || {}), ...incoming.delhivery }
      : current.delhivery,
  };
}

function getActiveTrackingDisplayId(order = {}) {
  if (order?.trackingKind === 'return') {
    return String(order.trackingId || order.waslahReturn?.trackingNumber || '').trim();
  }
  return getPublicTrackingDisplayId(order);
}

function TrackOrderPageInner() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [awbNumber, setAwbNumber] = useState('')
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState(null)
  const [relatedOrders, setRelatedOrders] = useState([])
  const [notFound, setNotFound] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const autoTrackStarted = useRef(false)
  const trackingRefreshInFlight = useRef(false)
  const trackingRefreshController = useRef(null)
  const trackingLookupGeneration = useRef(0)
  const activeTrackingOrderKey = useRef('')

  activeTrackingOrderKey.current = getTrackingOrderKey(order)

  const refreshLiveTracking = async ({ manual = false } = {}) => {
    if (trackingRefreshInFlight.current || !order) return null;
    const trackingReference = String(
      getActiveTrackingDisplayId(order)
      || order.trackingId
      || order.waslah?.emxTrackingNumber
      || order.waslah?.trackingNumber
      || awbNumber
      || '',
    ).trim();
    if (!trackingReference) return null;

    const requestGeneration = trackingLookupGeneration.current;
    const requestOrderKey = getTrackingOrderKey(order) || trackingReference;
    const controller = new AbortController();
    trackingRefreshInFlight.current = true;
    trackingRefreshController.current = controller;
    if (manual) setRefreshing(true);
    try {
      const params = buildTrackingParams('', trackingReference);

      const res = await axios.get(`/api/track-order?${params.toString()}`, {
        signal: controller.signal,
      });
      if (res.data.success && res.data.order) {
        if (
          controller.signal.aborted
          || requestGeneration !== trackingLookupGeneration.current
          || requestOrderKey !== activeTrackingOrderKey.current
        ) return null;

        const liveOrder = res.data.order;
        const currentId = String(order._id || '');
        const liveId = String(liveOrder._id || '');
        if (currentId && currentId !== liveId) return null;

        setOrder((current) => (
          getTrackingOrderKey(current) === requestOrderKey
            ? mergePublicLiveTracking(current, liveOrder)
            : current
        ));
        if (Array.isArray(res.data.relatedOrders)) setRelatedOrders(res.data.relatedOrders);
        if (manual) toast.success("Tracking updated!");
        return liveOrder;
      }
    } catch (error) {
      if (manual && !axios.isCancel(error) && error?.name !== 'CanceledError') {
        toast.error("Failed to refresh tracking");
      }
    } finally {
      if (trackingRefreshController.current === controller) trackingRefreshController.current = null;
      trackingRefreshInFlight.current = false;
      if (manual) setRefreshing(false);
    }
    return null;
  };

  const handleRefresh = () => refreshLiveTracking({ manual: true });

  useEffect(() => {
    const trackingReference = String(
      getActiveTrackingDisplayId(order)
      || order?.trackingId
      || order?.waslahReturn?.trackingNumber
      || order?.waslah?.emxTrackingNumber
      || order?.waslah?.trackingNumber
      || '',
    ).trim();
    const courier = String(order?.courier || '').toLowerCase();
    const isEmxOrder = Boolean(
      order?.waslah?.orderId
      || order?.waslahReturn?.orderId
      || order?.waslah?.trackingNumber
      || order?.waslahReturn?.trackingNumber
      || order?.waslah?.emxTrackingNumber
      || courier.includes('emx')
      || courier.includes('waslah'),
    );
    const isTerminal = isWaslahCourierTerminal(order);
    if (!trackingReference || !isEmxOrder || isTerminal) return undefined;

    let stopped = false;
    let timerId = null;

    const scheduleNext = () => {
      if (stopped) return;
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(runRefresh, LIVE_TRACKING_POLL_MS);
    };
    const runRefresh = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'hidden') await refreshLiveTracking();
      scheduleNext();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || stopped) return;
      if (timerId) window.clearTimeout(timerId);
      runRefresh();
    };

    scheduleNext();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopped = true;
      trackingRefreshController.current?.abort();
      if (timerId) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // Primitive dependencies keep the timer stable when only timeline details change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order?._id,
    order?.trackingId,
    order?.waslah?.trackingNumber,
    order?.waslah?.appStatus,
    order?.waslah?.carrierStatus,
    order?.waslah?.currentSubtag,
    order?.waslah?.lastSubtag,
    order?.courier,
    order?.status,
  ]);

  useEffect(() => {
    const orderNo = searchParams.get('order')
      || searchParams.get('orderNo')
      || searchParams.get('orderId')
      || searchParams.get('awb')
      || searchParams.get('q')
      || '';
    const phone = searchParams.get('phone') || '';

    if (phone) setPhoneNumber(phone);
    if (orderNo) setAwbNumber(orderNo);
  }, [searchParams]);

  const trackWithParams = async (params) => {
    const res = await axios.get(`/api/track-order?${params.toString()}`, {
      validateStatus: (status) => status < 500,
    })
    if (res.data.success && res.data.order) {
      setOrder(res.data.order)
      setRelatedOrders(Array.isArray(res.data.relatedOrders) ? res.data.relatedOrders : [])
      setNotFound(false)
      if (res.data.message) {
        toast.success(res.data.message)
      }
      return true
    }
    return false
  }

  const runTrack = async ({ phone = phoneNumber, reference = awbNumber } = {}) => {
    const contact = String(phone || '').trim();
    const ref = extractTrackingReferenceFromInput(reference);

    if (!contact && !ref) {
      toast.error('Please enter mobile number, email, tracking number, or order number — not the track-order page URL');
      return false;
    }
    if (ref && ref !== String(reference || '').trim()) {
      setAwbNumber(ref);
    }

    trackingLookupGeneration.current += 1;
    trackingRefreshController.current?.abort();
    setLoading(true);
    setNotFound(false);
    setOrder(null);
    setRelatedOrders([]);

    try {
      const params = buildTrackingParams(contact, ref);

      const tracked = await trackWithParams(params);
      if (tracked) {
        return true;
      }

      if (ref) {
        const emxRetry = await axios.get(`/api/track-order?carrier=emx&awb=${encodeURIComponent(ref)}`, {
          validateStatus: (status) => status < 500,
        });
        if (emxRetry.data?.success && emxRetry.data?.order) {
          setOrder(emxRetry.data.order);
          setRelatedOrders([]);
          setNotFound(false);
          toast.dismiss();
          return true;
        }

        const retry = await axios.get(`/api/track-order?carrier=c3xpress&awb=${encodeURIComponent(ref)}`, {
          validateStatus: (status) => status < 500,
        });
        if (retry.data?.success && retry.data?.order) {
          setOrder(retry.data.order);
          setRelatedOrders([]);
          setNotFound(false);
          toast.dismiss();
          return true;
        }

        setNotFound(true);
        toast.error(retry.data?.message || 'Order not found');
        return false;
      }

      setNotFound(true);
      toast.error('Order not found');
      return false;
    } catch (error) {
      const msg = error?.response?.data?.message;
      toast.error(msg || 'Unable to track order. Please try again.');
      setNotFound(true);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    await runTrack();
  };

  useEffect(() => {
    const orderNo = searchParams.get('order')
      || searchParams.get('orderNo')
      || searchParams.get('orderId')
      || searchParams.get('awb')
      || searchParams.get('q')
      || '';
    const phone = searchParams.get('phone') || '';

    if (!orderNo || autoTrackStarted.current) return;
    autoTrackStarted.current = true;

    runTrack({ phone, reference: orderNo });
  }, [searchParams]);

  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'DELIVERED':
        return 'bg-green-100 text-green-700';
      case 'OUT_FOR_DELIVERY':
        return 'bg-teal-100 text-teal-700';
      case 'SHIPPED':
        return 'bg-blue-100 text-blue-700';
      case 'WAREHOUSE_RECEIVED':
        return 'bg-indigo-100 text-indigo-700';
      case 'PICKED_UP':
        return 'bg-purple-100 text-purple-700';
      case 'PICKUP_REQUESTED':
        return 'bg-yellow-100 text-yellow-700';
      case 'WAITING_FOR_PICKUP':
        return 'bg-teal-100 text-teal-800';
      case 'CONFIRMED':
        return 'bg-orange-100 text-orange-700';
      case 'PROCESSING':
        return 'bg-yellow-100 text-yellow-700';
      case 'RETURN_REQUESTED':
        return 'bg-pink-100 text-pink-700';
      case 'RTO':
        return 'bg-rose-100 text-rose-800';
      case 'RETURN':
        return 'bg-pink-200 text-pink-900';
      case 'RETURNED':
        return 'bg-pink-200 text-pink-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  const getPublicStatusLabel = (status, packed = false) => {
    const normalized = String(status || 'ORDER_PLACED').toUpperCase();
    if (packed || normalized === 'WAITING_FOR_PICKUP') return 'Packed — awaiting pickup';
    if (normalized === 'PICKUP_REQUESTED') return 'Pickup requested';
    if (normalized === 'PICKED_UP') return 'Picked up';
    return normalized.replace(/_/g, ' ');
  };

  const getStatusSteps = (status, packed = false) => {
    const steps = [
      'ORDER PLACED',
      'PROCESSING',
      'PACKED',
      'SHIPPED',
      'OUT FOR DELIVERY',
      'DELIVERED',
    ];
    const normalizedStatus = status?.toUpperCase();
    const progressStatus = ['PICKED_UP', 'WAREHOUSE_RECEIVED'].includes(normalizedStatus)
      ? 'SHIPPED'
      : (packed || ['WAITING_FOR_PICKUP', 'PICKUP_REQUESTED'].includes(normalizedStatus))
        ? 'PACKED'
        : normalizedStatus === 'ORDER_PLACED'
          ? 'ORDER PLACED'
          : normalizedStatus === 'OUT_FOR_DELIVERY'
            ? 'OUT FOR DELIVERY'
            : normalizedStatus;
    const currentIndex = steps.indexOf(progressStatus);
    const safeIndex = currentIndex >= 0 ? currentIndex : (packed ? 2 : 0);
    return steps.map((step, idx) => ({
      name: step,
      completed: idx <= safeIndex,
      active: idx === safeIndex
    }));
  }

  return (
    <>
      {/* <Navbar /> removed, now global via ClientLayout */}
      <div className="bg-slate-50 py-12">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">Track Your Order</h1>
            <p className="text-slate-600">Enter your mobile number, email, tracking number, reference number, or order number to track your shipment</p>
          </div>

          {/* Search Form */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
            <form onSubmit={handleTrack} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mobile Number or Email</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Enter your mobile number or email"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">OR</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tracking number / Order No</label>
                <input
                  type="text"
                  value={awbNumber}
                  onChange={(e) => setAwbNumber(e.target.value)}
                  placeholder="EMX tracking number, order no, or reference"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">Use the EMX tracking number from your label (e.g. 1000045332510), order number, mobile, or email.</p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="relative w-full overflow-hidden rounded-lg bg-slate-800 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-800"
              >
                {loading ? (
                  <span className="relative flex h-6 items-center justify-center">
                    <span className={styles["tracking-button-sheen"]} aria-hidden="true" />
                    <span className="relative z-10 inline-flex items-center gap-2">
                      <span className={styles["tracking-button-orbit"]} aria-hidden="true">
                        <PackageSearch size={16} strokeWidth={2.4} />
                      </span>
                      <span>Checking shipment</span>
                    </span>
                  </span>
                ) : (
                  'Track Order'
                )}
              </button>
            </form>
          </div>

          {/* Order Not Found */}
          {notFound && (
            <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Order Not Found</h3>
              <p className="text-slate-600">Please check your mobile number, email, tracking number, reference number, or booking number and try again.</p>
            </div>
          )}

              {/* Order Details */}
          {order && (
            <div className="space-y-6">
              {order.trackingKind === 'return' ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                  <p className="font-semibold">Return pickup tracking</p>
                  <p className="mt-1">
                    You searched the return pickup AWB
                    {order.trackingId ? ` (${order.trackingId})` : ''}.
                    {order.linkedOriginalTrackingNumber ? (
                      <> Original delivery AWB: <span className="font-mono font-semibold">{order.linkedOriginalTrackingNumber}</span>.</>
                    ) : null}
                  </p>
                </div>
              ) : null}
              {relatedOrders.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900 mb-3">
                    We found {relatedOrders.length + 1} order(s) for this contact. Showing the most recent below.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {relatedOrders.map((entry) => (
                      <button
                        key={entry._id}
                        type="button"
                        onClick={async () => {
                          const nextReference = getDisplayOrderNumber(entry) || String(entry.shortOrderNumber || '')
                          trackingLookupGeneration.current += 1
                          trackingRefreshController.current?.abort()
                          setAwbNumber(nextReference)
                          setPhoneNumber('')
                          setLoading(true)
                          setNotFound(false)
                          try {
                            const params = buildTrackingParams('', nextReference)
                            await trackWithParams(params)
                          } finally {
                            setLoading(false)
                          }
                        }}
                        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-100"
                      >
                        Order {getDisplayOrderNumber(entry) || 'Pending'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Tracking not ready notice */}
              {!getActiveTrackingDisplayId(order) && !order.c3x && !order.waslah && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800 text-sm">
                  Shipment hasn't been created yet. You'll see live tracking here once the EMX tracking number is generated.
                </div>
              )}
              {/* Order Status */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      {order._id ? 'Store order status' : 'Shipment status'}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      {getActiveTrackingDisplayId(order)
                        ? `${order.trackingKind === 'return' ? 'Return tracking' : 'Tracking number'}: ${getActiveTrackingDisplayId(order)}`
                        : getDisplayOrderLabel(order)}
                    </h2>
                    {order.createdAt && !Number.isNaN(new Date(order.createdAt).getTime()) && (
                      <p className="mt-1 text-sm text-slate-600">Placed on {new Date(order.createdAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${getStatusColor(order.status)}`}>
                    {getPublicStatusLabel(order.status, order?.warehousePacking?.packed === true)}
                  </span>
                </div>

                {order?.warehousePacking?.packed ? (
                  <div className="mb-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                    <p className="font-semibold">Packed and ready for courier pickup</p>
                    {order.warehousePacking.packedAt ? (
                      <p className="mt-1 text-xs text-teal-800">
                        Packed on {new Date(order.warehousePacking.packedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Progress Tracker */}
                <AnimatedProgressTracker steps={getStatusSteps(order.status, order?.warehousePacking?.packed === true)} />
              </div>

              {/* Tracking Info */}
              {(order.trackingId || order.trackingUrl || order.courier || order.c3x || order.waslah) && (
                <>
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Tracking Information
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {order.courier && (
                        <div className="rounded-lg bg-white/75 p-3">
                          <p className="text-xs font-medium text-slate-500">Courier</p>
                          <p className="mt-1 font-semibold text-slate-900">{order.courier}</p>
                        </div>
                      )}
                      {getActiveTrackingDisplayId(order) ? (
                        <div className="rounded-lg bg-white/75 p-3">
                          <p className="text-xs font-medium text-slate-500">
                            {order.trackingKind === 'return' ? 'Return tracking number' : 'Tracking number'}
                          </p>
                          <p className="mt-1 font-mono font-semibold text-slate-900">{getActiveTrackingDisplayId(order)}</p>
                        </div>
                      ) : null}
                      {order.trackingUrl && (
                        <div className="rounded-lg bg-white/75 p-3 sm:col-span-2">
                          <p className="text-xs font-medium text-slate-500">Track Shipment</p>
                          <a 
                            href={order.trackingUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                          >
                            Open courier tracking
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

              {/* EMX / Waslah Timeline */}
              {(order.waslah?.events?.length > 0
                || order.waslah?.currentStatus
                || order.waslah?.lastSubtagMessage
                || order.waslah?.trackingNumber
                || (order.courier && String(order.courier).toLowerCase().includes('emx'))) && (
                <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${styles["tracking-card-enter"]}`}>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-violet-600">EMX</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">Shipment Updates</h3>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {(order.waslah?.currentStatus || order.waslah?.lastSubtagMessage) && (
                    <p className="mb-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-sm text-violet-900">
                      <span className="font-medium">EMX courier status:</span>{' '}
                      {order.waslah.currentStatus || order.waslah.lastSubtagMessage}
                    </p>
                  )}
                  {!isWaslahCourierTerminal(order) && (
                    <p className="mb-3 text-xs text-violet-700">
                      Live EMX updates refresh automatically every 30 seconds while this page is open.
                    </p>
                  )}
                  {order.waslah?.isDelivered && (
                    <div className={`mb-4 flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 ${styles["status-badge-active"]}`}>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Package delivered
                    </div>
                  )}
                  {order.waslah?.events?.length > 0 ? (
                    <TrackingTimeline events={order.waslah.events} type="waslah" />
                  ) : (
                    <p className="rounded-lg border border-dashed border-violet-200 bg-violet-50/60 px-4 py-6 text-center text-sm text-violet-800">
                      Live status is available. Event history will appear here after the next EMX update — tap Refresh to check again.
                    </p>
                  )}
                </div>
              )}

              {/* C3Xpress Timeline */}
              {order.c3x?.events?.length > 0 && (
                <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${styles["tracking-card-enter"]}`}>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-600">C3Xpress</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">Shipment Updates</h3>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                  {order.c3x.origin && order.c3x.destination && (
                    <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-800">Route:</span> {order.c3x.origin} to {order.c3x.destination}
                    </p>
                  )}
                  {(order.c3x.actualWeight || order.c3x.chargeableWeight) && (
                    <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-800">Weight:</span> {order.c3x.actualWeight || order.c3x.chargeableWeight} kg
                    </p>
                  )}
                  {order.c3x.pieces && (
                    <p className="text-sm text-slate-500 mb-2">
                      <span className="font-medium">Pieces:</span> {order.c3x.pieces}
                    </p>
                  )}
                  {order.c3x.lastLocation && (
                    <p className="text-sm text-slate-500 mb-4">
                      <span className="font-medium">Last Location:</span> {order.c3x.lastLocation}
                    </p>
                  )}
                  {order.c3x.isDelivered && order.c3x.deliveredTo && (
                    <div className={`mb-4 flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 ${styles["status-badge-active"]}`}>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Delivered to: {order.c3x.deliveredTo}
                    </div>
                  )}
                  <TrackingTimeline events={order.c3x.events} type="c3xpress" />
                </div>
              )}
                  {/* More tracking details/help */}
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mt-4 text-sm text-slate-700">
                    <p>
                      <strong>How tracking works:</strong> Once your order is shipped, you will receive a tracking ID and courier details. Use the tracking link above to see real-time shipment status on the courier's website. If tracking is not yet available, please check back later or contact our support team for assistance.
                    </p>
                  </div>
                </>
              )}

              {/* Order Items */}
              {(order.orderItems || []).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Order Items</h3>
                <div className="space-y-4">
                  {(order.orderItems || []).map((item, idx) => {
                    const product = item.productId || item.product || {}
                    return (
                      <div key={idx} className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0">
                        <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No image</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-800">{product.name || 'Product'}</h4>
                          <p className="text-sm text-slate-600 mt-1">Quantity: {item.quantity}</p>
                          <p className="text-sm text-slate-600">Price: AED{(item.price || 0).toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-800">AED{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between text-slate-800 font-semibold">
                    <span>Total:</span>
                    <span>AED{(order.total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              )}

              {/* Shipping Address */}
              {order.shippingAddress && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Shipping Address</h3>
                  <div className="text-slate-700 space-y-1">
                    <p className="font-medium">{order.shippingAddress.name}</p>
                    <p>{order.shippingAddress.street}</p>
                    <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                    <p>{order.shippingAddress.country}</p>
                    {order.shippingAddress.phone && (
                      <p className="mt-2">Phone: {(order.shippingAddress.phoneCode || '+91')} {order.shippingAddress.phone}</p>
                    )}
                    {order.shippingAddress.alternatePhone && (
                      <p className="text-slate-600">Alternate: {(order.shippingAddress.alternatePhoneCode || order.shippingAddress.phoneCode || '+91')} {order.shippingAddress.alternatePhone}</p>
                    )}
                  </div>
                </div>
              )}
              {/* Info about login for order details/history */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6 text-center">
                <p className="text-blue-700 font-medium">For full order details and history, please <a href="/login" className="underline text-blue-800">login</a> to your account. You will also receive an email with order information after every update.</p>
              </div>
            </div>
          )}

          {/* Tracking Details Help */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Tracking Details</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Everything you need to track your order</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use any order reference you received at checkout or by email. We will show your order status, courier
                information, shipment timeline, delivery estimate, items, and shipping address when available.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                    <SearchCheck size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">What you can enter</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Mobile number, email, EMX tracking number, order number, or reference.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                    <PackageSearch size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">What you will see</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Current status, EMX tracking number, courier name, route updates, and order items.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                    <Clock3 size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">When tracking appears</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Live courier updates show after the shipment is created and the EMX tracking number is generated.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Order status stages</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Order placed, processing, shipped, out for delivery, delivered, or return updates.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* <Footer /> removed, now global via ClientLayout */}
    </>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span>Loading...</span></div>}>
      <TrackOrderPageInner />
    </Suspense>
  );
}
