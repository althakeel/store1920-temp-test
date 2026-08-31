'use client';

import { useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CalendarRange,
  Download,
  FolderTree,
  Loader2,
  Package,
  ShoppingBag,
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

const EXPORT_OPTIONS = [
  {
    id: 'orders',
    title: 'Orders',
    description: 'Order lines with customer, payment, SKU, and totals (CSV).',
    icon: ShoppingBag,
  },
  {
    id: 'products',
    title: 'Products',
    description: 'Full product catalog details including categories and variants.',
    icon: Package,
  },
  {
    id: 'categories',
    title: 'Categories',
    description: 'Category tree names, slugs, parents, and SEO fields.',
    icon: FolderTree,
  },
];

function triggerBlobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function filenameFromDisposition(header, fallback) {
  const raw = String(header || '');
  const match = raw.match(/filename="([^"]+)"/i) || raw.match(/filename=([^;]+)/i);
  if (!match?.[1]) return fallback;
  return match[1].trim();
}

export default function StoreExportsPage() {
  const { getToken } = useAuth();
  const [exportType, setExportType] = useState('orders');
  const [rangeMode, setRangeMode] = useState('full');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const selectedOption = useMemo(
    () => EXPORT_OPTIONS.find((option) => option.id === exportType) || EXPORT_OPTIONS[0],
    [exportType],
  );

  const handleExport = async () => {
    if (rangeMode === 'custom') {
      if (!fromDate || !toDate) {
        toast.error('Choose both from and to dates');
        return;
      }
      if (fromDate > toDate) {
        toast.error('From date must be on or before to date');
        return;
      }
    }

    try {
      setExporting(true);
      const token = await getToken(true);
      if (!token) {
        toast.error('Authentication failed');
        return;
      }

      const response = await axios.get('/api/store/exports', {
        params: {
          type: exportType,
          range: rangeMode,
          ...(rangeMode === 'custom' ? { fromDate, toDate } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const countHeader = response.headers?.['x-export-count'];
      const count = Number(countHeader);
      const fallbackName = `store-${exportType}-export.csv`;
      const filename = filenameFromDisposition(
        response.headers?.['content-disposition'],
        fallbackName,
      );

      triggerBlobDownload(response.data, filename);

      if (Number.isFinite(count)) {
        toast.success(`Exported ${count} ${selectedOption.title.toLowerCase()} row(s)`);
      } else {
        toast.success(`${selectedOption.title} export downloaded`);
      }
    } catch (error) {
      let message = 'Export failed';
      const data = error?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const parsed = JSON.parse(text);
          if (parsed?.error) message = parsed.error;
        } catch {
          // keep default
        }
      } else if (data?.error) {
        message = data.error;
      } else if (error?.message) {
        message = error.message;
      }
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Exports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Download orders, products, or categories as CSV. Choose a full export or a custom date range.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">What to export</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {EXPORT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = exportType === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setExportType(option.id)}
                className={`rounded-xl border p-3 text-start transition ${
                  selected
                    ? 'border-orange-400 bg-orange-50 shadow-sm'
                    : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <Icon className={`h-5 w-5 ${selected ? 'text-orange-600' : 'text-slate-500'}`} />
                <p className="mt-2 text-sm font-semibold text-slate-900">{option.title}</p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <CalendarRange className="h-4 w-4" />
          Date range
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Custom range filters by created date. Categories and products use catalog created dates; orders use order created dates.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRangeMode('full')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              rangeMode === 'full'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Full export
          </button>
          <button
            type="button"
            onClick={() => setRangeMode('custom')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              rangeMode === 'custom'
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            From date → to date
          </button>
        </div>

        {rangeMode === 'custom' ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">To</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </label>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Exports every matching {selectedOption.title.toLowerCase()} record with no date limit.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {exporting ? 'Preparing…' : `Download ${selectedOption.title} CSV`}
        </button>
        <p className="text-xs text-slate-500">
          File downloads to your device. Large catalogs may take a moment.
        </p>
      </div>
    </div>
  );
}
