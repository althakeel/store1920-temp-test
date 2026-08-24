import authSeller from "@/middlewares/authSeller";
import { NextResponse } from "next/server";
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import Address from '@/models/Address';
import { fetchNormalizedDelhiveryTracking } from '@/lib/delhivery';
import AbandonedCart from '@/models/AbandonedCart';
import { attachConversionToOrders } from '@/lib/storeOrderInsights';
import { batchPopulateOrderUsers } from '@/lib/storeOrderUsers';
import { ACTIVE_RECORD_FILTER } from '@/lib/storeTrash';
import { repairOrderBundleLines } from '@/lib/bundleOrderRepair';
import { getOrderLineProduct } from '@/lib/orderDisplay';

const ORDER_LINE_PRODUCT_SELECT = 'name slug images sku variants price salePrice';

async function hydrateOrderItemProducts(orders = []) {
  const missingIds = new Set();

  for (const order of orders) {
    for (const item of order.orderItems || []) {
      const product = getOrderLineProduct(item);
      const rawId = typeof item.productId === 'object'
        ? (item.productId?._id || item.productId?.id)
        : item.productId;
      if (!rawId) continue;

      const hasName = Boolean(String(product?.name || item?.name || '').trim());
      const hasImage = Boolean(product?.images?.length || item?.image);
      const hasSku = Boolean(String(product?.sku || item?.sku || '').trim())
        || (Array.isArray(product?.variants) && product.variants.some((variant) => String(variant?.sku || '').trim()));
      // Always refill when populate was skipped/wiped, snapshot is empty, or SKU is missing for export.
      if (!hasName || !hasImage || !product?.variants || !hasSku) {
        missingIds.add(String(rawId));
      }
    }
  }

  if (!missingIds.size) return orders;

  const products = await Product.find({ _id: { $in: [...missingIds] } })
    .select(ORDER_LINE_PRODUCT_SELECT)
    .lean();
  const productById = new Map(products.map((product) => [String(product._id), product]));

  return orders.map((order) => ({
    ...order,
    orderItems: (order.orderItems || []).map((item) => {
      const rawId = typeof item.productId === 'object'
        ? String(item.productId?._id || item.productId?.id || '')
        : String(item.productId || '');
      const hydrated = productById.get(rawId);
      if (!hydrated) return item;
      const lineName = String(item.name || item.productName || '').trim();
      const nextItem = {
        ...item,
        name: lineName || hydrated.name || item.name || '',
      };
      if (typeof item.productId === 'object' && item.productId) {
        return { ...nextItem, productId: { ...item.productId, ...hydrated } };
      }
      return { ...nextItem, productId: hydrated };
    }),
  }));
}

// Debug log helper
function debugLog(...args) {
    try { console.log('[ORDER API DEBUG]', ...args); } catch {}
}



// Update seller order status
export async function POST(request) {
    try {
        await connectDB();
        
        // Firebase Auth: Extract token from Authorization header
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const { getAuth } = await import('firebase-admin/auth');
        const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
        if (getApps().length === 0) {
            initializeApp({ credential: applicationDefault() });
        }
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
        const userId = decodedToken.uid;
        const storeId = await authSeller(userId)
        if(!storeId){
            return NextResponse.json({ error: 'not authorized' }, { status: 401 })
        }

        const {orderId, status } = await request.json()

        await Order.findOneAndUpdate(
            { _id: orderId, storeId },
            { status }
        );

        return NextResponse.json({message: "Order Status updated"})
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 })
    }
}

