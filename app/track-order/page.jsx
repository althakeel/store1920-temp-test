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
import { useStorefrontI18n } from "@/lib/useStorefrontI18n";
import { AedText } from "@/components/CurrencySymbol";

const TRACK_ORDER_COPY = {
  en: {
    title: 'Track Your Order',
    subtitle: 'Enter your mobile number, email, tracking number, reference number, or order number to track your shipment',
    mobileLabel: 'Mobile Number or Email',
    mobilePlaceholder: 'Enter your mobile number or email',
    or: 'OR',
    trackingLabel: 'Tracking number / Order No',
    trackingPlaceholder: 'EMX tracking number, order no, or reference',
    trackingHint: 'Use the EMX tracking number from your label (e.g. 1000045332510), order number, mobile, or email.',
    trackButton: 'Track Order',
    checking: 'Checking shipment',
    notFoundTitle: 'Order Not Found',
    notFoundText: 'Please check your mobile number, email, tracking number, reference number, or booking number and try again.',
    returnTitle: 'Return pickup tracking',
    returnSearched: 'You searched the return pickup AWB',
    originalAwb: 'Original delivery AWB:',
    relatedFound: (count) => `We found ${count} order(s) for this contact. Showing the most recent below.`,
    orderButton: (num) => `Order ${num}`,
    pending: 'Pending',
    shipmentNotReady: "Shipment hasn't been created yet. You'll see live tracking here once the EMX tracking number is generated.",
    storeOrderStatus: 'Store order status',
    shipmentStatus: 'Shipment status',
    returnTracking: 'Return tracking',
    trackingNumber: 'Tracking number',
    returnTrackingNumber: 'Return tracking number',
    placedOn: (date) => `Placed on ${date}`,
    packedReady: 'Packed and ready for courier pickup',
    packedOn: (date) => `Packed on ${date}`,
    trackingInfo: 'Tracking Information',
    courier: 'Courier',
    trackShipment: 'Track Shipment',
    openCourier: 'Open courier tracking',
    shipmentUpdates: 'Shipment Updates',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    emxStatus: 'EMX courier status:',
    liveRefresh: 'Live EMX updates refresh automatically every 30 seconds while this page is open.',
    packageDelivered: 'Package delivered',
    liveStatusEmpty: 'Live status is available. Event history will appear here after the next EMX update — tap Refresh to check again.',
    route: 'Route',
    to: 'to',
    weight: 'Weight',
    pieces: 'Pieces',
    lastLocation: 'Last Location',
    deliveredTo: 'Delivered to:',
    howTrackingWorksTitle: 'How tracking works:',
    howTrackingWorks:
      "Once your order is shipped, you will receive a tracking ID and courier details. Use the tracking link above to see real-time shipment status on the courier's website. If tracking is not yet available, please check back later or contact our support team for assistance.",
    orderItems: 'Order Items',
    noImage: 'No image',
    product: 'Product',
    quantity: 'Quantity',
    price: 'Price',
    total: 'Total',
    shippingAddress: 'Shipping Address',
    phone: 'Phone',
    alternate: 'Alternate',
    loginPromptPrefix: 'For full order details and history, please ',
    login: 'login',
    loginPromptSuffix: ' to your account. You will also receive an email with order information after every update.',
    detailsEyebrow: 'Tracking Details',
    detailsTitle: 'Everything you need to track your order',
    detailsIntro:
      'Use any order reference you received at checkout or by email. We will show your order status, courier information, shipment timeline, delivery estimate, items, and shipping address when available.',
    whatYouCanEnter: 'What you can enter',
    whatYouCanEnterText: 'Mobile number, email, EMX tracking number, order number, or reference.',
    whatYouWillSee: 'What you will see',
    whatYouWillSeeText: 'Current status, EMX tracking number, courier name, route updates, and order items.',
    whenTracking: 'When tracking appears',
    whenTrackingText: 'Live courier updates show after the shipment is created and the EMX tracking number is generated.',
    statusStages: 'Order status stages',
    statusStagesText: 'Order placed, processing, shipped, out for delivery, delivered, or return updates.',
    loading: 'Loading...',
    emptyEvents: 'No tracking events yet',
    update: 'Update',
    receivedBy: 'Received by',
    toastUpdated: 'Tracking updated!',
    toastRefreshFailed: 'Failed to refresh tracking',
    toastNeedInput: 'Please enter mobile number, email, tracking number, or order number — not the track-order page URL',
    toastNotFound: 'Order not found',
    toastUnable: 'Unable to track order. Please try again.',
    stepOrderPlaced: 'ORDER PLACED',
    stepProcessing: 'PROCESSING',
    stepPacked: 'PACKED',
    stepShipped: 'SHIPPED',
    stepOutForDelivery: 'OUT FOR DELIVERY',
    stepDelivered: 'DELIVERED',
    statusPackedAwaiting: 'Packed — awaiting pickup',
    statusPickupRequested: 'Pickup requested',
    statusPickedUp: 'Picked up',
    statuses: {
      DELIVERED: 'Delivered',
      OUT_FOR_DELIVERY: 'Out for delivery',
      SHIPPED: 'Shipped',
      WAREHOUSE_RECEIVED: 'Warehouse received',
      PICKED_UP: 'Picked up',
      PICKUP_REQUESTED: 'Pickup requested',
      WAITING_FOR_PICKUP: 'Packed — awaiting pickup',
      CONFIRMED: 'Confirmed',
      PROCESSING: 'Processing',
      ORDER_PLACED: 'Order placed',
      RETURN_REQUESTED: 'Return requested',
      RTO: 'Return to origin',
      RETURN: 'Return',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled',
    },
  },
  ar: {
    title: 'تتبع طلبك',
    subtitle: 'أدخل رقم الجوال أو البريد الإلكتروني أو رقم التتبع أو الرقم المرجعي أو رقم الطلب لتتبع الشحنة',
    mobileLabel: 'رقم الجوال أو البريد الإلكتروني',
    mobilePlaceholder: 'أدخل رقم الجوال أو البريد الإلكتروني',
    or: 'أو',
    trackingLabel: 'رقم التتبع / رقم الطلب',
    trackingPlaceholder: 'رقم تتبع EMX أو رقم الطلب أو المرجع',
    trackingHint: 'استخدم رقم تتبع EMX من الملصق (مثال 1000045332510) أو رقم الطلب أو الجوال أو البريد.',
    trackButton: 'تتبع الطلب',
    checking: 'جارٍ التحقق من الشحنة',
    notFoundTitle: 'الطلب غير موجود',
    notFoundText: 'تحقق من رقم الجوال أو البريد أو رقم التتبع أو الرقم المرجعي أو رقم الحجز ثم أعد المحاولة.',
    returnTitle: 'تتبع استلام الإرجاع',
    returnSearched: 'بحثت برقم استلام الإرجاع',
    originalAwb: 'رقم تتبع التوصيل الأصلي:',
    relatedFound: (count) => `وجدنا ${count} طلبًا لهذا التواصل. نعرض الأحدث أدناه.`,
    orderButton: (num) => `طلب ${num}`,
    pending: 'قيد الانتظار',
    shipmentNotReady: 'لم تُنشأ الشحنة بعد. سيظهر التتبع المباشر هنا بعد إصدار رقم تتبع EMX.',
    storeOrderStatus: 'حالة طلب المتجر',
    shipmentStatus: 'حالة الشحنة',
    returnTracking: 'تتبع الإرجاع',
    trackingNumber: 'رقم التتبع',
    returnTrackingNumber: 'رقم تتبع الإرجاع',
    placedOn: (date) => `تاريخ الطلب ${date}`,
    packedReady: 'تم التجهيز وجاهز لاستلام شركة الشحن',
    packedOn: (date) => `تم التجهيز في ${date}`,
    trackingInfo: 'معلومات التتبع',
    courier: 'شركة الشحن',
    trackShipment: 'تتبع الشحنة',
    openCourier: 'فتح تتبع شركة الشحن',
    shipmentUpdates: 'تحديثات الشحنة',
    refresh: 'تحديث',
    refreshing: 'جارٍ التحديث...',
    emxStatus: 'حالة شركة الشحن EMX:',
    liveRefresh: 'تُحدَّث بيانات EMX تلقائيًا كل 30 ثانية أثناء فتح هذه الصفحة.',
    packageDelivered: 'تم تسليم الطرد',
    liveStatusEmpty: 'الحالة المباشرة متاحة. سيظهر سجل الأحداث بعد التحديث التالي من EMX — اضغط تحديث للتحقق.',
    route: 'المسار',
    to: 'إلى',
    weight: 'الوزن',
    pieces: 'القطع',
    lastLocation: 'آخر موقع',
    deliveredTo: 'سُلّم إلى:',
    howTrackingWorksTitle: 'كيف يعمل التتبع:',
    howTrackingWorks:
      'بعد شحن طلبك ستحصل على رقم تتبع وتفاصيل شركة الشحن. استخدم رابط التتبع أعلاه لمتابعة الحالة على موقع شركة الشحن. إذا لم يتوفر التتبع بعد، عد لاحقًا أو تواصل مع الدعم.',
    orderItems: 'منتجات الطلب',
    noImage: 'لا توجد صورة',
    product: 'منتج',
    quantity: 'الكمية',
    price: 'السعر',
    total: 'الإجمالي',
    shippingAddress: 'عنوان الشحن',
    phone: 'الهاتف',
    alternate: 'بديل',
    loginPromptPrefix: 'للتفاصيل الكاملة وسجل الطلبات، يُرجى ',
    login: 'تسجيل الدخول',
    loginPromptSuffix: ' إلى حسابك. ستصلك أيضًا رسالة بريد بكل تحديث.',
    detailsEyebrow: 'تفاصيل التتبع',
    detailsTitle: 'كل ما تحتاجه لتتبع طلبك',
    detailsIntro:
      'استخدم أي مرجع طلب وصلك عند الدفع أو عبر البريد. سنعرض حالة الطلب ومعلومات الشحن والجدول الزمني وتقدير التسليم والمنتجات والعنوان عند توفرها.',
    whatYouCanEnter: 'ماذا يمكنك إدخاله',
    whatYouCanEnterText: 'رقم الجوال أو البريد أو رقم تتبع EMX أو رقم الطلب أو المرجع.',
    whatYouWillSee: 'ماذا سترى',
    whatYouWillSeeText: 'الحالة الحالية ورقم تتبع EMX واسم شركة الشحن وتحديثات المسار ومنتجات الطلب.',
    whenTracking: 'متى يظهر التتبع',
    whenTrackingText: 'تظهر تحديثات شركة الشحن بعد إنشاء الشحنة وإصدار رقم تتبع EMX.',
    statusStages: 'مراحل حالة الطلب',
    statusStagesText: 'تم تقديم الطلب، قيد المعالجة، تم الشحن، خرج للتسليم، تم التسليم، أو تحديثات الإرجاع.',
    loading: 'جارٍ التحميل...',
    emptyEvents: 'لا توجد أحداث تتبع بعد',
    update: 'تحديث',
    receivedBy: 'استلمه',
    toastUpdated: 'تم تحديث التتبع',
    toastRefreshFailed: 'تعذّر تحديث التتبع',
    toastNeedInput: 'أدخل رقم الجوال أو البريد أو رقم التتبع أو رقم الطلب — وليس رابط صفحة التتبع',
    toastNotFound: 'الطلب غير موجود',
    toastUnable: 'تعذّر تتبع الطلب. حاول مرة أخرى.',
    stepOrderPlaced: 'تم تقديم الطلب',
    stepProcessing: 'قيد المعالجة',
    stepPacked: 'تم التجهيز',
    stepShipped: 'تم الشحن',
    stepOutForDelivery: 'خرج للتسليم',
    stepDelivered: 'تم التسليم',
    statusPackedAwaiting: 'جاهز — بانتظار استلام شركة الشحن',
    statusPickupRequested: 'تم طلب الاستلام',
    statusPickedUp: 'تم الاستلام',
    statuses: {
      DELIVERED: 'تم التسليم',
      OUT_FOR_DELIVERY: 'خرج للتسليم',
      SHIPPED: 'تم الشحن',
      WAREHOUSE_RECEIVED: 'وصل المستودع',
      PICKED_UP: 'تم الاستلام',
      PICKUP_REQUESTED: 'تم طلب الاستلام',
      WAITING_FOR_PICKUP: 'جاهز — بانتظار استلام شركة الشحن',
      CONFIRMED: 'مؤكد',
      PROCESSING: 'قيد المعالجة',
      ORDER_PLACED: 'تم تقديم الطلب',
      RETURN_REQUESTED: 'تم طلب الإرجاع',
      RTO: 'إعادة إلى المصدر',
      RETURN: 'إرجاع',
      RETURNED: 'تم الإرجاع',
      CANCELLED: 'ملغى',
    },
  },
};

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
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? TRACK_ORDER_COPY.ar : TRACK_ORDER_COPY.en;
  const dateLocale = isArabic ? 'ar-AE' : 'en-AE';
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
        if (manual) toast.success(copy.toastUpdated);
        return liveOrder;
      }
    } catch (error) {
      if (manual && !axios.isCancel(error) && error?.name !== 'CanceledError') {
        toast.error(copy.toastRefreshFailed);
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
      toast.error(copy.toastNeedInput);
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
        toast.error(retry.data?.message || copy.toastNotFound);
        return false;
      }

      setNotFound(true);
      toast.error(copy.toastNotFound);
      return false;
    } catch (error) {
      const msg = error?.response?.data?.message;
      toast.error(msg || copy.toastUnable);
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
    if (packed || normalized === 'WAITING_FOR_PICKUP') return copy.statusPackedAwaiting;
    if (normalized === 'PICKUP_REQUESTED') return copy.statusPickupRequested;
    if (normalized === 'PICKED_UP') return copy.statusPickedUp;
    return copy.statuses[normalized] || normalized.replace(/_/g, ' ');
  };

  const getStatusSteps = (status, packed = false) => {
    const steps = [
      { name: 'ORDER PLACED', label: copy.stepOrderPlaced },
      { name: 'PROCESSING', label: copy.stepProcessing },
      { name: 'PACKED', label: copy.stepPacked },
      { name: 'SHIPPED', label: copy.stepShipped },
      { name: 'OUT FOR DELIVERY', label: copy.stepOutForDelivery },
      { name: 'DELIVERED', label: copy.stepDelivered },
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
    const currentIndex = steps.findIndex((step) => step.name === progressStatus);
    const safeIndex = currentIndex >= 0 ? currentIndex : (packed ? 2 : 0);
    return steps.map((step, idx) => ({
      name: step.name,
      label: step.label,
      completed: idx <= safeIndex,
      active: idx === safeIndex
    }));
  }

  return (
    <>
      {/* <Navbar /> removed, now global via ClientLayout */}
      <div className="bg-slate-50 py-12" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">{copy.title}</h1>
            <p className="text-slate-600">{copy.subtitle}</p>
          </div>

          {/* Search Form */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
            <form onSubmit={handleTrack} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{copy.mobileLabel}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder={copy.mobilePlaceholder}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">{copy.or}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{copy.trackingLabel}</label>
                <input
                  type="text"
                  dir="ltr"
                  value={awbNumber}
                  onChange={(e) => setAwbNumber(e.target.value)}
                  placeholder={copy.trackingPlaceholder}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">{copy.trackingHint}</p>
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
                      <span>{copy.checking}</span>
                    </span>
                  </span>
                ) : (
                  copy.trackButton
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
              <h3 className="text-lg font-semibold text-slate-800 mb-2">{copy.notFoundTitle}</h3>
              <p className="text-slate-600">{copy.notFoundText}</p>
            </div>
          )}

              {/* Order Details */}
          {order && (
            <div className="space-y-6">
              {order.trackingKind === 'return' ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                  <p className="font-semibold">{copy.returnTitle}</p>
                  <p className="mt-1">
                    {copy.returnSearched}
                    {order.trackingId ? ` (${order.trackingId})` : ''}.
                    {order.linkedOriginalTrackingNumber ? (
                      <> {copy.originalAwb} <span className="font-mono font-semibold" dir="ltr">{order.linkedOriginalTrackingNumber}</span>.</>
                    ) : null}
                  </p>
                </div>
              ) : null}
              {relatedOrders.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900 mb-3">
                    {copy.relatedFound(relatedOrders.length + 1)}
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
                        {copy.orderButton(getDisplayOrderNumber(entry) || copy.pending)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Tracking not ready notice */}
              {!getActiveTrackingDisplayId(order) && !order.c3x && !order.waslah && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800 text-sm">
                  {copy.shipmentNotReady}
                </div>
              )}
              {/* Order Status */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600">
                      {order._id ? copy.storeOrderStatus : copy.shipmentStatus}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      {getActiveTrackingDisplayId(order)
                        ? `${order.trackingKind === 'return' ? copy.returnTracking : copy.trackingNumber}: ${getActiveTrackingDisplayId(order)}`
                        : getDisplayOrderLabel(order)}
                    </h2>
                    {order.createdAt && !Number.isNaN(new Date(order.createdAt).getTime()) && (
                      <p className="mt-1 text-sm text-slate-600">{copy.placedOn(new Date(order.createdAt).toLocaleDateString(dateLocale))}</p>
                    )}
                  </div>
                  <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${getStatusColor(order.status)}`}>
                    {getPublicStatusLabel(order.status, order?.warehousePacking?.packed === true)}
                  </span>
                </div>

                {order?.warehousePacking?.packed ? (
                  <div className="mb-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                    <p className="font-semibold">{copy.packedReady}</p>
                    {order.warehousePacking.packedAt ? (
                      <p className="mt-1 text-xs text-teal-800">
                        {copy.packedOn(new Date(order.warehousePacking.packedAt).toLocaleString(dateLocale))}
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
                      {copy.trackingInfo}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {order.courier && (
                        <div className="rounded-lg bg-white/75 p-3">
                          <p className="text-xs font-medium text-slate-500">{copy.courier}</p>
                          <p className="mt-1 font-semibold text-slate-900">{order.courier}</p>
                        </div>
                      )}
                      {getActiveTrackingDisplayId(order) ? (
                        <div className="rounded-lg bg-white/75 p-3">
                          <p className="text-xs font-medium text-slate-500">
                            {order.trackingKind === 'return' ? copy.returnTrackingNumber : copy.trackingNumber}
                          </p>
                          <p className="mt-1 font-mono font-semibold text-slate-900">{getActiveTrackingDisplayId(order)}</p>
                        </div>
                      ) : null}
                      {order.trackingUrl && (
                        <div className="rounded-lg bg-white/75 p-3 sm:col-span-2">
                          <p className="text-xs font-medium text-slate-500">{copy.trackShipment}</p>
                          <a 
                            href={order.trackingUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                          >
                            {copy.openCourier}
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
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{copy.shipmentUpdates}</h3>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                      {refreshing ? copy.refreshing : copy.refresh}
                    </button>
                  </div>
                  {(order.waslah?.currentStatus || order.waslah?.lastSubtagMessage) && (
                    <p className="mb-2 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-sm text-violet-900">
                      <span className="font-medium">{copy.emxStatus}</span>{' '}
                      {order.waslah.currentStatus || order.waslah.lastSubtagMessage}
                    </p>
                  )}
                  {!isWaslahCourierTerminal(order) && (
                    <p className="mb-3 text-xs text-violet-700">
                      {copy.liveRefresh}
                    </p>
                  )}
                  {order.waslah?.isDelivered && (
                    <div className={`mb-4 flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 ${styles["status-badge-active"]}`}>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {copy.packageDelivered}
                    </div>
                  )}
                  {order.waslah?.events?.length > 0 ? (
                    <TrackingTimeline
                      events={order.waslah.events}
                      type="waslah"
                      emptyLabel={copy.emptyEvents}
                      updateLabel={copy.update}
                      receivedByLabel={copy.receivedBy}
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-violet-200 bg-violet-50/60 px-4 py-6 text-center text-sm text-violet-800">
                      {copy.liveStatusEmpty}
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
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{copy.shipmentUpdates}</h3>
                    </div>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                      {refreshing ? copy.refreshing : copy.refresh}
                    </button>
                  </div>
                  {order.c3x.origin && order.c3x.destination && (
                    <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{copy.route}:</span> {order.c3x.origin} {copy.to} {order.c3x.destination}
                    </p>
                  )}
                  {(order.c3x.actualWeight || order.c3x.chargeableWeight) && (
                    <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{copy.weight}:</span> {order.c3x.actualWeight || order.c3x.chargeableWeight} kg
                    </p>
                  )}
                  {order.c3x.pieces && (
                    <p className="text-sm text-slate-500 mb-2">
                      <span className="font-medium">{copy.pieces}:</span> {order.c3x.pieces}
                    </p>
                  )}
                  {order.c3x.lastLocation && (
                    <p className="text-sm text-slate-500 mb-4">
                      <span className="font-medium">{copy.lastLocation}:</span> {order.c3x.lastLocation}
                    </p>
                  )}
                  {order.c3x.isDelivered && order.c3x.deliveredTo && (
                    <div className={`mb-4 flex items-center gap-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2 ${styles["status-badge-active"]}`}>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {copy.deliveredTo} {order.c3x.deliveredTo}
                    </div>
                  )}
                  <TrackingTimeline
                    events={order.c3x.events}
                    type="c3xpress"
                    emptyLabel={copy.emptyEvents}
                    updateLabel={copy.update}
                    receivedByLabel={copy.receivedBy}
                  />
                </div>
              )}
                  {/* More tracking details/help */}
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mt-4 text-sm text-slate-700">
                    <p>
                      <strong>{copy.howTrackingWorksTitle}</strong> {copy.howTrackingWorks}
                    </p>
                  </div>
                </>
              )}

              {/* Order Items */}
              {(order.orderItems || []).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">{copy.orderItems}</h3>
                <div className="space-y-4">
                  {(order.orderItems || []).map((item, idx) => {
                    const product = item.productId || item.product || {}
                    return (
                      <div key={idx} className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0">
                        <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={isArabic ? (product.nameAr || product.name) : product.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">{copy.noImage}</div>
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-800">{(isArabic && product.nameAr) ? product.nameAr : (product.name || copy.product)}</h4>
                          <p className="text-sm text-slate-600 mt-1">{copy.quantity}: {item.quantity}</p>
                          <p className="text-sm text-slate-600">{copy.price}: <AedText>{`AED${(item.price || 0).toFixed(2)}`}</AedText></p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-800"><AedText>{`AED${((item.price || 0) * (item.quantity || 0)).toFixed(2)}`}</AedText></p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between text-slate-800 font-semibold">
                    <span>{copy.total}:</span>
                    <span><AedText>{`AED${(order.total || 0).toFixed(2)}`}</AedText></span>
                  </div>
                </div>
              </div>
              )}

              {/* Shipping Address */}
              {order.shippingAddress && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">{copy.shippingAddress}</h3>
                  <div className="text-slate-700 space-y-1">
                    <p className="font-medium">{order.shippingAddress.name}</p>
                    <p>{order.shippingAddress.street}</p>
                    <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}</p>
                    <p>{order.shippingAddress.country}</p>
                    {order.shippingAddress.phone && (
                      <p className="mt-2">{copy.phone}: {(order.shippingAddress.phoneCode || '+91')} {order.shippingAddress.phone}</p>
                    )}
                    {order.shippingAddress.alternatePhone && (
                      <p className="text-slate-600">{copy.alternate}: {(order.shippingAddress.alternatePhoneCode || order.shippingAddress.phoneCode || '+91')} {order.shippingAddress.alternatePhone}</p>
                    )}
                  </div>
                </div>
              )}
              {/* Info about login for order details/history */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-6 text-center">
                <p className="text-blue-700 font-medium">{copy.loginPromptPrefix}<a href="/sign-in" className="underline text-blue-800">{copy.login}</a>{copy.loginPromptSuffix}</p>
              </div>
            </div>
          )}

          {/* Tracking Details Help */}
          <div className="mt-8 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">{copy.detailsEyebrow}</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{copy.detailsTitle}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {copy.detailsIntro}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                    <SearchCheck size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{copy.whatYouCanEnter}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {copy.whatYouCanEnterText}
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
                    <h3 className="text-sm font-semibold text-slate-900">{copy.whatYouWillSee}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {copy.whatYouWillSeeText}
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
                    <h3 className="text-sm font-semibold text-slate-900">{copy.whenTracking}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {copy.whenTrackingText}
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
                    <h3 className="text-sm font-semibold text-slate-900">{copy.statusStages}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {copy.statusStagesText}
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

function TrackOrderFallback() {
  const { isArabic } = useStorefrontI18n();
  return (
    <div className="min-h-screen flex items-center justify-center" dir={isArabic ? 'rtl' : 'ltr'}>
      <span>{isArabic ? TRACK_ORDER_COPY.ar.loading : TRACK_ORDER_COPY.en.loading}</span>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={<TrackOrderFallback />}>
      <TrackOrderPageInner />
    </Suspense>
  );
}
