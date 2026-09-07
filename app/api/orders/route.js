
import { NextResponse } from "next/server";
import Stripe from "stripe";
import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import User from '@/models/User';
import Address from '@/models/Address';
import Store from '@/models/Store';
import Coupon from '@/models/Coupon';
import SpinLog from '@/models/SpinLog';
import GuestUser from '@/models/GuestUser';
import Wallet from '@/models/Wallet';
import PersonalizedOffer from '@/models/PersonalizedOffer';
import StorePreference from '@/models/StorePreference';
import FreeGiftCampaign from '@/models/FreeGiftCampaign';
import AbandonedCart from '@/models/AbandonedCart';
import ShippingSetting from '@/models/ShippingSetting';
import { cartItemsMatchAbandoned, findActiveRecoveryCart } from '@/lib/abandonedCartRecoveryOffer';
import { sendOrderCreatedConfirmationNotifications } from '@/lib/orderConfirmationNotifications';
import { markAbandonedCartsConvertedForOrder } from '@/lib/markAbandonedCartsConverted';
import {
  applyDeferredPaymentOrderDefaults,
  isDeferredPaymentMethod,
  upsertAbandonedCartForPendingOrder,
} from '@/lib/deferredOrderFlow';
import { allocateShortOrderNumber } from '@/lib/orderNumber';
import { ensurePersistedShortOrderNumber, ensurePersistedShortOrderNumbers } from '@/lib/orderDisplayServer';
import { fetchNormalizedDelhiveryTracking } from '@/lib/delhivery';
import { createTamaraSession } from '@/lib/tamara';
import { buildCheckoutRedirectUrl, resolveTamaraMerchantBaseUrl } from '@/lib/checkoutOrigin';
import { getProductAbsoluteUrl } from '@/lib/productUrl';
import { createTabbySession, buildTabbyBuyerHistory, buildTabbyOrderHistoryEntries } from '@/lib/tabby';
import { formatPaymentProviderOrderReference } from '@/lib/orderPaymentReference';
import { normalizeEmail } from '@/lib/orderIdentity';
import { getCouponAccessErrorAsync } from '@/lib/couponAccess';
import { linkGuestOrdersToUser, resolveContactForGuestLinking } from '@/lib/linkGuestOrders';
import { getAuth } from '@/lib/firebase-admin';
import { recordPurchaseFromOrder, shouldRecordPurchaseOnCreate } from '@/lib/serverCustomerTracking';
import { recordEmailMarketingOrderConversion } from '@/lib/emailMarketingConversion';
import { sendMetaPurchaseFromOrder } from '@/lib/metaConversionsApi';
import {
  findBulkBundleVariant,
  isBulkBundleProduct,
} from '@/lib/bulkBundleCart';
import { applyFbtBundlePricingToOrderItems } from '@/lib/fbtCart';
import {
  getPaymentMethodLimitError,
  isPaymentMethodEnabled,
  isPaymentMethodOverLimit,
} from '@/lib/paymentMethodLimits';
import { requestWaslahAutoShipment } from '@/lib/waslahAutoShipment';
import { isWaslahAutoShipEnabled } from '@/lib/waslahAutoShipPolicy';
import { createPrepaidUpsellToken } from '@/lib/prepaidUpsellToken';
import {
  getClientIpFromRequest,
  stripeSecureCheckoutOptions,
} from '@/lib/paymentSecurity';
import { evaluateCheckoutFraud } from '@/lib/paymentFraud';
import { logPaymentEvent } from '@/lib/paymentTransactionLog';
import { reserveOrderStockAtomically } from '@/lib/orderStockReservation';
import { getVerifiedRazorpayOrder } from '@/lib/razorpayVerifiedOrderContext';
import { getTrustedManualStoreOrder } from '@/lib/manualStoreOrderContext';
import {
  matchVariantByOptions,
} from '@/lib/productVariantOptions';
import { checkoutOrderCreateSchema } from '@/lib/apiSchemas';
import { parseWithSchema } from '@/lib/apiValidate';

const PaymentMethod = {
    COD: 'COD',
    STRIPE: 'STRIPE',
    CARD: 'CARD',
    RAZORPAY: 'RAZORPAY',
    WALLET: 'WALLET'
};

async function getReferralRewardCoins(storeId) {
    if (!storeId) return 25;
    const preference = await StorePreference.findOne({ storeId }).select('shopShowcase.referralRewardCoins').lean();
    const configuredValue = Number(preference?.shopShowcase?.referralRewardCoins);
    if (!Number.isFinite(configuredValue)) return 25;
    return Math.min(10000, Math.max(0, Math.round(configuredValue)));
}

function deferPostOrderTask(label, task) {
    void Promise.resolve()
        .then(task)
        .catch((error) => {
            console.error(`[orders] Deferred ${label} failed:`, error);
        });
}