// Get all orders for a seller
export async function GET(request){
    console.log('[ORDER API ROUTE] Route hit');
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const includeDelhivery = searchParams.get('withDelhivery') === 'true';
        const includeWaslah = searchParams.get('withWaslah') !== 'false';
        
        // Firebase Auth: Extract token from Authorization header
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const { getAuth } = await import('firebase-admin/auth');
        const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
        if (getApps().length === 0) {
            initializeApp({ credential: applicationDefault() });
        }
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
        const userId = decodedToken.uid;
        debugLog('userId from Firebase:', userId);
        const storeId = await authSeller(userId)
        debugLog('storeId from authSeller:', storeId);
        if(!storeId){
            debugLog('Not authorized: no storeId');
            return NextResponse.json({ error: 'not authorized' }, { status: 401 })
        }

        try {
            const { expireStaleAwaitingPaymentOrders } = await import('@/lib/deferredOrderFlow');
            await expireStaleAwaitingPaymentOrders(storeId);
        } catch (expireError) {
            debugLog('stale awaiting-payment expiry failed:', expireError?.message || expireError);
        }

        const [orders, convertedCarts] = await Promise.all([
            Order.find({ storeId, ...ACTIVE_RECORD_FILTER })
                .populate('addressId')
                .populate({
                    path: 'orderItems.productId',
                    model: 'Product',
                    select: ORDER_LINE_PRODUCT_SELECT,
                })
                .sort({ createdAt: -1, shortOrderNumber: -1 })
                .lean(),
            AbandonedCart.find({
                storeId,
                ...ACTIVE_RECORD_FILTER,
                convertedByName: { $nin: [null, ''] },
            })
                .select('_id userId email phone status convertedAt convertedBy convertedByName convertedCartTotal cartTotal conversionNote conversionDiscountType conversionDiscountValue conversionPaymentMethod linkedOrderId')
                .lean(),
        ]);
        
        debugLog('orders found:', orders.length);
        
        await batchPopulateOrderUsers(orders, { getAuth });
        
        if (orders.length > 0) {
            debugLog('First order after population:', {
                _id: orders[0]._id,
                userId: orders[0].userId,
                userIdType: typeof orders[0].userId,
                shippingAddress: orders[0].shippingAddress,
                isGuest: orders[0].isGuest
            });
        }

        let enrichedOrders = attachConversionToOrders(orders, convertedCarts);

        const bundleRepairUpdates = [];
        enrichedOrders = enrichedOrders.map((order) => {
            const { items, changed } = repairOrderBundleLines(order);
            if (!changed) return order;
            bundleRepairUpdates.push(
                Order.findByIdAndUpdate(order._id, { orderItems: items }).catch((err) => {
                    debugLog('bundle order repair failed for', order._id, err?.message || err);
                }),
            );
            return { ...order, orderItems: items };
        });
        if (bundleRepairUpdates.length) {
            Promise.all(bundleRepairUpdates).catch(() => {});
        }

        if (includeDelhivery) {
            const shouldFetchDelhivery = (order) => {
                const trackingId = order.trackingId || order.awb || order.airwayBillNo;
                const courier = (order.courier || '').toLowerCase();
                const isTerminal = ['DELIVERED', 'RTO', 'RETURN', 'RETURNED'].includes(order.status);
                return Boolean(trackingId) && (courier.includes('delhivery') || !order.trackingUrl) && !isTerminal;
            };

            const MAX_DELHIVERY_ENRICH = 20;
            let delhiveryEnriched = 0;

            enrichedOrders = await Promise.all(enrichedOrders.map(async (order) => {
                if (!shouldFetchDelhivery(order) || delhiveryEnriched >= MAX_DELHIVERY_ENRICH) return order;
                delhiveryEnriched += 1;
                const trackingId = order.trackingId || order.awb || order.airwayBillNo;
                try {
                    const normalized = await fetchNormalizedDelhiveryTracking(trackingId);
                    if (normalized) {
                        return {
                            ...order,
                            courier: normalized.courier || order.courier,
                            trackingId: normalized.trackingId || order.trackingId,
                            trackingUrl: normalized.trackingUrl || order.trackingUrl,
                            delhivery: normalized.delhivery
                        };
                    }
                } catch (dlErr) {
                    debugLog('Delhivery enrichment failed for order', order._id, dlErr?.message || dlErr);
                }
                return order;
            }));
        }

        if (includeWaslah) {
            try {
                const { syncWaslahStatusForOrders } = await import('@/lib/waslahOrderStatusSync');
                enrichedOrders = await syncWaslahStatusForOrders(enrichedOrders, {
                    max: 12,
                    persist: true,
                    concurrency: 4,
                });
            } catch (waslahSyncError) {
                debugLog('Waslah status sync failed:', waslahSyncError?.message || waslahSyncError);
            }
        }

        // Hydrate catalog name/images AFTER Waslah/Delhivery sync. Those paths can
        // re-read lean orders and wipe populated orderItems.productId.
        enrichedOrders = await hydrateOrderItemProducts(enrichedOrders);

        const { excludeReturnPickupCloneOrders } = await import('@/lib/storeReturnLabels');
        enrichedOrders = excludeReturnPickupCloneOrders(enrichedOrders);

        return NextResponse.json({orders: enrichedOrders})
    } catch (error) {
        console.error('[ORDER API ERROR]', error);
        debugLog('API error:', error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 })
    }
}
