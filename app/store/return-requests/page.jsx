'use client'
import { useAuth } from '@/lib/useAuth';
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Loading from '@/components/Loading';
import { RefreshCw, Undo2, X, Image as ImageIcon, CheckCircle, XCircle, Package } from 'lucide-react';

const TABS = [
    { id: 'new', label: 'New Requests' },
    { id: 'pickup', label: 'Pickup' },
    { id: 'warehouse', label: 'Warehouse / QC' },
    { id: 'refund', label: 'Refunds' },
    { id: 'all', label: 'All' },
];

const QC_CONDITIONS = [
    'UNOPENED',
    'OPENED',
    'USED',
    'DAMAGED',
    'DEFECTIVE',
    'MISSING_ACCESSORIES',
    'CUSTOMER_DAMAGED',
];

function statusClass(status) {
    const key = String(status || '').toUpperCase();
    if (['UNDER_REVIEW', 'SUBMITTED', 'INFO_REQUIRED', 'QC_PENDING'].includes(key)) return 'bg-yellow-100 text-yellow-800';
    if (['APPROVED', 'QC_PASSED', 'REFUND_APPROVED', 'PICKUP_SCHEDULED', 'COMPLETED', 'REFUND_COMPLETED'].includes(key)) return 'bg-green-100 text-green-800';
    if (['REJECTED', 'NOT_ELIGIBLE', 'QC_FAILED'].includes(key)) return 'bg-red-100 text-red-800';
    return 'bg-blue-100 text-blue-800';
}

function Field({ label, value }) {
    if (value == null || value === '') return null;
    return (
        <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide">{label}</p>
            <p className="font-medium text-gray-900 break-words">{value}</p>
        </div>
    );
}

