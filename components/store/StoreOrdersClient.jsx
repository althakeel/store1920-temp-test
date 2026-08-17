"use client";

import { useAuth } from '@/lib/useAuth';
import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import Loading from "@/components/Loading";
import PageSkeleton from "@/components/PageSkeleton";
import { readPageCache, writePageCache, clearPageCache } from "@/lib/storePageCache";
import axios from "axios";
import toast from "react-hot-toast";
import { Package, Truck, X, Download, Printer, RefreshCw, MapPin, Trash2, CalendarClock, AlertTriangle, Search, Plus, ArrowUp, ArrowDown, ArrowUpDown, History, Pencil, Filter, Phone, Undo2, CheckCircle2 } from "lucide-react";
import StoreCreateOrderModal from '@/components/store/StoreCreateOrderModal';
import PaymentFailedCallCustomerModal from '@/components/store/PaymentFailedCallCustomerModal';
import StoreEditOrderPanel from '@/components/store/StoreEditOrderPanel';
import OrderStatusPicker, { getStoreOrderStatusMeta, STORE_ORDER_STATUS_FILTER_OPTIONS, STORE_ORDER_STATUS_OPTIONS } from '@/components/store/OrderStatusPicker';
import {
    addDaysToDateOnly,
    buildOrdersByProductDateTime,
    DEFAULT_ORDERS_BY_PRODUCT_TIME,
    getDubaiDateParts,
    getOrdersByProductBusinessDayBounds,
    normalizeOrdersByProductTime,
} from '@/lib/storeOrdersByProductDates';