export async function POST(request) {
    try {
        await connectDB();
        
        // Parse the request without logging credentials, payment signatures, or
        // customer details from its headers/body.
        let bodyText = '';
        try { bodyText = await request.text(); } catch (err) { bodyText = '[unreadable]'; }
        let rawBody = {};
        try { rawBody = JSON.parse(bodyText); } catch (err) {
            return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
        }

        const parsed = parseWithSchema(rawBody, checkoutOrderCreateSchema);
        if (parsed.error) return parsed.error;
        const body = parsed.data;

        // Extract fields
        const {
            addressId,
            addressData,
            items,
            couponCode,
            coupon: couponPayload,
            paymentMethod,
            isGuest,
            guestInfo,
            coinsToRedeem,
            paymentStatus,
            razorpayPaymentId,
            razorpayOrderId,
            razorpaySignature,
            trackingContext,
            attribution,
            recoveryToken: recoveryTokenInput,
            manualStoreOrder,
        } = body;
        let userId = null;
        let isPlusMember = false;

        const manualStoreOrderRequested = manualStoreOrder === true;
        const manualStoreOrderContext = getTrustedManualStoreOrder();
        const trustedManualStoreOrder = Boolean(
            manualStoreOrderRequested
            && manualStoreOrderContext?.storeId
            && manualStoreOrderContext?.actorId
        );
        if (Boolean(manualStoreOrder) && !trustedManualStoreOrder) {
            return NextResponse.json({
                error: 'Manual store orders must be created from an authenticated store workflow',
                code: 'MANUAL_STORE_ORDER_FORBIDDEN',
            }, { status: 403 });
        }

        const verifiedRazorpayOrder = getVerifiedRazorpayOrder();
        const suppliedRazorpayPaymentId = String(razorpayPaymentId || '');
        const suppliedRazorpayOrderId = String(razorpayOrderId || '');
        const suppliedRazorpaySignature = String(razorpaySignature || '');
        const hasRazorpayPaymentDetails = Boolean(
            suppliedRazorpayPaymentId
            || suppliedRazorpayOrderId
            || suppliedRazorpaySignature
        );
        const isVerifiedRazorpayOrder = Boolean(
            hasRazorpayPaymentDetails
            && suppliedRazorpayPaymentId === verifiedRazorpayOrder?.paymentId
            && suppliedRazorpayOrderId === verifiedRazorpayOrder?.orderId
            && suppliedRazorpaySignature === verifiedRazorpayOrder?.signature
        );

        // Razorpay payment details are accepted only inside the server-verified
        // flow. A public caller cannot turn CARD into a paid order by replaying
        // provider ids or a previously issued checkout signature.
        if (hasRazorpayPaymentDetails && !isVerifiedRazorpayOrder) {
            return NextResponse.json({
                error: 'Razorpay payment must be verified before order creation',
                code: 'RAZORPAY_VERIFICATION_REQUIRED',
            }, { status: 403 });
        }

        // Auth for logged-in user - ONLY if explicitly NOT a guest
        if (isGuest !== true) {
            const authHeader = request.headers.get('authorization');
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return NextResponse.json({ 
                    error: 'Authentication required for non-guest orders',
                    isGuest: isGuest,
                    hasAuthHeader: !!authHeader
                }, { status: 401 });
            }
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const decodedToken = await getAuth().verifyIdToken(idToken);
                userId = decodedToken.uid;
                isPlusMember = decodedToken.plan === 'plus';
            } catch (err) {
                console.error('Token verification error:', err);
                return NextResponse.json({ error: 'Token verification failed', details: err?.message || err }, { status: 401 });
            }
        }

        const validateShippingAddress = (address, sourceLabel) => {
            const missing = [];
            if (!address?.street) missing.push('street');
            if (!address?.city) missing.push('city');
            if (!address?.state) missing.push('state');
            if (!address?.country) missing.push('country');
            if (missing.length > 0) {
                return NextResponse.json(
                    { error: 'shipping address required', missingFields: missing, source: sourceLabel },
                    { status: 400 }
                );
            }
            return null;
        };

        const normalizeZip = (...candidates) => {
            for (const candidate of candidates) {
                if (candidate === undefined || candidate === null) continue;
                const normalized = String(candidate).trim();
                if (normalized) return normalized;
            }
            return '';
        };

        const isInvalidPincode = (zip) => {
            const normalized = normalizeZip(zip);
            if (!normalized) return true;
            return /^0+$/.test(normalized);
        };

        const isIndiaCountry = (country) => String(country || '').trim().toLowerCase() === 'india';

        // Validation
        if (isGuest === true) {
            console.log('ORDER API: Validating guest order...');
            const missingFields = [];
            if (!guestInfo) missingFields.push('guestInfo');
            else {
                if (!guestInfo.name) missingFields.push('name');
                if (!guestInfo.email) missingFields.push('email');
                if (!guestInfo.phone) missingFields.push('phone');
                if (!guestInfo.address && !guestInfo.street) missingFields.push('address');
                if (!guestInfo.city) missingFields.push('city');
                if (!guestInfo.state) missingFields.push('state');
                if (!guestInfo.country) missingFields.push('country');
                const guestZip = normalizeZip(guestInfo.pincode, guestInfo.zip);
                if (isIndiaCountry(guestInfo.country) && (!guestZip || isInvalidPincode(guestZip))) {
                    missingFields.push('pincode');
                }
            }
            if (missingFields.length > 0) {
                return NextResponse.json({ error: 'missing guest information', missingFields, guestInfo }, { status: 400 });
            }
            const guestAddressCheck = validateShippingAddress(
                {
                    street: guestInfo.address || guestInfo.street,
                    city: guestInfo.city,
                    state: guestInfo.state,
                    country: guestInfo.country
                },
                'guestInfo'
            );
            if (guestAddressCheck) return guestAddressCheck;
            if (!paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
                return NextResponse.json({ error: 'missing order details.', details: { paymentMethod, items }, guestInfo }, { status: 400 });
            }
        } else {
            if (!userId || !paymentMethod || !items || !Array.isArray(items) || items.length === 0) {
                return NextResponse.json({ error: 'missing order details.' }, { status: 400 });
            }
            if (!addressId && !(addressData && addressData.street)) {
                return NextResponse.json({ error: 'shipping address required' }, { status: 400 });
            }
            if (addressData && addressData.street) {
                const addressDataCheck = validateShippingAddress(addressData, 'addressData');
                if (addressDataCheck) return addressDataCheck;
                const inlineZip = normalizeZip(addressData.pincode, addressData.zip);
                if (isIndiaCountry(addressData.country) && (!inlineZip || isInvalidPincode(inlineZip))) {
                    return NextResponse.json({ error: 'shipping address required', missingFields: ['pincode'], source: 'addressData' }, { status: 400 });
                }
            }
        }

        const hasPersonalizedOfferItem = Array.isArray(items)
            ? items.some((item) => typeof item?.offerToken === 'string' && item.offerToken.trim().length > 0)
            : false;

        if (hasPersonalizedOfferItem && String(paymentMethod || '').toUpperCase() === 'COD') {
            return NextResponse.json(
                { error: 'Cash on Delivery is not available for personalized offer products. Please use online payment.' },
                { status: 400 }
            );
        }

        const recoveryToken = String(recoveryTokenInput || '').trim();
        let recoveryContext = null;
        if (recoveryToken) {
            recoveryContext = await findActiveRecoveryCart(AbandonedCart, recoveryToken);
            if (!recoveryContext.valid) {
                return NextResponse.json({ error: recoveryContext.error || 'Invalid recovery offer' }, { status: 400 });
            }
        }
        const recoveryPriceByProduct = recoveryContext?.valid
            ? new Map((recoveryContext.discountedItems || []).map((item) => [
                String(item.productId || item.id),
                Number(item.price || 0),
            ]))
            : null;

        // Coupon logic
        let coupon = null;
        const normalizedCouponCode = String(couponCode || couponPayload?.code || '').trim().toUpperCase();
        if (normalizedCouponCode) {
            coupon = await Coupon.findOne({ code: normalizedCouponCode }).lean();
            if (!coupon) return NextResponse.json({ error: 'Coupon not found' }, { status: 400 });
            const couponAccessError = await getCouponAccessErrorAsync(coupon, userId, SpinLog);
            if (couponAccessError) {
                return NextResponse.json({ error: couponAccessError }, { status: 400 });
            }
            if (coupon.forNewUser) {
                const userorders = await Order.find({ userId }).lean();
                if (userorders.length > 0) return NextResponse.json({ error: 'Coupon valid for new users' }, { status: 400 });
            }
            if (coupon.forMember && !isPlusMember) {
                return NextResponse.json({ error: 'Coupon valid for members only' }, { status: 400 });
            }
        }

        // Group items by store
        const ordersByStore = new Map();
        const checkoutStoreIds = new Set();
        let grandSubtotal = 0;

        const productSelect = '_id name slug price mrp AED images category sku inStock stockQuantity storeId variants';
        const validProductIds = [...new Set(
            items
                .map((item) => item.id)
                .filter((id) => typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id)),
        )];
        const loadedProducts = validProductIds.length
            ? await Product.find({ _id: { $in: validProductIds } }).select(productSelect).lean()
            : [];
        const productById = new Map(loadedProducts.map((product) => [String(product._id), product]));

        const missingProductIds = validProductIds.filter((id) => !productById.has(String(id)));
        if (missingProductIds.length > 0) {
            const altProducts = await Product.find({
                $or: [
                    { _id: { $in: missingProductIds } },
                    { id: { $in: missingProductIds } },
                    { slug: { $in: missingProductIds } },
                ],
            }).select(productSelect).lean();
            for (const product of altProducts) {
                productById.set(String(product._id), product);
            }
        }

        const offerTokenPairs = items
            .filter((item) => item.offerToken)
            .map((item) => ({ token: item.offerToken, productId: String(item.id) }));
        const offerByKey = new Map();
        if (offerTokenPairs.length > 0) {
            const offers = await PersonalizedOffer.find({
                offerToken: { $in: [...new Set(offerTokenPairs.map((entry) => entry.token))] },
                productId: { $in: [...new Set(offerTokenPairs.map((entry) => entry.productId))] },
            }).lean();
            for (const offer of offers) {
                offerByKey.set(`${offer.offerToken}:${String(offer.productId)}`, offer);
            }
        }

        const fbtMainProductIds = [...new Set(
            items
                .map((item) => item.fbtMainProductId)
                .filter(Boolean)
                .map(String),
        )];
        const fbtConfigByMainProductId = new Map();
        if (fbtMainProductIds.length > 0) {
            const fbtConfigs = await Product.find({
                _id: { $in: fbtMainProductIds },
                enableFBT: true,
            })
                .select('_id enableFBT fbtProductIds fbtBundlePrice fbtBundleDiscount')
                .lean();
            for (const config of fbtConfigs) {
                fbtConfigByMainProductId.set(String(config._id), config);
            }
        }

        const campaignIds = [...new Set(
            items
                .map((item) => item.freeGift?.campaignId)
                .filter(Boolean)
                .map(String),
        )];
        const campaignById = new Map();
        if (campaignIds.length > 0) {
            const campaigns = await FreeGiftCampaign.find({ _id: { $in: campaignIds } })
                .select('_id storeId giftProductId isActive')
                .lean();
            for (const campaign of campaigns) {
                campaignById.set(String(campaign._id), campaign);
            }
        }

        for (const item of items) {
            if (!item.id || typeof item.id !== 'string' || !item.id.match(/^[a-fA-F0-9]{24}$/)) {
                console.error('Invalid or missing productId in order item:', item.id);
                return NextResponse.json({ 
                    error: `Invalid product ID format: "${item.id}". Product IDs must be 24-character unique identifiers.`, 
                    id: item.id 
                }, { status: 400 });
            }

            const product = productById.get(String(item.id));
            if (!product) {
                console.error('Product not found in database. ProductId:', item.id);
                return NextResponse.json({ 
                    error: `Product not found (ID: ${item.id}). This product may have been deleted. Please clear your cart and add items again.`, 
                    id: item.id,
                    productId: item.id 
                }, { status: 400 });
            }

            // Stock validation - enforce available stock and max per order (20)
            const requestedQty = Math.min(Number(item.quantity) || 0, 20);
            if (requestedQty <= 0) {
                return NextResponse.json({ error: 'Quantity must be at least 1', id: item.id }, { status: 400 });
            }
            // If variantOptions provided, validate against matching variant stock; else product stockQuantity
            let availableQty = typeof product.stockQuantity === 'number' ? product.stockQuantity : 0;
            let variantMatch = null;
            if (item.variantOptions && Array.isArray(product.variants) && product.variants.length > 0) {
                const match = matchVariantByOptions(product.variants, item.variantOptions);
                if (!match) {
                    return NextResponse.json({ error: 'Selected variant not found', id: item.id, variantOptions: item.variantOptions }, { status: 400 });
                }
                variantMatch = match;
                availableQty = typeof match.stock === 'number' ? match.stock : availableQty;
            }
            const isBundleOrder = isBulkBundleProduct(product) && Number(item.variantOptions?.bundleQty) > 0;
            const orderQty = isBundleOrder ? 1 : requestedQty;
            if (availableQty < orderQty) {
                return NextResponse.json({ error: 'Insufficient stock', id: item.id, availableQty, requestedQty: orderQty }, { status: 400 });
            }
            
            // Check for personalized offer token and validate
            let finalPrice = product.price;
            let appliedOffer = null;
            
            if (item.offerToken) {
                try {
                    const offer = offerByKey.get(`${item.offerToken}:${String(item.id)}`);
                    
                    if (offer) {
                        // Validate offer
                        const now = new Date();
                        const isValid = offer.isActive && 
                                       !offer.isUsed && 
                                       new Date(offer.expiresAt) > now;
                        
                        if (isValid) {
                            // Apply discount
                            const discountAmount = (product.price * offer.discountPercent) / 100;
                            finalPrice = Math.round(product.price - discountAmount);
                            appliedOffer = {
                                offerId: offer._id,
                                offerToken: offer.offerToken,
                                discountPercent: offer.discountPercent,
                                originalPrice: product.price,
                                discountedPrice: finalPrice
                            };
                            console.log(`Applied personalized offer: ${offer.discountPercent}% off. Price: ${product.price} -> ${finalPrice}`);
                        } else {
                            console.warn(`Offer token ${item.offerToken} is invalid or expired`);
                            // Continue with regular price
                        }
                    } else {
                        console.warn(`Offer token ${item.offerToken} not found`);
                    }
                } catch (err) {
                    console.error('Error validating offer token:', err);
                    // Continue with regular price
                }
            }

            if (item.freeGift?.campaignId) {
                try {
                    const campaign = campaignById.get(String(item.freeGift.campaignId));
                    if (
                        campaign?.isActive &&
                        String(campaign.giftProductId) === String(item.id) &&
                        String(campaign.storeId) === String(product.storeId)
                    ) {
                        finalPrice = 0;
                    }
                } catch (err) {
                    console.error('Error validating free gift campaign:', err);
                }
            }

            // Base catalog pricing: bundle tier price or matched variant price.
            if (isBundleOrder) {
                const bundleVariant = findBulkBundleVariant(product, item.variantOptions.bundleQty) || variantMatch;
                if (bundleVariant?.price != null) {
                    finalPrice = Number(bundleVariant.price);
                }
            } else if (variantMatch?.price != null) {
                finalPrice = Number(variantMatch.price);
            }

            // Private recovery-link offer price overrides catalog pricing (incl. bundles),
            // so the recovered checkout matches the discounted total the customer was shown.
            if (
                recoveryPriceByProduct?.has(String(item.id))
                && !item.offerToken
                && !item.freeGift?.campaignId
            ) {
                finalPrice = recoveryPriceByProduct.get(String(item.id));
            }
            
            const storeId = product.storeId;
            if (!ordersByStore.has(storeId)) ordersByStore.set(storeId, []);
            checkoutStoreIds.add(String(storeId));
            ordersByStore.get(storeId).push({ 
                ...item,
                name: item.name || item.productName || item.title || product.name || '',
                quantity: orderQty, 
                price: finalPrice,
                appliedOffer: appliedOffer 
            });
            grandSubtotal += Number(finalPrice) * Number(orderQty);
        }

        if (
            trustedManualStoreOrder
            && [...checkoutStoreIds].some(
                (checkoutStoreId) => checkoutStoreId !== manualStoreOrderContext.storeId,
            )
        ) {
            return NextResponse.json({
                error: 'Manual store order items must belong to the authenticated store',
                code: 'MANUAL_STORE_ORDER_STORE_MISMATCH',
            }, { status: 403 });
        }

        applyFbtBundlePricingToOrderItems(ordersByStore, fbtConfigByMainProductId);
        grandSubtotal = 0;
        for (const sellerItems of ordersByStore.values()) {
            for (const item of sellerItems) {
                grandSubtotal += Number(item.price) * Number(item.quantity);
            }
        }

        if (recoveryContext?.valid) {
            if (!cartItemsMatchAbandoned(items, recoveryContext.cart.items || [])) {
                return NextResponse.json({
                    error: 'Recovery offer does not match the current cart items',
                }, { status: 400 });
            }

            const recoveryStoreId = String(recoveryContext.cart.storeId || '');
            const recoveryItems = ordersByStore.get(recoveryStoreId) || [];
            if (!recoveryItems.length) {
                return NextResponse.json({
                    error: 'Recovery offer store items not found in cart',
                }, { status: 400 });
            }

            const recoverySubtotal = recoveryItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const expectedSubtotal = Number(recoveryContext.offerTotal || 0);
            if (Math.abs(recoverySubtotal - expectedSubtotal) > 0.05) {
                return NextResponse.json({
                    error: 'Recovery offer pricing is no longer valid for this cart',
                }, { status: 400 });
            }
        }

        // Shipping: use from payload, fallback to 0
        let shippingFee = typeof body.shippingFee === 'number' ? body.shippingFee : 0;
        let isShippingFeeAdded = false;

        // Wallet redemption (logged-in users only)
        let redeemableCoins = 0;
        let walletRedeemApplied = false;
        let wallet = null;
        if (userId && Number(coinsToRedeem) > 0) {
            wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = await Wallet.create({ userId, coins: 0 });
            }
            const availableCoins = Number(wallet.coins || 0);
            redeemableCoins = Math.max(0, Math.min(Math.floor(Number(coinsToRedeem)), availableCoins));
        }

        const freeShippingCoupon = Boolean(coupon?.freeShipping);
        let projectedCheckoutTotal = 0;
        let projectedShippingAdded = false;
        let projectedWalletApplied = false;
        for (const [, sellerItems] of ordersByStore.entries()) {
            let storeTotal = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            if (normalizedCouponCode && coupon) {
                const normalizedDiscountValue = Number(coupon.discountValue ?? coupon.discount ?? 0);
                if (coupon.discountType === 'percentage') {
                    storeTotal -= (storeTotal * normalizedDiscountValue) / 100;
                } else {
                    storeTotal -= Math.min(normalizedDiscountValue, storeTotal);
                }
            }
            if (!isPlusMember && !projectedShippingAdded && !freeShippingCoupon) {
                storeTotal += shippingFee;
                projectedShippingAdded = true;
            }
            if (!projectedWalletApplied && redeemableCoins > 0) {
                const maxCoinsByTotal = Math.floor(storeTotal / 1);
                const coinsRedeemed = Math.min(redeemableCoins, maxCoinsByTotal);
                const walletDiscount = Number((coinsRedeemed * 1).toFixed(2));
                storeTotal = Math.max(0, Number((storeTotal - walletDiscount).toFixed(2)));
                projectedWalletApplied = true;
            }
            projectedCheckoutTotal += parseFloat(storeTotal.toFixed(2));
        }

        const primaryStoreId = [...ordersByStore.keys()][0];
        const shippingSettingForLimits = primaryStoreId
            ? await ShippingSetting.findOne({ storeId: primaryStoreId }).lean()
            : null;
        const paymentLimitError = getPaymentMethodLimitError(
            shippingSettingForLimits,
            paymentMethod,
            projectedCheckoutTotal,
            { hasPersonalizedOfferItem },
        );
        if (paymentLimitError) {
            return NextResponse.json({ error: paymentLimitError }, { status: 400 });
        }

        // Order creation
        let orderIds = [];
        const createdOrderTotals = new Map();
        let fullAmount = 0;
        for (const [storeId, sellerItems] of ordersByStore.entries()) {
            // Ensure user exists in DB (upsert)
            if (userId) {
                await User.findOneAndUpdate(
                    { _id: userId },
                    { $setOnInsert: { _id: userId, name: '', email: '', image: '', cart: {} } },
                    { upsert: true, new: true }
                );
            }
            
            // Existence checks (parallel)
            const [addressExists, storeExists] = await Promise.all([
                addressId ? Address.findById(addressId).lean() : Promise.resolve(null),
                storeId ? Store.findById(storeId).select('_id').lean() : Promise.resolve(null),
            ]);
            if (addressId) {
                if (!addressExists) {
                    return NextResponse.json({ error: 'Address not found' }, { status: 400 });
                }
                const addressCheck = validateShippingAddress(addressExists, 'addressId');
                if (addressCheck) return addressCheck;
                const savedZip = normalizeZip(addressExists.pincode, addressExists.zip);
                if (isIndiaCountry(addressExists.country) && (!savedZip || isInvalidPincode(savedZip))) {
                    return NextResponse.json({ error: 'invalid pincode in selected address. Please update address.' }, { status: 400 });
                }
            }
            if (storeId) {
                if (!storeExists) {
                    return NextResponse.json({ error: 'Store not found' }, { status: 400 });
                }
            }
            
            let total = sellerItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            const freeShippingCoupon = Boolean(coupon?.freeShipping);
            if (normalizedCouponCode && coupon) {
                const normalizedDiscountValue = Number(coupon.discountValue ?? coupon.discount ?? 0);
                if (coupon.discountType === 'percentage') {
                    total -= (total * normalizedDiscountValue) / 100;
                } else {
                    total -= Math.min(normalizedDiscountValue, total);
                }
            }
            if (!isPlusMember && !isShippingFeeAdded && !freeShippingCoupon) {
                total += shippingFee;
                isShippingFeeAdded = true;
            }

            // Apply wallet discount once across the entire checkout
            let coinsRedeemed = 0;
            let walletDiscount = 0;
            if (!walletRedeemApplied && redeemableCoins > 0) {
                const maxCoinsByTotal = Math.floor(total / 1);
                coinsRedeemed = Math.min(redeemableCoins, maxCoinsByTotal);
                walletDiscount = Number((coinsRedeemed * 1).toFixed(2));
                total = Math.max(0, Number((total - walletDiscount).toFixed(2)));
                walletRedeemApplied = true;
            }

            fullAmount += parseFloat(total.toFixed(2));

            // Prepare order data
            const orderData = {
                storeId: storeId,
                total: parseFloat(total.toFixed(2)),
                shippingFee: shippingFee,
                paymentMethod,
                paymentStatus: paymentStatus || 'PENDING',
                fulfillmentStockReservationRequired: true,
                isCouponUsed: !!coupon,
                coupon: coupon || {},
                coinsRedeemed,
                walletDiscount,
                waslah: {
                    autoShipEnrolled: isWaslahAutoShipEnabled(),
                    autoShipEnrolledAt: isWaslahAutoShipEnabled() ? new Date() : null,
                },
                orderItems: sellerItems.map(item => ({
                    productId: item.id,
                    name: item.name || item.productName || item.title || productById.get(String(item.id))?.name || '',
                    quantity: item.quantity,
                    price: item.price,
                    variantOptions: item.variantOptions || null,
                }))
            };

            const normalizedPaymentMethod = String(paymentMethod || '').toUpperCase();
            const paidOnlineMethods = new Set(['CARD', 'RAZORPAY', 'UPI', 'NETBANKING', 'ONLINE', 'PREPAID', 'WALLET']);
            const prepaidCapturedAtCreate = normalizedPaymentMethod === 'CARD'
                && isVerifiedRazorpayOrder;
            const deferPaymentAtCreate = isDeferredPaymentMethod(paymentMethod)
                && !prepaidCapturedAtCreate;

            if (normalizedPaymentMethod === 'COD') {
                orderData.isPaid = false;
                orderData.paymentStatus = paymentStatus || 'PENDING';
            } else if (paidOnlineMethods.has(normalizedPaymentMethod) && normalizedPaymentMethod !== 'CARD') {
                orderData.isPaid = true;
                orderData.paymentStatus = paymentStatus || 'PAID';
            }

            Object.assign(
                orderData,
                trustedManualStoreOrder || prepaidCapturedAtCreate
                  ? {}
                  : applyDeferredPaymentOrderDefaults(orderData, paymentMethod),
            );

            if (prepaidCapturedAtCreate) {
                orderData.status = 'ORDER_PLACED';
                orderData.isPaid = true;
                orderData.paymentStatus = 'PAID';
            }

            if (trustedManualStoreOrder) {
                orderData.status = 'ORDER_PLACED';
                if (normalizedPaymentMethod === 'COD') {
                    orderData.isPaid = false;
                    orderData.paymentStatus = paymentStatus || 'PENDING';
                } else {
                    orderData.isPaid = true;
                    orderData.paymentStatus = paymentStatus || 'PAID';
                }
            }

            if (razorpayPaymentId) orderData.razorpayPaymentId = razorpayPaymentId;
            if (razorpayOrderId) orderData.razorpayOrderId = razorpayOrderId;
            if (razorpaySignature) orderData.razorpaySignature = razorpaySignature;

            if (trackingContext && typeof trackingContext === 'object') {
                const hasTracking = trackingContext.anonymousId
                    || trackingContext.sessionId
                    || trackingContext.fbp
                    || trackingContext.fbc
                    || trackingContext.eventSourceUrl
                    || trackingContext.emailTrackingToken;
                if (hasTracking) {
                    orderData.trackingContext = {
                        anonymousId: trackingContext.anonymousId ? String(trackingContext.anonymousId) : null,
                        sessionId: trackingContext.sessionId ? String(trackingContext.sessionId) : null,
                        fbp: trackingContext.fbp ? String(trackingContext.fbp) : null,
                        fbc: trackingContext.fbc ? String(trackingContext.fbc) : null,
                        eventSourceUrl: trackingContext.eventSourceUrl ? String(trackingContext.eventSourceUrl) : null,
                        emailTrackingToken: trackingContext.emailTrackingToken
                            ? String(trackingContext.emailTrackingToken)
                            : null,
                    };
                }
            }

            if (attribution && typeof attribution === 'object') {
                orderData.attribution = {
                    utmSource: attribution.utmSource || null,
                    utmMedium: attribution.utmMedium || null,
                    utmCampaign: attribution.utmCampaign || null,
                    utmContent: attribution.utmContent || null,
                    utmTerm: attribution.utmTerm || null,
                    utmId: attribution.utmId || null,
                    utmReferrer: attribution.utmReferrer || null,
                };
            }

            if (isGuest) {
                // Robust upsert for guest user
                await User.findOneAndUpdate(
                    { _id: 'guest' },
                    { $setOnInsert: { _id: 'guest', name: 'Guest User', email: 'guest@system.local', image: '', cart: [] } },
                    { upsert: true, new: true }
                );
                
                // Only create and assign guest address if address fields are present
                if (guestInfo.address || guestInfo.street) {
                    const guestZip = normalizeZip(guestInfo.pincode, guestInfo.zip);
                    const guestAddress = await Address.create({
                        userId: 'guest',
                        name: guestInfo.name,
                        email: guestInfo.email,
                        phone: guestInfo.phone,
                        phoneCode: guestInfo.phoneCode || '+91',
                        alternatePhone: guestInfo.alternatePhone || '',
                        alternatePhoneCode: guestInfo.alternatePhoneCode || guestInfo.phoneCode || '+91',
                        street: guestInfo.address || guestInfo.street,
                        city: guestInfo.city || 'Guest',
                        state: guestInfo.state || 'Guest',
                        zip: guestZip,
                        country: guestInfo.country || 'UAE'
                    });
                    orderData.addressId = guestAddress._id.toString();
                    orderData.shippingAddress = {
                        name: guestInfo.name,
                        email: normalizeEmail(guestInfo.email),
                        phone: String(guestInfo.phone || '').replace(/\D/g, ''),
                        phoneCode: guestInfo.phoneCode || '+91',
                        alternatePhone: guestInfo.alternatePhone || '',
                        alternatePhoneCode: guestInfo.alternatePhoneCode || guestInfo.phoneCode || '+91',
                        street: guestInfo.address || guestInfo.street,
                        city: guestInfo.city || 'Guest',
                        state: guestInfo.state || 'Guest',
                        zip: guestZip,
                        country: guestInfo.country || 'UAE',
                        district: guestInfo.district || ''
                    };
                }
                orderData.isGuest = true;
                orderData.guestName = guestInfo.name;
                orderData.guestEmail = normalizeEmail(guestInfo.email);
                orderData.guestPhone = String(guestInfo.phone || '').replace(/\D/g, '');
                orderData.alternatePhone = guestInfo.alternatePhone || '';
                orderData.alternatePhoneCode = guestInfo.alternatePhoneCode || guestInfo.phoneCode || '';

                // Upsert guestUser record
                const convertToken = crypto.randomBytes(32).toString('hex');
                const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                await GuestUser.findOneAndUpdate(
                    { email: normalizeEmail(guestInfo.email) },
                    {
                        name: guestInfo.name,
                        email: normalizeEmail(guestInfo.email),
                        phone: guestInfo.phone,
                        convertToken,
                        tokenExpiry
                    },
                    { upsert: true, new: true }
                );
            } else {
                if (typeof userId === 'string' && userId.trim() !== '') {
                    orderData.userId = userId;
                }
                // Handle address - either from addressId or addressData
                if (typeof addressId === 'string' && addressId.trim() !== '') {
                    orderData.addressId = addressId;
                    // Fetch and store address data as embedded document
                    const address = await Address.findById(addressId).lean();
                    if (address) {
                        orderData.shippingAddress = {
                            name: address.name,
                            email: address.email,
                            phone: address.phone,
                            phoneCode: address.phoneCode || '+91',
                            alternatePhone: address.alternatePhone || '',
                            alternatePhoneCode: address.alternatePhoneCode || address.phoneCode || '+91',
                            street: address.street,
                            city: address.city,
                            state: address.state,
                            zip: address.zip,
                            country: address.country,
                            district: address.district || ''
                        };
                        orderData.alternatePhone = address.alternatePhone || '';
                        orderData.alternatePhoneCode = address.alternatePhoneCode || address.phoneCode || '';
                    }
                } else if (addressData && addressData.street) {
                    // User provided address data inline - save it and use it
                    const inlineZip = normalizeZip(addressData.pincode, addressData.zip);
                    const newAddress = await Address.create({
                        userId: userId,
                        name: addressData.name,
                        email: addressData.email,
                        phone: addressData.phone,
                        phoneCode: addressData.phoneCode || '+91',
                        alternatePhone: addressData.alternatePhone || '',
                        alternatePhoneCode: addressData.alternatePhoneCode || addressData.phoneCode || '+91',
                        street: addressData.street,
                        city: addressData.city,
                        state: addressData.state,
                        zip: inlineZip,
                        country: addressData.country,
                        district: addressData.district || ''
                    });
                    orderData.addressId = newAddress._id.toString();
                    orderData.shippingAddress = {
                        name: addressData.name,
                        email: addressData.email,
                        phone: addressData.phone,
                        phoneCode: addressData.phoneCode || '+91',
                        alternatePhone: addressData.alternatePhone || '',
                        alternatePhoneCode: addressData.alternatePhoneCode || addressData.phoneCode || '+91',
                        street: addressData.street,
                        city: addressData.city,
                        state: addressData.state,
                        zip: inlineZip,
                        country: addressData.country,
                        district: addressData.district || ''
                    };
                    orderData.alternatePhone = addressData.alternatePhone || '';
                    orderData.alternatePhoneCode = addressData.alternatePhoneCode || addressData.phoneCode || '';
                }
            }

            // Create order
            const order = await Order.create(orderData);

            // Mark personalized offers as used
            const usedOfferIds = sellerItems
                .filter(item => item.appliedOffer && item.appliedOffer.offerId)
                .map(item => item.appliedOffer.offerId);
            
            if (usedOfferIds.length > 0) {
                await PersonalizedOffer.updateMany(
                    { _id: { $in: usedOfferIds } },
                    { 
                        $set: { 
                            isUsed: true, 
                            usedAt: new Date(),
                            orderId: order._id.toString()
                        } 
                    }
                );
                console.log(`Marked ${usedOfferIds.length} personalized offer(s) as used for order ${order._id}`);
            }

            // Deduct wallet coins once when applied
            if (coinsRedeemed > 0 && userId) {
                await Wallet.findOneAndUpdate(
                    { userId },
                    {
                        $inc: { coins: -coinsRedeemed },
                        $push: { transactions: { type: 'REDEEM', coins: coinsRedeemed, rupees: walletDiscount, orderId: order._id.toString() } }
                    },
                    { new: true }
                );
            }
            
            // Increment coupon usage count if coupon was applied
            if (coupon && coupon.code) {
                await Coupon.findOneAndUpdate(
                    { code: coupon.code.toUpperCase(), storeId: storeId },
                    { $inc: { usedCount: 1 } }
                );
            }
            
            // Always assign the store order number before payment provider
            // checkout. Deferred allocation races Tabby/Tamara session creation
            // and can stamp ORD-{n+1} on the provider while Mongo keeps {n}.
            order.shortOrderNumber = await allocateShortOrderNumber(storeId);
            await order.save();

            orderIds.push(order._id.toString());
            createdOrderTotals.set(order._id.toString(), order.total);

            if (!deferPaymentAtCreate) {
                deferPostOrderTask('abandoned-cart-convert', () =>
                    markAbandonedCartsConvertedForOrder(order, { orderId: order._id })
                );
            }

            if (shouldRecordPurchaseOnCreate(order, paymentMethod)) {
                const trackingPayload = {
                    order,
                    trackingContext: order.trackingContext || trackingContext || {},
                    attribution: order.attribution || attribution || {},
                    userId,
                    isGuest: Boolean(isGuest),
                    source: 'order_create',
                };
                deferPostOrderTask('purchase-tracking', () => recordPurchaseFromOrder(trackingPayload));

                const forwardedFor = request.headers.get('x-forwarded-for');
                const clientIp = forwardedFor?.split(',')[0]?.trim()
                    || request.headers.get('x-real-ip')
                    || null;
                deferPostOrderTask('meta-purchase', () =>
                    sendMetaPurchaseFromOrder(order, {
                        clientIp,
                        userAgent: request.headers.get('user-agent') || null,
                        isGuest: Boolean(isGuest),
                        userId,
                        paymentMethod,
                    })
                );
            }

            if (!deferPaymentAtCreate) {
                deferPostOrderTask('confirmation-notifications', async () => {
                    try {
                        let customerEmail = '';
                        let customerName = '';

                        if (isGuest) {
                            customerEmail = guestInfo.email;
                            customerName = guestInfo.name;
                        } else if (userId) {
                            const userDoc = await User.findById(userId).lean();
                            customerEmail = userDoc?.email || '';
                            customerName = userDoc?.name || '';
                        }

                        await sendOrderCreatedConfirmationNotifications(
                            order._id,
                            paymentMethod,
                            { customerEmail, customerName, isGuest },
                        );
                    } catch (notificationError) {
                        console.error('Error sending order confirmation notifications:', notificationError);
                    }
                });
            }

            deferPostOrderTask('email-marketing-conversion', async () => {
                try {
                    let customerEmail = order.guestEmail || '';
                    if (!customerEmail && userId) {
                        const userDoc = await User.findById(userId).select('email').lean();
                        customerEmail = userDoc?.email || '';
                    }
                    if (!customerEmail && order.address?.email) {
                        customerEmail = order.address.email;
                    }

                    await recordEmailMarketingOrderConversion({
                        storeId,
                        email: customerEmail,
                        orderId: order._id,
                        orderTotal: order.total,
                        trackingToken: order.trackingContext?.emailTrackingToken
                            || trackingContext?.emailTrackingToken
                            || null,
                    });
                } catch (conversionError) {
                    console.error('Error recording email marketing conversion:', conversionError);
                }
            });

            if (deferPaymentAtCreate && !trustedManualStoreOrder) {
                deferPostOrderTask('awaiting-payment-abandoned-cart', () =>
                    upsertAbandonedCartForPendingOrder(order, { source: 'checkout_payment' })
                );
            }
            // Reserve product and selected-variant inventory as one transaction.
            // The fulfillment/EMX-ready marker is committed in that transaction,
            // so a concurrent last-unit checkout cannot leave a shippable order
            // after only part of its inventory was decremented.
            const shouldPrepareNewCod = !deferPaymentAtCreate
                && !trustedManualStoreOrder
                && normalizedPaymentMethod === 'COD'
                && order.waslah?.autoShipEnrolled === true;
            let stockReservationSucceeded = deferPaymentAtCreate;
            let stockReservedAt = null;
            if (!deferPaymentAtCreate) {
                try {
                    const reservation = await reserveOrderStockAtomically(order._id, {
                        markAutoShipReady: shouldPrepareNewCod,
                    });
                    stockReservationSucceeded = reservation.reserved === true;
                    stockReservedAt = reservation.reservedAt || null;
                } catch (stockErr) {
                    stockReservationSucceeded = false;
                    console.error('Atomic stock reservation error:', stockErr);
                    if (order.waslah?.autoShipEnrolled === true) {
                        await Order.findByIdAndUpdate(order._id, {
                            $set: {
                                'waslah.autoShipStatus': 'BLOCKED',
                                'waslah.autoShipLeaseExpiresAt': null,
                                'waslah.autoShipNextRetryAt': null,
                                'waslah.autoShipLastError': 'Stock reservation did not complete; automatic EMX shipping was not started.',
                                'waslah.autoShipLastErrorCode': 'STOCK_RESERVATION_FAILED',
                            },
                        }).catch((blockError) => {
                            console.error('[orders] Could not block EMX after stock failure:', order._id, blockError);
                        });
                    }
                }
            }

            const shouldQueueNewCod = stockReservationSucceeded
                && shouldPrepareNewCod
                && stockReservedAt;

            // Queue only after the order number, checkout bookkeeping, and stock
            // reservation have completed. Prepaid orders enter from trusted
            // provider confirmation instead of client-supplied paid flags.
            if (shouldQueueNewCod) {
                await requestWaslahAutoShipment(order._id, { source: 'new_cod_order' })
                    .catch((error) => {
                        console.error('[orders] Could not queue automatic EMX shipment:', order._id, error);
                    });
            }
        }

        // Stripe payment (hosted Checkout — PAN never touches our servers; 3DS enforced)
        if (paymentMethod === 'STRIPE') {
            const clientIp = getClientIpFromRequest(request);
            const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
            const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_BASE_URL || 'https://store1920.com';
            const primaryOrderId = orderIds[0] || '';
            const primaryOrderMeta = primaryOrderId
                ? await Order.findById(primaryOrderId).select('storeId').lean()
                : null;
            const fraudStoreId = primaryOrderMeta?.storeId || '';
            const fraud = await evaluateCheckoutFraud({
                email: guestInfo?.email || '',
                phone: guestInfo?.phone || '',
                ip: clientIp,
                userId: userId || '',
                amount: fullAmount,
                paymentMethod: 'STRIPE',
                storeId: fraudStoreId,
                orderId: primaryOrderId,
                userAgent: request.headers.get('user-agent') || '',
            });
            if (fraud.block) {
                return NextResponse.json({ error: fraud.message, code: 'FRAUD_BLOCKED', riskScore: fraud.score }, { status: 403 });
            }

            const session = await stripe.checkout.sessions.create({
                ...stripeSecureCheckoutOptions(),
                line_items: [{
                    price_data: {
                        currency: 'AED',
                        product_data: { name: 'Order Payment' },
                        unit_amount: Math.round(fullAmount * 100)
                    },
                    quantity: 1
                }],
                expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
                mode: 'payment',
                success_url: `${origin}/order-success?orderId=${primaryOrderId}&stripe=1&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${origin}/order-failed?orderId=${primaryOrderId}&reason=${encodeURIComponent('Payment cancelled')}`,
                metadata: {
                    orderIds: orderIds.join(','),
                    userId: userId || '',
                    appId: 'Qui'
                }
            });
            if (orderIds.length > 0) {
                await Order.updateMany(
                    { _id: { $in: orderIds } },
                    { $set: { stripeCheckoutSessionId: session.id } },
                ).catch((err) => {
                    console.error('[orders] Failed to save Stripe session id:', err?.message || err);
                });
                await Promise.all(orderIds.map((oid) => logPaymentEvent({
                    storeId: fraudStoreId,
                    orderId: oid,
                    eventType: 'SESSION_CREATED',
                    provider: 'STRIPE',
                    providerReference: session.id,
                    amount: fullAmount,
                    status: 'pending',
                    ip: clientIp,
                    userAgent: request.headers.get('user-agent') || '',
                    riskScore: fraud.score,
                    riskSignals: fraud.signals,
                    meta: { review: fraud.review },
                })));
            }
            return NextResponse.json({ session, orderId: primaryOrderId });
        }

        // Tamara BNPL payment
        if (paymentMethod === 'TAMARA') {
            const origin = resolveTamaraMerchantBaseUrl(request);
            const primaryOrderId = orderIds[0] || '';
            // Build consumer info from the saved order address
            let primaryOrder = await Order.findById(primaryOrderId).populate('addressId').lean();
            primaryOrder = await ensurePersistedShortOrderNumber(primaryOrder);
            const paymentReference = formatPaymentProviderOrderReference(primaryOrder);
            if (!paymentReference) {
                return NextResponse.json({ error: 'Could not assign order number for Tamara checkout' }, { status: 500 });
            }

            const addr = primaryOrder?.shippingAddress || primaryOrder?.addressId || {};
            const fullName = addr.name || guestInfo?.name || '';
            const nameParts = fullName.trim().split(' ');
            const firstName = nameParts[0] || 'Customer';
            const lastName = nameParts.slice(1).join(' ') || '-';
            const phoneNumber = addr.phone || guestInfo?.phone || '';
            const email = addr.email || guestInfo?.email || (userId ? (await User.findById(userId).select('email').lean())?.email : '') || '';

            // Build items from all orders
            const allOrders = await Order.find({ _id: { $in: orderIds } }).populate('orderItems.productId').lean();
            const tamaraItems = allOrders.flatMap(o =>
                (o.orderItems || []).map(item => {
                    const product = item.productId && typeof item.productId === 'object' ? item.productId : null;
                    return {
                        productId: product?._id?.toString() || String(item.productId),
                        name: product?.name || 'Product',
                        slug: product?.slug || '',
                        useProductsPath: product?.useProductsPath === true,
                        sku: product?.sku || product?._id?.toString() || String(item.productId),
                        quantity: item.quantity,
                        unit_price: item.price,
                        total_amount: Number((item.price * item.quantity).toFixed(2)),
                        item_url: product ? getProductAbsoluteUrl(product, origin) : undefined,
                    };
                })
            );

            const tamaraResult = await createTamaraSession({
                orderId: paymentReference,
                amount: fullAmount,
                siteUrl: origin,
                consumer: { first_name: firstName, last_name: lastName, email, phone_number: phoneNumber },
                shippingAddress: {
                    first_name: firstName,
                    last_name: lastName,
                    line1: addr.street || addr.address || addr.line1 || 'UAE',
                    city: addr.city || 'Dubai',
                    country_code: 'AE',
                    phone_number: phoneNumber,
                },
                items: tamaraItems,
                successUrl: buildCheckoutRedirectUrl(origin, '/order-success', {
                    orderId: primaryOrderId,
                    tamara: '1',
                }),
                failureUrl: buildCheckoutRedirectUrl(origin, '/order-failed', {
                    orderId: primaryOrderId,
                    reason: 'Tamara payment failed',
                }),
                cancelUrl: buildCheckoutRedirectUrl(origin, '/order-failed', {
                    orderId: primaryOrderId,
                    reason: 'Payment cancelled',
                }),
                notificationUrl: buildCheckoutRedirectUrl(origin, '/api/tamara/webhook'),
                description: paymentReference,
            });

            // A single Tamara checkout can cover orders split across several stores.
            // Persist the provider id on every member so the signed webhook can
            // validate the provider total against the complete order group.
            await Order.updateMany(
                { _id: { $in: orderIds } },
                { $set: { tamaraOrderId: tamaraResult.tamara_order_id } },
            );

            return NextResponse.json({
                checkout_url: tamaraResult.checkout_url,
                tamara_order_id: tamaraResult.tamara_order_id,
                orderId: primaryOrderId,
            });
        }

        // Tabby BNPL payment
        if (paymentMethod === 'TABBY') {
            const baseUrl = resolveTamaraMerchantBaseUrl(request);
            const primaryOrderId = orderIds[0] || '';

            let primaryOrder = await Order.findById(primaryOrderId).populate('addressId').lean();
            primaryOrder = await ensurePersistedShortOrderNumber(primaryOrder);
            const paymentReference = formatPaymentProviderOrderReference(primaryOrder);
            if (!paymentReference) {
                return NextResponse.json({ error: 'Could not assign order number for Tabby checkout' }, { status: 500 });
            }

            const addr = primaryOrder?.shippingAddress || primaryOrder?.addressId || {};
            const fullName = addr.name || guestInfo?.name || 'Customer';
            const phoneNumber = addr.phone || guestInfo?.phone || '';
            const phoneCode = addr.phoneCode || guestInfo?.phoneCode || '+971';
            const email = addr.email || guestInfo?.email || (userId ? (await User.findById(userId).select('email createdAt').lean())?.email : '') || '';

            const allOrders = await Order.find({ _id: { $in: orderIds } }).populate('orderItems.productId').lean();
            const tabbyItems = allOrders.flatMap(o =>
                (o.orderItems || []).map(item => ({
                    productId: item.productId?._id?.toString() || String(item.productId),
                    name: item.productId?.name || 'Product',
                    sku: item.productId?.sku || item.sku || item.productId?._id?.toString() || String(item.productId),
                    quantity: item.quantity,
                    unit_price: item.price,
                }))
            );

            const buyer = {
                name: fullName,
                email,
                phone: phoneNumber,
                phoneCode,
            };
            const tabbyShippingAddress = {
                address: addr.street || '',
                street: addr.street || '',
                city: addr.city || 'Dubai',
                zip: addr.zip || addr.pincode || '00000',
                pincode: addr.pincode || addr.zip || '00000',
            };

            let userDoc = null;
            let previousOrders = [];
            const tabbyStoreId = String(primaryOrder?.storeId || Array.from(checkoutStoreIds)[0] || '').trim();
            if (userId && userId !== 'guest' && tabbyStoreId) {
                userDoc = await User.findById(userId).select('email createdAt').lean();
                previousOrders = await Order.find({
                    storeId: tabbyStoreId,
                    userId,
                    _id: { $nin: orderIds },
                    status: { $nin: ['CANCELLED', 'PAYMENT_FAILED'] },
                })
                    .populate('orderItems.productId')
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .lean();
            }

            const tabbyResult = await createTabbySession({
                orderId: paymentReference,
                amount: fullAmount,
                buyer,
                shippingAddress: tabbyShippingAddress,
                items: tabbyItems,
                successUrl: buildCheckoutRedirectUrl(baseUrl, '/order-success', {
                    orderId: primaryOrderId,
                    tabby: '1',
                }),
                failureUrl: buildCheckoutRedirectUrl(baseUrl, '/order-failed', {
                    orderId: primaryOrderId,
                    reason: 'Tabby payment failed',
                }),
                cancelUrl: buildCheckoutRedirectUrl(baseUrl, '/order-failed', {
                    orderId: primaryOrderId,
                    reason: 'Payment cancelled',
                }),
                buyerHistory: buildTabbyBuyerHistory(userDoc, previousOrders.length),
                orderHistory: buildTabbyOrderHistoryEntries(previousOrders, {
                    buyer,
                    shippingAddress: tabbyShippingAddress,
                }),
            });

            // One Tabby checkout may cover orders split across stores. Persist
            // the provider payment ID on every member so server verification
            // can validate the exact aggregate amount and finalize each order.
            await Order.updateMany(
                { _id: { $in: orderIds } },
                { $set: { tabbyPaymentId: tabbyResult.payment_id || '' } },
            );

            return NextResponse.json({
                checkout_url: tabbyResult.web_url,
                tabby_payment_id: tabbyResult.payment_id || '',
                orderId: primaryOrderId,
            });
        }

        // Clear cart for logged-in users
        if (userId) {
            await User.findByIdAndUpdate(userId, { cart: {} });
        }

        if (recoveryContext?.valid && orderIds.length > 0) {
            deferPostOrderTask('recovery-link', () =>
                AbandonedCart.findByIdAndUpdate(recoveryContext.cart._id, {
                    $set: {
                        linkedOrderId: String(orderIds[0]),
                        recoveryLinkExpiresAt: new Date(),
                    },
                })
            );
        }

        // Referral reward: inviter gets wallet credit when invited customer places first purchase.
        if (!isGuest && userId && orderIds.length > 0) {
            deferPostOrderTask('referral-reward', async () => {
                const totalOrdersForUser = await Order.countDocuments({ userId });
                if (totalOrdersForUser !== orderIds.length) return;

                const invitedUser = await User.findById(userId)
                    .select('referredByUserId referralRewardCreditedAt')
                    .lean();

                const inviterUserId = invitedUser?.referredByUserId;
                if (inviterUserId && inviterUserId !== userId && !invitedUser?.referralRewardCreditedAt) {
                    const primaryStoreId = Array.from(checkoutStoreIds)[0] || null;
                    const referralRewardCoins = await getReferralRewardCoins(primaryStoreId);

                    if (referralRewardCoins > 0) {
                        const claimResult = await User.updateOne(
                            {
                                _id: userId,
                                referredByUserId: inviterUserId,
                                referralRewardCreditedAt: null
                            },
                            { $set: { referralRewardCreditedAt: new Date() } }
                        );

                        if (claimResult.modifiedCount > 0) {
                            await Wallet.findOneAndUpdate(
                                { userId: inviterUserId },
                                {
                                    $inc: { coins: referralRewardCoins },
                                    $push: {
                                        transactions: {
                                            type: 'BONUS',
                                            coins: referralRewardCoins,
                                            rupees: referralRewardCoins,
                                            orderId: orderIds[orderIds.length - 1],
                                            description: `Referral reward for inviting customer ${userId}`
                                        }
                                    }
                                },
                                { upsert: true, new: true, setDefaultsOnInsert: true }
                            );
                        }
                    }
                }
            });
        }

        const primaryOrderId = orderIds[orderIds.length - 1];
        const primaryTotal = createdOrderTotals.get(primaryOrderId) ?? fullAmount;
        const successPayload = {
            message: 'Orders Placed Successfully',
            id: primaryOrderId,
            orderId: primaryOrderId,
            total: primaryTotal,
            autoEmxShipping: isWaslahAutoShipEnabled(),
            orderIds,
        };

        // COD → card 5% popup needs a token for guests (no Firebase userId on the order).
        if (
            String(paymentMethod || '').toUpperCase() === 'COD'
            && !isWaslahAutoShipEnabled()
            && isPaymentMethodEnabled(shippingSettingForLimits, 'card')
            && !isPaymentMethodOverLimit(shippingSettingForLimits, 'card', primaryTotal)
        ) {
            const prepaidUpsellToken = createPrepaidUpsellToken(primaryOrderId);
            if (prepaidUpsellToken) {
                successPayload.prepaidUpsellToken = prepaidUpsellToken;
            }
        }

        if (isGuest) {
            return NextResponse.json(successPayload);
        }

        return NextResponse.json({
            ...successPayload,
            order: { _id: primaryOrderId, total: primaryTotal },
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 });
    }
}

