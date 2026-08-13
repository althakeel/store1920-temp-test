import dbConnect from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Rating from "@/models/Rating";
import AbandonedCart from "@/models/AbandonedCart";
import authSeller from "@/middlewares/authSeller";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/firebase-admin";
import { visibleStoreOrderMatch } from "@/lib/visibleStoreOrderMatch";

export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  AWAITING_PAYMENT: 'Awaiting payment',
  ORDER_PLACED: 'Placed',
  PROCESSING: 'Processing',
  WAITING_FOR_PICKUP: 'Waiting for pickup',
  PICKUP_REQUESTED: 'Pickup requested',
  PICKED_UP: 'Picked up',
  WAREHOUSE_RECEIVED: 'Warehouse received',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  PAYMENT_FAILED: 'Payment failed',
  RETURNED: 'Returned',
  RTO: 'RTO (not collected)',
  RETURN: 'Return (after delivery)',
  REPLACEMENT: 'Replacement (after delivery)',
  RETURN_INITIATED: 'Return initiated',
  RETURN_APPROVED: 'Return approved',
};

function getStatusBucket(status = '') {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'DELIVERED') return 'delivered';
  if (['RETURNED', 'RTO', 'RETURN', 'REPLACEMENT', 'RETURN_INITIATED', 'RETURN_APPROVED'].includes(normalized)) return 'returned';
  if (
    ['SHIPPED', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'PICKUP_REQUESTED', 'WAITING_FOR_PICKUP', 'WAREHOUSE_RECEIVED', 'IN_TRANSIT'].includes(normalized)
  ) {
    return 'shipping';
  }
  if (['CANCELLED', 'PAYMENT_FAILED'].includes(normalized)) return 'cancelled';
  return 'processing';
}

function buildTrendMaps(days, today) {
  const trendMap = {};
  const statusTrendMap = {};

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    trendMap[key] = { date: key, orders: 0, revenue: 0 };
    statusTrendMap[key] = {
      date: key,
      label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      total: 0,
      processing: 0,
      shipping: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
    };
  }

  return { trendMap, statusTrendMap };
}

function buildHourlyBuckets(timezone = 'Asia/Dubai') {
  const buckets = [];
  for (let h = 0; h < 24; h += 1) {
    const label = `${String(h).padStart(2, '0')}:00`;
    buckets.push({ hour: h, label, shortLabel: h % 3 === 0 ? label : '', orders: 0, revenue: 0 });
  }
  return buckets;
}

function buildPaymentLabel(method = '') {
  const key = String(method || 'UNKNOWN').toUpperCase();
  const labels = {
    COD: 'Cash on delivery',
    STRIPE: 'Card (Stripe)',
    CARD: 'Card',
    TABBY: 'Tabby',
    TAMARA: 'Tamara',
    WALLET: 'Wallet',
    RAZORPAY: 'Razorpay',
  };
  return labels[key] || key.replace(/_/g, ' ');
}

const PAYMENT_COLORS = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#6366F1', '#14B8A6'];

