'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Brain, Loader2, RefreshCw, Sparkles, Target, TrendingUp } from 'lucide-react';
import BusyButtonIcon from '@/components/store/BusyButtonIcon';

function InsightBlock({ title, icon: Icon, items, tone = 'slate' }) {
  const tones = {
    violet: 'border-violet-200 bg-violet-50/80 text-violet-900',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-900',
    slate: 'border-slate-200 bg-slate-50/80 text-slate-800',
  };

  if (!items?.length) return null;

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        <Icon size={14} />
        {title}
      </div>
      <ul className="space-y-2 text-sm leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StoreDashboardAiInsights({ getToken, stats, currency = 'AED' }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastKeyRef = useRef('');

  const fetchInsights = useCallback(async (force = false) => {
    if (!getToken || !stats) return;

    const key = JSON.stringify({
      ordersToday: stats.ordersToday,
      ordersThisWeek: stats.ordersThisWeek,
      totalOrders: stats.totalOrders,
      abandonedCarts: stats.abandonedCarts,
    });

    if (!force && key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setLoading(true);
    setError('');

    try {
      const token = await getToken();
      const { data } = await axios.post(
        '/api/store/dashboard/insights',
        {
          stats: {
            ...stats,
            currency,
          },
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 25000 },
      );
      setInsights(data);
    } catch (err) {
      setError('Could not load AI insights');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getToken, stats, currency]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return (
    <div className="overflow-hidden rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-md">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">AI store insights</h3>
            <p className="text-xs text-slate-500">
              {insights?.aiEnabled === false
                ? 'Rule-based tips (add GEMINI_API_KEY or OPENAI_API_KEY for AI)'
                : insights?.provider && insights.provider !== 'rules'
                  ? 'Powered by Store1920 AI'
                  : 'Analyzing your sales data…'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchInsights(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
        >
          <BusyButtonIcon busy={loading} icon={RefreshCw} size={14} />
          Refresh
        </button>
      </div>

      <div className="p-5">
        <div className={`items-center gap-2 text-sm text-slate-500 ${loading && !insights ? 'flex' : 'hidden'}`}>
          <Loader2 size={16} className="animate-spin text-violet-600" />
          Generating insights from your dashboard…
        </div>
        <p className={`text-sm text-red-600 ${error && !insights ? '' : 'hidden'}`}>{error || ' '}</p>
        <div className={`space-y-3 ${insights ? '' : 'hidden'}`}>
          <p className="text-base font-semibold leading-snug text-slate-900">{insights?.headline}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <InsightBlock title="Key signals" icon={Brain} items={insights?.bullets} tone="violet" />
            <InsightBlock title="Do this next" icon={Target} items={insights?.priorities} tone="amber" />
            <InsightBlock title="Outlook" icon={TrendingUp} items={insights?.outlook ? [insights.outlook] : []} tone="slate" />
          </div>
        </div>
      </div>
    </div>
  );
}
