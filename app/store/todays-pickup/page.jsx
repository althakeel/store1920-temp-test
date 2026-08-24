'use client';

import { useAuth } from '@/lib/useAuth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Loading from '@/components/Loading';
import { CalendarClock, RefreshCw, AlertTriangle, Package } from 'lucide-react';
import { getStoreOrderStatusMeta } from '@/components/store/OrderStatusPicker';

const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED';

export default function TodaysPickupPage() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [todayKey, setTodayKey] = useState('');
  const [orders, setOrders] = useState([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [filter, setFilter] = useState('all'); // 'all' | 'under24' | 'overdue'
  const requestIdRef = useRef(0);

  const fetchLists = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      const token = await getToken(true);
      if (requestId !== requestIdRef.current) return;
      if (!token) {
        toast.error('Authentication failed. Please sign in again.');
        return;
      }

      const { data } = await axios.get('/api/store/pickups', {
        headers: { Authorization: `Bearer ${token}` },
        params: { view: 'all', limit: 300 },
      });

      if (requestId !== requestIdRef.current) return;

      setTodayKey(data?.todayKey || '');
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setOverdueCount(Number(data?.overdueCount || 0));
      setTodayCount(Number(data?.todayCount || 0));
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error('[todays-pickup]', error);
      toast.error(error?.response?.data?.error || 'Failed to load pickup list');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [getToken]);

  useEffect(() => {
    void fetchLists();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchLists]);

  const under24Count = useMemo(
    () => orders.filter((order) => !order.overdue).length,
    [orders],
  );

  const visibleOrders = useMemo(() => {
    let list = orders;
    if (filter === 'overdue') list = orders.filter((order) => order.overdue);
    else if (filter === 'under24') list = orders.filter((order) => !order.overdue);

    return [...list].sort((a, b) => {
      if (Boolean(a.overdue) !== Boolean(b.overdue)) return a.overdue ? -1 : 1;
      return Number(b.hoursWaiting || 0) - Number(a.hoursWaiting || 0);
    });
  }, [orders, filter]);

  if (loading) return <Loading />;

  return (
    <div className="text-slate-700" lang="en" dir="ltr">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pickup list</h1>
          <p className="mt-1 text-sm text-slate-500">
            All orders with <strong>Pickup Requested</strong> that are not collected yet.
            Packed / Awaiting Pickup orders are hidden.
            {todayKey ? ` Today (${todayKey}): ${todayCount}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              All ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('under24')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                filter === 'under24'
                  ? 'bg-sky-600 text-white'
                  : 'text-sky-800 hover:bg-sky-50'
              }`}
              title="Show pickups waiting less than 24 hours"
            >
              Under 24h ({under24Count})
            </button>
            <button
              type="button"
              onClick={() => setFilter('overdue')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                filter === 'overdue'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-800 hover:bg-amber-50'
              }`}
              title="Show only pickups waiting 24+ hours"
            >
              24+ ({overdueCount})
            </button>
          </div>
          <button
            type="button"
            onClick={() => fetchLists()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {overdueCount > 0 && filter === 'all' ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {overdueCount} order(s) have pickup requested for 24+ hours and are still waiting.
            </p>
            <p className="text-xs text-amber-800">
              Click <strong>24+</strong> to show only those orders. Admin is emailed hourly for newly overdue pickups.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFilter('overdue')}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Show 24+
          </button>
        </div>
      ) : null}

      {filter === 'overdue' ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Showing only 24+ hour overdue pickups</p>
          </div>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Show all
          </button>
        </div>
      ) : null}

      {filter === 'under24' ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <CalendarClock size={18} className="shrink-0 text-sky-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Showing pickups waiting under 24 hours</p>
          </div>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            Show all
          </button>
        </div>
      ) : null}

      {!visibleOrders.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
          <CalendarClock className="mx-auto mb-3 text-slate-300" size={40} />
          <p className="text-base font-semibold text-slate-800">
            {filter === 'overdue'
              ? 'No 24+ overdue pickups'
              : filter === 'under24'
                ? 'No under-24h pickups'
                : 'No pickups waiting'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === 'overdue'
              ? 'No pickup-requested orders have been waiting longer than 24 hours.'
              : filter === 'under24'
                ? 'No pickup-requested orders are still within the first 24 hours.'
                : 'EMX shipments with Pickup Requested / Dispatch Requested on Waslah should appear here until the courier collects them. Refresh after shipping.'}
          </p>
          {filter !== 'all' ? (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Show all pickup requests
            </button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            {filter === 'overdue'
              ? `${visibleOrders.length} overdue pickup(s) (24+ hours)`
              : filter === 'under24'
                ? `${visibleOrders.length} pickup(s) under 24 hours`
                : `${visibleOrders.length} order(s) awaiting pickup`}
            {filter === 'all' && under24Count > 0 ? ` · ${under24Count} under 24h` : ''}
            {filter === 'all' && overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
            {filter === 'all' && todayCount > 0 ? ` · ${todayCount} today` : ''}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Pickup slot</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Waiting</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const statusMeta = getStoreOrderStatusMeta(order.status);
                  const isToday = Boolean(todayKey && order.pickupDate === todayKey);
                  return (
                    <tr
                      key={order._id}
                      className={`border-t border-slate-100 ${order.overdue ? 'bg-amber-50/70' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        #{order.displayOrderNumber || order.shortOrderNumber || '—'}
                        {order.trackingId ? (
                          <p className="mt-0.5 text-[11px] font-normal text-slate-500">
                            AWB {order.trackingId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{order.customerName || '—'}</td>
                      <td className="px-4 py-3">
                        <p>{order.pickupDate || '—'}</p>
                        <p className="text-xs text-slate-500">
                          {[order.pickupTime, order.pickupVehicle].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {isToday ? (
                          <span className="mt-1 inline-flex rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                            Today
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                        {order.overdue ? (
                          <p className="mt-1 text-[11px] font-semibold text-amber-700">Overdue 24h+</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {order.hoursWaiting != null ? `${order.hoursWaiting}h` : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {currency}{Number(order.total || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/store/orders?q=${encodeURIComponent(order.displayOrderNumber || order.shortOrderNumber || order._id)}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                        >
                          <Package size={14} />
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
