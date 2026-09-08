'use client';

import Link from 'next/link';
import { ArrowLeft, History, Shield } from 'lucide-react';
import StoreSettingsHistory from '@/components/store/StoreSettingsHistory';
import { useAuth } from '@/lib/useAuth';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import PageSkeleton from '@/components/PageSkeleton';

export default function StoreSettingsHistoryPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) setAllowed(false);
          return;
        }
        const { data } = await axios.get('/api/store/is-seller', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const canView = Boolean(data?.canViewActivityHistory);
        if (!cancelled) setAllowed(canView);
        if (!canView) router.replace('/store/settings');
      } catch {
        if (!cancelled) {
          setAllowed(false);
          router.replace('/store/settings');
        }
      }
    };

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [getToken, router]);

  if (allowed !== true) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Super admin</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Settings history</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Every change made in the store dashboard is listed here. Only the admin email can open this page.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 ring-1 ring-white/10">
            <Shield size={14} />
            Admin only
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/store/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} />
          Back to settings
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <History size={14} />
          Dashboard activity
        </span>
      </div>

      <StoreSettingsHistory />
    </div>
  );
}
