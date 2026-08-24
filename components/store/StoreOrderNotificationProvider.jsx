'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import StoreNavLink from '@/components/store/StoreNavLink';
import { usePathname } from 'next/navigation';
import { Package, Truck, X } from 'lucide-react';
import { canAccessDashboardArea } from '@/lib/storeDashboardPermissions';
import {
  dispatchStoreNewOrderEvent,
  getNotifiedOrderIds,
  getOrderNotificationCheckpoint,
  isOrderNotificationsSuppressed,
  rememberNotifiedOrderIds,
  setOrderNotificationCheckpoint,
  setOrderNotificationsSuppressed,
  STORE_ORDER_TOAST_ID,
  STORE_ORDERS_IMPORT_END_EVENT,
  STORE_ORDERS_IMPORT_START_EVENT,
} from '@/lib/storeOrderNotifications';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';

const ALERT_SOUND_SRC = '/sound/alert.mp3';
const BATCH_TOAST_THRESHOLD = 2;
let alertAudio = null;

function preloadStoreAlertSound() {
  if (typeof window === 'undefined') return;
  if (!alertAudio) {
    alertAudio = new Audio(ALERT_SOUND_SRC);
    alertAudio.preload = 'auto';
  }
}

function playStoreAlertSound() {
  if (typeof window === 'undefined') return;
  if (!alertAudio) {
    alertAudio = new Audio(ALERT_SOUND_SRC);
    alertAudio.preload = 'auto';
  }
  alertAudio.currentTime = 0;
  void alertAudio.play().catch(() => {});
}

function dismissOrderToasts() {
  toast.dismiss(STORE_ORDER_TOAST_ID);
}

const StoreOrderNotificationContext = createContext({
  unreadCount: 0,
  recentOrders: [],
  canViewOrders: false,
  overduePickupCount: 0,
  markAllRead: () => {},
  refreshNotifications: () => {},
});

export function useStoreOrderNotifications() {
  return useContext(StoreOrderNotificationContext);
}

function formatOrderLabel(order) {
  const orderNumber = getDisplayOrderNumber(order);
  const label = orderNumber ? `#${orderNumber}` : '#Pending';
  const total = Number(order.total || 0).toLocaleString();
  return `${label} · AED ${total}`;
}

const TOAST_THEMES = {
  order: {
    shell: 'border-slate-200/90 bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]',
    accent: 'bg-emerald-500',
    iconWrap: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    title: 'text-slate-900',
    link: 'bg-emerald-600 text-white hover:bg-emerald-700',
  },
  pickup: {
    shell: 'border-slate-200/90 bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]',
    accent: 'bg-amber-500',
    iconWrap: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
    title: 'text-slate-900',
    link: 'bg-amber-600 text-white hover:bg-amber-700',
  },
};

function DashboardToastShell({
  toastInstance,
  theme = 'order',
  icon,
  eyebrow,
  title,
  children,
  actionHref,
  actionLabel,
  onDismissAll = false,
}) {
  const styles = TOAST_THEMES[theme] || TOAST_THEMES.order;
  const dismiss = () => {
    if (onDismissAll) {
      dismissOrderToasts();
      return;
    }
    toast.dismiss(toastInstance.id);
  };

  // Keep this as the direct toaster child (no full-width wrapper).
  // react-hot-toast slots are left:0/right:0; a w-full wrapper blocks the page.
  return (
    <div
      className={`${
        toastInstance.visible ? 'animate-enter' : 'animate-leave'
      } pointer-events-auto w-[min(100vw-1.5rem,22.5rem)] overflow-hidden rounded-2xl border ${styles.shell}`}
      role="status"
      aria-live="polite"
      lang="en"
      dir="ltr"
    >
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${styles.accent}`} aria-hidden />
        <div className="min-w-0 flex-1 p-3.5 pe-3">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}>
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              {eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {eyebrow}
                </p>
              ) : null}
              <p className={`text-sm font-semibold tracking-tight ${styles.title}`}>{title}</p>
              <div className="mt-1.5 space-y-0.5">{children}</div>
              {actionHref && actionLabel ? (
                <StoreNavLink
                  href={actionHref}
                  onClick={dismiss}
                  className={`mt-3 inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${styles.link}`}
                >
                  {actionLabel}
                </StoreNavLink>
              ) : null}
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={onDismissAll ? 'Dismiss all order alerts' : 'Dismiss notification'}
            >
              <X size={14} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function showNewOrderToast(order) {
  toast.custom((toastInstance) => (
    <DashboardToastShell
      toastInstance={toastInstance}
      theme="order"
      icon={<Package size={16} strokeWidth={2.25} />}
      eyebrow="Live order"
      title="New confirmed order"
      actionHref="/store/orders"
      actionLabel="View order"
    >
      <p className="text-sm font-medium text-slate-800">{formatOrderLabel(order)}</p>
      <p className="text-xs text-slate-500">
        {order.customerName || 'Customer'}
        {order.itemCount ? ` · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'}` : ''}
      </p>
    </DashboardToastShell>
  ), {
    id: STORE_ORDER_TOAST_ID,
    duration: 8000,
    position: 'top-right',
  });
}

