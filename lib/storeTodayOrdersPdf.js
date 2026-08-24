import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getOrderLineProduct, isGenericProductName } from '@/lib/orderDisplay';
import {
  resolveOrderLineItems,
  resolveOrderLineName,
  resolveOrderLinePackQuantity,
} from '@/lib/gtmEcommerceHelpers';
import { formatMatrixSelectionLabel, formatVariantOptionsLabel } from '@/lib/productVariantOptions';
import {
  addDaysToDateOnly,
  buildOrdersByProductDateTime,
  normalizeOrdersByProductTime,
} from '@/lib/storeOrdersByProductDates';

const SKIPPED_STATUSES = new Set([
  'CANCELLED',
  'PAYMENT_FAILED',
  'RETURNED',
  'RTO',
  'RETURN',
]);

export function resolveTodayOrdersPdfRange({
  fromDate = '',
  toDate = '',
  fromTime = '10:00',
  toTime = '10:00',
} = {}) {
  const normalizedFromTime = normalizeOrdersByProductTime(fromTime);
  const normalizedToTime = normalizeOrdersByProductTime(toTime);
  const start = fromDate ? buildOrdersByProductDateTime(fromDate, normalizedFromTime) : null;
  let end = toDate ? buildOrdersByProductDateTime(toDate, normalizedToTime) : null;

  if (
    start
    && end
    && fromDate
    && toDate
    && fromDate === toDate
    && normalizedFromTime === normalizedToTime
  ) {
    end = buildOrdersByProductDateTime(addDaysToDateOnly(toDate, 1), normalizedToTime);
  } else if (start && end && end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    start,
    end,
    fromTime: normalizedFromTime,
    toTime: normalizedToTime,
  };
}

export function formatTodayOrdersPdfRangeLabel({
  fromDate = '',
  toDate = '',
  fromTime = '10:00',
  toTime = '10:00',
} = {}) {
  const { fromTime: startTime, toTime: endTime } = resolveTodayOrdersPdfRange({
    fromDate,
    toDate,
    fromTime,
    toTime,
  });
  const startLabel = fromDate ? `${fromDate} ${startTime}` : 'start';
  const endLabel = toDate ? `${toDate} ${endTime}` : 'now';
  return `${startLabel} → ${endLabel} (Dubai)`;
}

function isOrderInPdfRange(order, { start, end }) {
  const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
  if (start && createdAt < start) return false;
  if (end && createdAt >= end) return false;
  return true;
}

function getLineProductName(item = {}) {
  const product = getOrderLineProduct(item);
  const catalog = String(product?.name || product?.title || '').trim();
  if (catalog && !isGenericProductName(catalog)) return catalog;
  return resolveOrderLineName(item, product);
}

function getLineVariant(item = {}) {
  const opts = item?.variantOptions && typeof item.variantOptions === 'object'
    ? item.variantOptions
    : {};
  return formatVariantOptionsLabel(opts) || '—';
}

function getLineOption(item = {}) {
  const opts = item?.variantOptions && typeof item.variantOptions === 'object'
    ? item.variantOptions
    : {};
  const withoutTitle = { ...opts, title: '' };
  const option = formatMatrixSelectionLabel(withoutTitle);
  if (option) return option;

  const parts = [];
  const optionLabel = String(opts.optionLabel || '').trim();
  const optionValue = String(opts.option || '').trim();
  if (optionValue) {
    parts.push(optionLabel && optionLabel !== 'Option' ? `${optionLabel}: ${optionValue}` : optionValue);
  }
  ['color', 'size', 'model'].forEach((key) => {
    const value = String(opts[key] || '').trim();
    if (value) parts.push(value);
  });
  return parts.join(' · ') || '—';
}

export function buildTodayOrderProductRows(
  orders = [],
  {
    fromDate = '',
    toDate = '',
    fromTime = '10:00',
    toTime = '10:00',
    includeCancelled = false,
  } = {},
) {
  const range = resolveTodayOrdersPdfRange({ fromDate, toDate, fromTime, toTime });
  const matchedOrders = (orders || []).filter((order) => {
    if (!isOrderInPdfRange(order, range)) return false;
    const status = String(order?.status || '').toUpperCase();
    if (!includeCancelled && SKIPPED_STATUSES.has(status)) return false;
    return true;
  });

  const byKey = new Map();
  for (const order of matchedOrders) {
    for (const item of resolveOrderLineItems(order)) {
      const productName = getLineProductName(item);
      const variant = getLineVariant(item);
      const option = getLineOption(item);
      const quantity = resolveOrderLinePackQuantity(item, getOrderLineProduct(item), order);
      if (!productName || quantity <= 0) continue;

      const key = `${productName.toLowerCase()}|${variant.toLowerCase()}|${option.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity += quantity;
        continue;
      }
      byKey.set(key, { productName, variant, option, quantity });
    }
  }

  const rows = [...byKey.values()].sort((a, b) => {
    const byName = a.productName.localeCompare(b.productName, 'en', { sensitivity: 'base' });
    if (byName) return byName;
    const byVariant = a.variant.localeCompare(b.variant, 'en', { sensitivity: 'base' });
    if (byVariant) return byVariant;
    return a.option.localeCompare(b.option, 'en', { sensitivity: 'base' });
  });

  return {
    rows,
    orderCount: matchedOrders.length,
    totalQuantity: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    rangeLabel: formatTodayOrdersPdfRangeLabel({ fromDate, toDate, fromTime, toTime }),
  };
}

export async function downloadTodayOrdersProductPdf(
  orders = [],
  {
    fromDate = '',
    toDate = '',
    fromTime = '10:00',
    toTime = '10:00',
    includeCancelled = false,
    showOption = true,
  } = {},
) {
  const { rows, orderCount, totalQuantity, rangeLabel } = buildTodayOrderProductRows(orders, {
    fromDate,
    toDate,
    fromTime,
    toTime,
    includeCancelled,
  });

  if (!rows.length) {
    const error = new Error('No products found in this date range');
    error.code = 'EMPTY';
    throw error;
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Today orders — products', margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(rangeLabel, margin, 26);
  doc.text(
    `${orderCount} order(s) · ${rows.length} product row(s) · ${totalQuantity} qty`,
    margin,
    32,
  );
  if (includeCancelled) {
    doc.text('Includes cancelled / failed orders', margin, 38);
  }

  const head = showOption
    ? [['#', 'Product name', 'Variant', 'Option', 'Qty']]
    : [['#', 'Product name', 'Variant', 'Qty']];
  const body = rows.map((row, index) => (
    showOption
      ? [index + 1, row.productName, row.variant, row.option, row.quantity]
      : [index + 1, row.productName, row.variant, row.quantity]
  ));

  autoTable(doc, {
    startY: includeCancelled ? 44 : 38,
    head,
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.4,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: showOption
      ? {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 70 },
          2: { cellWidth: 42 },
          3: { cellWidth: 38 },
          4: { cellWidth: 16, halign: 'right' },
        }
      : {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 90 },
          2: { cellWidth: 60 },
          3: { cellWidth: 20, halign: 'right' },
        },
    foot: [showOption
      ? ['', '', '', 'Total', totalQuantity]
      : ['', '', 'Total', totalQuantity]],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Page ${doc.internal.getNumberOfPages()}`,
        pageWidth - margin,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' },
      );
    },
  });

  const slug = String(fromDate || new Date().toISOString().slice(0, 10));
  doc.save(`today-orders-products-${slug}.pdf`);

  return { rows, orderCount, totalQuantity };
}
