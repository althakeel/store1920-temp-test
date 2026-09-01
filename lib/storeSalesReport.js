import { isAwaitingPaymentOrder } from '@/lib/deferredOrderStatus';
import { isPaymentFailedStoreOrder } from '@/lib/paymentFailedFollowUp';
import { normalizeStoreOrderPaymentMethod } from '@/lib/storeOrderInsights';

export const SALES_REPORT_PAYMENT_BUCKETS = ['cod', 'paidOnline', 'failed'];

export function isFailedSalesReportOrder(order = {}) {
  if (isPaymentFailedStoreOrder(order)) return true;
  if (isAwaitingPaymentOrder(order)) return true;

  const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();
  if (['failed', 'payment_failed', 'refunded'].includes(paymentStatus)) return true;

  return false;
}

export function getSalesReportOrderBucket(order = {}) {
  if (isFailedSalesReportOrder(order)) return 'failed';
  if (normalizeStoreOrderPaymentMethod(order) === 'COD') return 'cod';
  return 'paidOnline';
}

export function shouldCountSalesReportRevenue(order = {}) {
  return getSalesReportOrderBucket(order) !== 'failed';
}

export function getSalesReportPaymentBucketLabel(bucket = '') {
  switch (bucket) {
    case 'cod':
      return 'COD';
    case 'paidOnline':
      return 'Payment success';
    case 'failed':
      return 'Failed';
    default:
      return 'Other';
  }
}

export function buildSalesReportPaymentSummary(orders = [], refundByOrderId = new Map()) {
  const summary = {
    cod: { count: 0, revenue: 0, grossRevenue: 0, refunds: 0 },
    paidOnline: { count: 0, revenue: 0, grossRevenue: 0, refunds: 0 },
    failed: { count: 0, revenue: 0, grossRevenue: 0, refunds: 0 },
  };

  for (const order of orders) {
    const bucket = getSalesReportOrderBucket(order);
    const grossRevenue = Number(order?.total || 0);
    const refunded = refundByOrderId.get(String(order?._id || '')) || 0;
    const netRevenue = bucket === 'failed' ? 0 : Math.max(0, grossRevenue - Math.min(refunded, grossRevenue));
    summary[bucket].count += 1;
    summary[bucket].grossRevenue += grossRevenue;
    summary[bucket].refunds += bucket === 'failed' ? 0 : refunded;
    summary[bucket].revenue += netRevenue;
  }

  summary.totalRevenue = summary.cod.revenue + summary.paidOnline.revenue;
  summary.totalGrossRevenue = summary.cod.grossRevenue + summary.paidOnline.grossRevenue;
  summary.totalRefunds = summary.cod.refunds + summary.paidOnline.refunds;
  summary.totalOrders = summary.cod.count + summary.paidOnline.count;

  return summary;
}

export function buildSalesReportDateFilter(dateRange, fromDate, toDate) {
  const now = new Date();

  switch (dateRange) {
    case 'TODAY':
      return {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        },
      };
    case 'YESTERDAY':
      return {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      };
    case 'THIS_WEEK': {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return { createdAt: { $gte: startOfWeek } };
    }
    case 'LAST_WEEK': {
      const startOfLastWeek = new Date(now);
      startOfLastWeek.setDate(now.getDate() - now.getDay() - 7);
      startOfLastWeek.setHours(0, 0, 0, 0);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 7);
      return {
        createdAt: {
          $gte: startOfLastWeek,
          $lt: endOfLastWeek,
        },
      };
    }
    case 'THIS_MONTH':
      return {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      };
    case 'LAST_MONTH':
      return {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          $lt: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      };
    case 'THIS_YEAR':
      return {
        createdAt: {
          $gte: new Date(now.getFullYear(), 0, 1),
        },
      };
    case 'LAST_YEAR':
      return {
        createdAt: {
          $gte: new Date(now.getFullYear() - 1, 0, 1),
          $lt: new Date(now.getFullYear(), 0, 1),
        },
      };
    case 'CUSTOM':
      if (fromDate && toDate) {
        return {
          createdAt: {
            $gte: new Date(fromDate),
            $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999)),
          },
        };
      }
      return {};
    default:
      return {
        createdAt: {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      };
  }
}

export async function buildProductCostMap(orders, Product) {
  const productIds = new Set();

  for (const order of orders) {
    for (const item of order.orderItems || []) {
      const productId = item?.productId?._id || item?.productId;
      if (productId) productIds.add(String(productId));
    }
  }

  if (!productIds.size) return new Map();

  const products = await Product.find({ _id: { $in: [...productIds] } })
    .select('_id costPrice')
    .lean();

  return new Map(products.map((product) => [String(product._id), Number(product.costPrice || 0)]));
}

export function calculateOrderProductCost(order, productCostMap) {
  return (order.orderItems || []).reduce((sum, item) => {
    const productId = String(item?.productId?._id || item?.productId || '');
    const costPrice = productCostMap.get(productId) || 0;
    return sum + costPrice * Number(item?.quantity || 0);
  }, 0);
}
