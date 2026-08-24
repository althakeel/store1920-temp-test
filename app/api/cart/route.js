import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Address from "@/models/Address";
import AbandonedCart from "@/models/AbandonedCart";
import Product from "@/models/Product";
import { getAuth } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { getCartEntryProductId, getCartEntryQuantity, isFreeGiftEntry } from "@/lib/freeGiftUtils";
import { isPlaceholderName } from "@/lib/abandonedCartUtils";
import { scheduleAbandonedCartWhatsAppReminder, queueAbandonedCartWhatsAppDrain } from "@/lib/abandonedCheckoutWhatsAppReminder";
import { cartRestoreTokenSetOnInsert } from '@/lib/abandonedCartRestore';
import { getProductThumbnailUrl } from '@/lib/productMedia';


// Update user cart 
export async function POST(request){
    try {
        // Firebase Auth: get Bearer token from header
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.split(" ")[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (e) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = decodedToken.uid;

        await dbConnect();
        const { cart, customerInfo } = await request.json();

        // Ensure user exists (minimal) then update cart
        const user = await User.findOneAndUpdate(
            { _id: userId },
            { cart: cart },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Track abandoned carts by product store
        if (cart && Object.keys(cart).length > 0) {
            try {
                const cartItems = Object.entries(cart).map(([productId, entry]) => ({
                    productId: getCartEntryProductId(productId, entry),
                    quantity: getCartEntryQuantity(entry),
                    isFreeGift: isFreeGiftEntry(entry),
                })).filter((it) => it.quantity > 0 && it.productId && !it.isFreeGift);

                const productIds = cartItems.map(it => it.productId);
                const products = await Product.find({ _id: { $in: productIds } })
                    .select('_id storeId name price images image slug useProductsPath')
                    .lean();

                const productMap = new Map(products.map(p => [String(p._id), p]));
                const grouped = new Map();

                for (const it of cartItems) {
                    const prod = productMap.get(String(it.productId));
                    if (!prod?.storeId) continue;
                    const storeId = String(prod.storeId);
                    if (!grouped.has(storeId)) grouped.set(storeId, []);
                    grouped.get(storeId).push({
                        productId: it.productId,
                        name: prod.name,
                        quantity: it.quantity,
                        price: prod.price || 0,
                        imageUrl: getProductThumbnailUrl(prod, { fallback: '' }) || '',
                    });
                }

                const now = new Date();

                await Promise.all([...grouped.entries()].map(async ([storeId, storeItems]) => {
                    const existingCart = await AbandonedCart.findOne({
                        storeId,
                        userId,
                        status: { $ne: 'converted' },
                    })
                        .select('name email phone phoneCode address')
                        .lean();

                    const latestAddress = await Address.findOne({ userId })
                        .sort({ updatedAt: -1, createdAt: -1 })
                        .select('phone phoneCode')
                        .lean();

                    const userName = String(user.name || '').trim();
                    const safeUserName = !isPlaceholderName(userName) ? userName : null;
                    const userEmail = user.email?.toLowerCase()?.trim() || null;
                    const userPhone = user.phone?.trim()
                        || latestAddress?.phone?.trim()
                        || existingCart?.phone?.trim()
                        || null;
                    const phoneCode = latestAddress?.phoneCode
                        || existingCart?.phoneCode
                        || '+971';
                    const cartTotal = storeItems.reduce(
                        (sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)),
                        0
                    );

                    const filter = { storeId, userId, status: { $ne: 'converted' } };

                    await AbandonedCart.updateOne(
                        filter,
                        {
                            $set: {
                                storeId,
                                userId,
                                name: safeUserName || existingCart?.name || null,
                                email: userEmail || existingCart?.email || null,
                                phone: userPhone,
                                phoneCode,
                                address: customerInfo?.address || existingCart?.address || null,
                                items: storeItems,
                                cartTotal,
                                currency: process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || 'AED',
                                lastSeenAt: now,
                                source: 'cart',
                                status: 'active',
                            },
                            $setOnInsert: cartRestoreTokenSetOnInsert(),
                        },
                        { upsert: true }
                    );

                    if (userPhone) {
                        await scheduleAbandonedCartWhatsAppReminder(
                            { storeId, userId, status: 'active' },
                            { now, phone: userPhone }
                        );
                    }
                }));
                queueAbandonedCartWhatsAppDrain();
            } catch (err) {
                console.warn('[cart] Could not track abandoned cart:', err.message);
            }
        }

        return NextResponse.json({ message: 'Cart updated' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

// Get user cart 
export async function GET(request){
    try {
        // Firebase Auth: get Bearer token from header
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ cart: {} });
        }
        const idToken = authHeader.split(" ")[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (e) {
            return NextResponse.json({ cart: {} });
        }
        const userId = decodedToken.uid;

        await dbConnect();
        let user = await User.findOne({ _id: userId });

        // If user doesn't exist yet, create a minimal record so reads don't fail
        if (!user) {
            user = await User.create({
                _id: userId,
                name: 'Unknown',
                email: '',
                cart: {},
            });
        }

        return NextResponse.json({ cart: user.cart || {} });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

// Delete one item from user cart
export async function DELETE(request) {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const idToken = authHeader.split(" ")[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (e) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = decodedToken.uid;

        const { searchParams } = new URL(request.url);
        const queryProductId = searchParams.get('productId');

        let bodyProductId = null;
        try {
            const body = await request.json();
            bodyProductId = body?.productId || null;
        } catch {
            // Some clients/proxies drop DELETE body; query param fallback handles this.
        }

        const productKey = String(queryProductId || bodyProductId || "").trim();

        if (!productKey) {
            return NextResponse.json({ error: "productId is required" }, { status: 400 });
        }

        await dbConnect();

        const updatedUser = await User.findOneAndUpdate(
            { _id: userId },
            { $unset: { [`cart.${productKey}`]: 1 } },
            { new: true }
        );

        if (!updatedUser) {
            return NextResponse.json({ cart: {} });
        }

        return NextResponse.json({ cart: updatedUser.cart || {} });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}