function showBatchOrderToast(orders) {
  const preview = orders.slice(0, 3).map(formatOrderLabel).join(', ');
  const extra = orders.length > 3 ? ` +${orders.length - 3} more` : '';

  toast.custom((toastInstance) => (
    <DashboardToastShell
      toastInstance={toastInstance}
      theme="order"
      icon={<Package size={16} strokeWidth={2.25} />}
      eyebrow="Live orders"
      title={`${orders.length} new confirmed orders`}
      actionHref="/store/orders"
      actionLabel="View orders"
      onDismissAll
    >
      <p className="text-sm font-medium text-slate-800">
        {preview}
        {extra}
      </p>
      <p className="text-xs text-slate-500">Grouped into one alert.</p>
    </DashboardToastShell>
  ), {
    id: STORE_ORDER_TOAST_ID,
    duration: 10000,
    position: 'top-right',
  });
}

function showPickupOverdueToast(count) {
  toast.custom((toastInstance) => (
    <DashboardToastShell
      toastInstance={toastInstance}
      theme="pickup"
      icon={<Truck size={16} strokeWidth={2.25} />}
      eyebrow="Courier pickup"
      title="Pickup waiting 24h+"
      actionHref="/store/todays-pickup"
      actionLabel="Open pickup list"
    >
      <p className="text-sm font-medium text-slate-800">
        {count} order{count === 1 ? '' : 's'} still awaiting courier pickup.
      </p>
      <p className="text-xs text-slate-500">Check labels and EMX pickup status.</p>
    </DashboardToastShell>
  ), {
    id: 'store-pickup-overdue',
    duration: 10000,
    position: 'top-right',
  });
}

