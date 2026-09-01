import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import MarketingExpense from "@/models/MarketingExpense";
import authSeller from "@/middlewares/authSeller";
import { getAuth } from '@/lib/firebase-admin';
import {
    buildProductCostMap,
    buildSalesReportDateFilter,
    buildSalesReportPaymentSummary,
    calculateOrderProductCost,
    getSalesReportOrderBucket,
    getSalesReportPaymentBucketLabel,
    shouldCountSalesReportRevenue,
} from '@/lib/storeSalesReport';
import {
    getOrderNetRevenue,
    loadCompletedReturnRefundsByOrderId,
} from '@/lib/returnSalesAdjustments';
import { normalizeStoreOrderPaymentMethod } from '@/lib/storeOrderInsights';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';

export async function GET(req) {
    try {
        await connectDB();

        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decoded = await getAuth().verifyIdToken(token);
        if (!decoded?.uid) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const storeId = await authSeller(decoded.uid);
        if (!storeId) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const dateRange = searchParams.get('dateRange') || 'THIS_MONTH';
        const fromDate = searchParams.get('fromDate');
        const toDate = searchParams.get('toDate');
        const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));
        const dateFilter = buildSalesReportDateFilter(dateRange, fromDate, toDate);

        const [orders, marketingExpenses] = await Promise.all([
            Order.find({
                storeId,
                ...dateFilter,
                ...ACTIVE_RECORD_FILTER,
                status: { $ne: 'CANCELLED' },
            })
                .select('shortOrderNumber createdAt total shippingFee status orderItems paymentMethod paymentStatus isPaid delhivery')
                .sort({ createdAt: -1 })
                .lean(),
            MarketingExpense.find({ storeId, ...dateFilter }).select('amount').lean(),
        ]);

        const orderIds = orders.map((order) => String(order._id));
        const refundByOrderId = await loadCompletedReturnRefundsByOrderId(storeId, { orderIds });
        const paymentSummaryNet = buildSalesReportPaymentSummary(orders, refundByOrderId);
        const revenueOrders = orders.filter((order) => shouldCountSalesReportRevenue(order));
        const productCostMap = await buildProductCostMap(revenueOrders, Product);

        let totalRevenue = 0;
        let totalGrossRevenue = 0;
        let totalRefunds = 0;
        let totalProductCosts = 0;
        let totalDeliveryCosts = 0;
        const totalMarketingCosts = marketingExpenses.reduce(
            (sum, expense) => sum + Number(expense.amount || 0),
            0
        );

        const ordersWithProfit = orders.map((order) => {
            const paymentBucket = getSalesReportOrderBucket(order);
            const countsTowardRevenue = shouldCountSalesReportRevenue(order);
            const refundedAmount = refundByOrderId.get(String(order._id)) || 0;
            const orderProductCost = countsTowardRevenue
                ? calculateOrderProductCost(order, productCostMap)
                : 0;
            const orderGrossRevenue = Number(order.total || 0);
            const orderRevenue = getOrderNetRevenue(order, refundedAmount);
            const orderDeliveryCost = countsTowardRevenue ? Number(order.shippingFee || 0) : 0;
            const orderProfit = countsTowardRevenue
                ? orderRevenue - orderProductCost - orderDeliveryCost
                : 0;

            if (countsTowardRevenue) {
                totalGrossRevenue += orderGrossRevenue;
                totalRefunds += refundedAmount;
                totalRevenue += orderRevenue;
                totalProductCosts += orderProductCost;
                totalDeliveryCosts += orderDeliveryCost;
            }

            return {
                _id: order._id,
                shortOrderNumber: order.shortOrderNumber,
                createdAt: order.createdAt,
                total: orderRevenue,
                grossTotal: orderGrossRevenue,
                refundedAmount,
                productCost: orderProductCost,
                shippingFee: orderDeliveryCost,
                profit: orderProfit,
                status: order.status,
                paymentMethod: normalizeStoreOrderPaymentMethod(order),
                paymentBucket,
                paymentBucketLabel: getSalesReportPaymentBucketLabel(paymentBucket),
                countsTowardRevenue,
            };
        });

        const totalCosts = totalProductCosts + totalDeliveryCosts + totalMarketingCosts;
        const totalProfit = totalRevenue - totalCosts;
        const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        const avgOrderValue = paymentSummaryNet.totalOrders > 0
            ? totalRevenue / paymentSummaryNet.totalOrders
            : 0;
        const avgProfit = paymentSummaryNet.totalOrders > 0
            ? totalProfit / paymentSummaryNet.totalOrders
            : 0;

        const monthsMap = new Map();

        ordersWithProfit.forEach((order) => {
            if (!order.countsTowardRevenue) return;

            const monthYear = new Date(order.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
            });

            if (!monthsMap.has(monthYear)) {
                monthsMap.set(monthYear, {
                    month: monthYear,
                    orders: 0,
                    revenue: 0,
                    costs: 0,
                    profit: 0,
                });
            }

            const monthData = monthsMap.get(monthYear);
            monthData.orders += 1;
            monthData.revenue += order.total;
            monthData.costs += order.productCost + order.shippingFee;
            monthData.profit += order.profit;
        });

        const report = {
            totalRevenue,
            totalGrossRevenue,
            totalRefunds,
            totalCosts,
            productCosts: totalProductCosts,
            deliveryCosts: totalDeliveryCosts,
            marketingCosts: totalMarketingCosts,
            totalProfit,
            profitMargin,
            totalOrders: paymentSummaryNet.totalOrders,
            totalOrdersInRange: orders.length,
            avgOrderValue,
            avgProfit,
            monthlyData: Array.from(monthsMap.values()),
            paymentSummary: paymentSummaryNet,
        };

        const totalOrderRows = ordersWithProfit.length;
        const skip = (page - 1) * limit;
        const paginatedOrders = ordersWithProfit.slice(skip, skip + limit);

        return NextResponse.json({
            success: true,
            report,
            orders: paginatedOrders,
            pagination: {
                page,
                limit,
                total: totalOrderRows,
                totalPages: Math.max(1, Math.ceil(totalOrderRows / limit)),
            },
        });
    } catch (error) {
        console.error('Sales report error:', error);
        return NextResponse.json(
            { error: 'Failed to generate sales report' },
            { status: 500 }
        );
    }
}
