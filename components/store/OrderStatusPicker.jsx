'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export const STORE_ORDER_STATUS_OPTIONS = [
  { value: 'ORDER_PLACED', label: 'Order Placed', color: 'bg-blue-100 text-blue-700' },
  { value: 'PROCESSING', label: 'Processing', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'WAITING_FOR_PICKUP', label: 'Packed / Awaiting Pickup', color: 'bg-teal-50 text-teal-800' },
  { value: 'PICKUP_REQUESTED', label: 'Pickup Requested', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'PICKED_UP', label: 'Picked Up', color: 'bg-purple-100 text-purple-700' },
  { value: 'WAREHOUSE_RECEIVED', label: 'Warehouse Received', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'SHIPPED', label: 'Shipped / In Transit', color: 'bg-purple-100 text-purple-700' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out For Delivery', color: 'bg-teal-100 text-teal-700' },
  { value: 'DELIVERED', label: 'Delivered', color: 'bg-green-100 text-green-700' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
  { value: 'PAYMENT_FAILED', label: 'Payment Failed', color: 'bg-orange-100 text-orange-700' },
  { value: 'RTO', label: 'RTO (Not Collected)', color: 'bg-rose-100 text-rose-800' },
  { value: 'RETURN', label: 'Return (After Delivery)', color: 'bg-pink-200 text-pink-900' },
  { value: 'REPLACEMENT', label: 'Replacement (After Delivery)', color: 'bg-sky-100 text-sky-800' },
  { value: 'RETURNED', label: 'Returned', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'RETURN_INITIATED', label: 'Return Initiated', color: 'bg-pink-100 text-pink-700' },
  { value: 'RETURN_APPROVED', label: 'Return Approved', color: 'bg-pink-100 text-pink-700' },
];

export const STORE_ORDER_STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Orders' },
  ...STORE_ORDER_STATUS_OPTIONS.map(({ value, label }) => ({ value, label })),
  { value: 'PACKED', label: 'Packed', isSpecial: true },
  { value: 'RETURN_REQUESTED', label: 'Return Requested', isSpecial: true },
];

const STATUS_GROUPS = [
  {
    label: 'Order flow',
    values: ['ORDER_PLACED', 'PROCESSING'],
  },
  {
    label: 'Pickup & warehouse',
    values: ['WAITING_FOR_PICKUP', 'PICKUP_REQUESTED', 'PICKED_UP', 'WAREHOUSE_RECEIVED'],
  },
  {
    label: 'Delivery',
    values: ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  },
  {
    label: 'Returns',
    values: ['RETURN_INITIATED', 'RETURN_APPROVED', 'RTO', 'RETURN', 'REPLACEMENT', 'RETURNED'],
  },
  {
    label: 'Issues',
    values: ['CANCELLED', 'PAYMENT_FAILED'],
  },
];

export function getStoreOrderStatusMeta(status, { packed = false } = {}) {
  const normalized = String(status || '').toUpperCase();
  const packedDisplayStatuses = new Set([
    'ORDER_PLACED',
    'PROCESSING',
    'WAITING_FOR_PICKUP',
    'PICKUP_REQUESTED',
  ]);

  // After warehouse pack API: show Packed until courier advances past pickup.
  if (packed && packedDisplayStatuses.has(normalized)) {
    return {
      value: status,
      label: 'Packed',
      color: 'bg-teal-100 text-teal-800',
    };
  }

  const match = STORE_ORDER_STATUS_OPTIONS.find((option) => option.value === status);
  if (match) return match;

  const label = String(status || 'Unknown')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    value: status,
    label,
    color: 'bg-slate-100 text-slate-700',
  };
}

export function getStoreOrderStatusColor(status, options = {}) {
  return getStoreOrderStatusMeta(status, options).color;
}

export default function OrderStatusPicker({
  value,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  packed = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const current = getStoreOrderStatusMeta(value, { packed });
  const isCompact = size === 'sm';

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return STATUS_GROUPS.map((group) => ({
      ...group,
      options: group.values
        .map((statusValue) => getStoreOrderStatusMeta(statusValue))
        .filter((option) => {
          if (!needle) return true;
          return option.label.toLowerCase().includes(needle)
            || option.value.toLowerCase().includes(needle);
        }),
    })).filter((group) => group.options.length > 0);
  }, [query]);

  useEffect(() => {
    if (!open || !triggerRef.current) return undefined;

    const updatePosition = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, isCompact ? 260 : 300);
      const maxHeight = 320;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < maxHeight && spaceAbove > spaceBelow;
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);

      setMenuStyle({
        position: 'fixed',
        left,
        width: menuWidth,
        maxHeight,
        zIndex: 120,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, isCompact]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setQuery('');
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = async (nextStatus) => {
    if (nextStatus === value) {
      setOpen(false);
      setQuery('');
      return;
    }

    setOpen(false);
    setQuery('');
    await onChange(nextStatus);
  };

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        style={menuStyle}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        role="listbox"
        aria-label="Order status options"
      >
        <div className="sticky top-0 border-b border-slate-100 bg-white p-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search status..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto p-2">
          {filteredGroups.length === 0 ? (
            <p className="px-2 py-3 text-sm text-slate-500">No matching status</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.options.map((option) => {
                    const selected = option.value === value;
                    return (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => handleSelect(option.value)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                            selected
                              ? 'bg-blue-50 text-blue-900'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${option.color}`}>
                            {option.label}
                          </span>
                          {selected ? <Check size={16} className="shrink-0 text-blue-600" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 ${
          isCompact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2.5 text-sm'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`rounded-full font-semibold ${current.color} ${isCompact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
          {current.label}
        </span>
        <ChevronDown size={isCompact ? 14 : 16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
}
