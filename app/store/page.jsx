'use client';

import { UserPlusIcon, UploadCloudIcon, FolderTreeIcon, ShoppingBag, Package, Users, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/useAuth';
import { useStoreDashboardData } from '@/lib/useStoreDashboardData';

const StoreDashboardCharts = dynamic(() => import('@/components/store/StoreDashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="mt-6 animate-pulse rounded-2xl border border-slate-200 bg-white p-6">
      <div className="h-6 w-48 rounded bg-slate-100" />
      <div className="mt-6 h-64 rounded-xl bg-slate-50" />
    </div>
  ),
});

const StoreLiveAnalytics = dynamic(() => import('@/components/store/StoreLiveAnalytics'), { ssr: false });

const ContactMessagesSeller = dynamic(() => import('./ContactMessagesSeller.jsx'), {
  ssr: false,
  loading: () => null,
});

export default function Dashboard() {
  const { user, loading: authLoading, getToken } = useAuth();
  const currency = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED';

  const onDashboardError = useCallback((error) => {
    console.error('Dashboard fetch error:', error);
    toast.error(error?.response?.data?.error || 'Failed to load dashboard');
  }, []);

  const {
    dashboardData,
    liveData,
    initialLoading,
    silentRefreshing,
    lastUpdated,
    liveLastUpdated,
    refresh,
  } = useStoreDashboardData({ user, getToken, onError: onDashboardError });

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center text-slate-400">
        <h1 className="text-2xl font-semibold sm:text-4xl">
          Please <span className="text-slate-500">Login</span> to view your dashboard
        </h1>
      </div>
    );
  }

  return (
    <div className="mb-16 w-full max-w-none text-slate-500">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-medium text-slate-800 sm:text-xl">Seller Dashboard</h1>
            <p className="text-sm text-slate-500">Sales overview, orders, and live visitors in one place.</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {lastUpdated ? (
                <span>
                  Stats · {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
              {silentRefreshing ? (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <RefreshCw size={11} className="animate-spin" />
                  Updating…
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refresh()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw size={14} className={silentRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link
              href="/store/categories"
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-700"
            >
              <FolderTreeIcon size={15} />
              <span>Import Categories</span>
            </Link>
            <Link
              href="/store/bulk-import"
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white transition hover:bg-emerald-700"
            >
              <UploadCloudIcon size={15} />
              <span>Bulk Import</span>
            </Link>
            <Link
              href="/store/settings?tab=team"
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white transition hover:bg-blue-700"
            >
              <UserPlusIcon size={15} />
              <span>Invite Team</span>
            </Link>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Dashboard shortcuts">
          {[
            { href: '/store/orders', label: 'Orders', icon: ShoppingBag },
            { href: '/store/abandoned-checkout', label: 'Abandoned checkout', icon: Package },
            { href: '/store/manage-product', label: 'Products', icon: Package },
            { href: '/store/customer-tracking', label: 'Visitor tracking', icon: Users },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <Icon size={15} className="text-slate-500" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <StoreLiveAnalytics
        currency={currency}
        liveData={liveData}
        loading={initialLoading && !liveData}
        lastUpdated={liveLastUpdated}
      />

      <div className="mt-8">
        <StoreDashboardCharts
          data={dashboardData}
          currency={currency}
          getToken={getToken}
          loading={initialLoading}
        />
      </div>

      <div className="mt-8">
        <ContactMessagesSeller />
      </div>
    </div>
  );
}