export default function StoreOrderNotificationProvider({
  children,
  getToken,
  storeId,
  isOwner = false,
  permissions = {},
}) {
  const pathname = usePathname();
  const canViewOrders = canAccessDashboardArea(permissions, 'orders', { isOwner });
  const canViewPickups = canViewOrders
    || canAccessDashboardArea(permissions, 'todaysPickup', { isOwner });
  const [recentOrders, setRecentOrders] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [overduePickupCount, setOverduePickupCount] = useState(0);
  const checkpointRef = useRef('');
  const pollingRef = useRef(null);
  const suppressRef = useRef(false);
  const lastOverdueToastAtRef = useRef(0);

  const markAllRead = useCallback(() => {
    if (!storeId) return;
    const now = new Date().toISOString();
    checkpointRef.current = now;
    setOrderNotificationCheckpoint(storeId, now);
    setUnreadCount(0);
    setRecentOrders([]);
    dismissOrderToasts();
  }, [storeId]);

  const handleNewOrders = useCallback((orders = [], options = {}) => {
    if (!storeId || !orders.length) return;

    const seen = getNotifiedOrderIds(storeId);
    const freshOrders = orders.filter((order) => order?.orderId && !seen.has(String(order.orderId)));
    if (!freshOrders.length) return;

    rememberNotifiedOrderIds(storeId, freshOrders.map((order) => order.orderId));

    if (suppressRef.current || isOrderNotificationsSuppressed() || options.silent) {
      return;
    }

    setRecentOrders((current) => {
      const merged = [...freshOrders, ...current];
      const unique = [];
      const ids = new Set();
      merged.forEach((order) => {
        const id = String(order.orderId);
        if (ids.has(id)) return;
        ids.add(id);
        unique.push(order);
      });
      return unique.slice(0, 10);
    });
    setUnreadCount((count) => count + freshOrders.length);

    playStoreAlertSound();

    dispatchStoreNewOrderEvent({ orders: freshOrders });

    // On the orders page, use the inline banner only — avoid a blocking toast overlay.
    if (pathname === '/store/orders') {
      return;
    }

    if (freshOrders.length >= BATCH_TOAST_THRESHOLD) {
      dismissOrderToasts();
      showBatchOrderToast(freshOrders);
    } else {
      dismissOrderToasts();
      showNewOrderToast(freshOrders[0]);
    }
  }, [storeId, pathname]);

  const refreshNotifications = useCallback(async () => {
    if ((!canViewOrders && !canViewPickups) || !storeId) return;
    if (suppressRef.current || isOrderNotificationsSuppressed()) return;

    try {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };

      if (canViewOrders) {
        if (!checkpointRef.current) {
          checkpointRef.current = getOrderNotificationCheckpoint(storeId);
        }

        const { data } = await axios.get('/api/store/orders/notifications', {
          headers,
          params: { since: checkpointRef.current },
          timeout: 15000,
        });
        handleNewOrders(Array.isArray(data?.orders) ? data.orders : []);
      }

      if (canViewPickups) {
        const overdueRes = await axios.get('/api/store/pickups', {
          headers,
          params: { view: 'overdue', limit: 50 },
          timeout: 15000,
        }).catch(() => ({ data: { count: 0 } }));

        const overdue = Number(overdueRes?.data?.count || 0);
        setOverduePickupCount(overdue);
        if (
          overdue > 0
          && pathname !== '/store/todays-pickup'
          && Date.now() - lastOverdueToastAtRef.current > 30 * 60 * 1000
        ) {
          lastOverdueToastAtRef.current = Date.now();
          // Defer toast so Toaster / layout subscribers are mounted.
          window.setTimeout(() => {
            showPickupOverdueToast(overdue);
          }, 0);
        }
      }
    } catch (error) {
      if (axios.isCancel?.(error)) return;
    }
  }, [canViewOrders, canViewPickups, storeId, getToken, handleNewOrders, pathname]);

  useEffect(() => {
    if ((!canViewOrders && !canViewPickups) || !storeId) return undefined;

    preloadStoreAlertSound();
    if (canViewOrders) {
      checkpointRef.current = getOrderNotificationCheckpoint(storeId);
    }

    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      refreshNotifications();
    };

    poll();

    pollingRef.current = window.setInterval(poll, 20000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNotifications();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [canViewOrders, canViewPickups, storeId, refreshNotifications]);

  useEffect(() => {
    if (pathname === '/store/orders') {
      markAllRead();
    }
  }, [pathname, markAllRead]);

  useEffect(() => {
    const onImportStart = () => {
      suppressRef.current = true;
      setOrderNotificationsSuppressed(true);
      dismissOrderToasts();
      markAllRead();
    };

    const onImportEnd = (event) => {
      suppressRef.current = false;
      setOrderNotificationsSuppressed(false);

      const importedCount = Number(event?.detail?.importedCount || 0);
      const orderIds = Array.isArray(event?.detail?.orderIds) ? event.detail.orderIds : [];

      if (orderIds.length) {
        rememberNotifiedOrderIds(storeId, orderIds);
      }

      markAllRead();

      if (importedCount > 0) {
        toast.success(`Imported ${importedCount} order${importedCount === 1 ? '' : 's'}`, {
          id: 'store-orders-import-summary',
        });
      }
    };

    window.addEventListener(STORE_ORDERS_IMPORT_START_EVENT, onImportStart);
    window.addEventListener(STORE_ORDERS_IMPORT_END_EVENT, onImportEnd);

    return () => {
      window.removeEventListener(STORE_ORDERS_IMPORT_START_EVENT, onImportStart);
      window.removeEventListener(STORE_ORDERS_IMPORT_END_EVENT, onImportEnd);
    };
  }, [markAllRead, storeId]);

  const value = useMemo(() => ({
    unreadCount,
    recentOrders,
    canViewOrders,
    overduePickupCount,
    markAllRead,
    refreshNotifications,
  }), [unreadCount, recentOrders, canViewOrders, overduePickupCount, markAllRead, refreshNotifications]);

  return (
    <StoreOrderNotificationContext.Provider value={value}>
      {children}
    </StoreOrderNotificationContext.Provider>
  );
}
