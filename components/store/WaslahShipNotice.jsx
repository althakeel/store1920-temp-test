'use client';

import { CheckCircle2, Download, Truck, X } from 'lucide-react';

export function buildWaslahShipNotice(data = {}) {
    const awb = String(
        data.trackingNumber
        || data.order?.waslah?.emxTrackingNumber
        || data.order?.waslah?.trackingNumber
        || data.order?.trackingId
        || '',
    ).trim();
    const emxAwb = /^1000\d{9,12}$/.test(awb) || (/^\d{10,16}$/.test(awb) && !/^62\d+$/.test(awb))
        ? awb
        : '';
    const labelUrl = String(data.labelUrl || data.order?.waslah?.labelUrl || '').trim();
    const pickup = data.pickupInfo || {};

    if (data.alreadyProcessed) {
        return {
            title: 'Already in Waslah',
            awb: emxAwb,
            labelUrl,
            lines: [
                emxAwb ? `EMX tracking ${emxAwb} synced to this order.` : 'Shipment synced to this order.',
                labelUrl ? 'EMX carrier label is ready to print.' : null,
                'EMX pickup may already be scheduled — do not ship again.',
            ].filter(Boolean),
        };
    }

    if (data.linkedExisting && data.syncOnly) {
        return {
            title: 'Synced from Waslah',
            awb: emxAwb,
            labelUrl,
            lines: [
                emxAwb ? `EMX tracking ${emxAwb} linked successfully.` : 'Waslah shipment linked.',
                labelUrl ? 'Download and print the EMX carrier label before pickup.' : null,
            ].filter(Boolean),
        };
    }

    const pickupLine = pickup.pickup_date
        ? `Pickup scheduled for ${pickup.pickup_date}${pickup.pickup_time ? ` (${pickup.pickup_time})` : ''}.`
        : null;

    return {
        title: 'Sent to EMX',
        awb: emxAwb,
        labelUrl,
        lines: [
            pickupLine,
            emxAwb ? `EMX tracking number: ${emxAwb}` : 'Schedule pickup to get the EMX tracking number and carrier label.',
            labelUrl ? 'Download Carrier Label (EMX only — not the Waslah receipt).' : null,
        ].filter(Boolean),
    };
}

export default function WaslahShipNotice({ notice, onDismiss, onLabelDownload }) {
    if (!notice) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-violet-50 shadow-sm"
        >
            <div className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-emerald-900">{notice.title}</p>
                    {notice.awb ? (
                        <p className="mt-1 font-mono text-base font-bold tracking-wide text-slate-900">
                            {notice.awb}
                        </p>
                    ) : null}
                    <ul className="mt-2 space-y-1">
                        {notice.lines.map((line) => (
                            <li key={line} className="flex items-start gap-1.5 text-xs text-slate-600">
                                <Truck size={12} className="mt-0.5 shrink-0 text-violet-500" />
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                    {notice.labelUrl || notice.awb || onLabelDownload ? (
                        <button
                            type="button"
                            onClick={() => onLabelDownload?.()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                        >
                            <Download size={14} />
                            Download Carrier Label
                        </button>
                    ) : null}
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
                    aria-label="Dismiss"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
