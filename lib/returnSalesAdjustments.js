import ReturnRequest from '@/models/ReturnRequest';
import { shouldCountSalesReportRevenue } from '@/lib/storeSalesReport';

export const COMPLETED_RETURN_REFUND_STATUSES = ['REFUND_COMPLETED', 'COMPLETED'];

export function getCompletedReturnRefundAmount(doc = {}) {
  const status = String(doc?.status || '').toUpperCase();
  if (!COMPLETED_RETURN_REFUND_STATUSES.includes(status)) return 0;
  if (String(doc?.type || 'RETURN').toUpperCase() !== 'RETURN') return 0;
  const amount = Number(doc?.refund?.finalAmount ?? doc?.refund?.productAmount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * Sum completed return refunds per order id for a store.
 * Returns Map<orderId, refundedAmount>.
 */
export async function loadCompletedReturnRefundsByOrderId(storeId, {
  orderIds = null,
} = {}) {
  const filter = {
    storeId: String(storeId),
    type: 'RETURN',
    status: { $in: COMPLETED_RETURN_REFUND_STATUSES },
  };
  if (Array.isArray(orderIds) && orderIds.length) {
    filter.orderId = { $in: orderIds.map((id) => String(id)) };
  }

  const rows = await ReturnRequest.find(filter)
    .select('orderId status type refund.finalAmount refund.productAmount refund.completedAt')
    .lean();

  const map = new Map();
  for (const row of rows) {
    const amount = getCompletedReturnRefundAmount(row);
    if (!amount) continue;
    const orderId = String(row.orderId || '').trim();
    if (!orderId) continue;
    map.set(orderId, (map.get(orderId) || 0) + amount);
  }
  return map;
}

export async function sumCompletedReturnRefunds(storeId, {
  fromDate = null,
  toDate = null,
} = {}) {
  const filter = {
    storeId: String(storeId),
    type: 'RETURN',
    status: { $in: COMPLETED_RETURN_REFUND_STATUSES },
  };
  if (fromDate || toDate) {
    filter['refund.completedAt'] = {};
    if (fromDate) filter['refund.completedAt'].$gte = fromDate;
    if (toDate) filter['refund.completedAt'].$lte = toDate;
  }

  const rows = await ReturnRequest.find(filter)
    .select('refund.finalAmount refund.productAmount status type')
    .lean();

  return rows.reduce((sum, row) => sum + getCompletedReturnRefundAmount(row), 0);
}

export function getOrderGrossRevenue(order = {}) {
  return Number(order?.total || 0);
}

export function getOrderNetRevenue(order = {}, refundedAmount = 0) {
  if (!shouldCountSalesReportRevenue(order)) return 0;
  const gross = getOrderGrossRevenue(order);
  const refund = Math.max(0, Number(refundedAmount || 0));
  return Math.max(0, gross - Math.min(refund, gross));
}

/**
 * Product-level return adjustments from completed return cases (QC passed / refunded).
 */
export async function loadReturnedProductAdjustments(storeId, {
  orderIds = null,
} = {}) {
  const filter = {
    storeId: String(storeId),
    type: 'RETURN',
    status: {
      $in: [
        ...COMPLETED_RETURN_REFUND_STATUSES,
        'REFUND_APPROVED',
        'REFUND_INITIATED',
        'QC_PASSED',
        'RECEIVED',
        'QC_PENDING',
      ],
    },
  };
  if (Array.isArray(orderIds) && orderIds.length) {
    filter.orderId = { $in: orderIds.map((id) => String(id)) };
  }

  const rows = await ReturnRequest.find(filter)
    .select('orderId status type items refund.finalAmount refund.productAmount stockRestockedAt qc.checkedAt')
    .lean();

  const byProduct = new Map();
  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    const restocked = Boolean(row.stockRestockedAt);
    const refunded = COMPLETED_RETURN_REFUND_STATUSES.includes(status);
    const qcPassed = ['QC_PASSED', 'REFUND_APPROVED', 'REFUND_INITIATED', ...COMPLETED_RETURN_REFUND_STATUSES].includes(status);
    if (!restocked && !refunded && !qcPassed) continue;

    for (const item of row.items || []) {
      const productId = String(item?.productId || '').trim();
      if (!productId) continue;
      const qty = Math.max(0, Number(item?.quantity || 0));
      const lineRevenue = Math.max(0, Number(item?.price || 0) * qty);
      const existing = byProduct.get(productId) || { unitsReturned: 0, revenueReturned: 0 };
      existing.unitsReturned += qty;
      existing.revenueReturned += lineRevenue;
      byProduct.set(productId, existing);
    }
  }
  return byProduct;
}

export function applyProductSalesReturnAdjustments(rows = [], adjustments = new Map()) {
  if (!adjustments?.size) return rows;
  return rows.map((row) => {
    const key = String(row.productId || '').trim();
    const adj = adjustments.get(key);
    if (!adj) return row;
    return {
      ...row,
      unitsSold: Math.max(0, Number(row.unitsSold || 0) - Number(adj.unitsReturned || 0)),
      revenue: Number(Math.max(0, Number(row.revenue || 0) - Number(adj.revenueReturned || 0)).toFixed(2)),
      unitsReturned: Number(adj.unitsReturned || 0),
      revenueReturned: Number(Number(adj.revenueReturned || 0).toFixed(2)),
    };
  });
}