export async function GET(request) {
   try {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedToken;
      try {
         decodedToken = await getAuth().verifyIdToken(idToken);
      } catch {
         return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
      const userId = decodedToken.uid;
      const storeId = await authSeller(userId);
      if (!storeId) {
         return NextResponse.json({ error: 'Forbidden: Seller not approved or no store found.' }, { status: 403 });
      }

      await dbConnect();

      const storeIdString = String(storeId);
      const days = 30;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const trendStart = new Date(today);
      trendStart.setDate(trendStart.getDate() - (days - 1));
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 6);
      const lastWeekEnd = new Date(weekAgo);
      lastWeekEnd.setMilliseconds(-1);
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(lastWeekStart.getDate() - 13);

      const visibleMatch = visibleStoreOrderMatch({ storeId: storeIdString });
      const visibleTrendMatch = visibleStoreOrderMatch({
        storeId: storeIdString,
        createdAt: { $gte: trendStart },
      });
      const visibleWeekMatch = visibleStoreOrderMatch({
        storeId: storeIdString,
        createdAt: { $gte: weekAgo },
      });
      const visibleTodayMatch = visibleStoreOrderMatch({
        storeId: storeIdString,
        createdAt: { $gte: today },
      });
      const visibleLastWeekMatch = visibleStoreOrderMatch({
        storeId: storeIdString,
        createdAt: { $gte: lastWeekStart, $lte: lastWeekEnd },
      });

      const productIdStrings = (await Product.distinct('_id', { storeId: storeIdString })).map((id) => String(id));

      const [
        orderTotals,
        statusBreakdownRows,
        trendRows,
        weekTotalsRows,
        todayTotalsRows,
        lastWeekTotalsRows,
        todayHourlyRows,
        paymentMethodRows,
        awaitingPaymentCount,
        totalProducts,
        abandonedCarts,
        totalCustomers,
        ratingStats,
      ] = await Promise.all([
        Order.aggregate([
          { $match: visibleMatch },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalEarnings: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: visibleMatch },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $match: visibleTrendMatch },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                status: '$status',
              },
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: visibleWeekMatch },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: visibleTodayMatch },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: visibleLastWeekMatch },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
        ]),
        Order.aggregate([
          { $match: visibleTodayMatch },
          {
            $group: {
              _id: { $hour: { date: '$createdAt', timezone: 'Asia/Dubai' } },
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Order.aggregate([
          { $match: visibleMatch },
          {
            $group: {
              _id: '$paymentMethod',
              count: { $sum: 1 },
              revenue: { $sum: { $ifNull: ['$total', 0] } },
            },
          },
          { $sort: { count: -1 } },
        ]),
        Order.countDocuments({
          storeId: storeIdString,
          $or: [
            { status: 'AWAITING_PAYMENT' },
            {
              status: 'ORDER_PLACED',
              paymentMethod: { $in: ['STRIPE', 'TABBY', 'TAMARA', 'CARD'] },
              isPaid: { $ne: true },
              paymentStatus: { $nin: ['PAID', 'paid', 'Paid'] },
            },
          ],
        }),
        Product.countDocuments({ storeId: storeIdString }),
        AbandonedCart.countDocuments({
          storeId: storeIdString,
          status: { $ne: 'converted' },
        }),
        Order.aggregate([
          { $match: visibleMatch },
          {
            $group: {
              _id: {
                $cond: [
                  { $eq: ['$isGuest', true] },
                  {
                    $concat: [
                      'guest-',
                      {
                        $ifNull: [
                          '$guestEmail',
                          { $ifNull: ['$shippingAddress.email', { $toString: '$_id' }] },
                        ],
                      },
                    ],
                  },
                  { $toString: '$userId' },
                ],
              },
            },
          },
          { $count: 'count' },
        ]),
        productIdStrings.length
          ? Rating.aggregate([
              { $match: { productId: { $in: productIdStrings } } },
              {
                $group: {
                  _id: { $round: [{ $ifNull: ['$rating', 0] }, 0] },
                  count: { $sum: 1 },
                  sum: { $sum: { $ifNull: ['$rating', 0] } },
                },
              },
            ])
          : Promise.resolve([]),
      ]);

      const totals = orderTotals[0] || { totalOrders: 0, totalEarnings: 0 };
      const totalOrders = totals.totalOrders || 0;
      const totalEarnings = totals.totalEarnings || 0;
      const avgOrderValue = totalOrders > 0 ? Math.round(totalEarnings / totalOrders) : 0;

      const { trendMap, statusTrendMap } = buildTrendMaps(days, today);

      const statusTotals = {
        total: totalOrders,
        processing: 0,
        shipping: 0,
        delivered: 0,
        returned: 0,
        cancelled: 0,
      };

      trendRows.forEach((row) => {
        const dateKey = row._id?.date;
        const bucket = getStatusBucket(row._id?.status);
        if (trendMap[dateKey]) {
          trendMap[dateKey].orders += row.orders || 0;
          trendMap[dateKey].revenue += row.revenue || 0;
        }
        if (statusTrendMap[dateKey]) {
          statusTrendMap[dateKey][bucket] += row.orders || 0;
          statusTrendMap[dateKey].total += row.orders || 0;
        }
      });

      statusBreakdownRows.forEach((row) => {
        const bucket = getStatusBucket(row._id);
        statusTotals[bucket] += row.count;
      });

      const weekTotals = weekTotalsRows[0] || { orders: 0, revenue: 0 };
      const ordersThisWeek = weekTotals.orders || 0;
      const revenueThisWeek = weekTotals.revenue || 0;

      const todayTotals = todayTotalsRows[0] || { orders: 0, revenue: 0 };
      const ordersToday = todayTotals.orders || 0;
      const revenueToday = Math.round(todayTotals.revenue || 0);

      const lastWeekTotals = lastWeekTotalsRows[0] || { orders: 0, revenue: 0 };
      const ordersLastWeek = lastWeekTotals.orders || 0;
      const revenueLastWeek = Math.round(lastWeekTotals.revenue || 0);

      const todayHourlyTrend = buildHourlyBuckets();
      todayHourlyRows.forEach((row) => {
        const hour = Number(row._id);
        if (hour >= 0 && hour < 24 && todayHourlyTrend[hour]) {
          todayHourlyTrend[hour].orders = row.orders || 0;
          todayHourlyTrend[hour].revenue = Math.round(row.revenue || 0);
        }
      });

      let peakHourToday = null;
      let peakHourOrders = 0;
      todayHourlyTrend.forEach((bucket) => {
        if (bucket.orders > peakHourOrders) {
          peakHourOrders = bucket.orders;
          peakHourToday = bucket.label;
        }
      });

      const paymentMethodBreakdown = paymentMethodRows.map((row, index) => ({
        method: row._id || 'UNKNOWN',
        label: buildPaymentLabel(row._id),
        count: row.count || 0,
        revenue: Math.round(row.revenue || 0),
        fill: PAYMENT_COLORS[index % PAYMENT_COLORS.length],
      }));

      const weekComparison = [
        { period: 'Last week', orders: ordersLastWeek, revenue: revenueLastWeek },
        { period: 'This week', orders: ordersThisWeek, revenue: Math.round(revenueThisWeek) },
      ];

      const ordersTrend = Object.values(trendMap).map((entry) => ({
        ...entry,
        revenue: Math.round(entry.revenue),
        label: new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      }));

      const ordersStatusTrend = Object.values(statusTrendMap);

      const orderStatusBreakdown = statusBreakdownRows
        .map(({ _id: status, count }) => ({
          status,
          label: STATUS_LABELS[status] || status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      const ratingCountMap = new Map(
        ratingStats.map((row) => [Number(row._id), row.count])
      );
      const ratingSum = ratingStats.reduce((sum, row) => sum + Number(row.sum || 0), 0);
      const ratingCount = ratingStats.reduce((sum, row) => sum + Number(row.count || 0), 0);

      const ratingBreakdown = [1, 2, 3, 4, 5].map((star) => ({
        star: `${star}★`,
        count: ratingCountMap.get(star) || 0,
      }));

      const avgRating = ratingCount
        ? Number((ratingSum / ratingCount).toFixed(1))
        : 0;

      const dashboardData = {
         totalOrders,
         totalEarnings: Math.round(totalEarnings),
         totalProducts,
         totalCustomers: totalCustomers[0]?.count || 0,
         abandonedCarts,
         analytics: {
           ordersTrend,
           ordersStatusTrend,
           statusTotals,
           orderStatusBreakdown,
           ratingBreakdown,
           avgOrderValue,
           avgRating,
           ordersThisWeek,
           revenueThisWeek: Math.round(revenueThisWeek),
           ordersToday,
           revenueToday,
           ordersLastWeek,
           revenueLastWeek,
           todayHourlyTrend,
           peakHourToday: peakHourOrders > 0 ? peakHourToday : null,
           paymentMethodBreakdown,
           weekComparison,
           awaitingPaymentCount,
         },
      };

      return NextResponse.json(
        { dashboardData },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
   } catch (error) {
      console.error(error);
      return NextResponse.json({ error: error.code || error.message }, { status: 400 });
   }
}
