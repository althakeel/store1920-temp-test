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

function OrderToastShell({ toastInstance, title, children, onDismissAll = false }) {
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
      } pointer-events-auto w-[min(100vw-1.5rem,24rem)] rounded-xl border border-emerald-200 bg-white p-4 shadow-lg`}
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-700">{title}</p>
          {children}
          <StoreNavLink
            href="/store/orders"
            onClick={dismiss}
            className="mt-3 inline-flex text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            View orders →
          </StoreNavLink>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-lg leading-none text-slate-400 hover:text-slate-600"
          aria-label={onDismissAll ? 'Dismiss all order alerts' : 'Dismiss notification'}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function showNewOrderToast(order) {
  toast.custom((toastInstance) => (
    <OrderToastShell toastInstance={toastInstance} title="New confirmed order">
      <p className="mt-1 text-sm text-slate-800">{formatOrderLabel(order)}</p>
      <p className="mt-1 text-xs text-slate-500">
        {order.customerName || 'Customer'}
        {order.itemCount ? ` · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'}` : ''}
      </p>
    </OrderToastShell>
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
    <OrderToastShell
      toastInstance={toastInstance}
      title={`${orders.length} new confirmed orders`}
      onDismissAll
    >
      <p className="mt-1 text-sm text-slate-800">
        {preview}
        {extra}
      </p>
      <p className="mt-1 text-xs text-slate-500">Imported or live orders are grouped into one alert.</p>
    </OrderToastShell>
  ), {
    id: STORE_ORDER_TOAST_ID,
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
  const [recentOrders, setRecentOrders] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const checkpointRef = useRef('');
  const pollingRef = useRef(null);
  const suppressRef = useRef(false);

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
    if (!canViewOrders || !storeId) return;
    if (suppressRef.current || isOrderNotificationsSuppressed()) return;

    try {
      const token = await getToken();
      if (!token) return;

      if (!checkpointRef.current) {
        checkpointRef.current = getOrderNotificationCheckpoint(storeId);
      }

      const { data } = await axios.get('/api/store/orders/notifications', {
        headers: { Authorization: `Bearer ${token}` },
        params: { since: checkpointRef.current },
        timeout: 15000,
      });

      handleNewOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (error) {
      if (axios.isCancel?.(error)) return;
    }
  }, [canViewOrders, storeId, getToken, handleNewOrders]);

  useEffect(() => {
    if (!canViewOrders || !storeId) return undefined;

    preloadStoreAlertSound();
    checkpointRef.current = getOrderNotificationCheckpoint(storeId);

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
  }, [canViewOrders, storeId, refreshNotifications]);

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
    markAllRead,
    refreshNotifications,
  }), [unreadCount, recentOrders, canViewOrders, markAllRead, refreshNotifications]);

  return (
    <StoreOrderNotificationContext.Provider value={value}>
      {children}
    </StoreOrderNotificationContext.Provider>
  );
}
