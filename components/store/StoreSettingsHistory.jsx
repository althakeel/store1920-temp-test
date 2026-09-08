'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { History, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/useAuth';
import StorePagination from '@/components/store/StorePagination';

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last week' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom dates' },
];

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleLabel(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'member') return 'Team member';
  return 'User';
}

export default function StoreSettingsHistory() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [todayCount, setTodayCount] = useState(0);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({
    range: 'today',
    actorUserId: '',
    q: '',
    fromDate: '',
    toDate: '',
    page: 1,
  });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const params = new URLSearchParams();
      params.set('page', String(filters.page));
      params.set('limit', '20');
      if (filters.range !== 'custom') params.set('range', filters.range);
      else params.set('range', 'all');
      if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.range === 'custom' && filters.fromDate) params.set('fromDate', filters.fromDate);
      if (filters.range === 'custom' && filters.toDate) params.set('toDate', filters.toDate);

      const { data } = await axios.get(`/api/store/activity-log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setItems(Array.isArray(data?.items) ? data.items : []);
      setMembers(Array.isArray(data?.members) ? data.members : []);
      setTodayCount(Number(data?.todayCount || 0));
      setPagination(data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Failed to load activity history');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters, getToken]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page || 1 }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{todayCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Showing</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{pagination.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team members</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{members.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => updateFilter({ range: option.id })}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                filters.range === option.id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">Team member</span>
            <select
              value={filters.actorUserId}
              onChange={(event) => updateFilter({ actorUserId: event.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
            >
              <option value="">All members</option>
              {members.map((member) => (
                <option key={member.id} value={member.userId || member.id}>
                  {member.name} {member.email ? `(${member.email})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block md:col-span-1 xl:col-span-1">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">Search</span>
            <span className="relative block">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filters.q}
                onChange={(event) => updateFilter({ q: event.target.value })}
                placeholder="Name, email, or action"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 ps-9 pe-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </span>
          </label>

          {filters.range === 'custom' ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">From</span>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => updateFilter({ fromDate: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">To</span>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(event) => updateFilter({ toDate: event.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
                />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Page</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">Loading history…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    <History className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                    No dashboard changes for this filter.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row._id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatWhen(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.actorName || 'Store user'}</p>
                      <p className="text-xs text-slate-500">{row.actorEmail || '—'}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-400">{roleLabel(row.actorRole)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.action}</p>
                      {row.summary ? <p className="mt-0.5 text-xs text-slate-500">{row.summary}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <p>{row.pagePath || '—'}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.method} {row.path}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StorePagination
        pagination={pagination}
        itemLabel="changes"
        disabled={loading}
        onPageChange={(page) => updateFilter({ page })}
      />
    </div>
  );
}
