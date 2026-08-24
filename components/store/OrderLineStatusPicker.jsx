'use client';

import { getStoreOrderLineStatusMeta, STORE_ORDER_LINE_STATUS_OPTIONS } from '@/lib/storeOrderLineStatus';

export default function OrderLineStatusPicker({
  value = 'PENDING',
  onChange,
  disabled = false,
  className = '',
}) {
  const current = getStoreOrderLineStatusMeta(value);

  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${current.color}`}>
        {current.label}
      </span>
      <select
        value={current.value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="max-w-[9.5rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Line item status"
      >
        {STORE_ORDER_LINE_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
