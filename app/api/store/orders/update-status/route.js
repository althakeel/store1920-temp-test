import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  applySellerOrderStatus,
  isValidStoreOrderStatus,
  normalizeStoreOrderStatus,
  orderBelongsToStore,
} from '@/lib/storeOrderStatusUpdate';

export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
        }

        const idToken = authHeader.split(' ')[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (err) {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
        }

        const userId = decodedToken.uid;
        const sellerName = decodedToken.name || decodedToken.email || 'Store staff';

        const storeId = await authSeller(userId);
        if (!storeId) {
            return NextResponse.json({ error: 'Unauthorized - not a seller' }, { status: 403 });
        }

        const { orderId, status, silent = false } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 });
        }

        const normalizedIncoming = normalizeStoreOrderStatus(status);
        if (!isValidStoreOrderStatus(status) && !isValidStoreOrderStatus(normalizedIncoming)) {
            return NextResponse.json({ error: `Invalid status. Allowed statuses: ${normalizedIncoming}` }, { status: 400 });
        }

        await dbConnect();

        const order = await Order.findById(orderId)
            .populate({ path: 'userId', select: 'email name' })
            .exec();
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        if (!orderBelongsToStore(order, storeId)) {
            return NextResponse.json({ error: 'Unauthorized - order does not belong to your store' }, { status: 403 });
        }

        const result = await applySellerOrderStatus(order, normalizedIncoming, {
            silent,
            actor: { uid: userId, name: sellerName },
            source: 'store_status_picker',
        });

        if (!result.changed) {
            return NextResponse.json({
                success: true,
                message: 'Order status unchanged',
                skippedNotifications: true,
                order: {
                    _id: order._id,
                    status: order.status,
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Order status updated and notifications sent',
            order: {
                _id: order._id,
                status: order.status,
            },
        });
    } catch (error) {
        console.error('[update-status API] Error:', error);
        return NextResponse.json({
            error: 'Failed to update order status',
            message: error.message,
        }, { status: 500 });
    }
}
