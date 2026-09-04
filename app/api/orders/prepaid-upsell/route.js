import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import { getAuth } from '@/lib/firebase-admin';
import { getAuthoritativeStripeCheckoutPayment } from '@/lib/stripeOrderPayment';
import { validateStripeAuthoritativePaymentState } from '@/lib/stripePaymentState';
import { verifyPrepaidUpsellToken } from '@/lib/prepaidUpsellToken';
import { stripeSecureCheckoutOptions } from '@/lib/paymentSecurity';
import { logPaymentEvent } from '@/lib/paymentTransactionLog';
import ShippingSetting from '@/models/ShippingSetting';
import { getPaymentMethodLimitError } from '@/lib/paymentMethodLimits';

export const dynamic = 'force-dynamic';

/**
 * Creates a Stripe Checkout session so a customer can pay online (with 5% off)
 * for an already-placed COD order (checkout / order-success prepaid upsell).
 *
 * Auth: logged-in owner Bearer token, OR a short-lived prepaidUpsellToken
 * returned when the COD order was created (guest checkout).
 *
 * The base order stays COD/unpaid until Stripe confirms payment.
 */
export async function POST(request) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const prepaidUpsellToken = String(body?.prepaidUpsellToken || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    let decodedToken = null;
    const authorization = request.headers.get('authorization') || '';
    if (authorization.startsWith('Bearer ')) {
      try {
        decodedToken = await getAuth().verifyIdToken(authorization.slice(7));
      } catch {
        decodedToken = null;
      }
    }

    const tokenOk = verifyPrepaidUpsellToken(prepaidUpsellToken, orderId);

    await dbConnect();
    const order = await Order.findById(orderId).lean();
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const orderUserId = String(order.userId || '').trim();
    const authOk = Boolean(
      decodedToken?.uid
      && orderUserId
      && orderUserId === String(decodedToken.uid),
    );

    if (!authOk && !tokenOk) {
      return NextResponse.json({
        error: orderUserId
          ? 'Please sign in to pay this order, or use the payment link from checkout'
          : 'This payment link expired. Continue with COD from your order confirmation',
      }, { status: 401 });
    }

    if (order.isPaid === true || String(order.paymentStatus || '').toUpperCase() === 'PAID') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 409 });
    }

    const paymentStatus = String(order.paymentStatus || '').trim().toUpperCase();
    const verificationStatus = String(order.paymentVerification?.status || '').trim().toUpperCase();
    if (
      /^(REFUNDED|PARTIALLY_REFUNDED|REVERSED|DISPUTED|CHARGEBACK|VOID|CANCELLED|CANCELED|EXPIRED)$/.test(paymentStatus)
      || /^(REVERSED|REVOKED|REFUNDED|DISPUTED|CHARGEBACK|VOID)$/.test(verificationStatus)
    ) {
      return NextResponse.json({ error: 'This payment was reversed and cannot be relaunched' }, { status: 409 });
    }

    if (
      order.deletedAt
      || !['ORDER_PLACED', 'PROCESSING'].includes(String(order.status || '').toUpperCase())
      || !['COD', 'CASH_ON_DELIVERY'].includes(String(order.paymentMethod || '').toUpperCase())
    ) {
      return NextResponse.json({ error: 'This order is not eligible for prepaid payment' }, { status: 409 });
    }

    if (order.waslah?.autoShipEnrolled === true) {
      return NextResponse.json({
        error: 'This COD order is already enrolled for automatic EMX shipping and cannot be switched to prepaid.',
        code: 'AUTO_EMX_COD_LOCKED',
      }, { status: 409 });
    }

    const baseTotal = Number(order.total || 0);
    if (!(baseTotal > 0)) {
      return NextResponse.json({ error: 'Order total is not payable' }, { status: 400 });
    }

    const shippingSetting = order.storeId
      ? await ShippingSetting.findOne({ storeId: order.storeId }).lean()
      : null;
    const cardUnavailable = getPaymentMethodLimitError(shippingSetting, 'card', baseTotal);
    if (cardUnavailable) {
      return NextResponse.json({ error: cardUnavailable }, { status: 403 });
    }

    const discountedTotal = Number((baseTotal * 0.95).toFixed(2));
    const origin = request.headers.get('origin')
      || process.env.NEXT_PUBLIC_BASE_URL
      || 'https://store1920.com';

    const stripe = new Stripe(secret);
    const storedSessionId = String(order.stripeCheckoutSessionId || '').trim();
    if (storedSessionId) {
      const storedSession = await stripe.checkout.sessions.retrieve(storedSessionId);
      if (String(storedSession?.status || '').toLowerCase() === 'open' && storedSession?.url) {
        const storedOrderIds = String(storedSession?.metadata?.orderIds || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        const isCurrentCheckout = storedOrderIds.length === 1
          && storedOrderIds[0] === orderId
          && String(storedSession?.metadata?.prepaidUpsell || '') === '1'
          && String(storedSession?.currency || '').toUpperCase() === 'AED'
          && Number(storedSession?.amount_total) === Math.round(discountedTotal * 100);
        if (!isCurrentCheckout) {
          return NextResponse.json({ error: 'The existing Stripe checkout no longer matches this order' }, { status: 409 });
        }
        return NextResponse.json({ success: true, url: storedSession.url, orderId, reused: true });
      }
      if (String(storedSession?.payment_status || '').toLowerCase() === 'paid') {
        const current = await getAuthoritativeStripeCheckoutPayment(storedSessionId, {
          stripeClient: stripe,
        });
        if (!current.valid) {
          return NextResponse.json({ error: 'The previous Stripe payment is not payable' }, { status: 409 });
        }
        const providerState = validateStripeAuthoritativePaymentState({
          ...current,
          expectedAmountFils: Number(current.session?.amount_total),
        });
        return NextResponse.json({
          error: providerState.valid
            ? 'Stripe already captured this order payment'
            : 'The previous Stripe payment was refunded, disputed, or is otherwise not payable',
        }, { status: 409 });
      }
      if (String(storedSession?.status || '').toLowerCase() !== 'expired') {
        return NextResponse.json({ error: 'The existing Stripe payment is still being processed' }, { status: 409 });
      }
    }

    const session = await stripe.checkout.sessions.create({
      ...stripeSecureCheckoutOptions(),
      line_items: [{
        price_data: {
          currency: 'AED',
          product_data: { name: 'Order Payment (5% prepaid discount)' },
          unit_amount: Math.round(discountedTotal * 100),
        },
        quantity: 1,
      }],
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      mode: 'payment',
      success_url: `${origin}/order-success?orderId=${orderId}&stripe=1&prepaid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order-success?orderId=${orderId}`,
      customer_email: String(order.guestEmail || order.shippingAddress?.email || '').trim() || undefined,
      metadata: {
        orderIds: orderId,
        userId: order.userId || '',
        prepaidUpsell: '1',
        discountedTotal: String(discountedTotal),
      },
    });

    const persistFilter = {
      _id: orderId,
      isPaid: { $ne: true },
      paymentStatus: {
        $not: /^(PAID|REFUNDED|PARTIALLY_REFUNDED|REVERSED|DISPUTED|CHARGEBACK|VOID|CANCELLED|CANCELED|EXPIRED)$/i,
      },
      'paymentVerification.status': {
        $not: /^(REVERSED|REVOKED|REFUNDED|DISPUTED|CHARGEBACK|VOID)$/i,
      },
      'waslah.autoShipEnrolled': { $ne: true },
      stripeCheckoutSessionId: storedSessionId || { $in: [null, ''] },
    };
    if (authOk && orderUserId) {
      persistFilter.userId = orderUserId;
    }

    const persisted = await Order.findOneAndUpdate(
      persistFilter,
      { $set: { stripeCheckoutSessionId: session.id } },
      { new: true },
    ).lean();
    if (!persisted) {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      return NextResponse.json({ error: 'Order changed before Stripe checkout could be saved' }, { status: 409 });
    }

    await logPaymentEvent({
      storeId: order.storeId || '',
      orderId,
      eventType: 'SESSION_CREATED',
      provider: 'STRIPE',
      providerReference: session.id,
      amount: discountedTotal,
      status: 'pending',
      meta: { prepaidUpsell: true },
    });

    return NextResponse.json({ success: true, url: session.url, orderId });
  } catch (error) {
    console.error('[prepaid-upsell] Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create payment session' }, { status: 500 });
  }
}