export default function StoreReturnRequests() {
    const { getToken } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('new');
    const [selected, setSelected] = useState(null);
    const [showReject, setShowReject] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [infoMessage, setInfoMessage] = useState('Please upload additional photos or a video of the product.');
    const [processing, setProcessing] = useState(false);
    const [qc, setQc] = useState({
        condition: 'UNOPENED',
        skuMatch: true,
        quantityMatch: true,
        sameItem: true,
        originalBox: true,
        accessories: true,
        notes: '',
    });

    const fetchRequests = async (nextTab = tab) => {
        try {
            const token = await getToken(true);
            if (!token) {
                toast.error('Authentication failed. Please sign in again.');
                setLoading(false);
                return;
            }
            const { data } = await axios.get(`/api/store/return-requests?tab=${encodeURIComponent(nextTab)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setRequests(data.requests || []);
        } catch (error) {
            toast.error(error?.response?.data?.error || error.message);
        } finally {
            setLoading(false);
        }
    };

    const runAction = async (action, extra = {}) => {
        if (!selected) return;
        try {
            setProcessing(true);
            const token = await getToken(true);
            const { data } = await axios.post('/api/store/return-requests', {
                id: selected.id,
                action,
                ...extra,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success(data?.message || 'Updated');
            setShowReject(false);
            setShowInfo(false);
            setSelected(data.request || null);
            fetchRequests(tab);
        } catch (error) {
            toast.error(error?.response?.data?.error || 'Action failed');
        } finally {
            setProcessing(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchRequests(tab);
    }, [tab]);

    if (loading) return <Loading />;

    return (
        <div lang="en" dir="ltr" className="p-6 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <RefreshCw className="text-orange-600" size={32} />
                    Returns & Replacements
                </h1>
                <p className="text-gray-600 mt-2">Review, pickup, inspect, and refund customer return requests</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                {TABS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        onClick={() => setTab(entry.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                            tab === entry.id ? 'bg-orange-600 text-white' : 'bg-white border text-gray-700'
                        }`}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            {requests.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl shadow">
                    <Package size={64} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 text-lg font-medium">No requests in this queue</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Return ID</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Order / Customer</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Product</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Type</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {requests.map((row) => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-mono font-semibold">{row.returnNumber}</td>
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-gray-900">#{row.orderNumber}</p>
                                        <p className="text-sm text-gray-700">{row.customerName}</p>
                                        <p className="text-xs text-gray-500">{row.customerEmail}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        {(row.items || []).map((item, idx) => (
                                            <p key={idx}>{item.productName} × {item.quantity}</p>
                                        ))}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                                            row.type === 'RETURN' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {row.type === 'RETURN' ? <Undo2 size={14} /> : <RefreshCw size={14} />}
                                            {row.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${statusClass(row.status)}`}>
                                            {row.statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            type="button"
                                            onClick={() => setSelected(row)}
                                            className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selected && (
                <div onClick={() => setSelected(null)} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-orange-600 text-white p-6 rounded-t-2xl z-10 flex justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold">{selected.returnNumber}</h2>
                                <p className="text-orange-100 text-sm">Order #{selected.orderNumber} · {selected.statusLabel}</p>
                            </div>
                            <button type="button" onClick={() => setSelected(null)} className="p-2 hover:bg-white/20 rounded-full">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <Field label="Customer" value={selected.customerName} />
                                <Field label="Email" value={selected.customerEmail} />
                                <Field label="Phone" value={selected.customerPhone} />
                                <Field label="Payment method" value={selected.paymentMethod} />
                                <Field label="Delivery date" value={selected.deliveredAtLabel} />
                                <Field label="Return deadline" value={selected.returnDeadlineLabel} />
                                <Field label="Reason" value={selected.reason} />
                                <Field label="Refund method" value={selected.refundMethod} />
                                <Field label="Pickup order" value={selected.returnPickupOrderNumber ? `#${selected.returnPickupOrderNumber}` : ''} />
                            </div>

                            {selected.eligibilityReason && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                                    {selected.eligibilityReason}
                                </div>
                            )}
                            {selected.infoRequestedMessage && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    Information requested: {selected.infoRequestedMessage}
                                </div>
                            )}
                            {selected.description && (
                                <div>
                                    <p className="text-gray-500 text-xs uppercase mb-1">Customer comments</p>
                                    <p className="bg-gray-50 rounded-lg p-3">{selected.description}</p>
                                </div>
                            )}

                            <div>
                                <h3 className="font-bold mb-2">Products</h3>
                                {(selected.items || []).map((item, idx) => (
                                    <div key={idx} className="border rounded-lg p-3 mb-2 text-sm">
                                        <p className="font-semibold">{item.productName}</p>
                                        <p className="text-gray-600">SKU {item.sku || '—'} · Qty {item.quantity} · AED {item.price}</p>
                                    </div>
                                ))}
                            </div>

                            {selected.pickupAddress && (
                                <div>
                                    <h3 className="font-bold mb-2">Pickup address</h3>
                                    <p className="text-sm text-gray-700">
                                        {[selected.pickupAddress.name, selected.pickupAddress.phone, selected.pickupAddress.street, selected.pickupAddress.city]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
                                </div>
                            )}

                            {selected.pickup?.scheduledFor && (
                                <p className="text-sm">Pickup scheduled for {selected.pickup.scheduledFor}{selected.pickup.riderName ? ` · Rider: ${selected.pickup.riderName}` : ''}</p>
                            )}

                            {[...(selected.images || []), ...(selected.additionalImages || [])].length > 0 && (
                                <div>
                                    <h3 className="font-bold mb-3 flex items-center gap-2"><ImageIcon size={18} /> Photos / video</h3>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[...(selected.images || []), ...(selected.additionalImages || [])].map((img, i) => (
                                            <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                                                <img src={img} alt="" className="w-full h-32 object-cover rounded-lg border" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(selected.previousReturns || []).length > 0 && (
                                <div>
                                    <h3 className="font-bold mb-2">Previous return history</h3>
                                    {selected.previousReturns.map((row) => (
                                        <p key={row.returnNumber} className="text-sm text-gray-700">
                                            {row.returnNumber} · {row.statusLabel} · {row.reason}
                                        </p>
                                    ))}
                                </div>
                            )}

                            {selected.refund?.finalAmount > 0 && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
                                    <p>Product: AED {selected.refund.productAmount}</p>
                                    <p>Discount: AED {selected.refund.discountAmount}</p>
                                    <p className="font-bold">Refundable amount: AED {selected.refund.finalAmount}</p>
                                    {selected.refund.customerMessage && <p className="mt-2">{selected.refund.customerMessage}</p>}
                                </div>
                            )}

                            {(selected.history || []).length > 0 && (
                                <div>
                                    <h3 className="font-bold mb-2">Timeline</h3>
                                    <ol className="space-y-1 text-sm text-gray-700">
                                        {selected.history.map((row, idx) => (
                                            <li key={idx}>{row.label}{row.note ? ` — ${row.note}` : ''}</li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            {['RECEIVED', 'QC_PENDING'].includes(selected.status) && (
                                <div className="border rounded-xl p-4 space-y-3">
                                    <h3 className="font-bold">Warehouse quality check</h3>
                                    <select
                                        value={qc.condition}
                                        onChange={(e) => setQc({ ...qc, condition: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2"
                                    >
                                        {QC_CONDITIONS.map((value) => (
                                            <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
                                        ))}
                                    </select>
                                    <label className="flex gap-2 text-sm"><input type="checkbox" checked={qc.skuMatch} onChange={(e) => setQc({ ...qc, skuMatch: e.target.checked })} /> Correct SKU</label>
                                    <label className="flex gap-2 text-sm"><input type="checkbox" checked={qc.quantityMatch} onChange={(e) => setQc({ ...qc, quantityMatch: e.target.checked })} /> Correct quantity</label>
                                    <label className="flex gap-2 text-sm"><input type="checkbox" checked={qc.sameItem} onChange={(e) => setQc({ ...qc, sameItem: e.target.checked })} /> Same item originally sold</label>
                                    <label className="flex gap-2 text-sm"><input type="checkbox" checked={qc.originalBox} onChange={(e) => setQc({ ...qc, originalBox: e.target.checked })} /> Original box</label>
                                    <label className="flex gap-2 text-sm"><input type="checkbox" checked={qc.accessories} onChange={(e) => setQc({ ...qc, accessories: e.target.checked })} /> Accessories</label>
                                    <textarea
                                        value={qc.notes}
                                        onChange={(e) => setQc({ ...qc, notes: e.target.value })}
                                        rows="3"
                                        placeholder="QC notes"
                                        className="w-full border rounded-lg px-3 py-2"
                                    />
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3 pt-4 border-t">
                                {['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED'].includes(selected.status) && (
                                    <>
                                        <button type="button" disabled={processing} onClick={() => runAction('APPROVE')} className="flex-1 min-w-40 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">
                                            <CheckCircle size={20} /> Approve
                                        </button>
                                        <button type="button" disabled={processing} onClick={() => setShowInfo(true)} className="flex-1 min-w-40 bg-amber-500 text-white py-3 rounded-xl font-bold">
                                            Request More Information
                                        </button>
                                        <button type="button" disabled={processing} onClick={() => setShowReject(true)} className="flex-1 min-w-40 flex items-center justify-center gap-2 bg-red-600 text-white py-3 rounded-xl font-bold">
                                            <XCircle size={20} /> Reject
                                        </button>
                                    </>
                                )}
                                {['APPROVED', 'PICKUP_SCHEDULED'].includes(selected.status) && !selected.reversePickupReady && (
                                    <button type="button" disabled={processing} onClick={() => runAction('APPROVE')} className="flex-1 min-w-40 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-bold disabled:opacity-50">
                                        Complete EMX pickup
                                    </button>
                                )}
                                {['ITEM_PICKED_UP', 'IN_TRANSIT'].includes(selected.status) && (
                                    <button type="button" disabled={processing} onClick={() => runAction('RECEIVE')} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold">
                                        Mark received at warehouse
                                    </button>
                                )}
                                {['RECEIVED', 'QC_PENDING'].includes(selected.status) && (
                                    <>
                                        <button type="button" disabled={processing} onClick={() => runAction('QC_PASS', { qc })} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold">
                                            QC Passed
                                        </button>
                                        <button type="button" disabled={processing} onClick={() => runAction('QC_FAIL', { qc })} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold">
                                            QC Failed
                                        </button>
                                    </>
                                )}
                                {['QC_PASSED', 'REFUND_APPROVED', 'REFUND_INITIATED'].includes(selected.status) && selected.type === 'RETURN' && (
                                    <button type="button" disabled={processing} onClick={() => runAction('PROCESS_REFUND')} className="flex-1 bg-orange-600 text-white py-3 rounded-xl font-bold">
                                        Process Refund
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showReject && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-8">
                        <h3 className="text-2xl font-bold mb-4">Reject request</h3>
                        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows="5" className="w-full border rounded-xl px-4 py-3 mb-4" placeholder="Explain why..." />
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setShowReject(false)} className="flex-1 py-3 bg-gray-200 rounded-xl font-semibold">Cancel</button>
                            <button type="button" disabled={!rejectReason.trim() || processing} onClick={() => runAction('REJECT', { rejectionReason: rejectReason.trim() })} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold">Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {showInfo && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-8">
                        <h3 className="text-2xl font-bold mb-4">Request more information</h3>
                        <textarea value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} rows="5" className="w-full border rounded-xl px-4 py-3 mb-4" />
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setShowInfo(false)} className="flex-1 py-3 bg-gray-200 rounded-xl font-semibold">Cancel</button>
                            <button type="button" disabled={!infoMessage.trim() || processing} onClick={() => runAction('REQUEST_INFO', { infoMessage: infoMessage.trim() })} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-semibold">Send</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
