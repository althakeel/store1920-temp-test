import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import {
    buildProductCostMap,
    buildSalesReportDateFilter,
    calculateOrderProductCost,
    getSalesReportOrderBucket,
    getSalesReportPaymentBucketLabel,
    shouldCountSalesReportRevenue,
} from '@/lib/storeSalesReport';
import {
    getOrderNetRevenue,
    loadCompletedReturnRefundsByOrderId,
} from '@/lib/returnSalesAdjustments';

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
        const dateFilter = buildSalesReportDateFilter(dateRange, fromDate, toDate);

        const orders = await Order.find({
            storeId,
            ...dateFilter,
            ...ACTIVE_RECORD_FILTER,
            status: { $ne: 'CANCELLED' },
        })
            .select('shortOrderNumber createdAt total shippingFee status orderItems paymentMethod paymentStatus isPaid delhivery')
            .sort({ createdAt: -1 })
            .lean();

        const revenueOrders = orders.filter((order) => shouldCountSalesReportRevenue(order));
        const productCostMap = await buildProductCostMap(revenueOrders, Product);
        const refundByOrderId = await loadCompletedReturnRefundsByOrderId(storeId, {
            orderIds: orders.map((order) => String(order._id)),
        });

        let csv = 'Order Number,Date,Payment Type,Gross Revenue,Refunded,Net Revenue,Product Cost,Delivery Cost,Profit/Loss,Included In Revenue,Status\n';

        for (const order of orders) {
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

            csv += `${order.shortOrderNumber},`;
            csv += `${new Date(order.createdAt).toLocaleDateString('en-IN')},`;
            csv += `${getSalesReportPaymentBucketLabel(paymentBucket)},`;
            csv += `${orderGrossRevenue},`;
            csv += `${refundedAmount},`;
            csv += `${orderRevenue},`;
            csv += `${orderProductCost},`;
            csv += `${orderDeliveryCost},`;
            csv += `${orderProfit},`;
            csv += `${countsTowardRevenue ? 'Yes' : 'No'},`;
            csv += `${order.status}\n`;
        }

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="sales-report.csv"',
            },
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json(
            { error: 'Failed to export report' },
            { status: 500 },
        );
    }
}