function formatFilterDateLabel(value = '') {
    if (!value) return '';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return value;
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

const DEFAULT_ORDER_FILTER_TIME = DEFAULT_ORDERS_BY_PRODUCT_TIME;

function normalizeFilterTimeValue(value = '', fallback = DEFAULT_ORDER_FILTER_TIME) {
    return normalizeOrdersByProductTime(value, fallback);
}

/** Interpret YYYY-MM-DD + HH:mm as Asia/Dubai wall time. */
function buildFilterDateTime(dateValue = '', timeValue = '') {
    return buildOrdersByProductDateTime(dateValue, timeValue);
}

function formatFilterTimeLabel(value = '') {
    const time = normalizeFilterTimeValue(value);
    const [hour, minute] = time.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
    const suffix = hour >= 12 ? 'pm' : 'am';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function buildDateRangeSummary(fromDate, toDate, fromTime = DEFAULT_ORDER_FILTER_TIME, toTime = DEFAULT_ORDER_FILTER_TIME) {
    if (fromDate && toDate) {
        return `${formatFilterDateLabel(fromDate)} ${formatFilterTimeLabel(fromTime)} – ${formatFilterDateLabel(toDate)} ${formatFilterTimeLabel(toTime)} (Dubai)`;
    }
    if (fromDate) {
        return `from ${formatFilterDateLabel(fromDate)} ${formatFilterTimeLabel(fromTime)} (Dubai)`;
    }
    if (toDate) {
        return `until ${formatFilterDateLabel(toDate)} ${formatFilterTimeLabel(toTime)} (Dubai)`;
    }
    return '';
}
import { downloadInvoice, printInvoice } from "@/lib/generateInvoice";
import { schedulePickup } from '@/lib/delhivery';
import { STORE_ORDER_NOTIFICATION_EVENT, STORE_ORDER_TOAST_ID, dispatchStoreOrdersImportEnd, dispatchStoreOrdersImportStart } from '@/lib/storeOrderNotifications';
import {
    formatConversionDiscount,
    getConversionPaymentLabel,
    getDeliveryBucket,
    getOrderDiscountLines,
    getOrderExpectedDeliveryDate,
    getOrderTableTags,
    getOrderPaymentMethodBadge,
    normalizeStoreOrderPaymentMethod,
    summarizeDeliveryBuckets,
    isDashboardConvertedOrder,
} from '@/lib/storeOrderInsights';
import { getDisplayOrderNumber, getOrderCustomerDisplayName, formatStoreOrderDateTime, formatStoreOrderDateParts, buildTrackOrderPageUrl } from '@/lib/orderDisplay';
import { getOrderTrafficSourceDisplay, getOrderTrafficSourceKey, TRAFFIC_SOURCE_FILTER_OPTIONS } from '@/lib/orderAttributionDisplay';
import {
    getManualStoreOrderCreator,
    getOrderPaymentReferenceId,
    isManualStoreDashboardOrder,
    orderPaymentReferenceLabel,
} from '@/lib/storeCreateOrder';
import { getStoreOrderDisplayItems } from '@/lib/storeOrderLineItems';
import {
  WOOCOMMERCE_ORDER_EXPORT_HEADERS,
  buildWooCommerceOrderExportRows,
  buildWooCommerceOrderExportCsv,
} from '@/lib/storeOrderWooExport';
import { isAwaitingPaymentOrder, isVisibleStoreOrder } from '@/lib/deferredOrderStatus';
import { isPaymentFailedStoreOrder, hasPaymentFailedFollowUpDiscount, hasPaymentFailedFollowUp } from '@/lib/paymentFailedFollowUp';
import { getDefaultWaslahPickupInfo, getWaslahPickupDateOptions } from '@/lib/waslahOrderMapper';
import WaslahShipNotice, { buildWaslahShipNotice } from '@/components/store/WaslahShipNotice';
import {
    getWaslahCheckpointDisplay,
    getWaslahCourierReason,
    getWaslahCourierStatus,
    isStaleWaslahCancellation,
    isWaslahCourierTerminal,
    mapWaslahSubtagToOrderStatus,
    resolveLatestWaslahAppStatus,
    resolveWaslahOrderStatusTransition,
    buildEmxTrackingUrl,
} from '@/lib/waslahTracking';
import { isWaslahLabelReadyOrder, isWaslahLabelNotPrinted, isWaslahLabelPrinted, getLabelDownloadCount } from '@/lib/waslahReceipts';
import TrackingTimeline from '@/components/TrackingTimeline';

function formatPaymentRecheckReason(reason = '', paymentMethod = '') {
    const method = String(paymentMethod || 'provider').toUpperCase();
    const raw = String(reason || '').trim().toLowerCase().replace(/\s+/g, '_');

    if (raw === 'tamara_expired' || raw === 'expired') {
        return 'Tamara expired this payment — customer did not finish checkout, or Approved was not Authorised within 72 hours. Cannot mark paid from here.';
    }
    if (raw === 'tamara_declined' || raw === 'declined') {
        return 'Tamara declined this payment. Customer was not charged.';
    }
    if (raw === 'tamara_canceled' || raw === 'tamara_cancelled' || raw === 'canceled' || raw === 'cancelled') {
        return 'Tamara cancelled this payment. Cannot mark paid.';
    }
    if (raw.startsWith('tabby_expired')) {
        return 'Tabby expired this payment session. Customer did not complete payment.';
    }
    if (raw.startsWith('tabby_rejected')) {
        return 'Tabby rejected this payment. Customer was not charged.';
    }
    if (!raw) return `Still unpaid at ${method}`;
    return `Still unpaid at ${method} — ${raw.replace(/_/g, ' ')}`;
}

function normalizeOrderSearchQuery(value = '') {
    return String(value || '').trim().toLowerCase();
}

function orderMatchesSearch(order, query) {
    const q = normalizeOrderSearchQuery(query);
    if (!q) return true;

    const qDigits = q.replace(/\D/g, '');
    const qNoHash = q.replace(/^#/, '');
    const short = order?.shortOrderNumber != null ? String(order.shortOrderNumber) : '';
    const isOrderNumberShaped = /^\d{4,8}$/.test(qDigits)
        && qDigits === qNoHash.replace(/\D/g, '')
        && !/[a-z]/i.test(qNoHash);

    // Typing a store order number (e.g. 618681) should not also match phones
    // that merely contain those digits in the middle (e.g. +971561868129).
    if (isOrderNumberShaped) {
        if (short && short === qDigits) return true;

        const exactFields = [
            order?.trackingId,
            order?.waslah?.trackingNumber,
            order?.waslah?.emxTrackingNumber,
            order?.waslah?.reference,
            order?.delhivery?.waybill,
            order?.delhivery?.awb,
            order?.legacySourceId,
            order?._id ? String(order._id) : '',
        ]
            .filter(Boolean)
            .map((value) => String(value).toLowerCase());

        if (exactFields.some((value) => {
            const digits = value.replace(/\D/g, '');
            return value === q
                || value === qNoHash
                || value === `s1920-${qDigits}`
                || value === `#${qDigits}`
                || digits === qDigits;
        })) {
            return true;
        }

        const phoneDigits = [
            order?.guestPhone,
            order?.alternatePhone,
            order?.shippingAddress?.phone,
        ]
            .filter(Boolean)
            .map((value) => String(value).replace(/\D/g, ''));

        // Allow last-N phone search only when the number ends with the query.
        if (phoneDigits.some((value) => value === qDigits || value.endsWith(qDigits))) {
            return true;
        }

        return false;
    }

    const textFields = [
        order?.guestName,
        order?.guestEmail,
        order?.guestPhone,
        order?.alternatePhone,
        order?.userId?.name,
        order?.userId?.email,
        order?.shippingAddress?.name,
        order?.shippingAddress?.email,
        order?.shippingAddress?.phone,
        short,
        order?._id ? String(order._id) : '',
        order?.legacySourceId,
        order?.trackingId,
        order?.waslah?.trackingNumber,
        order?.waslah?.emxTrackingNumber,
        order?.waslah?.reference,
        order?.waslah?.orderId,
        order?.trackingUrl,
        order?.courier,
        order?.delhivery?.waybill,
        order?.delhivery?.awb,
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

    if (textFields.some((value) => value.includes(q) || value.includes(qNoHash))) {
        return true;
    }

    if (order?.legacySourceId) {
        const legacyId = String(order.legacySourceId).toLowerCase().replace(/^wc-/, '');
        if (legacyId === qNoHash || legacyId.includes(qNoHash)) {
            return true;
        }
    }

    if (qDigits.length >= 3) {
        const digitFields = [
            order?.guestPhone,
            order?.alternatePhone,
            order?.shippingAddress?.phone,
            short,
            order?.trackingId,
            order?.waslah?.trackingNumber,
            order?.waslah?.emxTrackingNumber,
            order?.delhivery?.waybill,
        ]
            .filter(Boolean)
            .map((value) => String(value).replace(/\D/g, ''));

        if (digitFields.some((value) => value.includes(qDigits))) {
            return true;
        }
    }

    return false;
}

const STORE_ORDER_SORT_COLUMNS = {
    date: 'Date & time',
    orderNumber: 'Order No.',
    total: 'Total',
    customer: 'Customer',
};

function compareStoreOrders(a, b, sortBy, sortDirection) {
    const dir = sortDirection === 'asc' ? 1 : -1;
    let cmp = 0;

    if (sortBy === 'orderNumber') {
        cmp = (Number(a?.shortOrderNumber) || 0) - (Number(b?.shortOrderNumber) || 0);
    } else if (sortBy === 'total') {
        cmp = (Number(a?.total) || 0) - (Number(b?.total) || 0);
    } else if (sortBy === 'customer') {
        cmp = getOrderCustomerDisplayName(a).localeCompare(
            getOrderCustomerDisplayName(b),
            undefined,
            { sensitivity: 'base' },
        );
    } else {
        const aDate = new Date(a?.createdAt || 0).getTime();
        const bDate = new Date(b?.createdAt || 0).getTime();
        cmp = aDate - bDate;
        if (cmp === 0) {
            cmp = (Number(a?.shortOrderNumber) || 0) - (Number(b?.shortOrderNumber) || 0);
        }
    }

    return cmp * dir;
}

function SortableOrderTableHeader({ label, column, sortBy, sortDirection, onSort }) {
    const isActive = sortBy === column;
    const SortIcon = isActive
        ? (sortDirection === 'desc' ? ArrowDown : ArrowUp)
        : ArrowUpDown;

    return (
        <th className="px-4 py-3">
            <button
                type="button"
                onClick={() => onSort(column)}
                className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider transition ${
                    isActive ? 'text-slate-900' : 'text-gray-700 hover:text-slate-900'
                }`}
                aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
                <span>{label}</span>
                <SortIcon size={12} className={isActive ? 'text-slate-700' : 'text-slate-400'} />
            </button>
        </th>
    );
}

const updateOrderStatus = async (orderId, newStatus, getToken, fetchOrders) => {
    try {
        const token = await getToken(true); // Force refresh token
        if (!token) {
            toast.error('Authentication failed. Please sign in again.');
            return;
        }
        await axios.post('/api/store/orders/update-status', {
            orderId,
            status: newStatus
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Order status updated!');
        fetchOrders();
    } catch (error) {
        console.error('Update status error:', error);
        toast.error(error?.response?.data?.error || 'Failed to update status');
    }
};

// Add updateTrackingDetails function
// (must be inside the component, not top-level)
const updateTrackingDetails = async (orderId, trackingId, trackingUrl, courier, getToken, fetchOrders) => {
    try {
        const token = await getToken(true); // Force refresh token
        if (!token) {
            toast.error('Authentication failed. Please sign in again.');
            return;
        }
        await axios.post('/api/store/orders/update-tracking', {
            orderId,
            trackingId,
            trackingUrl,
            courier
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Tracking details updated!');
        fetchOrders();
    } catch (error) {
        console.error('Update tracking error:', error);
        toast.error(error?.response?.data?.error || 'Failed to update tracking details');
    }
};

const CENTER_POPUP_EASE = [0.22, 1, 0.36, 1];

function StoreCenterPopupShell({
    open = false,
    zIndex = 120,
    maxWidthClass = 'max-w-md',
    dismissible = true,
    onBackdropClick,
    labelledBy,
    role = 'dialog',
    children,
}) {
    const contentRef = useRef(null);
    if (open && children) {
        contentRef.current = children;
    }

    return (
        <AnimatePresence
            onExitComplete={() => {
                if (!open) contentRef.current = null;
            }}
        >
            {open ? (
                <motion.div
                    key="store-center-popup"
                    className="fixed inset-0 flex items-center justify-center p-4"
                    style={{ zIndex }}
                    role={role}
                    aria-modal={role === 'dialog' ? true : undefined}
                    aria-labelledby={labelledBy}
                    aria-live={role === 'status' ? 'polite' : undefined}
                    aria-busy={role === 'status' ? true : undefined}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                >
                    {dismissible ? (
                        <motion.button
                            type="button"
                            aria-label="Close popup"
                            className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
                            onClick={onBackdropClick}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.22 }}
                        />
                    ) : (
                        <motion.div
                            className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.22 }}
                        />
                    )}
                    <motion.div
                        className={`relative w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
                        initial={{ opacity: 0, scale: 0.88, y: 28 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 12 }}
                        transition={{ duration: 0.34, ease: CENTER_POPUP_EASE }}
                    >
                        {children || contentRef.current}
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

function isWaslahShipmentProcessed(order) {
    return Boolean(getOrderAwb(order));
}

/** Waslah already has this shipment but Store1920 is not linked yet. */
function isWaslahUnlinkedDuplicate(order) {
    if (order?.waslah?.cancelledAt && !order?.waslah?.orderId) return false;
    return Boolean(
        order?.waslah?.unlinkedInWaslah
        && !isWaslahShipmentProcessed(order),
    );
}

function getOrderAwb(order) {
    const emxCandidates = [
        order?.waslah?.emxTrackingNumber,
        order?.waslah?.trackingNumber,
        order?.trackingId,
    ];
    for (const candidate of emxCandidates) {
        const value = String(candidate || '').trim();
        if (/^1000\d{9,12}$/.test(value)) return value;
        if (/^\d{10,16}$/.test(value) && !/^62\d+$/.test(value) && !/^[a-fA-F0-9]{24}$/.test(value) && !/^S1920-/i.test(value)) {
            return value;
        }
    }
    return '';
}

/** Any courier AWB for list/filters (EMX Waslah number or manual trackingId). */
function getDisplayAwb(order) {
    return getOrderAwb(order) || String(order?.trackingId || '').trim();
}

function getWaslahOrderReference(order) {
    return String(order?.waslah?.reference || order?.shortOrderNumber || '').trim();
}

const WASLAH_LIVE_STATUS_POLL_MS = 30 * 1000;
const WASLAH_LIVE_STATUS_BATCH_SIZE = 12;

function getWaslahLiveAppStatus(order) {
    return getWaslahCourierStatus(order);
}

function isWaslahLiveTerminalOrder(order) {
    return isWaslahCourierTerminal(order);
}

function getWaslahLiveStatusColor(order) {
    const liveStatus = getWaslahLiveAppStatus(order);
    return getStoreOrderStatusMeta(liveStatus || String(order?.status || '').toUpperCase()).color;
}

function getWaslahLiveStatusLabel(order) {
    if (isStaleWaslahCancellation(order)) {
        return getStoreOrderStatusMeta(String(order?.status || '').toUpperCase()).label || 'AWB created';
    }
    return String(
        getWaslahCheckpointDisplay({
            subtag: order?.waslah?.currentSubtag || order?.waslah?.lastSubtag,
            subtagMessage: order?.waslah?.currentStatus,
            message: order?.waslah?.lastSubtagMessage,
        })
        || getStoreOrderStatusMeta(String(order?.status || '').toUpperCase()).label
        || 'AWB created',
    ).trim();
}

/** Latest EMX/Waslah courier reason for the orders table (why undelivered / failed). */
function getOrderCourierNoteDisplay(order) {
    const resolved = getWaslahCourierReason(order);
    if (!resolved?.reason) {
        // Fallback: show live checkpoint text when no structured reason yet.
        const waslah = order?.waslah || {};
        if (!waslah.orderId && !waslah.trackingNumber && !getOrderAwb(order) && !(waslah.events || []).length) {
            return null;
        }
        const fallback = getWaslahLiveStatusLabel(order);
        if (!fallback) return null;
        return {
            reason: fallback,
            label: '',
            location: String(waslah.lastLocation || '').trim(),
            tone: 'slate',
            title: fallback,
        };
    }

    const haystack = `${resolved.reason} ${resolved.label} ${resolved.courierStatus} ${resolved.subtag}`.toLowerCase();
    let tone = 'slate';
    if (resolved.courierStatus === 'DELIVERED' || haystack.includes('delivered')) {
        tone = 'emerald';
    } else if (
        resolved.isFailure
        || resolved.courierStatus === 'RTO'
        || resolved.courierStatus === 'RETURN'
        || resolved.courierStatus === 'CANCELLED'
        || haystack.includes('undeliver')
        || haystack.includes('failed attempt')
        || haystack.includes('exception')
        || haystack.includes('rto')
        || haystack.includes('return to')
    ) {
        tone = 'amber';
    } else if (
        resolved.courierStatus === 'OUT_FOR_DELIVERY'
        || haystack.includes('out for delivery')
    ) {
        tone = 'blue';
    }

    return {
        reason: resolved.reason,
        label: resolved.label || '',
        location: resolved.location || '',
        tone,
        title: [resolved.label, resolved.reason, resolved.location].filter(Boolean).join(' · '),
    };
}

function getCourierNoteToneClasses(tone = 'slate') {
    if (tone === 'emerald') {
        return {
            badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
            text: 'text-emerald-700',
        };
    }
    if (tone === 'amber') {
        return {
            badge: 'bg-amber-50 text-amber-900 ring-amber-200',
            text: 'text-amber-800',
        };
    }
    if (tone === 'blue') {
        return {
            badge: 'bg-sky-50 text-sky-800 ring-sky-200',
            text: 'text-sky-700',
        };
    }
    return {
        badge: 'bg-slate-50 text-slate-700 ring-slate-200',
        text: 'text-slate-600',
    };
}

function mergeWaslahLiveStatusPatch(current, incoming) {
    if (!current || !incoming || String(current._id) !== String(incoming._id)) return current;

    const currentUpdatedAt = Date.parse(current.updatedAt || '');
    const incomingUpdatedAt = Date.parse(incoming.updatedAt || '');
    if (
        Number.isFinite(currentUpdatedAt)
        && Number.isFinite(incomingUpdatedAt)
        && incomingUpdatedAt < currentUpdatedAt
    ) return current;

    return {
        ...current,
        status: incoming.status ?? current.status,
        trackingId: incoming.trackingId ?? current.trackingId,
        trackingUrl: incoming.trackingUrl ?? current.trackingUrl,
        courier: incoming.courier ?? current.courier,
        updatedAt: incoming.updatedAt ?? current.updatedAt,
        waslah: {
            ...(current.waslah || {}),
            ...(incoming.waslah || {}),
        },
    };
}

export default function StoreOrders() {
    const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED';
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showOrderEditPanel, setShowOrderEditPanel] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [trackingData, setTrackingData] = useState({
        trackingId: '',
        trackingUrl: '',
        courier: ''
    });
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterPayment, setFilterPayment] = useState('ALL');
    const [filterTrafficSource, setFilterTrafficSource] = useState('ALL');
    const [datePreset, setDatePreset] = useState('ALL');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [fromTime, setFromTime] = useState(DEFAULT_ORDER_FILTER_TIME);
    const [toTime, setToTime] = useState(DEFAULT_ORDER_FILTER_TIME);
    const [exportTypeFilter, setExportTypeFilter] = useState('ALL');
    const [orderSearchQuery, setOrderSearchQuery] = useState('');
    const [orderCsvFile, setOrderCsvFile] = useState(null);
    const [importingOrdersCsv, setImportingOrdersCsv] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0, phase: 'idle' });
    const [showImportExportPanel, setShowImportExportPanel] = useState(false);
    const [showDeliverySchedule, setShowDeliverySchedule] = useState(false);
    const [showOrderFilters, setShowOrderFilters] = useState(false);
    const [paymentReconcileStatus, setPaymentReconcileStatus] = useState(null);
    const paymentReconcileRunningRef = useRef(false);
    const PAYMENT_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
    const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
    const suppressLiveAlertsRef = useRef(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    const [deletingBulkOrders, setDeletingBulkOrders] = useState(false);
    const [bulkUpdatingStatus, setBulkUpdatingStatus] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [ordersPerPage, setOrdersPerPage] = useState(20);
    const [sortBy, setSortBy] = useState('date');
    const [sortDirection, setSortDirection] = useState('desc');
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
    const [paymentFailedCallOrder, setPaymentFailedCallOrder] = useState(null);
    const [savingPaymentFailedFollowUp, setSavingPaymentFailedFollowUp] = useState(false);
    const [recheckingPaymentOrderId, setRecheckingPaymentOrderId] = useState(null);
    const [schedulingPickup, setSchedulingPickup] = useState(false);
    const [sendingToC3xpress, setSendingToC3xpress] = useState(false);
    const [showCommunicationHistory, setShowCommunicationHistory] = useState(false);
    const [communicationHistory, setCommunicationHistory] = useState([]);
    const [loadingCommunicationHistory, setLoadingCommunicationHistory] = useState(false);
    const [c3xConfig, setC3xConfig] = useState({
        product: 'DOM',
        serviceType: 'NOR'
    });
    const [waslahConfig, setWaslahConfig] = useState({ configured: false, createOrderUrl: '' });
    const [waslahSenders, setWaslahSenders] = useState([]);
    const [waslahServices, setWaslahServices] = useState([]);
    const [loadingWaslahSenders, setLoadingWaslahSenders] = useState(false);
    const [loadingWaslahServices, setLoadingWaslahServices] = useState(false);
    const [shippingWithWaslah, setShippingWithWaslah] = useState(false);
    const [cancellingWaslah, setCancellingWaslah] = useState(false);
    const [requestingWaslahPickup, setRequestingWaslahPickup] = useState(false);
    const [refreshingWaslahStatus, setRefreshingWaslahStatus] = useState(false);
    const [waslahStatusRefreshedAt, setWaslahStatusRefreshedAt] = useState(null);
    const [waslahPickupInfo, setWaslahPickupInfo] = useState(() => getDefaultWaslahPickupInfo());
    const [showBulkPickupPanel, setShowBulkPickupPanel] = useState(false);
    const [waslahManualOrderId, setWaslahManualOrderId] = useState('');
    const [waslahLinkHelpOpen, setWaslahLinkHelpOpen] = useState(false);
    const [waslahSuccessNotice, setWaslahSuccessNotice] = useState(null);
    const [downloadingWaslahReceipts, setDownloadingWaslahReceipts] = useState(false);
    const [centerConfirm, setCenterConfirm] = useState(null);
    const centerConfirmResolverRef = useRef(null);
    const [centerNotice, setCenterNotice] = useState(null);
    const [centerProgress, setCenterProgress] = useState(null);
    const [refreshInterval, setRefreshInterval] = useState(30); // seconds
    const [liveOrderAlert, setLiveOrderAlert] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [returnActionType, setReturnActionType] = useState(null);
    const [returnActionReason, setReturnActionReason] = useState('');
    const [submittingReturnAction, setSubmittingReturnAction] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectingReturnIndex, setRejectingReturnIndex] = useState(null);
    const [ltlPickupData, setLtlPickupData] = useState({
        client_warehouse: '',
        pickup_date: '',
        start_time: '',
        expected_package_count: 1
    });
    const [ltlLabelSize, setLtlLabelSize] = useState('std');
    const [ltlLoading, setLtlLoading] = useState(false);
    const [awbManifestData, setAwbManifestData] = useState({
        pickup_location_name: '',
        payment_mode: 'cod',
        cod_amount: 0,
        weight: 1000,
        dimensions: [{ box_count: 1, length_cm: 10, width_cm: 10, height_cm: 10 }],
        dropoff_location: {}
    });
    const [generatingAwb, setGeneratingAwb] = useState(false);
    const refreshIntervalRef = useRef(null);
    const waslahStatusRefreshInFlightRef = useRef(new Set());
    const waslahBatchRefreshInFlightRef = useRef(false);
    const waslahBatchCursorRef = useRef(0);
    const selectedOrderIdRef = useRef('');
    const router = useRouter();

    selectedOrderIdRef.current = String(selectedOrder?._id || '');

    const { user, getToken, loading: authLoading } = useAuth();

    const liveWaslahOrderIds = useMemo(() => orders
        .filter((order) => (
            isWaslahShipmentProcessed(order)
            && !isWaslahLiveTerminalOrder(order)
        ))
        .map((order) => String(order._id))
        .filter(Boolean), [orders]);
    const liveWaslahOrderIdsKey = liveWaslahOrderIds.join(',');

    const callCourierProxy = async (action, params, data) => {
        setLtlLoading(true);
        try {
            const token = await getToken(true);
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }
            const response = await axios.post('/api/store/courior/proxy', {
                action,
                params,
                data
            }, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 15000
            });

            toast.success('Courier action completed');
            return response.data?.data;
        } catch (error) {
            console.error('[Courier action] error:', error);
            toast.error(error?.response?.data?.error || 'Courier action failed');
            return null;
        } finally {
            setLtlLoading(false);
        }
    };

    // Map Delhivery live status (current_status + latest event) to internal order status
    const mapDelhiveryStatusToOrderStatus = (delhivery, currentStatus) => {
        if (!delhivery) return null;

        const texts = [];
        if (delhivery.current_status) {
            texts.push(delhivery.current_status.toLowerCase());
        }

        if (Array.isArray(delhivery.events) && delhivery.events.length > 0) {
            const latestEvent = delhivery.events[delhivery.events.length - 1];
            if (latestEvent?.status) {
                texts.push(latestEvent.status.toLowerCase());
            }
        }

        if (texts.length === 0) return null;
        const combined = texts.join(' | ');

        if (combined.includes('delivered')) return 'DELIVERED';
        if (combined.includes('out for delivery')) return 'OUT_FOR_DELIVERY';
        if (combined.includes('picked up') || combined.includes('picked-up')) return 'PICKED_UP';
        if (combined.includes('pickup requested')) return 'PICKUP_REQUESTED';
        if (combined.includes('waiting for pickup')) return 'WAITING_FOR_PICKUP';
        if (combined.includes('warehouse') || combined.includes('hub')) return 'WAREHOUSE_RECEIVED';

        // Treat generic "pending" as order is being processed
        if (combined.includes('pending')) {
            if (currentStatus === 'ORDER_PLACED') return 'PROCESSING';
            return currentStatus;
        }

        if (
            combined.includes('in transit') ||
            combined.includes('dispatched') ||
            combined.includes('shipped') ||
            combined.includes('forwarded')
        ) {
            if (
                currentStatus === 'ORDER_PLACED' ||
                currentStatus === 'PROCESSING' ||
                currentStatus === 'WAITING_FOR_PICKUP' ||
                currentStatus === 'PICKUP_REQUESTED'
            ) {
                return 'SHIPPED';
            }
        }

        return null;
    };

    const mapWaslahToOrderStatus = (waslah, currentStatus, order = null) => {
        if (!waslah) return null;

        const packed = order?.warehousePacking?.packed === true;
        const fromEvents = Array.isArray(waslah.events) && waslah.events.length
            ? resolveLatestWaslahAppStatus(waslah.events)
            : null;
        const candidate = waslah.appStatus || fromEvents;

        const candidateOrderStatus = resolveWaslahOrderStatusTransition(candidate, currentStatus, { packed });
        if (candidateOrderStatus && candidateOrderStatus !== currentStatus) return candidateOrderStatus;

        const subtag = waslah.currentSubtag || waslah.lastSubtag;
        if (subtag) {
            const mapped = mapWaslahSubtagToOrderStatus(subtag);
            const mappedOrderStatus = resolveWaslahOrderStatusTransition(mapped, currentStatus, { packed });
            if (mappedOrderStatus && mappedOrderStatus !== currentStatus) return mappedOrderStatus;
        }

        return null;
    };

    // Unified payment-status resolver for dashboard
    const isOrderPaid = (order) => {
        if (isAwaitingPaymentOrder(order)) return false;

        const paymentMethod = normalizeOrderPaymentMethod(order);
        const orderStatus = String(order?.status || '').trim().toUpperCase();
        const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();

        // COD is paid when delivered or cash collected on delivery
        if (paymentMethod === 'COD') {
            if (orderStatus === 'DELIVERED') return true;
            if (order?.delhivery?.payment?.is_cod_recovered) return true;
            if (order?.isPaid === true) return true;

            const delhiveryText = [
                order?.delhivery?.current_status,
                order?.delhivery?.events?.[order?.delhivery?.events?.length - 1]?.status,
            ].filter(Boolean).join(' ').toLowerCase();
            if (delhiveryText.includes('delivered')) return true;

            return false;
        }

        // Non-COD (card/online/prepaid) should appear paid unless explicitly failed/unpaid
        if (paymentMethod && paymentMethod !== 'OTHER') {
            const explicitUnpaidStatuses = new Set(['failed', 'payment_failed', 'refunded', 'unpaid', 'pending']);
            if (explicitUnpaidStatuses.has(paymentStatus)) return false;
            if (orderStatus === 'PAYMENT_FAILED') return false;
            return true;
        }

        return !!order?.isPaid;
    };

    const normalizeOrderPaymentMethod = normalizeStoreOrderPaymentMethod;

    const PAYMENT_FILTER_OPTIONS = [
        { value: 'ALL', label: 'All payments' },
        { value: 'COD', label: 'COD' },
        { value: 'CARD', label: 'Card' },
        { value: 'TABBY', label: 'Tabby' },
        { value: 'TAMARA', label: 'Tamara' },
        { value: 'WALLET', label: 'Wallet' },
    ];
    const getOrderStats = (baseOrders = orders) => {
        const confirmedOrders = baseOrders.filter(isVisibleStoreOrder);
        const stats = {
            TOTAL: baseOrders.length,
            ACTIVE: confirmedOrders.length,
            RETURN_REQUESTED: baseOrders.filter((o) => o.returns && o.returns.some((r) => r.status === 'REQUESTED')).length,
            PENDING_PAYMENT: baseOrders.filter(isAwaitingPaymentOrder).length,
            PENDING_SHIPMENT: confirmedOrders.filter((o) => !getDisplayAwb(o) && ['ORDER_PLACED', 'PROCESSING'].includes(o.status)).length,
            LABEL_READY: baseOrders.filter(isWaslahLabelNotPrinted).length,
            PACKED: baseOrders.filter((o) => o?.warehousePacking?.packed === true).length,
        };

        STORE_ORDER_STATUS_OPTIONS.forEach(({ value }) => {
            stats[value] = baseOrders.filter((o) => o.status === value).length;
        });

        return stats;
    };

    const getStatsBaseOrders = () => {
        let base = orders;
        if (fromDate || toDate) {
            base = base.filter(isOrderInRange);
        }
        if (filterPayment !== 'ALL') {
            base = base.filter((o) => normalizeOrderPaymentMethod(o) === filterPayment);
        }
        if (filterTrafficSource !== 'ALL') {
            base = base.filter((o) => getOrderTrafficSourceKey(o) === filterTrafficSource);
        }
        if (orderSearchQuery.trim()) {
            base = base.filter((order) => orderMatchesSearch(order, orderSearchQuery));
        }
        return base;
    };
    const getDateRange = () => {
        if (!fromDate && !toDate) return { start: null, end: null };
        const normalizedFromTime = normalizeFilterTimeValue(fromTime);
        const normalizedToTime = normalizeFilterTimeValue(toTime);
        const start = fromDate ? buildFilterDateTime(fromDate, normalizedFromTime) : null;
        let end = toDate ? buildFilterDateTime(toDate, normalizedToTime) : null;

        // Same calendar day + same From/To clock time → one business day through the next cutover.
        // e.g. 14 Jul 10:00 – 14 Jul 10:00 → [14 Jul 10:00, 15 Jul 10:00)
        // Different days with matching times stay literal (13 Jul 10:00 – 14 Jul 10:00 ends at 14 Jul 10:00).
        if (
            end
            && start
            && fromDate
            && toDate
            && fromDate === toDate
            && normalizedFromTime === normalizedToTime
        ) {
            end = buildFilterDateTime(addDaysToDateOnly(toDate, 1), normalizedToTime);
        } else if (start && end && end.getTime() <= start.getTime()) {
            end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
        }
        return { start, end };
    };

    const isOrderInRange = (order) => {
        const { start, end } = getDateRange();
        if (!start && !end) return true;
        const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        if (start && createdAt < start) return false;
        if (end && createdAt >= end) return false;
        return true;
    };

    // Filter orders based on selected status + payment + date range
    const getFilteredOrders = () => {
        let dateFiltered = orders.filter(isOrderInRange);

        if (filterStatus === 'ALL') {
            // Show every loaded order (including cancelled, failed, and unpaid attempts).
        } else if (filterStatus === 'PENDING_PAYMENT') {
            dateFiltered = dateFiltered.filter(isAwaitingPaymentOrder);
        } else if (filterStatus === 'PENDING_SHIPMENT') {
            dateFiltered = dateFiltered.filter((o) => !getDisplayAwb(o) && ['ORDER_PLACED', 'PROCESSING'].includes(o.status));
        } else if (filterStatus === 'LABEL_READY') {
            dateFiltered = dateFiltered.filter(isWaslahLabelNotPrinted);
        } else if (filterStatus === 'PACKED') {
            dateFiltered = dateFiltered.filter((o) => o?.warehousePacking?.packed === true);
        } else if (filterStatus === 'RETURN_REQUESTED') {
            dateFiltered = dateFiltered.filter((o) => o.returns && o.returns.some((r) => r.status === 'REQUESTED'));
        } else if (filterStatus === 'CONVERTED') {
            dateFiltered = dateFiltered.filter((o) => isDashboardConvertedOrder(o));
        } else if (filterStatus === 'DELIVERY_TODAY') {
            dateFiltered = dateFiltered.filter((o) => getDeliveryBucket(o) === 'today');
        } else if (filterStatus === 'DELIVERY_TOMORROW') {
            dateFiltered = dateFiltered.filter((o) => getDeliveryBucket(o) === 'tomorrow');
        } else if (filterStatus === 'DELIVERY_DELAYED') {
            dateFiltered = dateFiltered.filter((o) => getDeliveryBucket(o) === 'delayed');
        } else {
            dateFiltered = dateFiltered.filter((o) => o.status === filterStatus);
        }

        if (filterPayment !== 'ALL') {
            dateFiltered = dateFiltered.filter((o) => normalizeOrderPaymentMethod(o) === filterPayment);
        }

        if (filterTrafficSource !== 'ALL') {
            dateFiltered = dateFiltered.filter((o) => getOrderTrafficSourceKey(o) === filterTrafficSource);
        }

        if (orderSearchQuery.trim()) {
            dateFiltered = dateFiltered.filter((order) => orderMatchesSearch(order, orderSearchQuery));
        }

        return dateFiltered.sort((a, b) => compareStoreOrders(a, b, sortBy, sortDirection));
    };

    const handleOrderSortChange = (value) => {
        const [nextSortBy, nextSortDirection] = String(value).split('-');
        setSortBy(nextSortBy);
        setSortDirection(nextSortDirection);
        setCurrentPage(1);
    };

    const handleOrderColumnSort = (column) => {
        if (sortBy === column) {
            setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
        } else {
            setSortBy(column);
            setSortDirection(column === 'customer' ? 'asc' : 'desc');
        }
        setCurrentPage(1);
    };

    const clearDateRange = () => {
        setDatePreset('ALL');
        setFromDate('');
        setToDate('');
        setFromTime(DEFAULT_ORDER_FILTER_TIME);
        setToTime(DEFAULT_ORDER_FILTER_TIME);
        setCurrentPage(1);
    };

    const dateRangeSummary = buildDateRangeSummary(fromDate, toDate, fromTime, toTime);

    const activeOrderFilterCount = useMemo(() => {
        let count = 0;
        if (filterStatus !== 'ALL') count += 1;
        if (filterPayment !== 'ALL') count += 1;
        if (filterTrafficSource !== 'ALL') count += 1;
        return count;
    }, [filterStatus, filterPayment, filterTrafficSource]);

    const paymentStats = useMemo(() => {
        const counts = { ALL: 0, COD: 0, CARD: 0, TABBY: 0, TAMARA: 0, WALLET: 0 };
        orders.forEach((order) => {
            const method = normalizeOrderPaymentMethod(order);
            counts.ALL += 1;
            if (counts[method] !== undefined) {
                counts[method] += 1;
            }
        });
        return counts;
    }, [orders]);

    const trafficSourceStats = useMemo(() => {
        const counts = TRAFFIC_SOURCE_FILTER_OPTIONS.reduce((acc, option) => {
            acc[option.value] = 0;
            return acc;
        }, {});

        orders.forEach((order) => {
            const key = getOrderTrafficSourceKey(order);
            counts.ALL += 1;
            if (counts[key] !== undefined) {
                counts[key] += 1;
            }
        });

        return counts;
    }, [orders]);

    // Calculate order statistics

    const deliverySummary = useMemo(() => summarizeDeliveryBuckets(orders), [orders]);
    const convertedOrderCount = useMemo(
        () => orders.filter((order) => isDashboardConvertedOrder(order)).length,
        [orders]
    );

    const hasDateFilter = Boolean(fromDate || toDate);
    const hasStatsScopeFilter = hasDateFilter
        || filterPayment !== 'ALL'
        || filterTrafficSource !== 'ALL'
        || Boolean(orderSearchQuery.trim());
    const statsBaseOrders = useMemo(
        () => getStatsBaseOrders(),
        [orders, fromDate, toDate, fromTime, toTime, filterPayment, filterTrafficSource, orderSearchQuery],
    );
    const stats = useMemo(() => getOrderStats(statsBaseOrders), [statsBaseOrders, orders]);
    const ordersMatchingDateRange = useMemo(
        () => orders.filter(isOrderInRange),
        [orders, fromDate, toDate, fromTime, toTime],
    );
    const filteredOrders = getFilteredOrders();
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedOrders = filteredOrders.slice(
        (safeCurrentPage - 1) * ordersPerPage,
        safeCurrentPage * ordersPerPage
    );
    const paginationWindowStart = Math.max(1, safeCurrentPage - 2);
    const paginationWindowEnd = Math.min(totalPages, paginationWindowStart + 4);
    const visiblePageNumbers = [];
    for (let page = Math.max(1, paginationWindowEnd - 4); page <= paginationWindowEnd; page += 1) {
        visiblePageNumbers.push(page);
    }

    const selectedVisibleOrderIds = paginatedOrders
        .map((order) => String(order._id))
        .filter((orderId) => selectedOrderIds.includes(orderId));
    const allVisibleSelected = paginatedOrders.length > 0 && selectedVisibleOrderIds.length === paginatedOrders.length;
    const hasSelectedOrders = selectedOrderIds.length > 0;

    const applyLabelPrintedToOrders = (orderIds, printedAt = new Date().toISOString(), statusById = {}, countById = {}) => {
        const idSet = new Set(orderIds.map(String));
        const updater = (order) => {
            if (!idSet.has(String(order._id))) return order;
            const nextStatus = statusById[String(order._id)] || 'WAITING_FOR_PICKUP';
            const current = String(order.status || '').toUpperCase();
            const shouldUpdateStatus = [
                'ORDER_PLACED',
                'CONFIRMED',
                'PROCESSING',
                'SHIPPED',
                'IN_TRANSIT',
                'WAITING_FOR_PICKUP',
            ].includes(current) || !current;
            const knownCount = Number(countById[String(order._id)]);
            const nextCount = Number.isFinite(knownCount) && knownCount > 0
                ? knownCount
                : getLabelDownloadCount(order) + 1;
            return {
                ...order,
                ...(shouldUpdateStatus ? { status: nextStatus } : {}),
                waslah: {
                    ...(order.waslah || {}),
                    labelPrintedAt: printedAt,
                    labelDownloadCount: nextCount,
                },
            };
        };
        setOrders((prev) => prev.map(updater));
        setSelectedOrder((prev) => (prev && idSet.has(String(prev._id)) ? updater(prev) : prev));
    };

    const markOrdersLabelPrinted = async (orderIds) => {
        const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        if (!ids.length) return false;

        try {
            const token = await getToken();
            const { data } = await axios.post(
                '/api/store/waslah/mark-label-printed',
                { orderIds: ids },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (data?.success) {
                const statusById = {};
                const countById = {};
                (data.orders || []).forEach((entry) => {
                    if (entry?._id && entry?.status) {
                        statusById[String(entry._id)] = entry.status;
                    }
                    if (entry?._id && entry?.waslah?.labelDownloadCount != null) {
                        countById[String(entry._id)] = Number(entry.waslah.labelDownloadCount) || 0;
                    }
                });
                applyLabelPrintedToOrders(data.orderIds || ids, data.labelPrintedAt, statusById, countById);
                return true;
            }
        } catch (error) {
            console.error('Mark label printed failed:', error);
            toast.error(error?.response?.data?.error || 'Failed to mark label as printed');
        }
        return false;
    };

    const downloadEmxCarrierLabel = async (order = selectedOrder) => {
        const orderId = String(order?._id || '').trim();
        if (!orderId) return;
        if (!order?.waslah?.orderId && !order?.waslah?.labelUrl) {
            toast.error('No EMX carrier label yet — send/pickup first');
            return;
        }

        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');
            const response = await axios.get(
                `/api/store/waslah/carrier-label?orderId=${encodeURIComponent(orderId)}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob',
                },
            );
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            const tracking = getOrderAwb(order) || orderId;
            link.href = url;
            link.download = `emx-carrier-label-${tracking}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            applyLabelPrintedToOrders([orderId], new Date().toISOString());
            clearPageCache('store-orders');
            toast.success('Downloaded EMX carrier label · status set to Waiting for Pickup');
        } catch (error) {
            console.error('EMX carrier label download failed:', error);
            let message = 'Failed to download EMX carrier label';
            if (error?.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const parsed = JSON.parse(text);
                    if (parsed?.error) message = parsed.error;
                } catch {
                    // keep default
                }
            } else if (error?.response?.data?.error || error?.message) {
                message = error.response?.data?.error || error.message;
            }
            toast.error(message);
        }
    };

    const getLabelReadyOrdersForReceiptDownload = () => {
        // Selected rows: any shipped-to-EMX order (Waslah order id is enough to print).
        // Default queue: not yet downloaded in the current filtered list.
        if (hasSelectedOrders) {
            const selectedSet = new Set(selectedOrderIds.map(String));
            return orders.filter((order) => (
                selectedSet.has(String(order._id)) && isWaslahLabelReadyOrder(order)
            ));
        }
        return filteredOrders.filter(isWaslahLabelNotPrinted);
    };

    const downloadBulkWaslahReceipts = async () => {
        if (!waslahConfig.configured) {
            toast.error('Waslah is not configured on the server');
            return;
        }

        const labelReadyOrders = getLabelReadyOrdersForReceiptDownload();
        if (!labelReadyOrders.length) {
            toast.error(hasSelectedOrders
                ? 'None of the selected orders have been sent to EMX yet'
                : 'No undownloaded label-ready orders in the current list');
            return;
        }

        setDownloadingWaslahReceipts(true);
        setCenterProgress({
            title: 'Downloading EMX labels…',
            message: `Preparing ${labelReadyOrders.length} EMX carrier label(s). Waslah receipt pages are removed.`,
        });
        try {
            const token = await getToken();
            // Same endpoint family as single-order "Download Carrier Label".
            const response = await axios.post(
                '/api/store/waslah/carrier-label',
                { orderIds: labelReadyOrders.map((order) => order._id) },
                {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'blob',
                },
            );

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `emx-carrier-labels-${labelReadyOrders.length}-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            const printedAt = new Date().toISOString();
            const downloadedIds = labelReadyOrders.map((order) => order._id);
            applyLabelPrintedToOrders(downloadedIds, printedAt);
            clearPageCache('store-orders');
            setCenterProgress(null);
            showCenterNotice({
                title: 'EMX labels downloaded',
                message: `Downloaded ${labelReadyOrders.length} EMX carrier label(s). Status updated to Packed / Awaiting Pickup.`,
                tone: 'success',
                icon: 'check',
                primaryLabel: 'OK',
            });
        } catch (error) {
            console.error('Bulk EMX carrier label download failed:', error);
            setCenterProgress(null);
            let message = 'Failed to download EMX carrier labels';
            if (error?.response?.data instanceof Blob) {
                try {
                    const text = await error.response.data.text();
                    const parsed = JSON.parse(text);
                    message = parsed?.error || message;
                } catch {
                    // keep default message
                }
            } else if (error?.response?.data?.error) {
                message = error.response.data.error;
            }
            showCenterNotice({
                title: 'Download failed',
                message,
                tone: 'error',
                icon: 'alert',
                primaryLabel: 'OK',
            });
        } finally {
            setDownloadingWaslahReceipts(false);
            setCenterProgress(null);
        }
    };

    const toggleOrderSelection = (orderId) => {
        const normalizedOrderId = String(orderId);
        setSelectedOrderIds((prev) => (
            prev.includes(normalizedOrderId)
                ? prev.filter((id) => id !== normalizedOrderId)
                : [...prev, normalizedOrderId]
        ));
    };

    const toggleSelectAllVisibleOrders = () => {
        const visibleIds = paginatedOrders.map((order) => String(order._id));
        if (!visibleIds.length) return;

        setSelectedOrderIds((prev) => {
            if (visibleIds.every((id) => prev.includes(id))) {
                return prev.filter((id) => !visibleIds.includes(id));
            }

            return [...new Set([...prev, ...visibleIds])];
        });
    };

    const renderPaginationControls = () => {
        if (filteredOrders.length <= ordersPerPage) return null;

        return (
            <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                    Showing {(safeCurrentPage - 1) * ordersPerPage + 1} to {Math.min(safeCurrentPage * ordersPerPage, filteredOrders.length)} of {filteredOrders.length} orders
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-500">Rows</label>
                    <select
                        value={ordersPerPage}
                        onChange={(event) => {
                            setOrdersPerPage(Number(event.target.value) || 20);
                            setCurrentPage(1);
                        }}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm bg-white"
                    >
                        {[10, 20, 50, 100, 500].map((size) => (
                            <option key={size} value={size}>{size}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={safeCurrentPage === 1}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Previous
                    </button>
                    {visiblePageNumbers.map((page) => (
                        <button
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${page === safeCurrentPage ? 'bg-blue-600 text-white' : 'border border-gray-300 text-slate-700 hover:bg-gray-50'}`}
                        >
                            {page}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={safeCurrentPage === totalPages}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
        );
    };

    // Function to update tracking details (AWB), auto-set status and notify customer
    const updateTrackingDetails = async () => {
        if (!selectedOrder) return;

        const awb = (trackingData.trackingId || '').trim();
        let courierName = (trackingData.courier || selectedOrder?.courier || '').trim();
        let trackingUrl = (trackingData.trackingUrl || '').trim();

        if (!awb) {
            toast.error('AWB / Tracking ID is required');
            return;
        }

        // If courier is not set, assume Delhivery (for AWB-based tracking)
        if (!courierName) {
            courierName = 'Delhivery';
        }

        // For Delhivery, if no tracking URL entered, auto-generate using AWB
        if (!trackingUrl && courierName.toLowerCase() === 'delhivery') {
            trackingUrl = `https://www.delhivery.com/track-v2/package/${encodeURIComponent(awb)}`;
        }

        // Auto-move status forward when tracking is added
        // If the order is still ORDER_PLACED or PROCESSING, treat it as SHIPPED
        let nextStatus = selectedOrder.status;
        if (nextStatus === 'ORDER_PLACED' || nextStatus === 'PROCESSING') {
            nextStatus = 'SHIPPED';
        }
        
        try {
            const token = await getToken();
            await axios.put(`/api/store/orders/${selectedOrder._id}`, {
                status: nextStatus,
                trackingId: awb,
                trackingUrl,
                courier: courierName
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Tracking details updated, status set to Shipped & customer notified!');

            // Refresh orders list
            await fetchOrders();

            // Update selectedOrder locally so UI + Delhivery auto-refresh work immediately
            setSelectedOrder(prev => prev ? {
                ...prev,
                status: nextStatus,
                trackingId: awb,
                courier: courierName,
                trackingUrl
            } : prev);

            // Trigger an immediate Delhivery refresh (if Delhivery courier)
            if (courierName.toLowerCase() === 'delhivery') {
                try {
                    await refreshTrackingData();
                } catch {
                    // ignore refresh errors here; UI will still have AWB saved
                }
            }
        } catch (error) {
            console.error('Failed to update tracking:', error);
            toast.error(error?.response?.data?.error || 'Failed to update tracking details');
        }
    };

    // Manually trigger automatic status sync from latest courier tracking
    const autoSyncStatusFromTracking = async (targetOrder) => {
        const order = targetOrder || selectedOrder;
        const awb = getDisplayAwb(order);

        if (!order || !awb) {
            toast.error('Add a tracking ID first');
            return;
        }
        try {
            const token = await getToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const { data } = await axios.get(`/api/track-order?awb=${encodeURIComponent(awb)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!data.order || (!data.order.delhivery && !data.order.waslah)) {
                toast.error('No live courier status found yet. Try again later.');
                return;
            }

            const currentStatus = data.order.status || order.status;
            const orderForMap = { ...order, ...data.order };
            const mappedStatus = data.order.waslah
                ? mapWaslahToOrderStatus(data.order.waslah, currentStatus, orderForMap)
                : mapDelhiveryStatusToOrderStatus(data.order.delhivery, currentStatus);

            if (!mappedStatus || mappedStatus === currentStatus) {
                toast.error('Status is already up to date with tracking.');
                return;
            }

            await axios.post('/api/store/orders/update-status', {
                orderId: order._id,
                status: mappedStatus
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Update local state so UI reflects the change immediately
            setSelectedOrder(prev => prev && prev._id === order._id ? { ...prev, status: mappedStatus } : prev);
            setOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: mappedStatus } : o));

            toast.success(`Order status set to "${mappedStatus}" from tracking.`);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Auto status sync timeout after 10 seconds');
                toast.error('Request timeout. Delhivery API took too long. Please try again.');
            } else {
                console.error('Auto status sync failed:', error);
                toast.error(error?.response?.data?.error || 'Failed to auto-sync status from tracking');
            }
        }
    };

    const markOrderPacked = async (order) => {
        if (!order?._id) return;
        if (order?.warehousePacking?.packed) {
            toast('Order is already packed');
            return;
        }
        try {
            const token = await getToken();
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }
            const { data } = await axios.post(
                '/api/store/orders/pack',
                { orderId: order._id },
                { headers: { Authorization: `Bearer ${token}` } },
            );

            const packing = {
                packed: true,
                packedAt: new Date().toISOString(),
                ...(data?.warehousePacking || data?.order?.warehousePacking || {}),
            };
            const nextStatus = data?.status
                || data?.order?.status
                || 'WAITING_FOR_PICKUP';
            const nextOrder = {
                ...order,
                ...(data?.order || {}),
                status: nextStatus,
                warehousePacking: packing,
            };

            setSelectedOrder((prev) => (prev && prev._id === order._id ? { ...prev, ...nextOrder } : prev));
            setOrders((prev) => {
                const updated = prev.map((o) => (o._id === order._id ? { ...o, ...nextOrder } : o));
                writePageCache('store-orders', { orders: updated, fetchedAt: Date.now() });
                return updated;
            });

            if (data?.emailSent) {
                toast.success(data?.message || 'Order packed — customer emailed');
            } else if (data?.emailError) {
                toast.success(data?.message || 'Order packed');
                toast.error(`Customer email not sent: ${data.emailError}`);
            } else {
                toast.success(data?.message || 'Order packed');
            }
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to mark order packed');
        }
    };

    // Move openModal and closeModal to top level
    const openModal = (order) => {
        console.log('[MODAL DEBUG] Opening order:', order);
        console.log('[MODAL DEBUG] Order shippingAddress:', order.shippingAddress);
        console.log('[MODAL DEBUG] Order userId type:', typeof order.userId);
        console.log('[MODAL DEBUG] Order userId value:', order.userId);
        console.log('[MODAL DEBUG] Order userId is object?:', typeof order.userId === 'object');
        if (typeof order.userId === 'object' && order.userId !== null) {
            console.log('[MODAL DEBUG] User name:', order.userId.name);
            console.log('[MODAL DEBUG] User email:', order.userId.email);
        }
        console.log('[MODAL DEBUG] Order addressId:', order.addressId);
        console.log('[MODAL DEBUG] Order isGuest:', order.isGuest);
        setSelectedOrder(order);
        setShowOrderEditPanel(false);
        // Pre-fill tracking data if it exists
        setTrackingData({
            trackingId: order.trackingId || '',
            trackingUrl: order.trackingUrl || '',
            courier: order.courier || ''
        });
        setC3xConfig({
            product: 'DOM',
            serviceType: 'NOR'
        });
        setWaslahPickupInfo(getDefaultWaslahPickupInfo());
        setWaslahLinkHelpOpen(isWaslahUnlinkedDuplicate(order));
        setWaslahSuccessNotice(null);
        setWaslahStatusRefreshedAt(null);
        // Pre-fill AWB manifest data from order
        const isCod = order.payment_method === 'cod' || order.paymentMethod === 'cod';
        setAwbManifestData({
            pickup_location_name: '',
            payment_mode: isCod ? 'cod' : 'prepaid',
            cod_amount: isCod ? order.total : 0,
            weight: Math.max(1000, Math.ceil(order.total / 10)), // Estimate: 1kg min or 100g per AED1
            dimensions: [{ box_count: 1, length_cm: 30, width_cm: 20, height_cm: 15 }],
            dropoff_location: order.shippingAddress || {}
        });
        setIsModalOpen(true);
    };

    // Check Razorpay payment settlement status
    const checkRazorpaySettlement = async (order) => {
        if (!order.razorpayPaymentId) {
            toast.error('This order does not have a Razorpay payment');
            return;
        }
        
        try {
            const token = await getToken();
            const { data } = await axios.get(`/api/store/orders/check-razorpay-settlement?orderId=${order._id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (data.success) {
                // Update order locally if it was updated
                if (data.updated) {
                    setSelectedOrder(prev => prev && prev._id === order._id ? {
                        ...prev,
                        isPaid: true,
                        paymentStatus: 'CAPTURED'
                    } : prev);
                    setOrders(prev => prev.map(o => 
                        o._id === order._id ? {
                            ...o,
                            isPaid: true,
                            paymentStatus: 'CAPTURED'
                        } : o
                    ));
                }
                
                const settlement = data.razorpayStatus;
                let message = `💳 Razorpay Payment Status\n`;
                message += `Amount: AED${settlement.amount}\n`;
                message += `Status: ${settlement.payment_captured ? '✓ Captured' : '✗ Not captured'}\n`;
                message += `Fee: AED${settlement.fee || 0}\n`;
                message += `Settlement: ${settlement.settlement_status}\n`;
                
                if (settlement.transfer_details) {
                    message += `✓ Transferred to Bank\n`;
                    message += `Transfer ID: ${settlement.transfer_details.transfer_id}\n`;
                    message += `Amount: AED${settlement.transfer_details.amount_transferred}`;
                } else {
                    message += `Pending transfer to bank account`;
                }
                
                toast.success(message);
            } else {
                toast.error(data.error);
            }
        } catch (error) {
            console.error('Razorpay check error:', error);
            toast.error(error?.response?.data?.error || 'Failed to check payment settlement');
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedOrder(null);
        setShowOrderEditPanel(false);
        setWaslahStatusRefreshedAt(null);
        // Reset tracking data
        setTrackingData({
            trackingId: '',
            trackingUrl: '',
            courier: ''
        });
        setC3xConfig({
            product: 'DOM',
            serviceType: 'NOR'
        });
    };

    const getPaymentStatus = (order) => isOrderPaid(order);

    const fetchOrders = async ({ silent = false } = {}) => {
        try {
            let token = await getToken(false);
            if (!token) token = await getToken(true);
            if (!token) {
                toast.error("Invalid session. Please sign in again.");
                setLoading(false);
                return;
            }
            if (!silent && !readPageCache('store-orders')) setLoading(true);

            const { data } = await axios.get('/api/store/orders', {
                params: {
                    withDelhivery: autoRefreshEnabled ? 'true' : 'false',
                    withWaslah: 'true',
                },
                headers: { Authorization: `Bearer ${token}` },
            });
            console.log('[ORDERS DEBUG] Raw orders data:', data.orders);
            
            // Debug first 3 orders
            if (data.orders && data.orders.length > 0) {
                console.log('[ORDERS DEBUG] First 3 orders payment/status info:');
                data.orders.slice(0, 3).forEach((o, i) => {
                    console.log(`Order ${i}:`, { _id: o._id, paymentMethod: o.paymentMethod, status: o.status, isPaid: o.isPaid });
                });
            }

            let syncedOrders = data.orders || [];

            // One-time client-side sync: if Delhivery says "out for delivery" / "delivered" etc.
            // but order.status is still ORDER_PLACED/PROCESSING/CANCELLED, bump status to match
            // and persist the change back to the backend so customer views stay in sync.
            const updatesToPersist = [];
            syncedOrders = syncedOrders.map(order => {
                const waslahMapped = order?.waslah
                    ? mapWaslahToOrderStatus(order.waslah, order.status, order)
                    : null;
                const delhiveryMapped = mapDelhiveryStatusToOrderStatus(order.delhivery, order.status);
                const mapped = waslahMapped || delhiveryMapped;
                if (mapped && mapped !== order.status) {
                    updatesToPersist.push({ orderId: order._id, status: mapped });
                    return { ...order, status: mapped };
                }
                return order;
            });

            if (syncedOrders.length > 0) {
                console.log('[ORDERS DEBUG] First synced order sample:', JSON.stringify(syncedOrders[0], null, 2));
            }

            // Persist any mapped statuses silently (no toast spam)
            if (updatesToPersist.length > 0) {
                try {
                    await Promise.all(
                        updatesToPersist.map(update =>
                            axios.post('/api/store/orders/update-status', {
                                ...update,
                                silent: true,
                            }, {
                                headers: { Authorization: `Bearer ${token}` }
                            })
                        )
                    );
                } catch (statusSyncError) {
                    console.error('Failed to persist auto-mapped statuses:', statusSyncError);
                }
            }

            setOrders(syncedOrders);
            writePageCache('store-orders', { orders: syncedOrders, fetchedAt: Date.now() });
            setSelectedOrderIds((prev) => prev.filter((id) => syncedOrders.some((order) => String(order._id) === id)));
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        } finally {
            setLoading(false);
        }
    };

    const savePaymentFailedFollowUp = async ({ reason, discountAmount, discountType, handledByName, paymentMethod }) => {
        if (!paymentFailedCallOrder?._id) return;

        try {
            setSavingPaymentFailedFollowUp(true);
            const token = await getToken(true);
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }

            const { data } = await axios.post(
                `/api/store/orders/${paymentFailedCallOrder._id}/payment-failed-follow-up`,
                { reason, discountAmount, discountType, handledByName, paymentMethod },
                { headers: { Authorization: `Bearer ${token}` } },
            );

            const followUp = data?.paymentFailedFollowUp;
            const updatedOrder = data?.order;
            const orderId = String(paymentFailedCallOrder._id);

            setOrders((prev) => prev.map((order) => (
                String(order._id) === orderId
                    ? {
                        ...order,
                        ...(updatedOrder || {}),
                        paymentFailedFollowUp: followUp,
                    }
                    : order
            )));

            setSelectedOrder((prev) => (
                prev && String(prev._id) === orderId
                    ? {
                        ...prev,
                        ...(updatedOrder || {}),
                        paymentFailedFollowUp: followUp,
                    }
                    : prev
            ));

            toast.success('Customer follow-up saved');
            setPaymentFailedCallOrder(null);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to save follow-up');
        } finally {
            setSavingPaymentFailedFollowUp(false);
        }
    };

    const recheckFailedOrderPayment = async (order) => {
        const orderId = String(order?._id || '').trim();
        if (!orderId || !isPaymentFailedStoreOrder(order)) return;
        if (recheckingPaymentOrderId) return;

        setRecheckingPaymentOrderId(orderId);
        try {
            let token = await getToken(false);
            if (!token) token = await getToken(true);
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }

            const { data } = await axios.post(
                `/api/store/orders/${orderId}/recheck-payment`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );

            const updatedOrder = data?.order;
            if (updatedOrder?._id) {
                setOrders((prev) => prev.map((row) => (
                    String(row._id) === orderId ? { ...row, ...updatedOrder } : row
                )));
                setSelectedOrder((prev) => (
                    prev && String(prev._id) === orderId
                        ? { ...prev, ...updatedOrder }
                        : prev
                ));
            }

            if (data?.paid || data?.fixed) {
                toast.success('Payment confirmed — order marked as paid');
                await fetchOrders({ silent: true });
                return;
            }

            const method = String(data?.paymentMethod || order?.paymentMethod || 'provider').toUpperCase();
            toast.error(formatPaymentRecheckReason(data?.reason, method), { duration: 8000 });
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Payment recheck failed');
        } finally {
            setRecheckingPaymentOrderId(null);
        }
    };

    const runPaymentReconciliation = async ({ silent = true } = {}) => {
        if (paymentReconcileRunningRef.current) return;
        paymentReconcileRunningRef.current = true;
        try {
            let token = await getToken(false);
            if (!token) token = await getToken(true);
            if (!token) return;

            const { data } = await axios.post(
                '/api/store/orders/reconcile-payments',
                { hours: 24 },
                { headers: { Authorization: `Bearer ${token}` } },
            );

            const summary = data?.summary || null;
            setPaymentReconcileStatus(summary);

            if (summary?.fixed > 0) {
                toast.success(
                    `Fixed ${summary.fixed} order(s) that were paid but showing failed/pending`,
                    { id: 'payment-reconcile-fixed' },
                );
                await fetchOrders({ silent: true });
            } else if (!silent) {
                toast.success('Payment check complete — no paid orders needed fixing', {
                    id: 'payment-reconcile-ok',
                });
            }
        } catch (error) {
            if (!silent) {
                toast.error(error?.response?.data?.error || 'Payment check failed');
            } else {
                console.error('Payment reconciliation failed:', error);
            }
        } finally {
            paymentReconcileRunningRef.current = false;
        }
    };

    useEffect(() => {
        const cached = readPageCache('store-orders');
        if (cached?.orders?.length) {
            setOrders(cached.orders);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return; // Wait for auth to load
        if (!user) {
            toast.error("You must be signed in as a seller to view orders.");
            setLoading(false);
            return;
        }
        fetchOrders({ silent: Boolean(readPageCache('store-orders')) });
        // eslint-disable-next-line
    }, [authLoading, user]);

    const loadWaslahConfig = async () => {
        try {
            const token = await getToken();
            const { data } = await axios.get('/api/store/waslah/status', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setWaslahConfig(data || { configured: false });
        } catch {
            setWaslahConfig({ configured: false });
        }
    };

    const loadWaslahSenders = async () => {
        setLoadingWaslahSenders(true);
        try {
            const token = await getToken();
            const { data } = await axios.get('/api/store/waslah/senders', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const addresses = Array.isArray(data?.addresses) ? data.addresses : [];
            setWaslahSenders(addresses);
            if (addresses.length) {
                toast.success(`Found ${addresses.length} Waslah sender address(es). Copy the id into WASLAH_SENDER_ID in .env`);
            } else {
                toast.error(data?.hint || 'No sender addresses found. Ask Waslah support for your sender _id.');
            }
        } catch (error) {
            setWaslahSenders([]);
            toast.error(error?.response?.data?.error || 'Could not load Waslah sender addresses');
        } finally {
            setLoadingWaslahSenders(false);
        }
    };

    const loadWaslahServices = async () => {
        setLoadingWaslahServices(true);
        try {
            const token = await getToken();
            const { data } = await axios.get('/api/store/waslah/services', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const services = Array.isArray(data?.services) ? data.services : [];
            setWaslahServices(services);
            if (services.length) {
                toast.success(`Found ${services.length} ${data?.preferredCourier || 'EMX'} service(s). Copy the id into WASLAH_SERVICE_ID in .env`);
            } else {
                toast.error(data?.hint || `No ${data?.preferredCourier || 'EMX'} services found. Ask Waslah support for your EMX service _id.`);
            }
        } catch (error) {
            setWaslahServices([]);
            toast.error(error?.response?.data?.error || 'Could not load Waslah services');
        } finally {
            setLoadingWaslahServices(false);
        }
    };

    useEffect(() => {
        if (authLoading || !user) return;
        loadWaslahConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user]);

    useEffect(() => {
        if (authLoading || !user) return undefined;

        const initialTimer = setTimeout(() => {
            runPaymentReconciliation({ silent: true });
        }, 45000);

        const intervalId = setInterval(() => {
            runPaymentReconciliation({ silent: true });
        }, PAYMENT_RECONCILE_INTERVAL_MS);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(intervalId);
        };
        // eslint-disable-next-line
    }, [authLoading, user]);

    useEffect(() => {
        const handleNewStoreOrder = (event) => {
            const incoming = Array.isArray(event?.detail?.orders) ? event.detail.orders : [];
            fetchOrders();
            if (suppressLiveAlertsRef.current || incoming.length === 0) return;
            if (incoming.length === 1) {
                const order = incoming[0];
                const label = getDisplayOrderNumber(order) ? `#${getDisplayOrderNumber(order)}` : 'A new order';
                setLiveOrderAlert(`${label} just arrived · AED ${Number(order.total || 0).toLocaleString()}`);
            } else if (incoming.length > 1) {
                setLiveOrderAlert(`${incoming.length} new orders just arrived`);
            }
        };

        window.addEventListener(STORE_ORDER_NOTIFICATION_EVENT, handleNewStoreOrder);
        return () => window.removeEventListener(STORE_ORDER_NOTIFICATION_EVENT, handleNewStoreOrder);
        // eslint-disable-next-line
    }, [user]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, filterPayment, filterTrafficSource, fromDate, toDate, fromTime, toTime, datePreset, ordersPerPage, orderSearchQuery]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    // Auto-refresh tracking data
    useEffect(() => {
        if (autoRefreshEnabled && selectedOrder?.trackingId) {
            refreshIntervalRef.current = setInterval(() => {
                refreshTrackingData();
            }, refreshInterval * 1000);
        }
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [autoRefreshEnabled, selectedOrder, refreshInterval]);

    useEffect(() => {
        const cutover = DEFAULT_ORDER_FILTER_TIME;
        const bounds = getOrdersByProductBusinessDayBounds(cutover);
        const dubaiToday = getDubaiDateParts().date;

        if (datePreset === 'TODAY') {
            setFromDate(bounds.startDate || dubaiToday);
            setToDate(bounds.startDate || dubaiToday);
            setFromTime(cutover);
            setToTime(cutover);
            return;
        }
        if (datePreset === 'LAST_7_DAYS') {
            const startDate = addDaysToDateOnly(bounds.startDate || dubaiToday, -6);
            setFromDate(startDate);
            setToDate(bounds.startDate || dubaiToday);
            setFromTime(cutover);
            setToTime(cutover);
            return;
        }
        if (datePreset === 'ALL') {
            setFromDate('');
            setToDate('');
            setFromTime(cutover);
            setToTime(cutover);
        }
    }, [datePreset]);

    const refreshTrackingData = async () => {
        if (!selectedOrder || !selectedOrder.trackingId) return;
        try {
            const token = await getToken();
            const { data } = await axios.get(`/api/track-order?awb=${selectedOrder.trackingId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.order) {
                const mappedStatus = data.order.waslah
                    ? mapWaslahToOrderStatus(data.order.waslah, selectedOrder.status || data.order.status)
                    : mapDelhiveryStatusToOrderStatus(
                        data.order.delhivery,
                        selectedOrder.status || data.order.status
                    );

                if (mappedStatus && mappedStatus !== (selectedOrder.status || data.order.status)) {
                    try {
                        // Persist new status silently (no toast spam during auto-refresh)
                        await axios.post('/api/store/orders/update-status', {
                            orderId: selectedOrder._id,
                            status: mappedStatus,
                            silent: true,
                        }, {
                            headers: { Authorization: `Bearer ${token}` }
                        });

                        data.order.status = mappedStatus;
                    } catch (statusError) {
                        console.error('Failed to sync status from Delhivery:', statusError);
                    }
                }

                // Update the selected order with fresh tracking data
                setSelectedOrder(prev => ({
                    ...prev,
                    ...data.order,
                    delhivery: data.order.delhivery || prev.delhivery,
                    waslah: data.order.waslah || prev.waslah,
                }));
                // Also update in orders list
                setOrders(prev => prev.map(o => o._id === selectedOrder._id ? {...o, ...data.order} : o));
            }
        } catch (error) {
            console.error('Failed to refresh tracking:', error);
        }
    };

    const getExportFilteredOrders = () => {
        let baseOrders = filteredOrders;

        if (selectedOrderIds.length > 0) {
            const selectedSet = new Set(selectedOrderIds.map(String));
            baseOrders = orders.filter((order) => selectedSet.has(String(order._id)));
        }

        if (exportTypeFilter === 'ALL') return baseOrders;
        if (exportTypeFilter === 'CANCELLED') {
            return baseOrders.filter((order) => String(order?.status || '').toUpperCase() === 'CANCELLED');
        }
        if (exportTypeFilter === 'PAID') {
            return baseOrders.filter((order) => isOrderPaid(order));
        }
        if (exportTypeFilter === 'COD') {
            return baseOrders.filter((order) => normalizeOrderPaymentMethod(order) === 'COD');
        }
        if (exportTypeFilter === 'CARD') {
            return baseOrders.filter((order) => normalizeOrderPaymentMethod(order) === 'CARD');
        }
        if (exportTypeFilter === 'TABBY') {
            return baseOrders.filter((order) => normalizeOrderPaymentMethod(order) === 'TABBY');
        }
        if (exportTypeFilter === 'TAMARA') {
            return baseOrders.filter((order) => normalizeOrderPaymentMethod(order) === 'TAMARA');
        }
        if (exportTypeFilter === 'WALLET') {
            return baseOrders.filter((order) => normalizeOrderPaymentMethod(order) === 'WALLET');
        }

        return baseOrders;
    };

    const getExportFileBaseName = () => {
        const dateLabel = new Date().toISOString().slice(0, 10);
        if (selectedOrderIds.length > 0) {
            return `store-orders-selected-${selectedOrderIds.length}-${dateLabel}`;
        }
        return `store-orders-${dateLabel}`;
    };

    const exportOrdersToExcel = async () => {
        const exportOrders = getExportFilteredOrders();

        if (!exportOrders.length) {
            toast.error(selectedOrderIds.length > 0
                ? 'No selected orders match the export filters'
                : 'No orders available to export');
            return;
        }

        try {
            const XLSX = await import('xlsx');
            const rows = buildWooCommerceOrderExportRows(exportOrders);
            const worksheetData = [WOOCOMMERCE_ORDER_EXPORT_HEADERS, ...rows];
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

            worksheet['!cols'] = WOOCOMMERCE_ORDER_EXPORT_HEADERS.map((header, columnIndex) => {
                const maxCellLength = Math.max(
                    header.length,
                    ...rows.map((row) => String(row[columnIndex] || '').length),
                );
                return { wch: Math.min(Math.max(maxCellLength + 2, 12), 48) };
            });

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

            XLSX.writeFile(workbook, `${getExportFileBaseName()}.xlsx`);

            const scopeLabel = selectedOrderIds.length > 0 ? 'selected ' : '';
            toast.success(`Exported ${rows.length} row(s) from ${exportOrders.length} ${scopeLabel}order(s)`);
        } catch (error) {
            console.error('Excel export failed:', error);
            toast.error('Failed to export Excel file');
        }
    };

    const exportOrdersToCsv = async () => {
        const exportOrders = getExportFilteredOrders();

        if (!exportOrders.length) {
            toast.error(selectedOrderIds.length > 0
                ? 'No selected orders match the export filters'
                : 'No orders available to export');
            return;
        }

        try {
            const csv = buildWooCommerceOrderExportCsv(exportOrders);
            const rowCount = csv.split('\n').length - 1;

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${getExportFileBaseName()}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            const scopeLabel = selectedOrderIds.length > 0 ? 'selected ' : '';
            toast.success(`Exported ${rowCount} row(s) from ${exportOrders.length} ${scopeLabel}order(s) to CSV`);
        } catch (error) {
            console.error('CSV export failed:', error);
            toast.error('Failed to export CSV file');
        }
    };

    const importOrdersFromCsv = async () => {
        if (!orderCsvFile) {
            toast.error('Choose a CSV file first');
            return;
        }

        const fileName = String(orderCsvFile.name || '').toLowerCase();
        if (!fileName.endsWith('.csv')) {
            toast.error('Use the WordPress .csv export only. Excel (.xlsx) auto-changes dates and breaks import.');
            return;
        }

        try {
            setImportingOrdersCsv(true);
            setImportProgress({ current: 0, total: 0, phase: 'parsing' });
            suppressLiveAlertsRef.current = true;
            setLiveOrderAlert('');
            dispatchStoreOrdersImportStart();
            toast.dismiss(STORE_ORDER_TOAST_ID);

            const token = await getToken();
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }

            const authHeaders = { Authorization: `Bearer ${token}` };

            const parseFormData = new FormData();
            parseFormData.append('file', orderCsvFile);
            parseFormData.append('mode', 'parse');

            const { data: parseData } = await axios.post('/api/store/orders/csv', parseFormData, {
                headers: authHeaders,
                timeout: 120000,
            });

            const totalRows = Number(parseData?.total || 0);
            const stats = parseData?.stats || {};
            const exportMeta = stats.exportMeta || null;
            const skippedRows = Number(stats.emptyRowsSkipped || 0)
                + Number(stats.nonOrderRowsSkipped || 0)
                + Number(stats.metaRowsSkipped || 0);

            if (!totalRows) {
                toast.error('No order rows found in file');
                return;
            }

            if (exportMeta?.exportedRows && totalRows < exportMeta.exportedRows) {
                toast(
                    `File reports ${exportMeta.exportedRows.toLocaleString()} exported orders, but only ${totalRows.toLocaleString()} rows were detected. Re-export from WordPress as CSV (do not save as .xlsx in Excel).`,
                    { icon: '⚠️', duration: 8000 },
                );
            } else if (stats.sheetRows && totalRows < stats.sheetRows - 2) {
                toast(
                    `Detected ${totalRows.toLocaleString()} order rows from ${stats.sheetRows.toLocaleString()} Excel sheet rows (${skippedRows.toLocaleString()} blank/meta/non-order rows skipped).`,
                    { icon: 'ℹ️', duration: 6000 },
                );
            }

            setImportProgress({
                current: 0,
                total: totalRows,
                phase: 'importing',
                sheetRows: stats.sheetRows,
                emptyRowsSkipped: skippedRows,
                exportMeta,
            });

            const importFormData = new FormData();
            importFormData.append('file', orderCsvFile);
            importFormData.append('mode', 'import');

            const { data } = await axios.post('/api/store/orders/csv', importFormData, {
                headers: authHeaders,
                timeout: 600000,
                onUploadProgress: (event) => {
                    if (!event.total) return;
                    const uploaded = Math.round((event.loaded / event.total) * Math.min(15, totalRows));
                    setImportProgress((prev) => ({
                        ...prev,
                        current: Math.max(prev.current || 0, uploaded),
                    }));
                },
            });

            const createdCount = Number(data?.summary?.created || 0);
            const updatedCount = Number(data?.summary?.updated || 0);
            const failedCount = Number(data?.summary?.failed || 0);
            const importedTotal = Number(data?.totalParsed || data?.summary?.totalRows || totalRows);

            setOrderCsvFile(null);
            clearPageCache('store-orders');
            setImportProgress({
                current: importedTotal,
                total: importedTotal,
                phase: 'done',
                sheetRows: stats.sheetRows,
                emptyRowsSkipped: skippedRows,
                exportMeta,
            });
            await fetchOrders();

            const importedCount = createdCount + updatedCount;
            const latestOrders = await axios.get('/api/store/orders', {
                headers: authHeaders,
            }).then((response) => (Array.isArray(response?.data?.orders) ? response.data.orders : [])).catch(() => []);

            dispatchStoreOrdersImportEnd({
                importedCount: importedCount || latestOrders.length,
                orderIds: latestOrders.map((order) => String(order?._id || '')).filter(Boolean),
            });

            if (failedCount > 0) {
                toast.error(`Import finished with ${failedCount} failed row(s). ${createdCount} new, ${updatedCount} replaced.`);
            } else {
                toast.success(`Import complete: ${importedTotal.toLocaleString()} orders processed (${createdCount} new, ${updatedCount} updated).`);
            }
        } catch (error) {
            console.error('Order CSV import failed:', error);
            toast.error(error?.response?.data?.error || 'Failed to import orders CSV');
            dispatchStoreOrdersImportEnd({ importedCount: 0, orderIds: [] });
        } finally {
            suppressLiveAlertsRef.current = false;
            setImportingOrdersCsv(false);
            setTimeout(() => {
                setImportProgress({ current: 0, total: 0, phase: 'idle' });
            }, 2500);
        }
    };

    const closeCenterConfirm = (confirmed = false) => {
        const resolve = centerConfirmResolverRef.current;
        centerConfirmResolverRef.current = null;
        setCenterConfirm(null);
        if (typeof resolve === 'function') resolve(Boolean(confirmed));
    };

    const askCenterConfirm = ({
        title = 'Confirm',
        message = '',
        confirmLabel = 'OK',
        cancelLabel = 'Cancel',
        tone = 'violet',
        icon = 'truck',
    } = {}) => new Promise((resolve) => {
        if (centerConfirmResolverRef.current) {
            centerConfirmResolverRef.current(false);
        }
        centerConfirmResolverRef.current = resolve;
        setCenterConfirm({
            title,
            message,
            confirmLabel,
            cancelLabel,
            tone,
            icon,
        });
    });

    const showCenterNotice = ({
        title = 'Done',
        message = '',
        tone = 'success',
        icon = 'check',
        primaryLabel = 'OK',
        secondaryLabel = '',
        onPrimary = null,
        onSecondary = null,
    } = {}) => {
        setCenterNotice({
            title,
            message,
            tone,
            icon,
            primaryLabel,
            secondaryLabel,
            onPrimary,
            onSecondary,
        });
    };

    const closeCenterNotice = (action = 'primary') => {
        const notice = centerNotice;
        setCenterNotice(null);
        if (action === 'primary' && typeof notice?.onPrimary === 'function') {
            notice.onPrimary();
            return;
        }
        if (action === 'secondary' && typeof notice?.onSecondary === 'function') {
            notice.onSecondary();
        }
    };

    const deleteSelectedOrders = async () => {
        if (!selectedOrderIds.length) {
            toast.error('Select orders to delete first');
            return;
        }

        const confirmed = await askCenterConfirm({
            title: 'Move orders to trash?',
            message: `${selectedOrderIds.length} selected order(s) will move to Trash. You can restore them later.`,
            confirmLabel: 'Move to Trash',
            cancelLabel: 'Keep Orders',
            tone: 'red',
            icon: 'trash',
        });
        if (!confirmed) {
            return;
        }

        try {
            setDeletingBulkOrders(true);
            const token = await getToken();
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }

            const { data } = await axios.post('/api/store/orders/bulk-delete', {
                orderIds: selectedOrderIds,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            toast.success(data?.message || 'Selected orders moved to trash');
            setSelectedOrderIds([]);
            await fetchOrders();
        } catch (error) {
            console.error('Bulk delete orders failed:', error);
            toast.error(error?.response?.data?.error || 'Failed to move selected orders to trash');
        } finally {
            setDeletingBulkOrders(false);
        }
    };

    const updateSelectedOrdersStatus = async (newStatus) => {
        if (!selectedOrderIds.length) {
            toast.error('Select orders first');
            return;
        }
        if (!newStatus) return;

        const statusMeta = getStoreOrderStatusMeta(newStatus);
        const confirmed = await askCenterConfirm({
            title: 'Change status for selected orders?',
            message: `${selectedOrderIds.length} selected order(s) will be set to ${statusMeta.label}. Customers are emailed when the status actually changes.`,
            confirmLabel: `Set to ${statusMeta.label}`,
            cancelLabel: 'Cancel',
            tone: 'violet',
            icon: 'alert',
        });
        if (!confirmed) return;

        try {
            setBulkUpdatingStatus(true);
            const token = await getToken(true);
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                return;
            }

            const { data } = await axios.post('/api/store/orders/bulk-status', {
                orderIds: selectedOrderIds,
                status: newStatus,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const failedCount = Number(data?.failedCount || 0);
            if (failedCount > 0) {
                toast.error(data?.message
                    ? `${data.message}. ${failedCount} failed.`
                    : `Updated some orders. ${failedCount} failed.`);
            } else {
                toast.success(data?.message || 'Selected orders updated');
            }
            await fetchOrders();
        } catch (error) {
            console.error('Bulk status update failed:', error);
            toast.error(error?.response?.data?.error || 'Failed to update selected orders');
        } finally {
            setBulkUpdatingStatus(false);
        }
    };

    const schedulePickupWithDelhivery = async () => {
        if (!selectedOrder) return;
        
        if (!selectedOrder.trackingId) {
            toast.error('Please add tracking ID first');
            return;
        }

        setSchedulingPickup(true);
        try {
            const token = await getToken();
            
            // Call backend to schedule pickup
            const { data } = await axios.post('/api/store/schedule-pickup', {
                orderId: selectedOrder._id,
                trackingId: selectedOrder.trackingId,
                courierName: selectedOrder.courier || 'Delhivery',
                shippingAddress: selectedOrder.shippingAddress,
                shipmentWeight: 1, // kg - can be configurable
                packageCount: selectedOrder.orderItems?.length || 1
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (data.success) {
                toast.success(`✅ Pickup scheduled! ID: ${data.pickupId}`);
                fetchOrders();
            } else {
                toast.error(data.error || 'Failed to schedule pickup');
            }
        } catch (error) {
            console.error('Pickup scheduling error:', error);
            toast.error(error?.response?.data?.error || 'Failed to schedule pickup with Delhivery');
        } finally {
            setSchedulingPickup(false);
        }
    };

    const sendOrderToC3xpress = async () => {
        if (!selectedOrder) return;

        if (!selectedOrder.shippingAddress?.street || !selectedOrder.shippingAddress?.city) {
            toast.error('Complete shipping address is required to send order to C3Xpress');
            return;
        }

        setSendingToC3xpress(true);
        try {
            const token = await getToken();
            const { data } = await axios.post('/api/c3xpress/create-shipment', {
                orderId: selectedOrder._id,
                shipmentData: {
                    Product: c3xConfig.product,
                    ProductType: c3xConfig.product,
                    ServiceType: c3xConfig.serviceType,
                }
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!data?.success || !data?.airwayBillNumber) {
                toast.error(data?.error || 'Failed to create C3Xpress AWB');
                return;
            }

            const awb = String(data.airwayBillNumber);
            const url = `https://c3xpress.com/tracking?awb=${encodeURIComponent(awb)}`;

            setTrackingData(prev => ({
                ...prev,
                trackingId: awb,
                courier: 'C3Xpress',
                trackingUrl: url
            }));

            setSelectedOrder(prev => prev ? {
                ...prev,
                trackingId: awb,
                courier: 'C3Xpress',
                trackingUrl: url,
                status: (prev.status === 'ORDER_PLACED' || prev.status === 'PROCESSING') ? 'SHIPPED' : prev.status
            } : prev);

            toast.success(`C3Xpress AWB created: ${awb}`);
            await fetchOrders();
        } catch (error) {
            console.error('Send to C3Xpress error:', error);
            toast.error(error?.response?.data?.error || 'Failed to send order to C3Xpress');
        } finally {
            setSendingToC3xpress(false);
        }
    };

    const applyWaslahShipResult = (data = {}) => {
        const trackingNumber = data.trackingNumber || data.order?.trackingId || '';
        const courierName = data.courier || 'EMX';
        const labelUrl = data.labelUrl || data.order?.waslah?.labelUrl || '';

        if (trackingNumber) {
            setTrackingData((prev) => ({
                ...prev,
                trackingId: trackingNumber,
                courier: courierName,
            }));
        }

        if (data.order) {
            setSelectedOrder((prev) => (prev ? { ...prev, ...data.order } : prev));
            setOrders((current) => current.map((row) => (
                String(row._id) === String(data.order._id) ? { ...row, ...data.order } : row
            )));
            return;
        }

        setSelectedOrder((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                trackingId: trackingNumber || prev.trackingId,
                courier: courierName || prev.courier,
                status: (prev.status === 'ORDER_PLACED' || prev.status === 'PROCESSING') ? 'SHIPPED' : prev.status,
                waslah: {
                    ...(prev.waslah || {}),
                    orderId: data.waslahOrderId || prev.waslah?.orderId,
                    cartId: data.cartId || prev.waslah?.cartId,
                    trackingNumber: trackingNumber || prev.waslah?.trackingNumber,
                    labelUrl: labelUrl || prev.waslah?.labelUrl,
                },
            };
        });
    };

    const callWaslahShip = async ({
        dryRun = false,
        testCreateOnly = false,
        syncOnly = false,
        waslahOrderId = '',
    } = {}) => {
        if (!selectedOrder) return null;

        if (!selectedOrder.shippingAddress?.street && !selectedOrder.shippingAddress?.city) {
            toast.error('Complete shipping address is required for Waslah');
            return null;
        }

        const token = await getToken();
        const pickupDefaults = getDefaultWaslahPickupInfo();
        const pickupInfo = {
            pickup_date: waslahPickupInfo.pickup_date || pickupDefaults.pickup_date,
            pickup_time: waslahPickupInfo.pickup_time || pickupDefaults.pickup_time,
            pickup_vehicle: waslahPickupInfo.pickup_vehicle || pickupDefaults.pickup_vehicle,
        };

        const { data } = await axios.post('/api/store/waslah/ship', {
            orderId: selectedOrder._id,
            pickupInfo,
            serviceId: waslahServices[0]?.id || undefined,
            waslahOrderId: waslahOrderId || waslahManualOrderId || undefined,
            syncOnly,
            // Manual "Send to EMX" creates the shipment only. Pickup is a second step
            // so the seller can choose EMX date / time / vehicle (or dropoff).
            skipPickup: !syncOnly,
            dryRun,
            testCreateOnly,
        }, {
            headers: { Authorization: `Bearer ${token}` },
        });

        return data;
    };

    const formatWaslahError = (error, fallback = 'Waslah request failed') => {
        const data = error?.response?.data;
        const parts = [];
        if (data?.error) parts.push(data.error);
        if (data?.hint) parts.push(data.hint);
        if (Array.isArray(data?.validationIssues) && data.validationIssues.length) {
            parts.push(data.validationIssues.join(' '));
        }
        if (parts.length) return parts.join(' — ');
        if (error?.message) return error.message;
        return fallback;
    };

    const showWaslahSuccessNotice = (data = {}) => {
        setWaslahSuccessNotice(buildWaslahShipNotice(data));
    };

    const isDeliveredStoreOrder = (order) => {
        const status = String(order?.status || '').toUpperCase();
        const waslahStatus = String(order?.waslah?.appStatus || order?.waslah?.carrierStatus || '').toUpperCase();
        return status === 'DELIVERED' || waslahStatus === 'DELIVERED';
    };

    const hasOpenStoreReturn = (order, type) => (
        Array.isArray(order?.returns)
        && order.returns.some((entry) => (
            String(entry?.type || '').toUpperCase() === type
            && ['REQUESTED', 'APPROVED'].includes(String(entry?.status || '').toUpperCase())
        ))
    );

    const startStoreReturnAction = async () => {
        if (!selectedOrder?._id || !returnActionType) return;
        setSubmittingReturnAction(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');
            const { data } = await axios.post('/api/store/orders/start-return', {
                orderId: selectedOrder._id,
                type: returnActionType,
                reason: returnActionReason.trim(),
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!data?.success) {
                throw new Error(data?.error || 'Could not start this request');
            }
            if (data.order) {
                setSelectedOrder((current) => (
                    current && String(current._id) === String(data.order._id)
                        ? { ...current, ...data.order }
                        : current
                ));
                setOrders((current) => current.map((row) => (
                    String(row._id) === String(data.order._id) ? { ...row, ...data.order } : row
                )));
            }
            clearPageCache('store-orders');
            toast.success(data.message || (returnActionType === 'REPLACEMENT' ? 'Replacement started' : 'Return started'));
            setReturnActionType(null);
            setReturnActionReason('');
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Failed to start return or replacement');
        } finally {
            setSubmittingReturnAction(false);
        }
    };

    const canCancelWaslahShipment = (order) => Boolean(String(order?.waslah?.orderId || '').trim());

    const canRequestWaslahPickup = (order) => (
        Boolean(String(order?.waslah?.orderId || '').trim())
        && !isWaslahLiveTerminalOrder(order)
    );

    const canSendOrderToEmx = (order) => {
        if (!order) return false;
        if (String(order?.waslah?.orderId || '').trim()) return false;
        if (isWaslahLiveTerminalOrder(order)) return false;
        const status = String(order?.status || '').toUpperCase();
        if (['CANCELLED', 'REFUNDED', 'TRASH', 'DELETED'].includes(status)) return false;
        return Boolean(order?.shippingAddress?.street || order?.shippingAddress?.city);
    };

    const getSelectedOrders = () => {
        const selectedSet = new Set(selectedOrderIds.map(String));
        return orders.filter((order) => selectedSet.has(String(order._id)));
    };

    const getSelectedPickupEligibleOrders = () => (
        getSelectedOrders().filter(canRequestWaslahPickup)
    );

    const getSelectedShipEligibleOrders = () => (
        getSelectedOrders().filter(canSendOrderToEmx)
    );

    const getSelectedLabelReadyOrders = () => (
        getSelectedOrders().filter(isWaslahLabelReadyOrder)
    );

    const requestWaslahPickup = async () => {
        if (!selectedOrder?._id || !canRequestWaslahPickup(selectedOrder)) return;

        setRequestingWaslahPickup(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');
            const pickupDefaults = getDefaultWaslahPickupInfo();
            const pickupInfo = {
                type: waslahPickupInfo.type || pickupDefaults.type || 'pickup',
                pickup_date: waslahPickupInfo.pickup_date || pickupDefaults.pickup_date,
                pickup_time: waslahPickupInfo.pickup_time || pickupDefaults.pickup_time,
                pickup_vehicle: waslahPickupInfo.pickup_vehicle || pickupDefaults.pickup_vehicle,
            };
            const { data } = await axios.post('/api/store/waslah/pickup', {
                orderId: selectedOrder._id,
                pickupInfo,
                serviceId: waslahServices[0]?.id || undefined,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!data?.success) {
                throw new Error(data?.error || 'Waslah did not accept the pickup request');
            }
            if (data.order) {
                setSelectedOrder((current) => (
                    current && String(current._id) === String(data.order._id)
                        ? { ...current, ...data.order }
                        : current
                ));
                setOrders((current) => current.map((row) => (
                    String(row._id) === String(data.order._id) ? { ...row, ...data.order } : row
                )));
            }
            clearPageCache('store-orders');
            const awb = String(data.trackingNumber || data.order?.waslah?.trackingNumber || data.order?.trackingId || '').trim();
            toast.success(
                awb
                    ? (data.message || `Pickup scheduled. EMX tracking ${awb}`)
                    : (data.message || 'Pickup requested — EMX AWB will appear when the label is ready'),
            );
            if (!awb) {
                try {
                    await refreshWaslahStatus({ manual: true });
                } catch {
                    // ignore — pickup already succeeded
                }
            }
        } catch (error) {
            toast.error(formatWaslahError(error, 'Failed to request EMX pickup'));
        } finally {
            setRequestingWaslahPickup(false);
        }
    };

    const requestBulkWaslahPickup = async () => {
        const eligible = getSelectedPickupEligibleOrders();
        if (!eligible.length) {
            toast.error('Select orders that already have an EMX shipment (Send to EMX first)');
            return;
        }
        if (eligible.length > 25) {
            toast.error('Select at most 25 orders for bulk pickup');
            return;
        }

        const pickupDefaults = getDefaultWaslahPickupInfo();
        const pickupInfo = {
            type: waslahPickupInfo.type || pickupDefaults.type || 'pickup',
            pickup_date: waslahPickupInfo.pickup_date || pickupDefaults.pickup_date,
            pickup_time: waslahPickupInfo.pickup_time || pickupDefaults.pickup_time,
            pickup_vehicle: waslahPickupInfo.pickup_vehicle || pickupDefaults.pickup_vehicle,
        };

        const confirmed = await askCenterConfirm({
            title: 'Schedule EMX pickup?',
            message: [
                `${eligible.length} selected order(s) will use this pickup window.`,
                `Type: ${pickupInfo.type}`,
                `Date: ${pickupInfo.pickup_date || '—'}`,
                `Time: ${pickupInfo.pickup_time || '—'}`,
                `Vehicle: ${pickupInfo.pickup_vehicle || '—'}`,
            ].join('\n'),
            confirmLabel: 'Schedule Pickup',
            cancelLabel: 'Cancel',
            tone: 'violet',
            icon: 'calendar',
        });
        if (!confirmed) return;

        setRequestingWaslahPickup(true);
        setCenterProgress({
            title: 'Scheduling pickup…',
            message: `Requesting EMX pickup for ${eligible.length} order(s). Please wait.`,
        });
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');

            const { data } = await axios.post('/api/store/waslah/pickup', {
                orderIds: eligible.map((order) => order._id),
                pickupInfo,
                serviceId: waslahServices[0]?.id || undefined,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (Array.isArray(data?.orders) && data.orders.length) {
                const byId = new Map(data.orders.map((order) => [String(order._id), order]));
                setOrders((current) => current.map((row) => {
                    const updated = byId.get(String(row._id));
                    return updated ? { ...row, ...updated } : row;
                }));
                setSelectedOrder((current) => {
                    if (!current) return current;
                    const updated = byId.get(String(current._id));
                    return updated ? { ...current, ...updated } : current;
                });
            }

            clearPageCache('store-orders');
            setShowBulkPickupPanel(false);
            setCenterProgress(null);

            const firstError = (data.results || []).find((entry) => !entry.success)?.error;
            if (data?.succeeded > 0 && !data?.failed) {
                showCenterNotice({
                    title: 'Pickup scheduled',
                    message: data.message || `Pickup scheduled for ${data.succeeded} order(s). You can download EMX carrier labels next.`,
                    tone: 'success',
                    icon: 'check',
                    primaryLabel: 'Download Labels',
                    secondaryLabel: 'Close',
                    onPrimary: () => {
                        downloadSelectedEmxCarrierLabels();
                    },
                });
            } else if (data?.succeeded > 0 && data?.failed > 0) {
                showCenterNotice({
                    title: 'Pickup partly completed',
                    message: [
                        data.message || `Pickup scheduled for ${data.succeeded} of ${data.total} order(s).`,
                        firstError ? `First error: ${firstError}` : '',
                    ].filter(Boolean).join('\n\n'),
                    tone: 'warning',
                    icon: 'alert',
                    primaryLabel: 'OK',
                });
            } else if (data?.failed > 0) {
                showCenterNotice({
                    title: 'Pickup failed',
                    message: firstError || `${data.failed} order(s) failed to schedule pickup`,
                    tone: 'error',
                    icon: 'alert',
                    primaryLabel: 'OK',
                });
            } else if (!data?.succeeded && !data?.failed) {
                throw new Error(data?.error || 'Waslah did not accept the bulk pickup request');
            }
        } catch (error) {
            setCenterProgress(null);
            showCenterNotice({
                title: 'Pickup failed',
                message: formatWaslahError(error, 'Failed to schedule bulk EMX pickup'),
                tone: 'error',
                icon: 'alert',
                primaryLabel: 'OK',
            });
        } finally {
            setRequestingWaslahPickup(false);
            setCenterProgress(null);
        }
    };

    const downloadSelectedEmxCarrierLabels = async () => {
        let labelReady = getSelectedLabelReadyOrders();
        if (!labelReady.length) {
            // Orders may still be syncing after bulk send/pickup — refresh then retry once.
            try {
                await fetchOrders();
            } catch {
                // keep going with current state
            }
            labelReady = getSelectedLabelReadyOrders();
        }
        if (!labelReady.length) {
            showCenterNotice({
                title: 'Labels not ready',
                message: 'None of the selected orders have been sent to EMX yet. Use Send to EMX first, then download carrier labels.',
                tone: 'warning',
                icon: 'alert',
                primaryLabel: 'OK',
            });
            return;
        }
        await downloadBulkWaslahReceipts();
    };

    const cancelWaslahShipment = async () => {
        if (!selectedOrder?._id || !canCancelWaslahShipment(selectedOrder)) return;
        const awb = getOrderAwb(selectedOrder) || selectedOrder.waslah?.orderId;
        const confirmed = await askCenterConfirm({
            title: 'Cancel EMX shipment?',
            message: [
                awb ? `Cancel courier shipment ${awb}?` : 'Cancel this Waslah / EMX shipment?',
                'This cancels the courier AWB only. The store order stays open so you can ship again.',
            ].join('\n\n'),
            confirmLabel: 'Cancel Shipment',
            cancelLabel: 'Keep Shipment',
            tone: 'red',
            icon: 'alert',
        });
        if (!confirmed) return;

        setCancellingWaslah(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');
            const { data } = await axios.post('/api/store/waslah/cancel', {
                orderId: selectedOrder._id,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!data?.success || !data?.order) {
                throw new Error(data?.error || 'Waslah did not cancel the shipment');
            }
            const mergeCancelled = (current) => {
                if (!current || String(current._id) !== String(data.order._id)) return current;
                return {
                    ...current,
                    status: data.order.status || current.status,
                    trackingId: data.order.trackingId ?? null,
                    trackingUrl: data.order.trackingUrl ?? null,
                    courier: data.order.courier ?? current.courier,
                    updatedAt: data.order.updatedAt ?? current.updatedAt,
                    waslah: {
                        ...(current.waslah || {}),
                        ...(data.order.waslah || {}),
                    },
                };
            };
            setSelectedOrder((current) => mergeCancelled(current));
            setOrders((current) => current.map((row) => mergeCancelled(row)));
            setTrackingData((prev) => ({ ...prev, trackingId: '', trackingUrl: '' }));
            setWaslahSuccessNotice(null);
            clearPageCache('store-orders');
            toast.success(data.message || 'Waslah shipment cancelled');
        } catch (error) {
            toast.error(error?.response?.data?.error || error?.message || 'Failed to cancel Waslah shipment');
        } finally {
            setCancellingWaslah(false);
        }
    };

    const refreshWaslahStatus = async ({ orderId, manual = false, signal } = {}) => {
        const targetOrderId = String(orderId || selectedOrder?._id || '').trim();
        if (!targetOrderId) return null;
        if (waslahStatusRefreshInFlightRef.current.has(targetOrderId)) {
            if (manual) toast('An EMX status refresh is already running.');
            return { busy: true };
        }

        waslahStatusRefreshInFlightRef.current.add(targetOrderId);
        if (manual) setRefreshingWaslahStatus(true);

        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');

            const { data } = await axios.post('/api/store/waslah/sync-status', {
                orderId: targetOrderId,
                force: manual,
            }, {
                headers: { Authorization: `Bearer ${token}` },
                signal,
            });

            if (!data?.success || !data?.order) {
                throw new Error(data?.error || 'EMX did not return a live status');
            }
            if (data.skipped) {
                throw new Error('This order does not have an EMX AWB to refresh');
            }

            const liveOrder = data.order;
            const mergeLiveOrder = (current) => mergeWaslahLiveStatusPatch(current, liveOrder);

            setSelectedOrder((current) => (
                current && String(current._id) === targetOrderId
                    ? mergeLiveOrder(current)
                    : current
            ));
            setOrders((current) => current.map((order) => (
                String(order._id) === targetOrderId ? mergeLiveOrder(order) : order
            )));
            if (selectedOrderIdRef.current === targetOrderId) {
                setWaslahStatusRefreshedAt(data.refreshedAt || new Date().toISOString());
            }

            clearPageCache('store-orders');

            if (manual && selectedOrderIdRef.current === targetOrderId) {
                const liveAwb = getOrderAwb(liveOrder);
                const liveLabel = getWaslahLiveStatusLabel(liveOrder);
                if (liveAwb) {
                    toast.success(data.changed
                        ? `EMX tracking ${liveAwb} · ${liveLabel}`
                        : `Tracking number ${liveAwb} · ${liveLabel}`);
                } else {
                    toast.success(data.changed
                        ? `EMX status updated: ${liveLabel}`
                        : `EMX status is up to date: ${liveLabel}`);
                }
            }

            return data;
        } catch (error) {
            if (axios.isCancel(error) || error?.name === 'CanceledError' || error?.name === 'AbortError') {
                return null;
            }
            if (manual) {
                toast.error(error?.response?.data?.error || error?.message || 'Failed to refresh EMX status');
            } else {
                console.error('Live EMX status refresh failed:', error?.response?.data?.detail || error?.message || error);
            }
            return null;
        } finally {
            waslahStatusRefreshInFlightRef.current.delete(targetOrderId);
            if (manual) setRefreshingWaslahStatus(false);
        }
    };

    const refreshWaslahStatusBatch = async ({ orderIds = [], signal } = {}) => {
        if (waslahBatchRefreshInFlightRef.current) return { busy: true };

        const targets = [...new Set(orderIds.map((value) => String(value || '').trim()))]
            .filter((value) => value && !waslahStatusRefreshInFlightRef.current.has(value))
            .slice(0, WASLAH_LIVE_STATUS_BATCH_SIZE);
        if (!targets.length) return { busy: true };

        waslahBatchRefreshInFlightRef.current = true;
        targets.forEach((id) => waslahStatusRefreshInFlightRef.current.add(id));

        try {
            const token = await getToken();
            if (!token) return null;

            const { data } = await axios.post('/api/store/waslah/sync-status', {
                orderIds: targets,
            }, {
                headers: { Authorization: `Bearer ${token}` },
                signal,
            });
            if (!data?.success || !Array.isArray(data.orders)) return null;

            const liveById = new Map(data.orders.map((entry) => [String(entry._id), entry]));
            const mergeLiveOrder = (current) => {
                const liveOrder = liveById.get(String(current?._id));
                return liveOrder ? mergeWaslahLiveStatusPatch(current, liveOrder) : current;
            };

            setOrders((current) => current.map(mergeLiveOrder));
            setSelectedOrder((current) => (current ? mergeLiveOrder(current) : current));
            clearPageCache('store-orders');
            return data;
        } catch (error) {
            if (!axios.isCancel(error) && error?.name !== 'CanceledError' && error?.name !== 'AbortError') {
                console.error('Background EMX status refresh failed:', error?.response?.data?.detail || error?.message || error);
            }
            return null;
        } finally {
            targets.forEach((id) => waslahStatusRefreshInFlightRef.current.delete(id));
            waslahBatchRefreshInFlightRef.current = false;
        }
    };

    // Keep the open EMX shipment synchronized without re-running the shipping workflow.
    useEffect(() => {
        const orderId = String(selectedOrder?._id || '');
        const trackingId = getOrderAwb(selectedOrder);
        const isWaslahOrder = Boolean(
            selectedOrder?.waslah?.orderId
            || selectedOrder?.waslah?.trackingNumber
            || String(selectedOrder?.courier || '').toLowerCase().includes('emx')
            || String(selectedOrder?.courier || '').toLowerCase().includes('waslah'),
        );

        if (
            !isModalOpen
            || !waslahConfig.configured
            || !orderId
            || (!trackingId && !selectedOrder?.waslah?.orderId)
            || !isWaslahOrder
            || isWaslahLiveTerminalOrder(selectedOrder)
        ) {
            return undefined;
        }

        let stopped = false;
        let running = false;
        let timerId = null;
        const controller = new AbortController();

        function scheduleNext(delay = WASLAH_LIVE_STATUS_POLL_MS) {
            if (stopped) return;
            if (timerId) window.clearTimeout(timerId);
            timerId = window.setTimeout(runRefresh, delay);
        }

        async function runRefresh() {
            if (stopped || running) return;
            running = true;
            let nextDelay = WASLAH_LIVE_STATUS_POLL_MS;
            try {
                if (document.visibilityState !== 'hidden') {
                    const result = await refreshWaslahStatus({ orderId, signal: controller.signal });
                    if (result?.busy) nextDelay = 500;
                }
            } finally {
                running = false;
                scheduleNext(nextDelay);
            }
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible' || stopped) return;
            if (timerId) window.clearTimeout(timerId);
            runRefresh();
        };

        runRefresh();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            stopped = true;
            controller.abort();
            if (timerId) window.clearTimeout(timerId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
        // Primitive dependencies intentionally restart polling only when the shipment changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        isModalOpen,
        waslahConfig.configured,
        selectedOrder?._id,
        selectedOrder?.trackingId,
        selectedOrder?.waslah?.trackingNumber,
        selectedOrder?.waslah?.orderId,
        selectedOrder?.waslah?.appStatus,
        selectedOrder?.waslah?.carrierStatus,
        selectedOrder?.waslah?.currentSubtag,
        selectedOrder?.waslah?.lastSubtag,
        selectedOrder?.courier,
        selectedOrder?.status,
    ]);

    // Reconcile every active EMX row, even when its details modal is closed.
    // Large lists are rotated through small batches to keep courier/API load bounded.
    useEffect(() => {
        if (authLoading || !user || !waslahConfig.configured || !liveWaslahOrderIdsKey) {
            return undefined;
        }

        const orderIds = liveWaslahOrderIdsKey.split(',').filter(Boolean);
        if (!orderIds.length) return undefined;
        if (waslahBatchCursorRef.current >= orderIds.length) waslahBatchCursorRef.current = 0;

        let stopped = false;
        let running = false;
        let timerId = null;
        const controller = new AbortController();

        function scheduleNext(delay = WASLAH_LIVE_STATUS_POLL_MS) {
            if (stopped) return;
            if (timerId) window.clearTimeout(timerId);
            timerId = window.setTimeout(runRefresh, delay);
        }

        async function runRefresh() {
            if (stopped || running) return;
            if (document.visibilityState === 'hidden') {
                scheduleNext();
                return;
            }

            running = true;
            let nextDelay = WASLAH_LIVE_STATUS_POLL_MS;
            const start = waslahBatchCursorRef.current % orderIds.length;
            const batch = orderIds.slice(start, start + WASLAH_LIVE_STATUS_BATCH_SIZE);
            try {
                const result = await refreshWaslahStatusBatch({
                    orderIds: batch,
                    signal: controller.signal,
                });
                if (result?.busy) {
                    nextDelay = 1000;
                } else {
                    waslahBatchCursorRef.current = (start + batch.length) % orderIds.length;
                }
            } finally {
                running = false;
                scheduleNext(nextDelay);
            }
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible' || stopped) return;
            if (timerId) window.clearTimeout(timerId);
            runRefresh();
        };

        scheduleNext();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            stopped = true;
            controller.abort();
            if (timerId) window.clearTimeout(timerId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
        // The key changes only when the set of active EMX shipments changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user?.uid, waslahConfig.configured, liveWaslahOrderIdsKey]);

    const shipOrderWithWaslah = async () => {
        if (!selectedOrder) return;

        if (!waslahConfig.configured) {
            toast.error('Waslah is not configured. Add WASLAH_API_TOKEN to server .env');
            return;
        }

        if (!selectedOrder.shippingAddress?.street && !selectedOrder.shippingAddress?.city) {
            toast.error('Complete shipping address is required for Waslah');
            return;
        }

        setShippingWithWaslah(true);
        setSelectedOrder((current) => (
            current ? {
                ...current,
                waslah: {
                    ...(current.waslah || {}),
                    unlinkedInWaslah: false,
                },
            } : current
        ));
        try {
            const data = await callWaslahShip();
            if (!data?.success) {
                toast.error(data?.error || 'Failed to ship with Waslah');
                return;
            }

            applyWaslahShipResult(data);
            setWaslahLinkHelpOpen(false);
            showWaslahSuccessNotice(data);
            toast.success(data?.message || 'Sent to EMX. Schedule pickup next.');
            await fetchOrders();
        } catch (error) {
            console.error('Ship with Waslah error:', error);
            const data = error?.response?.data;
            if (data?.code === 'WASLAH_DUPLICATE_REFERENCE' || data?.code === 'WASLAH_LINK_REQUIRED') {
                setWaslahLinkHelpOpen(true);
            }
            if (data?.order) {
                applyWaslahShipResult({ order: data.order });
            }
            toast.error(formatWaslahError(error, 'Failed to ship with Waslah'));
        } finally {
            setShippingWithWaslah(false);
        }
    };

    const shipSelectedOrdersWithWaslah = async () => {
        if (!waslahConfig.configured) {
            toast.error('Waslah is not configured. Add WASLAH_API_TOKEN to server .env');
            return;
        }

        const eligible = getSelectedShipEligibleOrders();
        if (!eligible.length) {
            toast.error('Select orders with a shipping address that are not already sent to EMX');
            return;
        }
        if (eligible.length > 25) {
            toast.error('Select at most 25 orders to send to EMX at once');
            return;
        }

        const skipped = selectedOrderIds.length - eligible.length;
        const confirmed = await askCenterConfirm({
            title: 'Send selected orders to EMX?',
            message: [
                `${eligible.length} order(s) will be sent to EMX.`,
                'This creates the shipments only. You can schedule pickup for them next.',
                eligible.length > 5
                    ? 'Large selections are sent in batches of 5 so the request does not time out (504).'
                    : '',
                skipped > 0
                    ? `${skipped} selected order(s) will be skipped (already shipped, missing address, or not eligible).`
                    : '',
            ].filter(Boolean).join('\n\n'),
            confirmLabel: 'Send to EMX',
            cancelLabel: 'Cancel',
            tone: 'violet',
            icon: 'truck',
        });
        if (!confirmed) return;

        setShippingWithWaslah(true);
        const pickupDefaults = getDefaultWaslahPickupInfo();
        const aggregated = {
            succeeded: 0,
            failed: 0,
            total: eligible.length,
            results: [],
            orders: [],
        };
        const BULK_EMX_SHIP_CHUNK_SIZE = 5;
        const BULK_EMX_SHIP_TIMEOUT_MS = 90000;

        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication failed. Please sign in again.');

            for (let start = 0; start < eligible.length; start += BULK_EMX_SHIP_CHUNK_SIZE) {
                const chunk = eligible.slice(start, start + BULK_EMX_SHIP_CHUNK_SIZE);
                const from = start + 1;
                const to = start + chunk.length;
                setCenterProgress({
                    title: 'Sending to EMX…',
                    message: `Creating EMX shipments ${from}–${to} of ${eligible.length}. Batches of ${BULK_EMX_SHIP_CHUNK_SIZE} avoid gateway timeouts.`,
                });

                try {
                    const { data } = await axios.post('/api/store/waslah/ship', {
                        orderIds: chunk.map((order) => order._id),
                        pickupInfo: {
                            pickup_date: waslahPickupInfo.pickup_date || pickupDefaults.pickup_date,
                            pickup_time: waslahPickupInfo.pickup_time || pickupDefaults.pickup_time,
                            pickup_vehicle: waslahPickupInfo.pickup_vehicle || pickupDefaults.pickup_vehicle,
                        },
                        serviceId: waslahServices[0]?.id || undefined,
                        skipPickup: true,
                    }, {
                        headers: { Authorization: `Bearer ${token}` },
                        timeout: BULK_EMX_SHIP_TIMEOUT_MS,
                    });

                    aggregated.succeeded += Number(data?.succeeded || 0);
                    aggregated.failed += Number(data?.failed || 0);
                    if (Array.isArray(data?.results)) aggregated.results.push(...data.results);
                    if (Array.isArray(data?.orders)) aggregated.orders.push(...data.orders);
                } catch (chunkError) {
                    const status = chunkError?.response?.status;
                    const timedOut = chunkError?.code === 'ECONNABORTED'
                        || status === 504
                        || status === 524
                        || status === 408;
                    const chunkMessage = timedOut
                        ? 'This batch timed out. Wait a few seconds, then send remaining orders again — some may already be on EMX.'
                        : formatWaslahError(chunkError, 'This batch failed to send to EMX');

                    aggregated.failed += chunk.length;
                    chunk.forEach((order) => {
                        aggregated.results.push({
                            orderId: String(order._id),
                            success: false,
                            error: chunkMessage,
                        });
                    });
                }
            }

            if (aggregated.orders.length) {
                const byId = new Map(aggregated.orders.map((order) => [String(order._id), order]));
                setOrders((current) => current.map((row) => {
                    const updated = byId.get(String(row._id));
                    return updated ? { ...row, ...updated } : row;
                }));
                setSelectedOrder((current) => {
                    if (!current) return current;
                    const updated = byId.get(String(current._id));
                    return updated ? { ...current, ...updated } : current;
                });
            }

            clearPageCache('store-orders');
            setCenterProgress(null);

            const data = {
                ...aggregated,
                message: aggregated.failed
                    ? `Sent ${aggregated.succeeded} of ${aggregated.total} order(s) to EMX; ${aggregated.failed} failed. Schedule pickup next.`
                    : `Sent ${aggregated.succeeded} order(s) to EMX. Schedule pickup next.`,
            };
            const firstError = (data.results || []).find((entry) => !entry.success)?.error;

            if (data.succeeded > 0 && !data.failed) {
                setWaslahPickupInfo(getDefaultWaslahPickupInfo());
                showCenterNotice({
                    title: 'Sent to EMX',
                    message: data.message,
                    tone: 'success',
                    icon: 'check',
                    primaryLabel: 'Schedule Pickup',
                    secondaryLabel: 'Close',
                    onPrimary: () => {
                        setShowBulkPickupPanel(true);
                    },
                });
            } else if (data.succeeded > 0 && data.failed > 0) {
                setWaslahPickupInfo(getDefaultWaslahPickupInfo());
                showCenterNotice({
                    title: 'Partly sent to EMX',
                    message: [
                        data.message,
                        firstError ? `First error: ${firstError}` : '',
                        'You can still schedule pickup for the orders that succeeded. Re-select any that failed and send again.',
                    ].filter(Boolean).join('\n\n'),
                    tone: 'warning',
                    icon: 'alert',
                    primaryLabel: 'Schedule Pickup',
                    secondaryLabel: 'Close',
                    onPrimary: () => {
                        setShowBulkPickupPanel(true);
                    },
                });
            } else if (data.failed > 0) {
                showCenterNotice({
                    title: 'Send to EMX failed',
                    message: firstError || `${data.failed} order(s) failed to send to EMX`,
                    tone: 'error',
                    icon: 'alert',
                    primaryLabel: 'OK',
                });
            } else {
                throw new Error('Waslah did not accept the bulk ship request');
            }

            await fetchOrders();
        } catch (error) {
            console.error('Bulk Send to EMX error:', error);
            setCenterProgress(null);
            showCenterNotice({
                title: 'Send to EMX failed',
                message: formatWaslahError(error, 'Failed to send selected orders to EMX'),
                tone: 'error',
                icon: 'alert',
                primaryLabel: 'OK',
            });
        } finally {
            setShippingWithWaslah(false);
            setCenterProgress(null);
        }
    };

    const linkWaslahAwb = async () => {
        if (!selectedOrder) return;

        if (!String(waslahManualOrderId || '').trim()) {
            toast.error('Paste the 24-character Waslah Order ID from ship.waslah.ae (not order #616532)');
            return;
        }

        if (!/^[a-f0-9]{24}$/i.test(String(waslahManualOrderId).trim())) {
            toast.error('That looks like an order number. Waslah needs the 24-character ID from ship.waslah.ae');
            return;
        }

        setShippingWithWaslah(true);
        try {
            const data = await callWaslahShip({ syncOnly: true });
            if (!data?.success) {
                toast.error(data?.error || 'Failed to link Waslah shipment');
                return;
            }

            applyWaslahShipResult(data);
            setWaslahLinkHelpOpen(false);
            showWaslahSuccessNotice({ ...data, syncOnly: true });
            await fetchOrders();
        } catch (error) {
            console.error('Link Waslah AWB error:', error);
            toast.error(formatWaslahError(error, 'Failed to link Waslah shipment'));
        } finally {
            setShippingWithWaslah(false);
        }
    };

    const openCommunicationHistory = async () => {
        if (!selectedOrder?._id) return;

        setShowCommunicationHistory(true);
        setLoadingCommunicationHistory(true);
        setCommunicationHistory([]);

        try {
            const token = await getToken();
            const { data } = await axios.get(`/api/store/orders/${selectedOrder._id}/communications`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setCommunicationHistory(Array.isArray(data?.history) ? data.history : []);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Failed to load communication history');
        } finally {
            setLoadingCommunicationHistory(false);
        }
    };

    if (authLoading || (loading && !orders.length)) return <PageSkeleton rows={8} />;

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl text-slate-500">Store <span className="text-slate-800 font-medium">Orders</span></h1>
                <button
                    type="button"
                    onClick={() => setShowCreateOrderModal(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                    <Plus size={16} />
                    Create order
                </button>
            </div>

            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
                <label htmlFor="order-search" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Search orders
                </label>
                <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        id="order-search"
                        type="search"
                        value={orderSearchQuery}
                        onChange={(e) => setOrderSearchQuery(e.target.value)}
                        placeholder="Email, phone, name, order #, tracking AWB..."
                        className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    {orderSearchQuery ? (
                        <button
                            type="button"
                            onClick={() => setOrderSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label="Clear search"
                        >
                            <X size={16} />
                        </button>
                    ) : null}
                </div>
                {orderSearchQuery.trim() ? (
                    <p className="mt-2 text-xs text-slate-500">
                        {filteredOrders.length.toLocaleString()} order{filteredOrders.length === 1 ? '' : 's'} found
                    </p>
                ) : null}
            </div>

            {liveOrderAlert ? (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <span>{liveOrderAlert}</span>
                    <button
                        type="button"
                        onClick={() => setLiveOrderAlert('')}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <div>
                    <p className="font-semibold text-slate-900">Payment health check (last 24 hours)</p>
                    <p className="mt-1 text-xs text-slate-500">
                        Auto-runs every 5 minutes here, plus a Vercel cron every 5 minutes (even when this page is closed). Only marks paid when Tabby/Tamara/Stripe confirm payment — true Pending/Awaiting orders stay unpaid until the customer finishes.
                        {paymentReconcileStatus?.checkedAt ? (
                            <>
                                {' '}Last check: {new Date(paymentReconcileStatus.checkedAt).toLocaleString('en-GB')}
                                {paymentReconcileStatus.fixed > 0
                                    ? ` · Fixed ${paymentReconcileStatus.fixed}`
                                    : ` · Scanned ${paymentReconcileStatus.scanned || 0}`}
                            </>
                        ) : null}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => runPaymentReconciliation({ silent: false })}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                    <RefreshCw size={14} />
                    Check payments now
                </button>
            </div>
            
            {/* Order Statistics Cards */}
            {hasStatsScopeFilter ? (
                <p className="mb-2 text-xs text-slate-500">
                    Summary counts match your current date, payment, source, and search filters.
                </p>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                <div 
                    onClick={() => setFilterStatus('ALL')}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${filterStatus === 'ALL' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border border-gray-200 text-slate-700'}`}
                >
                    <p className="text-xs opacity-75">Total Orders</p>
                    <p className="text-2xl font-bold">{stats.TOTAL}</p>
                    {stats.ACTIVE < stats.TOTAL ? (
                        <p className="mt-1 text-[10px] opacity-80">{stats.ACTIVE.toLocaleString()} active · {(stats.TOTAL - stats.ACTIVE).toLocaleString()} cancelled/failed/unpaid</p>
                    ) : null}
                </div>
                <div 
                    onClick={() => router.push('/store/abandoned-checkout')}
                    className="p-4 rounded-lg cursor-pointer transition-all bg-white border border-gray-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50"
                >
                    <p className="text-xs opacity-75">Awaiting Payment</p>
                    <p className="text-2xl font-bold">{stats.PENDING_PAYMENT}</p>
                    <p className="mt-1 text-[10px] font-medium text-orange-700">View in Abandoned Checkout</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('ORDER_PLACED')}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${filterStatus === 'ORDER_PLACED' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border border-gray-200 text-slate-700'}`}
                >
                    <p className="text-xs opacity-75">Order Placed</p>
                    <p className="text-2xl font-bold">{stats.ORDER_PLACED || 0}</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('PROCESSING')}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${filterStatus === 'PROCESSING' ? 'bg-yellow-600 text-white shadow-lg' : 'bg-white border border-gray-200 text-slate-700'}`}
                >
                    <p className="text-xs opacity-75">Processing</p>
                    <p className="text-2xl font-bold">{stats.PROCESSING}</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('SHIPPED')}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${filterStatus === 'SHIPPED' ? 'bg-purple-600 text-white shadow-lg' : 'bg-white border border-gray-200 text-slate-700'}`}
                >
                    <p className="text-xs opacity-75">Shipped</p>
                    <p className="text-2xl font-bold">{stats.SHIPPED}</p>
                </div>
                <div 
                    onClick={() => setFilterStatus('DELIVERED')}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${filterStatus === 'DELIVERED' ? 'bg-green-600 text-white shadow-lg' : 'bg-white border border-gray-200 text-slate-700'}`}
                >
                    <p className="text-xs opacity-75">Delivered</p>
                    <p className="text-2xl font-bold">{stats.DELIVERED}</p>
                </div>
            </div>

            {waslahConfig.configured && stats.LABEL_READY > 0 ? (
                <div className="mb-6 flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-violet-900">EMX labels ready</p>
                        <p className="mt-0.5 text-xs text-violet-700">
                            {stats.LABEL_READY} order(s) sent to EMX — labels not downloaded yet
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setFilterStatus('LABEL_READY');
                                setCurrentPage(1);
                            }}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                filterStatus === 'LABEL_READY'
                                    ? 'bg-violet-700 text-white'
                                    : 'border border-violet-300 bg-white text-violet-800 hover:bg-violet-100'
                            }`}
                        >
                            <Package size={16} />
                            Show label-ready only
                        </button>
                        {(filterStatus === 'LABEL_READY' || hasSelectedOrders || stats.LABEL_READY > 0) ? (
                            <button
                                type="button"
                                onClick={downloadBulkWaslahReceipts}
                                disabled={downloadingWaslahReceipts}
                                className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
                            >
                                <Download size={16} className={downloadingWaslahReceipts ? 'animate-pulse' : ''} />
                                {downloadingWaslahReceipts
                                    ? 'Preparing PDF…'
                                    : filterStatus === 'LABEL_READY' && !hasSelectedOrders
                                        ? 'Download all receipts (PDF)'
                                        : hasSelectedOrders
                                            ? 'Download selected receipts (PDF)'
                                            : 'Download EMX carrier labels (PDF)'}
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {filterStatus === 'LABEL_READY' ? (
                <div className="mb-4 rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm text-violet-900">
                    Showing {filteredOrders.length} order(s) sent to EMX that have not been downloaded yet.
                    {filteredOrders.length > 0 ? (
                        <span className="text-violet-700">
                            {' '}Use <strong>Download all receipts (PDF)</strong> to get every label in one file.
                        </span>
                    ) : null}
                </div>
            ) : null}

            {/* Order filters — status, payment, traffic source */}
            <div className="mb-6">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowOrderFilters((prev) => !prev)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                            showOrderFilters
                                ? 'border-blue-700 bg-blue-700 text-white'
                                : 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300'
                        }`}
                    >
                        <Filter size={16} />
                        {showOrderFilters ? 'Hide order filters' : 'Order filters'}
                        {!showOrderFilters && activeOrderFilterCount > 0 ? (
                            <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-blue-900">
                                {activeOrderFilterCount} active
                            </span>
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowDeliverySchedule((prev) => !prev)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                            showDeliverySchedule
                                ? 'border-sky-700 bg-sky-700 text-white'
                                : 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-300'
                        }`}
                    >
                        <CalendarClock size={16} />
                        {showDeliverySchedule ? 'Hide delivery schedule' : 'Delivery schedule'}
                        {!showDeliverySchedule && (deliverySummary.today + deliverySummary.tomorrow + deliverySummary.delayed) > 0 ? (
                            <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-sky-900">
                                {deliverySummary.today + deliverySummary.tomorrow + deliverySummary.delayed}
                            </span>
                        ) : null}
                    </button>
                    {!showOrderFilters && activeOrderFilterCount > 0 ? (
                        <p className="text-xs text-slate-500">
                            {filterStatus !== 'ALL' ? `Status: ${
                                filterStatus === 'LABEL_READY'
                                    ? 'Labels ready'
                                    : (STORE_ORDER_STATUS_FILTER_OPTIONS.find((t) => t.value === filterStatus)?.label || filterStatus)
                            }` : null}
                            {filterPayment !== 'ALL' ? `${filterStatus !== 'ALL' ? ' · ' : ''}Payment: ${PAYMENT_FILTER_OPTIONS.find((o) => o.value === filterPayment)?.label || filterPayment}` : null}
                            {filterTrafficSource !== 'ALL' ? `${filterStatus !== 'ALL' || filterPayment !== 'ALL' ? ' · ' : ''}Source: ${TRAFFIC_SOURCE_FILTER_OPTIONS.find((o) => o.value === filterTrafficSource)?.label || filterTrafficSource}` : null}
                        </p>
                    ) : null}
                </div>

                {showOrderFilters ? (
                <>
            {/* Status Filter Tabs */}
            <div className="mb-6 flex flex-wrap gap-2">
                {STORE_ORDER_STATUS_FILTER_OPTIONS.map((tab) => {
                    const isActive = filterStatus === tab.value;
                    const count = tab.value === 'ALL'
                        ? stats.TOTAL
                        : (stats[tab.value] || 0);

                    return (
                        <button
                            key={tab.value}
                            type="button"
                            onClick={() => setFilterStatus(tab.value)}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                                isActive
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
                            }`}
                        >
                            <span>{tab.label}</span>
                            {tab.value !== 'ALL' && count > 0 ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                    isActive
                                        ? 'bg-blue-800 text-white'
                                        : tab.isSpecial
                                            ? 'bg-red-500 text-white'
                                            : 'bg-white text-slate-600'
                                }`}>
                                    {count}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            {/* Payment method filters */}
            <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment method</p>
                <div className="flex flex-wrap gap-2">
                    {PAYMENT_FILTER_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setFilterPayment(option.value)}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                                filterPayment === option.value
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
                            }`}
                        >
                            <span>{option.label}</span>
                            {option.value !== 'ALL' && paymentStats[option.value] > 0 ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                    filterPayment === option.value ? 'bg-slate-700 text-white' : 'bg-white text-slate-600'
                                }`}>
                                    {paymentStats[option.value]}
                                </span>
                            ) : null}
                            {option.value === 'ALL' ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                    filterPayment === option.value ? 'bg-slate-700 text-white' : 'bg-white text-slate-600'
                                }`}>
                                    {paymentStats.ALL}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>

            {/* Traffic source filters */}
            <div className="mb-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Traffic source</p>
                <div className="flex flex-wrap gap-2">
                    {TRAFFIC_SOURCE_FILTER_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setFilterTrafficSource(option.value)}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                                filterTrafficSource === option.value
                                    ? 'bg-violet-700 text-white shadow-md'
                                    : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
                            }`}
                        >
                            <span>{option.label}</span>
                            {option.value !== 'ALL' && trafficSourceStats[option.value] > 0 ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                    filterTrafficSource === option.value ? 'bg-violet-900 text-white' : 'bg-white text-slate-600'
                                }`}>
                                    {trafficSourceStats[option.value]}
                                </span>
                            ) : null}
                            {option.value === 'ALL' ? (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                    filterTrafficSource === option.value ? 'bg-violet-900 text-white' : 'bg-white text-slate-600'
                                }`}>
                                    {trafficSourceStats.ALL}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            </div>
                </>
                ) : null}

                {showDeliverySchedule ? (
                <>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div
                        onClick={() => setFilterStatus('DELIVERY_TODAY')}
                        className={`cursor-pointer rounded-lg border p-4 transition-all ${filterStatus === 'DELIVERY_TODAY' ? 'border-sky-600 bg-sky-600 text-white shadow-lg' : 'border-sky-200 bg-sky-50 text-sky-900 hover:border-sky-300'}`}
                    >
                        <p className="text-xs opacity-80">Delivering today</p>
                        <p className="text-2xl font-bold">{deliverySummary.today}</p>
                    </div>
                    <div
                        onClick={() => setFilterStatus('DELIVERY_TOMORROW')}
                        className={`cursor-pointer rounded-lg border p-4 transition-all ${filterStatus === 'DELIVERY_TOMORROW' ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg' : 'border-indigo-200 bg-indigo-50 text-indigo-900 hover:border-indigo-300'}`}
                    >
                        <p className="text-xs opacity-80">Delivering tomorrow</p>
                        <p className="text-2xl font-bold">{deliverySummary.tomorrow}</p>
                    </div>
                    <div
                        onClick={() => setFilterStatus('DELIVERY_DELAYED')}
                        className={`cursor-pointer rounded-lg border p-4 transition-all ${filterStatus === 'DELIVERY_DELAYED' ? 'border-amber-600 bg-amber-600 text-white shadow-lg' : 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300'}`}
                    >
                        <div className="flex items-center gap-1 text-xs opacity-80">
                            <AlertTriangle size={12} />
                            <span>Delayed delivery</span>
                        </div>
                        <p className="text-2xl font-bold">{deliverySummary.delayed}</p>
                    </div>
                </div>
                {convertedOrderCount > 0 ? (
                    <button
                        type="button"
                        onClick={() => setFilterStatus('CONVERTED')}
                        className={`mt-3 rounded-lg border px-4 py-2 text-sm font-medium transition ${filterStatus === 'CONVERTED' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300'}`}
                    >
                        Converted orders: {convertedOrderCount}
                    </button>
                ) : null}
                </>
                ) : null}
            </div>

            {/* Date Range Filters */}
            <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setDatePreset('ALL')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${datePreset === 'ALL' ? 'bg-slate-900 text-white' : 'bg-gray-100 text-slate-700 hover:bg-gray-200'}`}
                        >
                            All Orders
                        </button>
                        <button
                            onClick={() => setDatePreset('TODAY')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${datePreset === 'TODAY' ? 'bg-slate-900 text-white' : 'bg-gray-100 text-slate-700 hover:bg-gray-200'}`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setDatePreset('LAST_7_DAYS')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${datePreset === 'LAST_7_DAYS' ? 'bg-slate-900 text-white' : 'bg-gray-100 text-slate-700 hover:bg-gray-200'}`}
                        >
                            Last 7 Days
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowImportExportPanel((prev) => !prev)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                            showImportExportPanel || importingOrdersCsv
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <Download size={16} />
                        {showImportExportPanel || importingOrdersCsv ? 'Hide Import / Export' : 'Import / Export'}
                    </button>
                </div>

                <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                    <div className="min-w-[160px]">
                        <label htmlFor="orders-from-date" className="text-xs font-medium text-slate-500">From date</label>
                        <input
                            id="orders-from-date"
                            type="date"
                            value={fromDate}
                            max={toDate || undefined}
                            onChange={(e) => {
                                setFromDate(e.target.value);
                                setDatePreset('CUSTOM');
                                setCurrentPage(1);
                            }}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="min-w-[130px]">
                        <label htmlFor="orders-from-time" className="text-xs font-medium text-slate-500">From time</label>
                        <input
                            id="orders-from-time"
                            type="time"
                            value={fromTime}
                            onChange={(e) => {
                                setFromTime(normalizeFilterTimeValue(e.target.value));
                                setDatePreset('CUSTOM');
                                setCurrentPage(1);
                            }}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="min-w-[160px]">
                        <label htmlFor="orders-to-date" className="text-xs font-medium text-slate-500">To date</label>
                        <input
                            id="orders-to-date"
                            type="date"
                            value={toDate}
                            min={fromDate || undefined}
                            onChange={(e) => {
                                setToDate(e.target.value);
                                setDatePreset('CUSTOM');
                                setCurrentPage(1);
                            }}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="min-w-[130px]">
                        <label htmlFor="orders-to-time" className="text-xs font-medium text-slate-500">To time</label>
                        <input
                            id="orders-to-time"
                            type="time"
                            value={toTime}
                            onChange={(e) => {
                                setToTime(normalizeFilterTimeValue(e.target.value));
                                setDatePreset('CUSTOM');
                                setCurrentPage(1);
                            }}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                    </div>
                    {hasDateFilter ? (
                        <button
                            type="button"
                            onClick={clearDateRange}
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                            Clear dates
                        </button>
                    ) : null}
                    {hasDateFilter && dateRangeSummary ? (
                        <p className="pb-2 text-sm text-slate-600">
                            Filter: <strong>{dateRangeSummary}</strong>
                        </p>
                    ) : null}
                </div>
                <p className="text-xs text-slate-500">
                    Dates use Dubai time (Asia/Dubai). Range ends at the To date/time you set (orders at or after that moment are excluded). Same From and To day with the same clock time (e.g. both 10:00) means one business day through the next cutover.
                </p>

                {(hasDateFilter || orders.length > 0) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center gap-3">
                            <span>
                                Showing <strong>{filteredOrders.length}</strong>
                                {hasDateFilter ? ' matching orders' : ` of ${orders.length} loaded orders`}
                                {!hasDateFilter ? null : (
                                    <>
                                        {' '}<span className="text-slate-500">({orders.length.toLocaleString()} loaded total)</span>
                                    </>
                                )}
                            </span>
                        </div>
                        <label className="flex items-center gap-2 text-slate-600">
                            <span className="font-medium text-slate-500">Sort by</span>
                            <select
                                value={`${sortBy}-${sortDirection}`}
                                onChange={(e) => handleOrderSortChange(e.target.value)}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                aria-label="Sort orders"
                            >
                                <option value="date-desc">Date & time (newest first)</option>
                                <option value="date-asc">Date & time (oldest first)</option>
                                <option value="orderNumber-desc">Order # (high to low)</option>
                                <option value="orderNumber-asc">Order # (low to high)</option>
                                <option value="total-desc">Total (high to low)</option>
                                <option value="total-asc">Total (low to high)</option>
                                <option value="customer-asc">Customer (A to Z)</option>
                                <option value="customer-desc">Customer (Z to A)</option>
                            </select>
                        </label>
                    </div>
                )}
                {(showImportExportPanel || importingOrdersCsv) ? (
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                        <label className="text-xs text-slate-500">Export Type</label>
                        <select
                            value={exportTypeFilter}
                            onChange={(e) => setExportTypeFilter(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                            <option value="ALL">All</option>
                            <option value="CANCELLED">Cancelled</option>
                            <option value="PAID">Paid</option>
                            <option value="COD">COD</option>
                            <option value="CARD">Card</option>
                            <option value="TABBY">Tabby</option>
                            <option value="TAMARA">Tamara</option>
                            <option value="WALLET">Wallet</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500">Import Orders CSV</label>
                        <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(e) => setOrderCsvFile(e.target.files?.[0] || null)}
                            className="w-full mt-1 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                        />
                    </div>
                    <div className="flex items-end">
                        <div className="w-full flex flex-col gap-2 lg:items-end">
                            <div className="text-xs text-slate-500">Import the WordPress CSV export (.csv) only — do not open in Excel first (Excel changes dates/times). Each order keeps its original date and time from the export.</div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={importOrdersFromCsv}
                                    disabled={importingOrdersCsv}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Download size={14} />
                                    {importingOrdersCsv ? 'Importing...' : 'Import CSV'}
                                </button>
                                <button
                                    onClick={exportOrdersToCsv}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                                >
                                    <Download size={14} />
                                    {hasSelectedOrders ? 'Export Selected CSV' : 'Export CSV'}
                                </button>
                                <button
                                    onClick={exportOrdersToExcel}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition"
                                >
                                    <Download size={14} />
                                    {hasSelectedOrders ? 'Export Selected Excel' : 'Export Excel'}
                                </button>
                            </div>
                            {hasSelectedOrders ? (
                                <p className="text-xs text-blue-700">
                                    {selectedOrderIds.length} order(s) selected — export will include only those orders.
                                </p>
                            ) : null}
                            {importingOrdersCsv && importProgress.total > 0 ? (
                                <div className="w-full max-w-md rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                                        <span>
                                            {importProgress.phase === 'parsing'
                                                ? 'Reading file...'
                                                : 'Importing orders...'}
                                        </span>
                                        <span>
                                            {Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))}%
                                        </span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                                        <div
                                            className="h-full rounded-full bg-blue-600 transition-all duration-300"
                                            style={{
                                                width: `${Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))}%`,
                                            }}
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()} order rows
                                        {importProgress.sheetRows
                                            ? ` · ${importProgress.sheetRows.toLocaleString()} Excel rows`
                                            : ''}
                                        {importProgress.emptyRowsSkipped
                                            ? ` · ${importProgress.emptyRowsSkipped.toLocaleString()} skipped`
                                            : ''}
                                    </p>
                                    {importProgress.phase === 'done' && importProgress.exportMeta?.exportedRows ? (
                                        <p className="mt-1 text-xs text-slate-500">
                                            WordPress export meta: {importProgress.exportMeta.exportedRows.toLocaleString()} exported
                                            {importProgress.exportMeta.expectedRows
                                                ? ` / ${importProgress.exportMeta.expectedRows.toLocaleString()} expected`
                                                : ''}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
                ) : null}
            </div>

            {hasSelectedOrders && (
                <div className="mb-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-medium text-blue-900">
                            {selectedOrderIds.length} order(s) selected
                            <span className="mt-0.5 block text-xs font-normal text-blue-700">
                                Use checkboxes to choose orders, then change status, send to EMX, schedule pickup, or download labels.
                                {waslahConfig.configured ? (
                                    <>
                                        {' '}
                                        {getSelectedShipEligibleOrders().length} ready to send ·{' '}
                                        {getSelectedPickupEligibleOrders().length} ready for pickup ·{' '}
                                        {getSelectedLabelReadyOrders().length} with label ready
                                    </>
                                ) : null}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex min-w-[200px] items-center gap-2">
                                <span className="whitespace-nowrap text-xs font-semibold text-blue-900">
                                    Change status
                                </span>
                                <OrderStatusPicker
                                    value=""
                                    placeholder={bulkUpdatingStatus ? 'Updating…' : 'Select status'}
                                    size="sm"
                                    className="min-w-[180px]"
                                    disabled={bulkUpdatingStatus || deletingBulkOrders}
                                    onChange={updateSelectedOrdersStatus}
                                />
                            </div>
                            {waslahConfig.configured ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={shipSelectedOrdersWithWaslah}
                                        disabled={shippingWithWaslah || requestingWaslahPickup}
                                        className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                                    >
                                        {shippingWithWaslah ? (
                                            <RefreshCw size={14} className="animate-spin" />
                                        ) : (
                                            <Truck size={14} />
                                        )}
                                        {shippingWithWaslah
                                            ? 'Sending to EMX…'
                                            : `Send to EMX (${getSelectedShipEligibleOrders().length})`}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!getSelectedPickupEligibleOrders().length) {
                                                toast.error('Select orders that were already sent to EMX');
                                                return;
                                            }
                                            setWaslahPickupInfo(getDefaultWaslahPickupInfo());
                                            setShowBulkPickupPanel((open) => !open);
                                        }}
                                        disabled={requestingWaslahPickup || shippingWithWaslah}
                                        className="inline-flex items-center gap-2 rounded-lg border border-violet-400 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 transition hover:bg-violet-100 disabled:opacity-60"
                                    >
                                        <CalendarClock size={14} />
                                        {showBulkPickupPanel ? 'Hide Pickup Options' : 'Schedule Pickup (Selected)'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={downloadSelectedEmxCarrierLabels}
                                        disabled={downloadingWaslahReceipts || shippingWithWaslah}
                                        className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-900 transition hover:bg-violet-100 disabled:opacity-60"
                                    >
                                        <Download size={14} className={downloadingWaslahReceipts ? 'animate-pulse' : ''} />
                                        {downloadingWaslahReceipts
                                            ? 'Preparing PDF…'
                                            : `Download Labels (${getSelectedLabelReadyOrders().length})`}
                                    </button>
                                </>
                            ) : null}
                            <button
                                type="button"
                                onClick={exportOrdersToCsv}
                                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                            >
                                <Download size={14} />
                                Export Selected CSV
                            </button>
                            <button
                                type="button"
                                onClick={exportOrdersToExcel}
                                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
                            >
                                <Download size={14} />
                                Export Selected Excel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedOrderIds([]);
                                    setShowBulkPickupPanel(false);
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                                Clear Selection
                            </button>
                            <button
                                type="button"
                                onClick={deleteSelectedOrders}
                                disabled={deletingBulkOrders}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Trash2 size={14} />
                                {deletingBulkOrders ? 'Moving...' : 'Move to Trash'}
                            </button>
                        </div>
                    </div>

                    {showBulkPickupPanel && waslahConfig.configured ? (
                        <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">Bulk Schedule Pickup</h4>
                                    <p className="text-xs text-slate-600">
                                        Same pickup window for {getSelectedPickupEligibleOrders().length} selected EMX order(s).
                                    </p>
                                </div>
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                                    Max 25 orders
                                </span>
                            </div>

                            <div className="mb-3">
                                <p className="mb-2 text-xs font-medium text-slate-700">What type of service do you need?</p>
                                <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                                    <button
                                        type="button"
                                        onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, type: 'pickup' }))}
                                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                                            (waslahPickupInfo.type || 'pickup') === 'pickup'
                                                ? 'border-blue-700 bg-blue-700 text-white'
                                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        Pickup by Courier
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, type: 'dropoff' }))}
                                        className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                                            waslahPickupInfo.type === 'dropoff'
                                                ? 'border-blue-700 bg-blue-700 text-white'
                                                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        Dropoff
                                    </button>
                                </div>
                            </div>

                            {(waslahPickupInfo.type || 'pickup') === 'pickup' ? (
                                <div className="mb-3 space-y-3">
                                    <div>
                                        <p className="mb-2 text-xs font-medium text-slate-700">
                                            <span className="text-red-500">*</span> Pickup date
                                        </p>
                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {getWaslahPickupDateOptions().map((day) => {
                                                const selected = waslahPickupInfo.pickup_date === day.value;
                                                return (
                                                    <button
                                                        key={day.value}
                                                        type="button"
                                                        disabled={day.disabled}
                                                        onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, pickup_date: day.value }))}
                                                        className={`min-w-[7.5rem] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${
                                                            day.disabled
                                                                ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                                                                : selected
                                                                    ? 'border-blue-700 bg-blue-700 text-white'
                                                                    : 'border-blue-200 bg-white text-slate-800 hover:border-blue-400'
                                                        }`}
                                                    >
                                                        <div className="text-xs font-semibold">{day.label}</div>
                                                        <div className={`text-[10px] ${selected && !day.disabled ? 'text-blue-100' : 'text-slate-500'}`}>
                                                            ({day.hint})
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-xs font-medium text-slate-700">Time range</label>
                                            <select
                                                value={waslahPickupInfo.pickup_time || '09:00-21:00'}
                                                onChange={(e) => setWaslahPickupInfo((prev) => ({ ...prev, pickup_time: e.target.value }))}
                                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                            >
                                                <option value="09:00-21:00">Working Hours (09:00 – 21:00)</option>
                                                <option value="09:00-14:00">Morning (09:00 – 14:00)</option>
                                                <option value="14:00-21:00">Afternoon / Evening (14:00 – 21:00)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <p className="mb-1 text-xs font-medium text-slate-700">
                                                <span className="text-red-500">*</span> Vehicle
                                            </p>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { value: 'motorcycle', label: 'Motorcycle' },
                                                    { value: 'car', label: 'Car' },
                                                    { value: 'van', label: 'Truck' },
                                                ].map((vehicle) => {
                                                    const selected = (waslahPickupInfo.pickup_vehicle || 'motorcycle') === vehicle.value;
                                                    return (
                                                        <button
                                                            key={vehicle.value}
                                                            type="button"
                                                            onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, pickup_vehicle: vehicle.value }))}
                                                            className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                                                                selected
                                                                    ? 'border-blue-700 bg-blue-700 text-white'
                                                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {vehicle.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={requestBulkWaslahPickup}
                                    disabled={requestingWaslahPickup || !getSelectedPickupEligibleOrders().length}
                                    className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                                >
                                    {requestingWaslahPickup ? (
                                        <>
                                            <RefreshCw size={16} className="animate-spin" />
                                            Scheduling pickup…
                                        </>
                                    ) : (
                                        <>
                                            <Truck size={16} />
                                            Confirm Pickup for {getSelectedPickupEligibleOrders().length} Order(s)
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkPickupPanel(false)}
                                    disabled={requestingWaslahPickup}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {filteredOrders.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                    <p>No orders found for this status{hasDateFilter ? ' and date range' : ''}.</p>
                    {orders.length > 0 && hasDateFilter && ordersMatchingDateRange.length === 0 ? (
                        <p className="mt-2 text-sm text-amber-700">
                            {orders.length} orders are loaded, but none fall between the selected dates.
                            Re-import the WordPress CSV export to restore original order dates (`createdAt` column).
                        </p>
                    ) : null}
                    {orders.length === 0 ? (
                        <p className="mt-2 text-sm">Import orders from WordPress via WooCommerce → Rohith Order Confirm → Export all orders.</p>
                    ) : null}
                </div>
            ) : (
                <div className="overflow-x-auto w-full rounded-md shadow border border-gray-200">
                    <table className="w-full text-sm text-left text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={toggleSelectAllVisibleOrders}
                                        className="h-4 w-4 rounded border-gray-300"
                                        aria-label="Select all visible orders"
                                    />
                                </th>
                                <th className="px-4 py-3">Sr. No.</th>
                                <SortableOrderTableHeader
                                    label={STORE_ORDER_SORT_COLUMNS.orderNumber}
                                    column="orderNumber"
                                    sortBy={sortBy}
                                    sortDirection={sortDirection}
                                    onSort={handleOrderColumnSort}
                                />
                                <SortableOrderTableHeader
                                    label={STORE_ORDER_SORT_COLUMNS.customer}
                                    column="customer"
                                    sortBy={sortBy}
                                    sortDirection={sortDirection}
                                    onSort={handleOrderColumnSort}
                                />
                                <SortableOrderTableHeader
                                    label={STORE_ORDER_SORT_COLUMNS.total}
                                    column="total"
                                    sortBy={sortBy}
                                    sortDirection={sortDirection}
                                    onSort={handleOrderColumnSort}
                                />
                                <th className="px-4 py-3">Payment</th>
                                <th className="px-4 py-3">Tags</th>
                                <th className="px-4 py-3">Traffic Source</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Tracking</th>
                                <th className="px-4 py-3">Reason</th>
                                <SortableOrderTableHeader
                                    label={STORE_ORDER_SORT_COLUMNS.date}
                                    column="date"
                                    sortBy={sortBy}
                                    sortDirection={sortDirection}
                                    onSort={handleOrderColumnSort}
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {paginatedOrders.map((order, index) => (
                                <tr
                                    key={order._id}
                                    className="hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                                    onClick={() => openModal(order)}
                                >
                                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedOrderIds.includes(String(order._id))}
                                            onChange={() => toggleOrderSelection(order._id)}
                                            className="h-4 w-4 rounded border-gray-300"
                                            aria-label={`Select order ${getDisplayOrderNumber(order) || 'pending'}`}
                                        />
                                    </td>
                                    <td className="pl-6 text-green-600 font-medium">{(safeCurrentPage - 1) * ordersPerPage + index + 1}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{getDisplayOrderNumber(order) || 'Pending'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-medium text-slate-800">
                                                {getOrderCustomerDisplayName(order)}
                                            </span>
                                            {order.isGuest && (
                                                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full w-fit font-semibold">
                                                    Guest
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {hasPaymentFailedFollowUpDiscount(order) && Number(order?.paymentFailedFollowUp?.originalTotal) > Number(order?.total) ? (
                                            <div className="flex flex-col leading-tight">
                                                <span className="text-xs text-slate-400 line-through">
                                                    {currency}{Number(order.paymentFailedFollowUp.originalTotal).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-emerald-700">
                                                    {currency}{Number(order.total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        ) : (
                                            <span>{currency}{order.total}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col items-start gap-1.5">
                                            {(() => {
                                                const paymentBadge = getOrderPaymentMethodBadge(order);
                                                if (!paymentBadge) return null;
                                                return (
                                                    <span className={paymentBadge.className}>
                                                        {paymentBadge.label}
                                                    </span>
                                                );
                                            })()}
                                            {(() => {
                                                const isCod = normalizeOrderPaymentMethod(order) === 'COD';
                                                const paid = getPaymentStatus(order);
                                                if (isCod && !paid) return null;
                                                return (
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {paid ? '✓ Paid' : 'Pending'}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const tableTags = getOrderTableTags(order, currency);
                                            if (!tableTags.length) {
                                                return <span className="text-xs text-slate-300">—</span>;
                                            }
                                            return (
                                                <div className="flex max-w-[220px] flex-wrap gap-1">
                                                    {tableTags.map((tag) => (
                                                        tag.key === 'payment-failed-follow-up' ? (
                                                            <button
                                                                key={`${order._id}-${tag.key}`}
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    setPaymentFailedCallOrder(order);
                                                                }}
                                                                className={`${tag.className} cursor-pointer hover:opacity-90`}
                                                                title={tag.title ? `${tag.title} · Click to edit` : 'Click to edit follow-up'}
                                                            >
                                                                {tag.label}
                                                            </button>
                                                        ) : (
                                                            <span
                                                                key={`${order._id}-${tag.key}`}
                                                                className={tag.className}
                                                                title={tag.title || undefined}
                                                            >
                                                                {tag.label}
                                                            </span>
                                                        )
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const trafficSource = getOrderTrafficSourceDisplay(order);
                                            return (
                                                <div className="max-w-[180px]">
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${trafficSource.className}`}
                                                        title={trafficSource.title || undefined}
                                                    >
                                                        {trafficSource.label}
                                                    </span>
                                                    {trafficSource.detail ? (
                                                        <p
                                                            className="mt-1 truncate text-[11px] text-slate-500"
                                                            title={trafficSource.title || trafficSource.detail}
                                                        >
                                                            {trafficSource.detail}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); }}>
                                        <div className="flex min-w-[180px] flex-col items-start gap-2">
                                            <div className="flex w-full items-center gap-2">
                                                <OrderStatusPicker
                                                    value={order.status}
                                                    packed={order?.warehousePacking?.packed === true}
                                                    size="sm"
                                                    className="min-w-[160px] flex-1"
                                                    onChange={(newStatus) => updateOrderStatus(order._id, newStatus, getToken, fetchOrders)}
                                                />
                                                {order?.warehouseReturn?.collected ? (
                                                    <span
                                                        className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-800"
                                                        title="Warehouse scanned this returning parcel"
                                                    >
                                                        Return collected
                                                    </span>
                                                ) : null}
                                                {getDisplayAwb(order) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => autoSyncStatusFromTracking(order)}
                                                        className="text-xs font-semibold px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                                                        title="Auto-set status from latest tracking"
                                                    >
                                                        Auto
                                                    </button>
                                                )}
                                            </div>
                                            {isPaymentFailedStoreOrder(order) ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={recheckingPaymentOrderId === String(order._id)}
                                                        onClick={() => recheckFailedOrderPayment(order)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                                        title="Check Tabby / Tamara / Stripe if this order was actually paid"
                                                    >
                                                        <RefreshCw
                                                            size={13}
                                                            className={recheckingPaymentOrderId === String(order._id) ? 'animate-spin' : ''}
                                                        />
                                                        {recheckingPaymentOrderId === String(order._id) ? 'Checking…' : 'Recheck payment'}
                                                    </button>
                                                    {!hasPaymentFailedFollowUp(order) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPaymentFailedCallOrder(order)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                                                        >
                                                            <Phone size={13} />
                                                            Call customer
                                                        </button>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {getDisplayAwb(order) ? (
                                            <div className="flex flex-col items-start gap-1">
                                                <a
                                                    href={buildTrackOrderPageUrl(order)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(event) => event.stopPropagation()}
                                                    className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium hover:bg-blue-200"
                                                    title={`Open track order for ${getDisplayAwb(order)}`}
                                                >
                                                    {getDisplayAwb(order).substring(0, 8)}...
                                                </a>
                                                {isWaslahLabelPrinted(order) ? (
                                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                                                        Downloaded ×{getLabelDownloadCount(order)}
                                                    </span>
                                                ) : isWaslahLabelNotPrinted(order) ? (
                                                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200">
                                                        Not printed
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs">Not shipped</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {(() => {
                                            const courierNote = getOrderCourierNoteDisplay(order);
                                            if (!courierNote) {
                                                return <span className="text-xs text-slate-300">—</span>;
                                            }
                                            const tone = getCourierNoteToneClasses(courierNote.tone);
                                            return (
                                                <div className="max-w-[240px]" title={courierNote.title}>
                                                    <p className={`line-clamp-3 text-[12px] font-semibold leading-snug ${tone.text}`}>
                                                        {courierNote.reason}
                                                    </p>
                                                    {courierNote.label ? (
                                                        <span
                                                            className={`mt-1 inline-flex max-w-full rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${tone.badge}`}
                                                        >
                                                            <span className="truncate">{courierNote.label}</span>
                                                        </span>
                                                    ) : null}
                                                    {courierNote.location ? (
                                                        <p className="mt-0.5 truncate text-[10px] text-slate-400">
                                                            {courierNote.location}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                                        {(() => {
                                            const { date, time } = formatStoreOrderDateParts(order.createdAt);
                                            return (
                                                <div className="flex flex-col leading-tight">
                                                    <span className="font-medium text-slate-700">{date}</span>
                                                    {time ? (
                                                        <span className="text-[11px] text-slate-400 tabular-nums">{time}</span>
                                                    ) : null}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {renderPaginationControls()}
                </div>
            )}
            {isModalOpen && selectedOrder && (() => {
                const manualOrderCreator = getManualStoreOrderCreator(selectedOrder);
                const manualOrderReference = getOrderPaymentReferenceId(selectedOrder);
                const isManualOrder = isManualStoreDashboardOrder(selectedOrder);

                return (
                <div onClick={closeModal} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm text-slate-700 text-sm">
                    <div
                        onClick={e => e.stopPropagation()}
                        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        {/* Header — fixed in the modal shell (not sticky over scrolling content) */}
                        <div className="relative z-20 shrink-0 rounded-t-2xl bg-gradient-to-r from-blue-600 to-purple-600 p-5 text-white sm:p-6">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1 pe-2">
                                    <h2 className="mb-1 text-xl font-bold sm:text-2xl">Order Details</h2>
                                    <p className="text-xs text-blue-100">Order No: <span className='font-mono text-white'>{getDisplayOrderNumber(selectedOrder) || 'Pending'}</span></p>
                                    {selectedOrder?.warehousePacking?.packed ? (
                                        <p className="mt-2 inline-flex items-center rounded-full bg-teal-400/20 px-2.5 py-1 text-[11px] font-semibold text-teal-50 ring-1 ring-teal-200/40">
                                            Packed
                                            {selectedOrder.warehousePacking.packedByName
                                                ? ` · ${selectedOrder.warehousePacking.packedByName}`
                                                : ''}
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => markOrderPacked(selectedOrder)}
                                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-400"
                                        >
                                            <Package size={14} />
                                            Mark packed
                                        </button>
                                    )}
                                    {selectedOrder?.warehouseReturn?.collected ? (
                                        <p className="mt-2 ms-2 inline-flex items-center rounded-full bg-indigo-400/25 px-2.5 py-1 text-[11px] font-semibold text-indigo-50 ring-1 ring-indigo-200/40">
                                            Return collected
                                            {selectedOrder.warehouseReturn.collectedByName
                                                ? ` · ${selectedOrder.warehouseReturn.collectedByName}`
                                                : ''}
                                        </p>
                                    ) : null}
                                    {isManualOrder ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                Store dashboard
                                            </span>
                                            {manualOrderCreator?.name ? (
                                                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] text-blue-50">
                                                    Created by {manualOrderCreator.name}
                                                </span>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowOrderEditPanel((value) => !value)}
                                        className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/30 sm:px-4"
                                        title="Edit order"
                                    >
                                        <Pencil size={18} />
                                        <span className="text-sm">{showOrderEditPanel ? 'Hide edit' : 'Edit'}</span>
                                    </button>
                                    <button
                                        onClick={() => downloadInvoice(selectedOrder)}
                                        className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/30 sm:px-4"
                                        title="Download Invoice"
                                    >
                                        <Download size={18} />
                                        <span className="text-sm">Download</span>
                                    </button>
                                    <button
                                        onClick={() => printInvoice(selectedOrder)}
                                        className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/30 sm:px-4"
                                        title="Print Invoice"
                                    >
                                        <Printer size={18} />
                                        <span className="text-sm">Print</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="rounded-full p-2 transition-colors hover:bg-white/20"
                                        aria-label="Close order details"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
                            {showOrderEditPanel ? (
                                <StoreEditOrderPanel
                                    order={selectedOrder}
                                    currency={currency}
                                    getToken={getToken}
                                    onSaved={(updatedOrder) => {
                                        if (!updatedOrder) return;
                                        setSelectedOrder((current) => (
                                            current && String(current._id) === String(updatedOrder._id)
                                                ? { ...current, ...updatedOrder }
                                                : current
                                        ));
                                        setOrders((current) => current.map((row) => (
                                            String(row._id) === String(updatedOrder._id)
                                                ? { ...row, ...updatedOrder }
                                                : row
                                        )));
                                        setShowOrderEditPanel(false);
                                    }}
                                />
                            ) : null}

                            {/* Shipping & Tracking */}
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                        <Truck size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-orange-900">Shipping &amp; Tracking</h3>
                                        <p className="text-xs text-orange-800/80">Ship with EMX via Waslah, or enter tracking manually.</p>
                                    </div>
                                </div>

                                {waslahConfig.configured ? (
                                    <div className="mb-4 space-y-3 rounded-lg border border-violet-200 bg-violet-50 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-violet-900">EMX via Waslah</p>
                                            {isWaslahShipmentProcessed(selectedOrder) ? (
                                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getWaslahLiveStatusColor(selectedOrder)}`}>
                                                    {getWaslahLiveStatusLabel(selectedOrder)}
                                                </span>
                                            ) : isWaslahUnlinkedDuplicate(selectedOrder) ? (
                                                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                                                    Ready to ship
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                                                    Ready to ship
                                                </span>
                                            )}
                                            {isWaslahLabelPrinted(selectedOrder) ? (
                                                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                                                    Downloaded ×{getLabelDownloadCount(selectedOrder)}
                                                </span>
                                            ) : isWaslahLabelNotPrinted(selectedOrder) ? (
                                                <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
                                                    Not printed
                                                </span>
                                            ) : null}
                                        </div>

                                        <WaslahShipNotice
                                            notice={waslahSuccessNotice}
                                            onDismiss={() => setWaslahSuccessNotice(null)}
                                            onLabelDownload={() => {
                                                downloadEmxCarrierLabel(selectedOrder);
                                            }}
                                        />

                                        {!isWaslahShipmentProcessed(selectedOrder) && !selectedOrder?.waslah?.orderId ? (
                                            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-violet-900">
                                                <li>Click <strong>Send to EMX</strong> — creates the shipment</li>
                                                <li>Then use <strong>Schedule Pickup</strong> (EMX options: date, time, vehicle)</li>
                                                <li>After pickup, the EMX tracking / AWB appears — download the carrier label</li>
                                            </ol>
                                        ) : null}

                                        {selectedOrder?.waslah?.orderId && !selectedOrder?.waslah?.pickupRequestedAt && canRequestWaslahPickup(selectedOrder) ? (
                                            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-900">
                                                Shipment sent to EMX. Schedule pickup below — then you will get the EMX AWB / carrier label.
                                            </p>
                                        ) : null}

                                        {waslahConfig.configured && !waslahConfig.senderConfigured ? (
                                            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                                                <p className="text-xs font-medium text-amber-800">
                                                    Add <code className="rounded bg-white px-1">WASLAH_SENDER_ID</code> to server <code className="rounded bg-white px-1">.env</code>, then restart.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={loadWaslahSenders}
                                                    disabled={loadingWaslahSenders}
                                                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                                                >
                                                    {loadingWaslahSenders ? 'Loading…' : 'Fetch sender IDs'}
                                                </button>
                                                {waslahSenders.length > 0 ? (
                                                    <ul className="space-y-1 text-[11px] text-amber-900">
                                                        {waslahSenders.map((sender) => (
                                                            <li key={sender.id} className="rounded bg-white px-2 py-1.5 font-mono break-all">
                                                                <span className="font-sans font-semibold">{sender.contactName || sender.companyName || 'Sender'}</span>
                                                                {' — '}
                                                                {sender.id}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {waslahConfig.configured && !waslahConfig.serviceConfigured ? (
                                            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                                                <p className="text-xs font-medium text-amber-800">
                                                    Add <code className="rounded bg-white px-1">WASLAH_SERVICE_ID</code> (EMX) to server <code className="rounded bg-white px-1">.env</code>, then restart.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={loadWaslahServices}
                                                    disabled={loadingWaslahServices}
                                                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                                                >
                                                    {loadingWaslahServices ? 'Loading…' : 'Fetch EMX service ID'}
                                                </button>
                                                {waslahServices.length > 0 ? (
                                                    <ul className="space-y-1 text-[11px] text-amber-900">
                                                        {waslahServices.map((service) => (
                                                            <li key={service.id} className="rounded bg-white px-2 py-1.5 font-mono break-all">
                                                                <span className="font-sans font-semibold">
                                                                    {service.name || 'Service'}
                                                                    {service.courier ? ` (${service.courier})` : ''}
                                                                </span>
                                                                {' — '}
                                                                {service.id}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        {getOrderAwb(selectedOrder) || selectedOrder?.waslah?.orderId ? (
                                            <div className="rounded-lg border border-violet-200 bg-white p-3">
                                                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                                                    <div>
                                                        <p className="text-xs text-slate-500">Tracking number</p>
                                                        <p className="font-semibold text-slate-900 font-mono">
                                                            {getOrderAwb(selectedOrder) || 'Pending — click Refresh EMX status'}
                                                        </p>
                                                        {getOrderAwb(selectedOrder) ? (
                                                            <a
                                                                href={buildTrackOrderPageUrl(selectedOrder)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="mt-1 inline-flex text-xs font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900"
                                                            >
                                                                Open on Track Order page
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-slate-500">Courier</p>
                                                        <p className="font-semibold text-slate-900">{selectedOrder.courier || 'EMX'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-slate-500">Live EMX status</p>
                                                        <p className="font-semibold text-slate-900">{getWaslahLiveStatusLabel(selectedOrder)}</p>
                                                        <p className="text-[10px] text-slate-500">
                                                            Store status: {selectedOrder.status || '—'}
                                                            {waslahStatusRefreshedAt
                                                                ? ` · checked ${new Date(waslahStatusRefreshedAt).toLocaleTimeString()}`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {(selectedOrder?.waslah?.labelUrl || selectedOrder?.waslah?.orderId) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => downloadEmxCarrierLabel(selectedOrder)}
                                                            className="inline-flex items-center rounded-lg border border-violet-300 bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-200"
                                                        >
                                                            Download Carrier Label
                                                        </button>
                                                    ) : null}
                                                    {isWaslahLabelPrinted(selectedOrder) ? (
                                                        <span className="inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                                                            Downloaded ×{getLabelDownloadCount(selectedOrder)}
                                                        </span>
                                                    ) : isWaslahLabelNotPrinted(selectedOrder) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => markOrdersLabelPrinted([selectedOrder._id])}
                                                            className="inline-flex items-center rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                                        >
                                                            Mark label printed
                                                        </button>
                                                    ) : null}
                                                    <a
                                                        href={
                                                            buildTrackOrderPageUrl(selectedOrder)
                                                            || buildEmxTrackingUrl(getOrderAwb(selectedOrder))
                                                            || selectedOrder.trackingUrl
                                                            || 'https://www.emx.ae/all-services/track-a-package'
                                                        }
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                                    >
                                                        Track Order
                                                    </a>
                                                    {buildEmxTrackingUrl(getOrderAwb(selectedOrder)) ? (
                                                        <a
                                                            href={buildEmxTrackingUrl(getOrderAwb(selectedOrder))}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                                                        >
                                                            Track on EMX
                                                        </a>
                                                    ) : null}
                                                    {canCancelWaslahShipment(selectedOrder) ? (
                                                        <button
                                                            type="button"
                                                            onClick={cancelWaslahShipment}
                                                            disabled={cancellingWaslah || shippingWithWaslah || requestingWaslahPickup}
                                                            className="inline-flex items-center rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                                                        >
                                                            {cancellingWaslah ? 'Cancelling…' : 'Cancel Waslah shipment'}
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {(Array.isArray(selectedOrder?.waslah?.events) && selectedOrder.waslah.events.length > 0) ? (
                                                    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                                                            Live EMX tracking events
                                                        </p>
                                                        <TrackingTimeline events={selectedOrder.waslah.events} type="waslah" />
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-[11px] text-violet-800">
                                                        Click <strong>Refresh EMX status</strong> to load the live event timeline from Waslah.
                                                    </p>
                                                )}
                                            </div>
                                        ) : null}

                                        {isWaslahUnlinkedDuplicate(selectedOrder) ? (
                                            <p className="text-xs text-amber-900">
                                                Waslah may still have an older shipment for {getWaslahOrderReference(selectedOrder) || 'this order'}.
                                                Use <strong>Ship with EMX</strong> to create a new AWB, or optionally sync the old one below.
                                            </p>
                                        ) : null}

                                        {(isWaslahUnlinkedDuplicate(selectedOrder) || waslahLinkHelpOpen) ? (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                                <p className="text-xs font-semibold text-amber-900">One-time sync from Waslah</p>
                                                <p className="mt-1 text-[11px] text-amber-800">
                                                    Open <a href="https://ship.waslah.ae/" target="_blank" rel="noopener noreferrer" className="underline">ship.waslah.ae</a>
                                                    {' '}→ find order <strong>{getWaslahOrderReference(selectedOrder) || '—'}</strong>
                                                    {' '}→ copy the 24-character ID from the URL → paste below → sync AWB.
                                                </p>
                                                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                                    <input
                                                        type="text"
                                                        value={waslahManualOrderId}
                                                        onChange={(e) => setWaslahManualOrderId(e.target.value)}
                                                        placeholder="24-character Waslah Order ID"
                                                        className="w-full flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={linkWaslahAwb}
                                                        disabled={shippingWithWaslah}
                                                        className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                                                    >
                                                        Sync AWB from Waslah
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}

                                        {!selectedOrder?.waslah?.labelUrl && !waslahLinkHelpOpen && !isWaslahUnlinkedDuplicate(selectedOrder) ? (
                                            <button
                                                type="button"
                                                onClick={() => setWaslahLinkHelpOpen(true)}
                                                className="text-left text-[11px] font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                                            >
                                                Shipment already exists in Waslah? Link it manually
                                            </button>
                                        ) : null}

                                        {canRequestWaslahPickup(selectedOrder) ? (
                                            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h4 className="text-sm font-bold text-slate-900">Schedule Pickup</h4>
                                                    {selectedOrder?.waslah?.pickupRequestedAt ? (
                                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                                            Pickup requested
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                                                            EMX options
                                                        </span>
                                                    )}
                                                </div>

                                                <div>
                                                    <p className="mb-2 text-xs font-medium text-slate-700">What type of service do you need?</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, type: 'pickup' }))}
                                                            className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                                                                (waslahPickupInfo.type || 'pickup') === 'pickup'
                                                                    ? 'border-blue-700 bg-blue-700 text-white'
                                                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            Pickup by Courier
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, type: 'dropoff' }))}
                                                            className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                                                                waslahPickupInfo.type === 'dropoff'
                                                                    ? 'border-blue-700 bg-blue-700 text-white'
                                                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            Dropoff
                                                        </button>
                                                    </div>
                                                </div>

                                                {(waslahPickupInfo.type || 'pickup') === 'pickup' ? (
                                                    <>
                                                        <div>
                                                            <p className="mb-2 text-xs font-medium text-slate-700">
                                                                <span className="text-red-500">*</span> Pickup date
                                                            </p>
                                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                                {getWaslahPickupDateOptions().map((day) => {
                                                                    const selected = waslahPickupInfo.pickup_date === day.value;
                                                                    return (
                                                                        <button
                                                                            key={day.value}
                                                                            type="button"
                                                                            disabled={day.disabled}
                                                                            onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, pickup_date: day.value }))}
                                                                            className={`min-w-[7.5rem] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${
                                                                                day.disabled
                                                                                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                                                                                    : selected
                                                                                        ? 'border-blue-700 bg-blue-700 text-white'
                                                                                        : 'border-blue-200 bg-white text-slate-800 hover:border-blue-400'
                                                                            }`}
                                                                        >
                                                                            <div className="text-xs font-semibold">{day.label}</div>
                                                                            <div className={`text-[10px] ${selected && !day.disabled ? 'text-blue-100' : 'text-slate-500'}`}>
                                                                                ({day.hint})
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="mb-1 block text-xs font-medium text-slate-700">Select a time range</label>
                                                            <select
                                                                value={waslahPickupInfo.pickup_time || '09:00-21:00'}
                                                                onChange={(e) => setWaslahPickupInfo((prev) => ({ ...prev, pickup_time: e.target.value }))}
                                                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
                                                            >
                                                                <option value="09:00-21:00">Working Hours (09:00 – 21:00)</option>
                                                                <option value="09:00-14:00">Morning (09:00 – 14:00)</option>
                                                                <option value="14:00-21:00">Afternoon / Evening (14:00 – 21:00)</option>
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <p className="mb-2 text-xs font-medium text-slate-700">
                                                                <span className="text-red-500">*</span> Preferred pickup vehicle
                                                            </p>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {[
                                                                    { value: 'motorcycle', label: 'Motorcycle' },
                                                                    { value: 'car', label: 'Car' },
                                                                    { value: 'van', label: 'Truck' },
                                                                ].map((vehicle) => {
                                                                    const selected = (waslahPickupInfo.pickup_vehicle || 'motorcycle') === vehicle.value;
                                                                    return (
                                                                        <button
                                                                            key={vehicle.value}
                                                                            type="button"
                                                                            onClick={() => setWaslahPickupInfo((prev) => ({ ...prev, pickup_vehicle: vehicle.value }))}
                                                                            className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${
                                                                                selected
                                                                                    ? 'border-blue-700 bg-blue-700 text-white'
                                                                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                                            }`}
                                                                        >
                                                                            {vehicle.label}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                                                        Dropoff selected — you will take the parcel to an EMX / Waslah dropoff point. Continue to confirm.
                                                    </p>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={requestWaslahPickup}
                                                    disabled={requestingWaslahPickup || shippingWithWaslah || cancellingWaslah}
                                                    className="w-full rounded-xl bg-blue-700 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-300"
                                                >
                                                    {requestingWaslahPickup
                                                        ? 'Scheduling…'
                                                        : (selectedOrder?.waslah?.pickupRequestedAt
                                                            ? 'Update pickup'
                                                            : 'Continue')}
                                                </button>
                                            </div>
                                        ) : null}

                                        {isWaslahShipmentProcessed(selectedOrder) && !isWaslahLiveTerminalOrder(selectedOrder) ? (
                                            <p className="text-[11px] text-emerald-800">
                                                Live EMX status refreshes every 30 seconds here and in the orders list.
                                            </p>
                                        ) : null}

                                        {isWaslahShipmentProcessed(selectedOrder) && isWaslahLiveTerminalOrder(selectedOrder) ? (
                                            <p className="text-[11px] font-medium text-slate-700">
                                                Final EMX status: {getWaslahLiveStatusLabel(selectedOrder)}.
                                            </p>
                                        ) : null}

                                        {selectedOrder?.waslah?.cancelledAt && !canCancelWaslahShipment(selectedOrder) ? (
                                            <p className="text-[11px] text-red-800">
                                                Last Waslah shipment cancelled
                                                {selectedOrder.waslah.cancelledTrackingNumber
                                                    ? ` (AWB ${selectedOrder.waslah.cancelledTrackingNumber})`
                                                    : ''}.
                                                Use Ship with EMX to create a new AWB.
                                            </p>
                                        ) : null}

                                        <div className="space-y-2">
                                        {(isWaslahShipmentProcessed(selectedOrder) || selectedOrder?.waslah?.orderId) ? (
                                            <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5">
                                                <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700">
                                                    Tracking number
                                                </p>
                                                <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                                                    {getOrderAwb(selectedOrder) || 'Not loaded yet — click Refresh EMX status'}
                                                </p>
                                            </div>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={
                                                (isWaslahShipmentProcessed(selectedOrder) || selectedOrder?.waslah?.orderId)
                                                    ? () => refreshWaslahStatus({ manual: true })
                                                    : shipOrderWithWaslah
                                            }
                                            disabled={shippingWithWaslah || refreshingWaslahStatus || cancellingWaslah || requestingWaslahPickup}
                                            className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                                        >
                                            {shippingWithWaslah || refreshingWaslahStatus ? (
                                                <>
                                                    <RefreshCw size={16} className="animate-spin" />
                                                    {refreshingWaslahStatus ? 'Refreshing EMX status…' : 'Sending to EMX…'}
                                                </>
                                            ) : (
                                                <>
                                                    {(isWaslahShipmentProcessed(selectedOrder) || selectedOrder?.waslah?.orderId)
                                                        ? <RefreshCw size={16} />
                                                        : <Truck size={16} />}
                                                    {(isWaslahShipmentProcessed(selectedOrder) || selectedOrder?.waslah?.orderId)
                                                        ? 'Refresh EMX status'
                                                        : 'Send to EMX'}
                                                </>
                                            )}
                                        </button>
                                        {(selectedOrder?.waslah?.labelUrl || selectedOrder?.waslah?.orderId) ? (
                                            <button
                                                type="button"
                                                onClick={() => downloadEmxCarrierLabel(selectedOrder)}
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 py-2.5 text-sm font-semibold text-slate-800 hover:bg-white"
                                            >
                                                Download Carrier Label
                                            </button>
                                        ) : null}
                                        {canRequestWaslahPickup(selectedOrder) && selectedOrder?.waslah?.pickupDate ? (
                                            <p className="text-[11px] text-emerald-800">
                                                Last pickup request: {selectedOrder.waslah.pickupDate}
                                                {selectedOrder.waslah.pickupTime ? ` · ${selectedOrder.waslah.pickupTime}` : ''}
                                                {selectedOrder.waslah.pickupVehicle ? ` · ${selectedOrder.waslah.pickupVehicle}` : ''}
                                                {selectedOrder.waslah.pickupType ? ` · ${selectedOrder.waslah.pickupType}` : ''}
                                            </p>
                                        ) : null}
                                        {canCancelWaslahShipment(selectedOrder) && !getOrderAwb(selectedOrder) ? (
                                            <button
                                                type="button"
                                                onClick={cancelWaslahShipment}
                                                disabled={cancellingWaslah || shippingWithWaslah || requestingWaslahPickup}
                                                className="w-full rounded-lg border border-red-300 bg-red-50 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                                            >
                                                {cancellingWaslah ? 'Cancelling…' : 'Cancel Waslah shipment'}
                                            </button>
                                        ) : null}
                                        </div>
                                    </div>
                                ) : null}

                                {!waslahConfig.configured && selectedOrder.trackingId ? (
                                    <div className="bg-white rounded-lg p-4 mb-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <p className="text-xs text-slate-500 mb-1">Tracking ID</p>
                                                <p className="font-semibold text-slate-900">{selectedOrder.trackingId}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500 mb-1">Courier</p>
                                                <p className="font-semibold text-slate-900">{selectedOrder.courier}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500 mb-1">Track Order</p>
                                                {selectedOrder.trackingUrl ? (
                                                    <a href={selectedOrder.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                                                        View Tracking
                                                    </a>
                                                ) : (
                                                    <p className="text-slate-400">No URL</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Delhivery Live Status */}
                                        {selectedOrder.delhivery && (
                                            <div className="border-t border-slate-200 mt-4 pt-4">
                                                <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                                    📍 Live Delhivery Tracking
                                                </p>
                                                <div className="space-y-3">
                                                    {/* Current Location - Most Important */}
                                                    {selectedOrder.delhivery.current_status_location && (
                                                        <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-4 rounded-lg text-white shadow-lg border-l-4 border-green-700">
                                                            <p className="text-xs font-semibold opacity-90">📍 Current Location</p>
                                                            <p className="font-bold text-lg mt-1">{selectedOrder.delhivery.current_status_location}</p>
                                                        </div>
                                                    )}

                                                    {/* Current Status */}
                                                    {selectedOrder.delhivery.current_status && (
                                                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                                                            <p className="text-xs text-slate-600 font-semibold">Status</p>
                                                            <p className="font-bold text-blue-700 mt-1 text-lg">{selectedOrder.delhivery.current_status}</p>
                                                        </div>
                                                    )}

                                                    {/* Expected Delivery */}
                                                    {selectedOrder.delhivery.expected_delivery_date && (
                                                        <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg">
                                                            <p className="text-xs text-slate-600 font-semibold">Expected Delivery</p>
                                                            <p className="font-bold text-purple-700 mt-1">{new Date(selectedOrder.delhivery.expected_delivery_date).toLocaleDateString()} {new Date(selectedOrder.delhivery.expected_delivery_date).toLocaleTimeString()}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Recent Events Timeline */}
                                                {selectedOrder.delhivery.events && selectedOrder.delhivery.events.length > 0 && (
                                                    <div className="border-t border-slate-200 mt-4 pt-4">
                                                        <p className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-2">
                                                            <span>📦</span> Tracking History
                                                        </p>
                                                        <div className="space-y-2 max-h-96 overflow-y-auto">
                                                            {selectedOrder.delhivery.events.map((event, idx) => (
                                                                <div key={idx} className="border-l-3 border-blue-400 pl-3 py-2 bg-slate-50 rounded-r p-2">
                                                                    <div className="flex justify-between items-start gap-2">
                                                                        <div className="flex-1">
                                                                            {event.location && (
                                                                                <div className="font-semibold text-slate-900 text-sm">📍 {event.location}</div>
                                                                            )}
                                                                            {event.status && (
                                                                                <div className="font-medium text-blue-700 text-sm mt-0.5">{event.status}</div>
                                                                            )}
                                                                            {event.remarks && (
                                                                                <div className="text-slate-600 text-xs mt-1 italic">{event.remarks}</div>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-slate-500 whitespace-nowrap">
                                                                            {formatStoreOrderDateTime(event.time)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                <details className="rounded-lg border border-slate-200 bg-white/80 p-3">
                                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                                        Manual tracking (other couriers)
                                    </summary>
                                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-slate-700 block mb-1">AWB / Tracking ID</label>
                                            <input
                                                type="text"
                                                value={trackingData.trackingId}
                                                onChange={e => setTrackingData({...trackingData, trackingId: e.target.value})}
                                                placeholder="Courier tracking number"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-700 block mb-1">Courier name</label>
                                            <input
                                                type="text"
                                                value={trackingData.courier}
                                                onChange={e => setTrackingData({...trackingData, courier: e.target.value})}
                                                placeholder="e.g. Delhivery, DHL"
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-700 block mb-1">Tracking URL</label>
                                            <input
                                                type="url"
                                                value={trackingData.trackingUrl}
                                                onChange={e => setTrackingData({...trackingData, trackingUrl: e.target.value})}
                                                placeholder="https://..."
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            />
                                        </div>
                                    </div>
                                    <details className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                        <summary className="cursor-pointer text-xs font-semibold text-emerald-800">C3X settings</summary>
                                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-medium text-emerald-800 block mb-1">C3X Product Type</label>
                                                <input
                                                    type="text"
                                                    value={c3xConfig.product}
                                                    onChange={e => setC3xConfig(prev => ({ ...prev, product: e.target.value.toUpperCase() }))}
                                                    placeholder="DOM / DOC / INT"
                                                    className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-emerald-800 block mb-1">C3X Service Type</label>
                                                <input
                                                    type="text"
                                                    value={c3xConfig.serviceType}
                                                    onChange={e => setC3xConfig(prev => ({ ...prev, serviceType: e.target.value.toUpperCase() }))}
                                                    placeholder="NOR / EXP"
                                                    className="w-full px-3 py-2 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                />
                                            </div>
                                        </div>
                                    </details>
                                    <button
                                        onClick={updateTrackingDetails}
                                        className="mt-3 w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg transition-colors"
                                    >
                                        Update tracking &amp; notify customer
                                    </button>
                                    <button
                                        onClick={autoSyncStatusFromTracking}
                                        className="mt-2 w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                                    >
                                        Auto status from tracking
                                    </button>
                                </details>

                                {!waslahConfig.configured ? (
                                    <p className="mt-3 text-xs text-violet-700">
                                        To ship with EMX, add <code className="rounded bg-white px-1">WASLAH_API_TOKEN</code> and{' '}
                                        <code className="rounded bg-white px-1">WASLAH_API_BASE_URL</code> to server .env, then restart.
                                    </p>
                                ) : null}

                                {/* Delhivery Pickup & Auto-Refresh Controls */}
                                {selectedOrder?.courier?.toLowerCase() === 'delhivery' && (
                                    <div className="mt-4 space-y-2">
                                        <button
                                            onClick={schedulePickupWithDelhivery}
                                            disabled={schedulingPickup || !selectedOrder?.trackingId}
                                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            {schedulingPickup ? (
                                                <>
                                                    <span className="animate-spin">⚙️</span>
                                                    Scheduling Pickup...
                                                </>
                                            ) : (
                                                <>
                                                    <MapPin size={18} />
                                                    Schedule Delhivery Pickup
                                                </>
                                            )}
                                        </button>
                                        
                                        <button
                                            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                                            className={`w-full font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                                                autoRefreshEnabled
                                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                            }`}
                                        >
                                            <RefreshCw size={18} />
                                            {autoRefreshEnabled ? `Auto-Refresh ON (Every ${refreshInterval}s)` : 'Auto-Refresh OFF'}
                                        </button>
                                    </div>
                                )}

                                
                            </div>

                            {isDeliveredStoreOrder(selectedOrder) ? (
                                <div className="rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50 p-5">
                                    <h3 className="text-lg font-semibold text-pink-900">After delivery</h3>
                                    <p className="mt-1 text-xs text-pink-800/80">
                                        Start a return or a replacement for this delivered order. The customer is emailed automatically.
                                    </p>
                                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReturnActionReason('');
                                                setReturnActionType('RETURN');
                                            }}
                                            disabled={hasOpenStoreReturn(selectedOrder, 'RETURN') || String(selectedOrder.status || '').toUpperCase() === 'RETURNED'}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            <Undo2 size={16} />
                                            {hasOpenStoreReturn(selectedOrder, 'RETURN') ? 'Return already started' : 'Return this order'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReturnActionReason('');
                                                setReturnActionType('REPLACEMENT');
                                            }}
                                            disabled={hasOpenStoreReturn(selectedOrder, 'REPLACEMENT') || String(selectedOrder.status || '').toUpperCase() === 'RETURNED'}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            <RefreshCw size={16} />
                                            {hasOpenStoreReturn(selectedOrder, 'REPLACEMENT') ? 'Replacement already started' : 'Start replacement'}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {/* Return/Replacement Request Section */}
                            {selectedOrder.returns && selectedOrder.returns.length > 0 && (
                                <div className="bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200 rounded-xl p-5">
                                    <h3 className="text-lg font-semibold text-pink-900 mb-4">Return/Replacement Requests</h3>
                                    
                                    <div className="space-y-4">
                                        {selectedOrder.returns.map((returnRequest, idx) => (
                                            <div key={idx} className="bg-white rounded-lg p-4 border border-pink-200">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                        returnRequest.type === 'RETURN' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {returnRequest.type}
                                                    </span>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                        returnRequest.status === 'REQUESTED' ? 'bg-yellow-100 text-yellow-700' :
                                                        returnRequest.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                                        returnRequest.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                                        'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {returnRequest.status}
                                                    </span>
                                                    <span className="text-xs text-slate-500 ml-auto">{new Date(returnRequest.requestedAt).toLocaleString()}</span>
                                                </div>

                                                <div className="space-y-2 text-sm">
                                                    <div>
                                                        <p className="text-slate-600 font-medium">Reason:</p>
                                                        <p className="text-slate-900">{returnRequest.reason}</p>
                                                    </div>
                                                    
                                                    {returnRequest.description && (
                                                        <div>
                                                            <p className="text-slate-600 font-medium">Description:</p>
                                                            <p className="text-slate-900">{returnRequest.description}</p>
                                                        </div>
                                                    )}

                                                    {returnRequest.images && returnRequest.images.length > 0 && (
                                                        <div>
                                                            <p className="text-slate-600 font-medium mb-2">Images:</p>
                                                            <div className="flex gap-2 flex-wrap">
                                                                {returnRequest.images.map((img, imgIdx) => (
                                                                    <a 
                                                                        key={imgIdx} 
                                                                        href={img} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                    >
                                                                        <img 
                                                                            src={img} 
                                                                            alt={`Return ${imgIdx + 1}`}
                                                                            className="w-24 h-24 object-cover rounded-lg border-2 border-pink-200 hover:border-pink-400 transition cursor-pointer"
                                                                        />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {returnRequest.status === 'REQUESTED' && (
                                                        <div className="flex gap-2 pt-3">
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const token = await getToken(true);
                                                                        await axios.post('/api/store/return-requests', {
                                                                            orderId: selectedOrder._id,
                                                                            returnIndex: idx,
                                                                            action: 'APPROVE'
                                                                        }, {
                                                                            headers: { Authorization: `Bearer ${token}` }
                                                                        });
                                                                        toast.success('Approved!');
                                                                        fetchOrders();
                                                                        closeModal();
                                                                    } catch (error) {
                                                                        toast.error(error?.response?.data?.error || 'Failed');
                                                                    }
                                                                }}
                                                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                                                            >
                                                                ✓ Approve
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setRejectingReturnIndex(idx);
                                                                    setShowRejectModal(true);
                                                                }}
                                                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                                                            >
                                                                ✗ Reject
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Customer Details */}
                            <div className="bg-slate-50 rounded-xl p-5">
                                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
                                    Customer Details
                                    {selectedOrder.isGuest && (
                                        <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                                            GUEST ORDER
                                        </span>
                                    )}
                                    {isManualOrder ? (
                                        <span className="ml-2 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
                                            ADMIN CREATED
                                        </span>
                                    ) : null}
                                </h3>
                                
                                {!selectedOrder.shippingAddress && !selectedOrder.isGuest && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                                        <p className="text-yellow-800 text-sm">
                                            ⚠️ Shipping address not available for this order. This order was placed before address tracking was implemented.
                                        </p>
                                        {selectedOrder.userId && (
                                            <p className="text-yellow-700 text-xs mt-2">
                                                Customer: {getOrderCustomerDisplayName(selectedOrder)}
                                            </p>
                                        )}
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-slate-500">Name</p>
                                        <p className="font-medium text-slate-900">
                                            {selectedOrder.isGuest 
                                                ? (selectedOrder.guestName || selectedOrder.shippingAddress?.name || '—') 
                                                : (selectedOrder.shippingAddress?.name || selectedOrder.userId?.name || selectedOrder.guestName || '—')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Email</p>
                                        <p className="font-medium text-slate-900">
                                            {selectedOrder.isGuest 
                                                ? (selectedOrder.guestEmail || selectedOrder.shippingAddress?.email || '—') 
                                                : (selectedOrder.shippingAddress?.email || selectedOrder.userId?.email || selectedOrder.guestEmail || '—')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Phone</p>
                                        <p className="font-medium text-slate-900">
                                            {selectedOrder.isGuest 
                                                ? ([selectedOrder.shippingAddress?.phoneCode, selectedOrder.guestPhone || selectedOrder.shippingAddress?.phone].filter(Boolean).join(' ') || '—')
                                                : ([selectedOrder.shippingAddress?.phoneCode, selectedOrder.shippingAddress?.phone || selectedOrder.guestPhone].filter(Boolean).join(' ') || '—')}
                                        </p>
                                    </div>
                                    {(selectedOrder.shippingAddress?.alternatePhone || selectedOrder.alternatePhone) && (
                                        <div>
                                            <p className="text-slate-500">Alternate Phone</p>
                                            <p className="font-medium text-slate-900">
                                                {selectedOrder.isGuest
                                                    ? [selectedOrder.alternatePhoneCode || selectedOrder.shippingAddress?.phoneCode || '+91', selectedOrder.alternatePhone || selectedOrder.shippingAddress?.alternatePhone].filter(Boolean).join(' ')
                                                    : [selectedOrder.shippingAddress?.alternatePhoneCode || selectedOrder.shippingAddress?.phoneCode || '+91', selectedOrder.shippingAddress?.alternatePhone || selectedOrder.alternatePhone].filter(Boolean).join(' ')}
                                            </p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-slate-500">Street</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.shippingAddress?.street || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">City</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.shippingAddress?.city || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Traffic Source</p>
                                        {(() => {
                                            const trafficSource = getOrderTrafficSourceDisplay(selectedOrder);
                                            return (
                                                <div>
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${trafficSource.className}`}>
                                                        {trafficSource.label}
                                                    </span>
                                                    {trafficSource.detail ? (
                                                        <p className="mt-1 text-xs text-slate-600">{trafficSource.detail}</p>
                                                    ) : null}
                                                    {trafficSource.title ? (
                                                        <p className="mt-1 whitespace-pre-line text-[11px] text-slate-400">{trafficSource.title}</p>
                                                    ) : null}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    {selectedOrder.shippingAddress?.district && selectedOrder.shippingAddress.district.trim() !== '' && (
                                        <div>
                                            <p className="text-slate-500">District</p>
                                            <p className="font-medium text-slate-900">{selectedOrder.shippingAddress.district}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-slate-500">State</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.shippingAddress?.state || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Pincode</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.shippingAddress?.zip || selectedOrder.shippingAddress?.pincode || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Country</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.shippingAddress?.country || '—'}</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={openCommunicationHistory}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        <History size={14} />
                                        History
                                    </button>
                                </div>
                            </div>

                            {/* Products */}
                            <div>
                                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-green-600 rounded-full"></div>
                                    Order Items
                                </h3>
                                <div className="space-y-3">
                                    {(() => {
                                        const displayItems = getStoreOrderDisplayItems(selectedOrder);
                                        if (!displayItems.length) {
                                            return (
                                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                                    No products were found on this order.
                                                </div>
                                            );
                                        }

                                        return displayItems.map((item, i) => {
                                        const itemName = item.name || item.productId?.name || item.product?.name || 'Product';
                                        const itemImage = item.image || item.productId?.images?.[0] || item.product?.images?.[0] || null;
                                        const unitPrice = Number(item.price || 0);
                                        const packQuantity = Number(item.packQuantity || 1);
                                        const bundleUnits = Number(item.bundleUnits || 0);
                                        const quantity = Number(item.quantity || 1);
                                        const lineTotal = Number(item.lineTotal ?? unitPrice * packQuantity);

                                        return (
                                        <div key={i} className="flex items-center gap-4 border border-slate-200 rounded-xl p-3 bg-white hover:shadow-md transition-shadow">
                                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                                                {itemImage ? (
                                                    <img
                                                        src={itemImage}
                                                        alt={itemName}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="px-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                                        No image
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-slate-900">{itemName}</p>
                                                {!item.productId && !item.product?.name && item.name ? (
                                                    <p className="text-xs text-orange-600">Imported item (not linked to catalog)</p>
                                                ) : null}
                                                <p className="text-sm text-slate-600">
                                                    {item.quantityLabel
                                                        || (item.isBulkBundle
                                                            ? `Bundle of ${bundleUnits || quantity} (${packQuantity} pack${packQuantity > 1 ? 's' : ''})`
                                                            : `Quantity: ${quantity}`)}
                                                </p>
                                                {item.variantLabel && !item.isBulkBundle && !item.isMatrixLine ? (
                                                    <p className="text-xs text-slate-500">{item.variantLabel}</p>
                                                ) : null}
                                                <p className="text-sm font-semibold text-slate-900">
                                                    {currency}{unitPrice.toFixed(2)} {(item.isBulkBundle || item.isMatrixLine) ? 'per pack' : 'each'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-slate-900">{currency}{lineTotal.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    )});
                                    })()}
                                </div>
                            </div>

                            {/* Payment & Status */}
                            <div className="bg-slate-50 rounded-xl p-5">
                                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-purple-600 rounded-full"></div>
                                    Payment & Status
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-4">
                                    {(() => {
                                        const orderTotal = Number(selectedOrder.total || 0);
                                        const shippingFee = Number(
                                            selectedOrder.shippingFee
                                            ?? selectedOrder.shipping
                                            ?? 0,
                                        );
                                        const hasShippingCharge = shippingFee > 0;
                                        const itemsSubtotal = Math.max(0, orderTotal - (hasShippingCharge ? shippingFee : 0));

                                        return (
                                            <>
                                                {hasShippingCharge ? (
                                                    <>
                                                        <div>
                                                            <p className="text-slate-500">Items subtotal</p>
                                                            <p className="text-lg font-semibold text-slate-900">
                                                                {currency}{itemsSubtotal.toFixed(2)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-slate-500">Shipping charge</p>
                                                            <p className="text-lg font-semibold text-slate-900">
                                                                {currency}{shippingFee.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    </>
                                                ) : null}
                                                <div>
                                                    <p className="text-slate-500">Total Amount</p>
                                                    <p className="text-xl font-bold text-slate-900">
                                                        {currency}{orderTotal.toFixed(2)}
                                                    </p>
                                                    {hasShippingCharge ? (
                                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                                            Includes {currency}{shippingFee.toFixed(2)} shipping
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </>
                                        );
                                    })()}
                                    <div>
                                        <p className="text-slate-500">Payment Method</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.paymentMethod}</p>
                                    </div>
                                    {manualOrderReference ? (
                                        <div className="md:col-span-2">
                                            <p className="text-slate-500">{orderPaymentReferenceLabel(selectedOrder.paymentMethod)}</p>
                                            <p className="font-mono text-xs font-medium text-slate-900 break-all">
                                                {manualOrderReference}
                                            </p>
                                        </div>
                                    ) : null}
                                    <div>
                                        <p className="text-slate-500">Payment Status</p>
                                        <p className="font-medium text-slate-900">{getPaymentStatus(selectedOrder) ? "✓ Paid" : "Pending"}</p>
                                    </div>
                                    
                                    {/* Delhivery Payment Collection Info */}
                                    {selectedOrder.delhivery?.payment && (
                                        <>
                                            {selectedOrder.delhivery.payment.is_cod_recovered && (
                                                <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                                    <p className="text-sm text-green-700 font-medium">✓ Payment Collected by Delhivery</p>
                                                    {selectedOrder.delhivery.payment.cod_amount > 0 && (
                                                        <p className="text-sm text-green-600 mt-1">
                                                            Amount: AED{selectedOrder.delhivery.payment.cod_amount}
                                                        </p>
                                                    )}
                                                    {selectedOrder.delhivery.payment.payment_collected_at && (
                                                        <p className="text-xs text-green-500 mt-1">
                                                            Collected: {new Date(selectedOrder.delhivery.payment.payment_collected_at).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                    
                                    {/* Razorpay Payment Settlement Info */}
                                    {selectedOrder.razorpayPaymentId && (
                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                            <p className="text-sm text-blue-700 font-medium">💳 Card Payment (Razorpay)</p>
                                            <p className="text-xs text-blue-600 mt-1">Payment ID: {selectedOrder.razorpayPaymentId.slice(-8)}</p>
                                            {selectedOrder.razorpaySettlement?.is_transferred && (
                                                <p className="text-xs text-green-600 mt-1">✓ Transferred to Bank Account</p>
                                            )}
                                            {!selectedOrder.razorpaySettlement?.is_transferred && (
                                                <p className="text-xs text-amber-600 mt-1">⏳ Pending transfer to bank</p>
                                            )}
                                            <button
                                                onClick={() => checkRazorpaySettlement(selectedOrder)}
                                                className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition"
                                            >
                                                Check Settlement Status
                                            </button>
                                        </div>
                                    )}
                                    
                                    {getOrderDiscountLines(selectedOrder, currency).length > 0 && (
                                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                                            <p className="text-sm font-semibold text-green-800">Discounts applied</p>
                                            <ul className="mt-2 space-y-1 text-sm text-green-900">
                                                {getOrderDiscountLines(selectedOrder, currency).map((line) => (
                                                    <li key={line.label}>
                                                        <span className="font-medium">{line.label}:</span> {line.detail}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {isDashboardConvertedOrder(selectedOrder) ? (
                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                            <p className="text-sm font-semibold text-emerald-800">Converted from abandoned checkout</p>
                                            {selectedOrder.conversion.convertedByName ? (
                                                <p className="mt-1 text-sm text-emerald-900">
                                                    Converted by {selectedOrder.conversion.convertedByName}
                                                </p>
                                            ) : (
                                                <p className="mt-1 text-sm text-emerald-900">
                                                    Linked to abandoned checkout
                                                    {selectedOrder.conversion.cartId ? ` #${String(selectedOrder.conversion.cartId).slice(-6)}` : ''}
                                                </p>
                                            )}
                                            {selectedOrder.conversion.convertedAt ? (
                                                <p className="mt-1 text-xs text-emerald-700">
                                                    {new Date(selectedOrder.conversion.convertedAt).toLocaleString()}
                                                </p>
                                            ) : null}
                                            {formatConversionDiscount(selectedOrder.conversion, currency)
                                              && !(Number(selectedOrder?.manualDiscount?.amount) > 0) ? (
                                                <p className="mt-1 text-sm text-emerald-900">
                                                    Customer discount (abandoned cart): {formatConversionDiscount(selectedOrder.conversion, currency)}
                                                </p>
                                            ) : null}
                                            {getConversionPaymentLabel(selectedOrder.conversion) ? (
                                                <p className="mt-1 text-sm text-emerald-900">
                                                    Payment: {getConversionPaymentLabel(selectedOrder.conversion)}
                                                </p>
                                            ) : null}
                                            {selectedOrder.conversion.originalTotal != null && selectedOrder.conversion.finalTotal != null ? (
                                                <p className="mt-1 text-sm text-emerald-900">
                                                    Cart {currency}{Number(selectedOrder.conversion.originalTotal).toFixed(2)} → {currency}{Number(selectedOrder.conversion.finalTotal).toFixed(2)}
                                                </p>
                                            ) : null}
                                            {selectedOrder.conversion.note ? (
                                                <p className="mt-2 text-xs text-emerald-700">{selectedOrder.conversion.note}</p>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {getOrderExpectedDeliveryDate(selectedOrder) ? (
                                        <div className={`rounded-lg border p-3 ${
                                            getDeliveryBucket(selectedOrder) === 'delayed'
                                                ? 'border-amber-200 bg-amber-50'
                                                : getDeliveryBucket(selectedOrder) === 'today'
                                                    ? 'border-sky-200 bg-sky-50'
                                                    : 'border-indigo-200 bg-indigo-50'
                                        }`}>
                                            <p className="text-sm font-semibold text-slate-800">Expected delivery</p>
                                            <p className="mt-1 text-sm font-medium text-slate-900">
                                                {getOrderExpectedDeliveryDate(selectedOrder).toLocaleString()}
                                            </p>
                                            {getDeliveryBucket(selectedOrder) === 'delayed' ? (
                                                <p className="mt-1 text-xs font-semibold text-amber-700">This delivery is delayed</p>
                                            ) : null}
                                            {getDeliveryBucket(selectedOrder) === 'today' ? (
                                                <p className="mt-1 text-xs font-semibold text-sky-700">Scheduled for today</p>
                                            ) : null}
                                            {getDeliveryBucket(selectedOrder) === 'tomorrow' ? (
                                                <p className="mt-1 text-xs font-semibold text-indigo-700">Scheduled for tomorrow</p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div>
                                        <p className="text-slate-500">Order Date</p>
                                        <p className="font-medium text-slate-900">{formatStoreOrderDateTime(selectedOrder.createdAt)}</p>
                                    </div>
                                </div>

                                {/* Order Status Selector */}
                                <div className="border-t border-slate-200 pt-4">
                                    <label className="mb-2 block text-sm font-semibold text-slate-600">Update order status</label>
                                    <OrderStatusPicker
                                        value={selectedOrder.status}
                                        packed={selectedOrder?.warehousePacking?.packed === true}
                                        className="max-w-md"
                                        onChange={async (newStatus) => {
                                            try {
                                                const token = await getToken(true);
                                                if (!token) {
                                                    toast.error('Authentication failed. Please sign in again.');
                                                    return;
                                                }
                                                await axios.post('/api/store/orders/update-status', {
                                                    orderId: selectedOrder._id,
                                                    status: newStatus,
                                                }, {
                                                    headers: { Authorization: `Bearer ${token}` },
                                                });
                                                toast.success('Order status updated!');
                                                setSelectedOrder({ ...selectedOrder, status: newStatus });
                                                fetchOrders();
                                            } catch (error) {
                                                console.error('Update status error:', error);
                                                toast.error(error?.response?.data?.error || 'Failed to update status');
                                            }
                                        }}
                                    />
                                    {isPaymentFailedStoreOrder(selectedOrder) ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={recheckingPaymentOrderId === String(selectedOrder._id)}
                                                onClick={() => recheckFailedOrderPayment(selectedOrder)}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <RefreshCw
                                                    size={14}
                                                    className={recheckingPaymentOrderId === String(selectedOrder._id) ? 'animate-spin' : ''}
                                                />
                                                {recheckingPaymentOrderId === String(selectedOrder._id)
                                                    ? 'Checking payment…'
                                                    : 'Recheck payment'}
                                            </button>
                                            {!hasPaymentFailedFollowUp(selectedOrder) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setPaymentFailedCallOrder(selectedOrder)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                                                >
                                                    <Phone size={14} />
                                                    Call customer
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={async () => {
                                        const confirmed = await askCenterConfirm({
                                            title: 'Move order to trash?',
                                            message: 'This order will move to Trash. You can restore it later.',
                                            confirmLabel: 'Move to Trash',
                                            cancelLabel: 'Keep Order',
                                            tone: 'red',
                                            icon: 'trash',
                                        });
                                        if (!confirmed) return;
                                        try {
                                            const token = await getToken();
                                            await axios.delete(`/api/store/orders/${selectedOrder._id}`, {
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            toast.success('Order moved to trash');
                                            setIsModalOpen(false);
                                            fetchOrders();
                                        } catch (error) {
                                            toast.error(error?.response?.data?.error || 'Failed to move order to trash');
                                        }
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors shadow backdrop-blur-sm"
                                    title="Move to Trash"
                                >
                                    <Trash2 size={18} />
                                    <span className="text-sm">Move to Trash</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );})()}

            {showCommunicationHistory ? (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setShowCommunicationHistory(false)}
                >
                    <div
                        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Communication history</h3>
                                <p className="text-xs text-slate-500">
                                    Emails and WhatsApp messages sent to this customer
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCommunicationHistory(false)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                                aria-label="Close history"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {loadingCommunicationHistory ? (
                                <p className="text-sm text-slate-500">Loading history...</p>
                            ) : communicationHistory.length === 0 ? (
                                <p className="text-sm text-slate-500">No messages recorded for this order yet.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {communicationHistory.map((entry, index) => {
                                        const channel = String(entry.channel || 'system').toLowerCase();
                                        const channelClass = channel === 'whatsapp'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : channel === 'email'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-slate-100 text-slate-700';
                                        const status = String(entry.status || 'sent').toLowerCase();
                                        const statusClass = status === 'failed'
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-green-100 text-green-700';

                                        return (
                                            <li
                                                key={`${entry.template || 'item'}-${entry.sentAt || index}-${index}`}
                                                className="rounded-lg border border-slate-200 p-3"
                                            >
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${channelClass}`}>
                                                        {channel}
                                                    </span>
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass}`}>
                                                        {status}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-slate-900">{entry.label}</p>
                                                {entry.recipient ? (
                                                    <p className="mt-1 text-xs text-slate-600">
                                                        To: <span className="font-medium">{entry.recipient}</span>
                                                    </p>
                                                ) : null}
                                                <p className="mt-1 text-xs text-slate-500">
                                                    By: {entry.sentByName || 'System'}
                                                    {entry.sentAt ? ` · ${formatStoreOrderDateTime(entry.sentAt)}` : ''}
                                                </p>
                                                {entry.details ? (
                                                    <p className="mt-2 text-xs text-red-600">{entry.details}</p>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {returnActionType ? (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    onClick={() => {
                        if (submittingReturnAction) return;
                        setReturnActionType(null);
                        setReturnActionReason('');
                    }}
                >
                    <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-2xl font-bold text-slate-900">
                            {returnActionType === 'REPLACEMENT' ? 'Start replacement' : 'Return this order'}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                            {returnActionType === 'REPLACEMENT'
                                ? 'This marks the delivered order for replacement and emails the customer.'
                                : 'This marks the delivered order as a return and emails the customer.'}
                        </p>
                        <label className="mt-5 block text-sm font-semibold text-slate-700">
                            Reason <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <textarea
                            value={returnActionReason}
                            onChange={(e) => setReturnActionReason(e.target.value)}
                            rows={4}
                            placeholder={returnActionType === 'REPLACEMENT'
                                ? 'Example: Customer received the wrong size. Sending a replacement.'
                                : 'Example: Customer requested a return after delivery.'}
                            className="mt-2 w-full resize-none rounded-xl border-2 border-slate-300 px-4 py-3 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500"
                        />
                        <div className="mt-6 flex gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setReturnActionType(null);
                                    setReturnActionReason('');
                                }}
                                disabled={submittingReturnAction}
                                className="flex-1 rounded-xl bg-slate-200 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={startStoreReturnAction}
                                disabled={submittingReturnAction}
                                className={`flex-1 rounded-xl px-6 py-3 font-semibold text-white disabled:opacity-60 ${
                                    returnActionType === 'REPLACEMENT'
                                        ? 'bg-sky-600 hover:bg-sky-700'
                                        : 'bg-pink-600 hover:bg-pink-700'
                                }`}
                            >
                                {submittingReturnAction
                                    ? 'Saving…'
                                    : (returnActionType === 'REPLACEMENT' ? 'Confirm replacement' : 'Confirm return')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showRejectModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                    setRejectingReturnIndex(null);
                }}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 transform transition-all" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900">Reject Request</h3>
                                <p className="text-sm text-slate-500">Provide a clear reason for the customer</p>
                            </div>
                        </div>
                        
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-slate-700 mb-3">
                                Rejection Reason <span className="text-red-600">*</span>
                            </label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Example: Product shows no defects upon inspection. Please contact support if you believe this is an error."
                                rows="5"
                                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none text-sm"
                            />
                            <p className="text-xs text-slate-500 mt-2">This message will be visible to the customer in their order dashboard</p>
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowRejectModal(false);
                                    setRejectReason('');
                                    setRejectingReturnIndex(null);
                                }}
                                className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!rejectReason.trim()) {
                                        toast.error('Please provide a rejection reason');
                                        return;
                                    }
                                    try {
                                        const token = await getToken(true);
                                        await axios.post('/api/store/return-requests', {
                                            orderId: selectedOrder._id,
                                            returnIndex: rejectingReturnIndex,
                                            action: 'REJECT',
                                            rejectionReason: rejectReason.trim()
                                        }, {
                                            headers: { Authorization: `Bearer ${token}` }
                                        });
                                        toast.success('Return request rejected successfully');
                                        setShowRejectModal(false);
                                        setRejectReason('');
                                        setRejectingReturnIndex(null);
                                        fetchOrders();
                                        closeModal();
                                    } catch (error) {
                                        toast.error(error?.response?.data?.error || 'Failed to reject request');
                                    }
                                }}
                                disabled={!rejectReason.trim()}
                                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-600/30"
                            >
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <StoreCreateOrderModal
                open={showCreateOrderModal}
                onClose={() => setShowCreateOrderModal(false)}
                getToken={getToken}
                currency={currency}
                onCreated={() => {
                    setCurrentPage(1);
                    setFilterStatus('ALL');
                    setDatePreset('ALL');
                    setFromDate('');
                    setToDate('');
                    setFromTime(DEFAULT_ORDER_FILTER_TIME);
                    setToTime(DEFAULT_ORDER_FILTER_TIME);
                    setOrderSearchQuery('');
                    fetchOrders();
                }}
            />

            <PaymentFailedCallCustomerModal
                open={Boolean(paymentFailedCallOrder)}
                order={paymentFailedCallOrder}
                currency={currency}
                saving={savingPaymentFailedFollowUp}
                onClose={() => {
                    if (!savingPaymentFailedFollowUp) setPaymentFailedCallOrder(null);
                }}
                onSave={savePaymentFailedFollowUp}
            />

            <StoreCenterPopupShell
                open={Boolean(centerConfirm)}
                zIndex={120}
                onBackdropClick={() => closeCenterConfirm(false)}
                labelledBy="store-orders-center-confirm-title"
            >
                {centerConfirm ? (
                    <>
                        <div className="absolute -left-10 -top-14 h-40 w-40 bg-violet-400/15 blur-3xl" />
                        <div className="absolute -right-8 -bottom-12 h-36 w-36 bg-blue-300/15 blur-3xl" />
                        <div className="relative p-6">
                            <motion.div
                                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                                    centerConfirm.tone === 'red'
                                        ? 'bg-red-50 text-red-600'
                                        : 'bg-violet-50 text-violet-700'
                                }`}
                                initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.05 }}
                            >
                                {centerConfirm.icon === 'trash' ? (
                                    <Trash2 size={22} />
                                ) : centerConfirm.icon === 'calendar' ? (
                                    <CalendarClock size={22} />
                                ) : centerConfirm.icon === 'alert' ? (
                                    <AlertTriangle size={22} />
                                ) : (
                                    <Truck size={22} />
                                )}
                            </motion.div>
                            <motion.h3
                                id="store-orders-center-confirm-title"
                                className="text-center text-lg font-semibold text-slate-900"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.08, duration: 0.28, ease: CENTER_POPUP_EASE }}
                            >
                                {centerConfirm.title}
                            </motion.h3>
                            <motion.p
                                className="mt-2 whitespace-pre-line text-center text-sm leading-relaxed text-slate-600"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.12, duration: 0.28, ease: CENTER_POPUP_EASE }}
                            >
                                {centerConfirm.message}
                            </motion.p>
                            <motion.div
                                className="mt-5 grid grid-cols-2 gap-3"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.16, duration: 0.28, ease: CENTER_POPUP_EASE }}
                            >
                                <button
                                    type="button"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                                    onClick={() => closeCenterConfirm(false)}
                                >
                                    {centerConfirm.cancelLabel || 'Cancel'}
                                </button>
                                <button
                                    type="button"
                                    className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-105 active:scale-[0.98] ${
                                        centerConfirm.tone === 'red'
                                            ? 'bg-red-600 shadow-red-200/50'
                                            : 'bg-violet-700 shadow-violet-200/50'
                                    }`}
                                    onClick={() => closeCenterConfirm(true)}
                                >
                                    {centerConfirm.confirmLabel || 'OK'}
                                </button>
                            </motion.div>
                        </div>
                    </>
                ) : null}
            </StoreCenterPopupShell>

            <StoreCenterPopupShell
                open={Boolean(centerProgress)}
                zIndex={125}
                maxWidthClass="max-w-sm"
                dismissible={false}
                role="status"
            >
                {centerProgress ? (
                    <div className="relative p-6">
                        <motion.div
                            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700"
                            animate={{ scale: [1, 1.08, 1] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <RefreshCw size={22} className="animate-spin" />
                        </motion.div>
                        <h3 className="text-center text-lg font-semibold text-slate-900">
                            {centerProgress.title}
                        </h3>
                        <p className="mt-2 whitespace-pre-line text-center text-sm leading-relaxed text-slate-600">
                            {centerProgress.message}
                        </p>
                        <motion.div
                            className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <motion.div
                                className="h-full w-1/2 rounded-full bg-violet-600"
                                animate={{ x: ['-100%', '200%'] }}
                                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </motion.div>
                    </div>
                ) : null}
            </StoreCenterPopupShell>

            <StoreCenterPopupShell
                open={Boolean(centerNotice)}
                zIndex={130}
                onBackdropClick={() => closeCenterNotice('secondary')}
                labelledBy="store-orders-center-notice-title"
            >
                {centerNotice ? (
                    <>
                        <div className="absolute -left-10 -top-14 h-40 w-40 bg-emerald-400/15 blur-3xl" />
                        <div className="absolute -right-8 -bottom-12 h-36 w-36 bg-violet-300/15 blur-3xl" />
                        <div className="relative p-6">
                            <motion.div
                                className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                                    centerNotice.tone === 'error'
                                        ? 'bg-red-50 text-red-600'
                                        : centerNotice.tone === 'warning'
                                            ? 'bg-amber-50 text-amber-700'
                                            : 'bg-emerald-50 text-emerald-700'
                                }`}
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 460, damping: 16, delay: 0.04 }}
                            >
                                {centerNotice.tone === 'error' || centerNotice.icon === 'alert' ? (
                                    <AlertTriangle size={22} />
                                ) : centerNotice.icon === 'calendar' ? (
                                    <CalendarClock size={22} />
                                ) : (
                                    <CheckCircle2 size={22} />
                                )}
                            </motion.div>
                            <motion.h3
                                id="store-orders-center-notice-title"
                                className="text-center text-lg font-semibold text-slate-900"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.08, duration: 0.28, ease: CENTER_POPUP_EASE }}
                            >
                                {centerNotice.title}
                            </motion.h3>
                            <motion.p
                                className="mt-2 whitespace-pre-line text-center text-sm leading-relaxed text-slate-600"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.12, duration: 0.28, ease: CENTER_POPUP_EASE }}
                            >
                                {centerNotice.message}
                            </motion.p>
                            <motion.div
                                className={`mt-5 grid gap-3 ${centerNotice.secondaryLabel ? 'grid-cols-2' : 'grid-cols-1'}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.16, duration: 0.28, ease: CENTER_POPUP_EASE }}
                            >
                                {centerNotice.secondaryLabel ? (
                                    <button
                                        type="button"
                                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                                        onClick={() => closeCenterNotice('secondary')}
                                    >
                                        {centerNotice.secondaryLabel}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className={`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-105 active:scale-[0.98] ${
                                        centerNotice.tone === 'error'
                                            ? 'bg-red-600 shadow-red-200/50'
                                            : centerNotice.tone === 'warning'
                                                ? 'bg-amber-600 shadow-amber-200/50'
                                                : 'bg-violet-700 shadow-violet-200/50'
                                    }`}
                                    onClick={() => closeCenterNotice('primary')}
                                >
                                    {centerNotice.primaryLabel || 'OK'}
                                </button>
                            </motion.div>
                        </div>
                    </>
                ) : null}
            </StoreCenterPopupShell>
        </>
    );
}
