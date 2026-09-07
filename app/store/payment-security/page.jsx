'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Shield, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { trackGa4Refund } from '@/lib/ga4Ecommerce';

export default function PaymentSecurityPage() {
  const { getToken } = useAuth();
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [refundForm, setRefundForm] = useState({ orderId: '', amount: '', reason: '' });
  const [busy, setBusy] = useState('');

  const authHeaders = useCallback(async () => {
    const token = await getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [overviewRes, logsRes, refundsRes] = await Promise.all([
        fetch('/api/store/payment-security', { headers }),
        fetch('/api/store/payment-security?view=logs&limit=40', { headers }),
        fetch('/api/store/payment-security?view=refunds', { headers }),
      ]);
      const overview = await overviewRes.json();
      const logsData = await logsRes.json();
      const refundsData = await refundsRes.json();
      if (!overviewRes.ok) throw new Error(overview.error || 'Failed to load');
      setConfig(overview.config || null);
      setLogs(logsData.items || []);
      setRefunds(refundsData.refunds || []);
    } catch (e) {
      toast.error(e.message || 'Failed to load payment security');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestRefund = async (e) => {
    e.preventDefault();
    setBusy('request');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/store/payment-security/refunds', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderId: refundForm.orderId.trim(),
          amount: Number(refundForm.amount),
          reason: refundForm.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (data?.executed) {
        trackGa4Refund({
          transactionId: data.transactionId || data.authorization?.orderId || refundForm.orderId,
          value: Number(data.authorization?.amount || refundForm.amount || 0),
        });
      }
      toast.success(data.executed ? 'Refund executed' : 'Refund requested — awaiting second approval');
      setRefundForm({ orderId: '', amount: '', reason: '' });
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const decide = async (refundAuthId, decision) => {
    setBusy(refundAuthId);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/store/payment-security/refunds', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ refundAuthId, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (decision === 'approve' && data?.executed) {
        trackGa4Refund({
          transactionId: data.transactionId || data.authorization?.orderId || data.orderId,
          value: Number(data.authorization?.amount || data.amount || 0),
        });
      }
      toast.success(decision === 'approve' ? 'Approved / executed' : 'Rejected');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" lang="en" dir="ltr">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6" /> Payment security
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            PCI SAQ A controls, fraud signals, refund authorization, and transaction logs.
            Card numbers are never stored — payments use hosted Stripe / Tabby / Tamara.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {['overview', 'logs', 'refunds'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
              tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : null}

      {!loading && tab === 'overview' && config ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-900">PCI-DSS posture</h2>
            <p><span className="text-gray-500">SAQ:</span> {config.saq}</p>
            <p><span className="text-gray-500">Store cards:</span> {config.neverStoreCards ? 'Never' : 'Yes'}</p>
            <p><span className="text-gray-500">Tokenization:</span> {config.tokenization}</p>
            <p><span className="text-gray-500">3-D Secure:</span> {config.threeDSecure}</p>
            <p><span className="text-gray-500">Gateways:</span> {(config.gateways || []).join(', ')}</p>
          </div>
          <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-900">Fraud &amp; refunds</h2>
            <p>Velocity window: {config.fraud?.velocityWindowMinutes} min</p>
            <p>Max orders / email: {config.fraud?.maxOrdersPerEmail}</p>
            <p>High-amount flag: {config.fraud?.highAmountAed} AED</p>
            <p>Second approver for refunds: {config.refund?.requireSecondApprover ? 'Required' : 'Optional'}</p>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'logs' ? (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Risk</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No transaction logs yet</td></tr>
              ) : logs.map((row) => (
                <tr key={row._id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.eventType}</td>
                  <td className="px-3 py-2">{row.provider || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.orderId ? String(row.orderId).slice(-8) : '—'}</td>
                  <td className="px-3 py-2">{row.amount != null ? `${row.amount} ${row.currency || 'AED'}` : '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.riskScore != null ? row.riskScore : '—'}
                    {row.riskSignals?.length ? (
                      <span className="block text-amber-700">{row.riskSignals.join(', ')}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === 'refunds' ? (
        <div className="space-y-6">
          <form onSubmit={requestRefund} className="bg-white border rounded-xl p-4 space-y-3 max-w-lg">
            <h2 className="font-semibold text-gray-900">Request Stripe refund</h2>
            <p className="text-xs text-gray-500">
              Requires a second staff approver by default. Executes via Stripe PaymentIntent refund and updates order payment state.
            </p>
            <input
              className="border rounded-lg px-3 py-2 text-sm w-full"
              placeholder="Order ID"
              value={refundForm.orderId}
              onChange={(e) => setRefundForm((f) => ({ ...f, orderId: e.target.value }))}
              required
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm w-full"
              placeholder="Amount (AED)"
              type="number"
              step="0.01"
              min="0.01"
              value={refundForm.amount}
              onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm w-full"
              placeholder="Reason"
              value={refundForm.reason}
              onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))}
            />
            <button
              type="submit"
              disabled={busy === 'request'}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg disabled:opacity-50"
            >
              Submit refund request
            </button>
          </form>

          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {refunds.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">No refund authorizations</td></tr>
                ) : refunds.map((r) => (
                  <tr key={r._id} className="border-t">
                    <td className="px-3 py-2 font-medium">{r.status}</td>
                    <td className="px-3 py-2 font-mono text-xs">{String(r.orderId).slice(-10)}</td>
                    <td className="px-3 py-2">{r.amount} {r.currency}</td>
                    <td className="px-3 py-2 space-x-2">
                      {r.status === 'PENDING' ? (
                        <>
                          <button
                            type="button"
                            disabled={busy === r._id}
                            onClick={() => decide(r._id, 'approve')}
                            className="text-xs text-green-700 hover:underline"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy === r._id}
                            onClick={() => decide(r._id, 'reject')}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">{r.providerRefundId || r.errorMessage || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
