export const STORE_ORDER_LINE_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'OUT_OF_STOCK',
  'CANCELLED',
  'DELIVERED',
];

export const STORE_ORDER_LINE_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', color: 'bg-slate-100 text-slate-700' },
  { value: 'PROCESSING', label: 'Processing', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'SHIPPED', label: 'Shipped', color: 'bg-purple-100 text-purple-800' },
  { value: 'OUT_OF_STOCK', label: 'Out of stock', color: 'bg-orange-100 text-orange-900' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  { value: 'DELIVERED', label: 'Delivered', color: 'bg-green-100 text-green-800' },
];

export function normalizeStoreOrderLineStatus(status = '') {
  return String(status || '').trim().toUpperCase() || 'PENDING';
}

export function isValidStoreOrderLineStatus(status = '') {
  return STORE_ORDER_LINE_STATUSES.includes(normalizeStoreOrderLineStatus(status));
}

export function getStoreOrderLineStatusMeta(status = 'PENDING') {
  const normalized = normalizeStoreOrderLineStatus(status);
  const match = STORE_ORDER_LINE_STATUS_OPTIONS.find((option) => option.value === normalized);
  if (match) return match;

  return {
    value: normalized,
    label: normalized.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    color: 'bg-slate-100 text-slate-700',
  };
}

export function resolveOrderLineStatus(item = {}) {
  return normalizeStoreOrderLineStatus(item?.lineStatus || 'PENDING');
}

/** Short summary for order modal header, e.g. "2 shipped · 1 out of stock". */
export function summarizeOrderLineStatuses(orderItems = []) {
  const lines = Array.isArray(orderItems) ? orderItems : [];
  if (lines.length <= 1) return '';

  const counts = new Map();
  lines.forEach((item) => {
    const status = resolveOrderLineStatus(item);
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  const parts = STORE_ORDER_LINE_STATUS_OPTIONS
    .filter((option) => counts.has(option.value))
    .map((option) => {
      const count = counts.get(option.value) || 0;
      if (count <= 0) return '';
      const label = option.label.toLowerCase();
      return count === 1 ? `1 ${label}` : `${count} ${label}`;
    })
    .filter(Boolean);

  return parts.join(' · ');
}

export function applyOrderLineStatusUpdates(order, updates = []) {
  const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
  const applied = [];

  (Array.isArray(updates) ? updates : []).forEach((entry) => {
    const itemIndex = Number(entry?.itemIndex);
    const lineStatus = normalizeStoreOrderLineStatus(entry?.lineStatus);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length) {
      return;
    }
    if (!isValidStoreOrderLineStatus(lineStatus)) {
      return;
    }

    const line = items[itemIndex];
    const previousStatus = resolveOrderLineStatus(line);
    if (previousStatus === lineStatus && !entry?.note) {
      return;
    }

    line.lineStatus = lineStatus;
    if (entry?.note !== undefined) {
      line.lineStatusNote = String(entry.note || '').trim() || undefined;
    }
    line.lineStatusUpdatedAt = new Date();

    applied.push({
      itemIndex,
      previousStatus,
      lineStatus,
      name: line?.name || `Item ${itemIndex + 1}`,
    });
  });

  if (applied.length > 0) {
    order.markModified('orderItems');
  }

  return applied;
}