// Get all orders for a user
export async function GET(request) {
    try {
        await connectDB();
        
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('orderId');
        
        // If orderId is provided, allow guest access to fetch that specific order
        if (orderId) {
            console.log('GET /api/orders: Fetching order by orderId:', orderId);
            try {
                let order = await Order.findById(orderId)
                    .populate({
                        path: 'orderItems.productId',
                        model: 'Product'
                    })
                    .populate('addressId')
                    .lean();
                
                if (!order) {
                    console.log('GET /api/orders: Order not found');
                    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
                }

                const authHeader = request.headers.get('authorization');
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const idToken = authHeader.split('Bearer ')[1];
                    try {
                        const decodedToken = await getAuth().verifyIdToken(idToken);
                        const userId = decodedToken.uid;
                        const contact = await resolveContactForGuestLinking({ decodedToken, userId });

                        await linkGuestOrdersToUser(userId, contact).catch(() => {});
                        order = await Order.findById(orderId)
                            .populate({ path: 'orderItems.productId', model: 'Product' })
                            .populate('addressId')
                            .lean();

                        const isPublicGuestOrder = Boolean(order?.isGuest)
                            || !order?.userId
                            || order.userId === 'guest';
                        if (order?.userId && order.userId !== userId && !isPublicGuestOrder) {
                            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
                        }
                    } catch (e) {
                        // Guest access without valid auth is still allowed below
                    }
                }
                
                order = await ensurePersistedShortOrderNumber(order);
                
                try {
                    const ReturnRequest = (await import('@/models/ReturnRequest')).default;
                    const { serializeReturnCase } = await import('@/lib/storeReturnWorkflow');
                    const cases = await ReturnRequest.find({ orderId: String(order._id) }).sort({ createdAt: -1 }).lean();
                    order.returnRequests = cases.map((row) => serializeReturnCase(row, order));
                } catch {
                    order.returnRequests = [];
                }

                console.log('GET /api/orders: Order found, isGuest:', order.isGuest);
                return NextResponse.json({ order });
            } catch (err) {
                console.error('GET /api/orders: Error fetching order:', err);
                return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
            }
        }
        
        // For listing orders (no orderId), require authentication
        const authHeader = request.headers.get('authorization');
        let userId = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const decodedToken = await getAuth().verifyIdToken(idToken);
                userId = decodedToken.uid;
                const contact = await resolveContactForGuestLinking({ decodedToken, userId });
                await linkGuestOrdersToUser(userId, contact).catch(() => {/* non-fatal */});
            } catch (e) {
                // Not signed in, userId remains null
            }
        }
        if (!userId) {
            return NextResponse.json({ error: "not authorized" }, { status: 401 });
        }
        
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        
        const paidOnlineMethods = [
            PaymentMethod.STRIPE,
            PaymentMethod.CARD,
            PaymentMethod.RAZORPAY,
            PaymentMethod.WALLET,
            'PREPAID',
            'ONLINE',
            'UPI',
            'NETBANKING',
            'CARD',
            'card',
            'razorpay',
            'wallet',
            'prepaid',
            'online',
            'upi',
            'netbanking',
        ];

        const orders = await Order.find({ userId })
        .populate({
            path: 'orderItems.productId',
            model: 'Product'
        })
        .populate('addressId')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();

        // Ensure all orders have shortOrderNumber calculated
        const enrichedOrders = await ensurePersistedShortOrderNumbers(orders.map((order) => {
            const paymentMethod = String(order?.paymentMethod || '').toUpperCase();
            const status = String(order?.status || '').toUpperCase();
            const paymentStatus = String(order?.paymentStatus || '').toUpperCase();

            if (paymentMethod === 'COD') {
                if (status === 'DELIVERED' || order?.delhivery?.payment?.is_cod_recovered) {
                    order.isPaid = true;
                }
            } else if (paymentMethod) {
                const failedStatuses = new Set(['FAILED', 'PAYMENT_FAILED', 'REFUNDED', 'UNPAID']);
                if (!failedStatuses.has(paymentStatus) && status !== 'PAYMENT_FAILED') {
                    order.isPaid = true;
                }
            }

            return order;
        }));

        try {
            const ReturnRequest = (await import('@/models/ReturnRequest')).default;
            const { serializeReturnCase } = await import('@/lib/storeReturnWorkflow');
            const ids = enrichedOrders.map((order) => String(order._id));
            const cases = ids.length
                ? await ReturnRequest.find({ orderId: { $in: ids }, userId }).sort({ createdAt: -1 }).lean()
                : [];
            const byOrder = new Map();
            for (const row of cases) {
                const key = String(row.orderId);
                const list = byOrder.get(key) || [];
                list.push(serializeReturnCase(row));
                byOrder.set(key, list);
            }
            for (const order of enrichedOrders) {
                order.returnRequests = byOrder.get(String(order._id)) || [];
            }
        } catch (attachError) {
            console.error('Failed to attach return requests', attachError?.message || attachError);
        }

        const { excludeReturnPickupCloneOrders } = await import('@/lib/storeReturnLabels');
        return NextResponse.json({ orders: excludeReturnPickupCloneOrders(enrichedOrders) });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
