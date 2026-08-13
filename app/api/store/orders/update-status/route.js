import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import Wallet from '@/models/Wallet';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
export async function POST(request) {
    try {
        // Authenticate user
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

        // Check if user is a seller
        const storeId = await authSeller(userId);
        if (!storeId) {
            return NextResponse.json({ error: 'Unauthorized - not a seller' }, { status: 403 });
        }

        // Get request body
        const { orderId, status, silent = false } = await request.json();

        if (!orderId || !status) {
            return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 });
        }

        const normalizedIncoming = String(status || '').toUpperCase();

        // Validate status
        const validStatuses = [
            'ORDER_PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED',
            'PAYMENT_FAILED', 'AWAITING_PAYMENT', 'RTO', 'RETURN', 'RETURNED', 'REPLACEMENT', 'RETURN_INITIATED', 'RETURN_APPROVED',
            'RETURN_REQUESTED', 'PICKUP_REQUESTED', 'WAITING_FOR_PICKUP', 
            'PICKED_UP', 'WAREHOUSE_RECEIVED', 'OUT_FOR_DELIVERY',
            // Lowercase variants for compatibility
            'pending', 'processing', 'shipped', 'delivered', 'cancelled'
        ];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: `Invalid status. Allowed statuses: ${validStatuses.join(', ')}` }, { status: 400 });
        }

        // Connect to database
        await dbConnect();

        // Find and update order (ensure we get a Mongoose document, not a plain object)
        const order = await Order.findById(orderId)
            .populate({ path: 'userId', select: 'email name' })
            .exec();
        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Verify that this order belongs to the seller's store
        // Check storeId at order level or in items
        const orderStoreId = order.storeId ? order.storeId.toString() : null;
        const orderItems = order.items || [];
        const itemStoreIds = orderItems.map(item => item.storeId?.toString()).filter(Boolean);
        
        const belongsToStore = orderStoreId === storeId.toString() || 
                              itemStoreIds.includes(storeId.toString());

        if (!belongsToStore) {
            console.log('[update-status] Order storeId:', orderStoreId);
            console.log('[update-status] Item storeIds:', itemStoreIds);
            console.log('[update-status] Seller storeId:', storeId);
            return NextResponse.json({ error: 'Unauthorized - order does not belong to your store' }, { status: 403 });
        }

        const previousStatus = String(order.status || '').toUpperCase();
        if (previousStatus === normalizedIncoming) {
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

        // Update order status
        order.status = status;

        // Auto-mark COD orders as PAID when delivered
        const normalizedStatus = normalizedIncoming;
        const paymentMethod = (order.paymentMethod || '').toLowerCase();
        
        if (normalizedStatus === 'DELIVERED' && paymentMethod === 'cod') {
            order.isPaid = true;
        }
        
        // Also check if Delhivery has reported payment collected
        if (order.delhivery?.payment?.is_cod_recovered && paymentMethod === 'cod') {
            order.isPaid = true;
        }

        if (normalizedStatus === 'DELIVERED' && order.userId && !order.rewardsCredited) {
            // Fixed reward per delivered order
            const coinsEarned = 10;

            if (coinsEarned > 0) {
                await Wallet.findOneAndUpdate(
                    { userId: order.userId },
                    {
                        $inc: { coins: coinsEarned },
                        $push: { transactions: { type: 'EARN', coins: coinsEarned, rupees: Number((coinsEarned * 1).toFixed(2)), orderId: order._id.toString() } }
                    },
                    { upsert: true, new: true }
                );
            }

            order.coinsEarned = coinsEarned;
            order.rewardsCredited = true;
        }

        await order.save();

        if (!silent) {
            try {
                const { notifyCustomerOfOrderStatusChange } = await import('@/lib/orderStatusCustomerNotify');
                await notifyCustomerOfOrderStatusChange(order, normalizedStatus, {
                    previousStatus,
                    source: 'store_status_picker',
                    force: true,
                    actor: { uid: userId, name: sellerName },
                });
            } catch (emailError) {
                console.error('[store/update-status] Email sending failed:', emailError);
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Order status updated and notifications sent',
            order: {
                _id: order._id,
                status: order.status
            }
        });

    } catch (error) {
        console.error('[update-status API] Error:', error);
        return NextResponse.json({ 
            error: 'Failed to update order status',
            message: error.message 
        }, { status: 500 });
    }
}
