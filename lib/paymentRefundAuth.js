import Stripe from 'stripe';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import PaymentRefundAuthorization from '@/models/PaymentRefundAuthorization';
import { logPaymentEvent } from '@/lib/paymentTransactionLog';
import { paymentSecurityPublicConfig } from '@/lib/paymentSecurity';
import { blockOrdersForPaymentReversal } from '@/lib/orderPaymentReversal';

function refundClientPayload(result, order) {
  const authorization = result?.authorization || {};
  return {
    ...result,
    orderId: String(order?._id || authorization.orderId || ''),
    transactionId: String(
      order?.shortOrderNumber
      || order?.orderNumber
      || authorization.orderId
      || order?._id
      || '',
    ).trim(),
  };
}

function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error('Stripe is not configured');
  return new Stripe(secret);
}

export async function createRefundAuthorization({
  storeId,
  orderId,
  amount,
  reason = '',
  requestedByUserId,
  requestedByEmail = '',
}) {
  await connectDB();
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error('Order not found');
  if (String(order.storeId || '') && String(order.storeId) !== String(storeId)) {
    // Multi-store: allow if empty storeId on legacy orders
    if (order.storeId) throw new Error('Order does not belong to this store');
  }

  const paid = order.isPaid === true || String(order.paymentStatus || '').toUpperCase() === 'PAID';
  if (!paid) throw new Error('Order is not paid');

  const provider = String(order.paymentMethod || order.paymentVerification?.provider || '').toUpperCase();
  if (!['STRIPE', 'TABBY', 'TAMARA', 'RAZORPAY'].includes(provider)) {
    throw new Error(`Refunds via gateway not supported for ${provider || 'this method'}`);
  }

  const maxAmount = Number(order.total) || 0;
  const refundAmount = Number(amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw new Error('Invalid refund amount');
  }
  if (refundAmount > maxAmount + 0.01) {
    throw new Error('Refund amount exceeds order total');
  }

  if (provider !== 'STRIPE') {
    throw new Error(`${provider} refunds must be issued in the provider dashboard, then wait for webhook reversal. Stripe in-app refunds are supported.`);
  }

  const providerReference = String(
    order.paymentVerification?.providerReference
    || order.stripeCheckoutSessionId
    || '',
  );

  const cfg = paymentSecurityPublicConfig().refund;
  const autoApprove = cfg.maxAutoApproveAed > 0 && refundAmount <= cfg.maxAutoApproveAed;

  const doc = await PaymentRefundAuthorization.create({
    storeId: String(storeId),
    orderId: String(orderId),
    provider,
    providerReference,
    amount: refundAmount,
    currency: 'AED',
    reason: String(reason || '').slice(0, 500),
    status: autoApprove ? 'APPROVED' : 'PENDING',
    requestedByUserId: String(requestedByUserId),
    requestedByEmail: String(requestedByEmail || ''),
    approvedByUserId: autoApprove ? String(requestedByUserId) : '',
    approvedByEmail: autoApprove ? String(requestedByEmail || '') : '',
  });

  await logPaymentEvent({
    storeId,
    orderId,
    eventType: 'REFUND_REQUESTED',
    provider,
    providerReference,
    amount: refundAmount,
    status: doc.status,
    actorUserId: requestedByUserId,
    actorRole: 'seller',
    meta: { refundAuthId: String(doc._id), reason, autoApprove },
  });

  if (autoApprove) {
    const executed = await executeApprovedRefund(doc._id, {
      actorUserId: requestedByUserId,
      actorEmail: requestedByEmail,
      skipApproverCheck: true,
    });
    return refundClientPayload(executed, order);
  }

  return refundClientPayload({ authorization: doc.toObject(), executed: false }, order);
}

export async function decideRefundAuthorization({
  refundAuthId,
  storeId,
  decision, // approve | reject
  actorUserId,
  actorEmail = '',
  rejectReason = '',
}) {
  await connectDB();
  const doc = await PaymentRefundAuthorization.findById(refundAuthId);
  if (!doc) throw new Error('Refund authorization not found');
  if (String(doc.storeId) !== String(storeId)) throw new Error('Not authorized for this store');
  if (doc.status !== 'PENDING') throw new Error(`Cannot decide a ${doc.status} request`);

  const cfg = paymentSecurityPublicConfig().refund;
  if (decision === 'approve' && cfg.requireSecondApprover) {
    if (String(doc.requestedByUserId) === String(actorUserId)) {
      throw new Error('A second approver is required (requester cannot approve their own refund)');
    }
  }

  if (decision === 'reject') {
    doc.status = 'REJECTED';
    doc.rejectedByUserId = String(actorUserId);
    doc.rejectReason = String(rejectReason || '').slice(0, 500);
    await doc.save();
    await logPaymentEvent({
      storeId,
      orderId: doc.orderId,
      eventType: 'REFUND_REJECTED',
      provider: doc.provider,
      amount: doc.amount,
      status: 'REJECTED',
      actorUserId,
      actorRole: 'seller',
      meta: { refundAuthId: String(doc._id), rejectReason },
    });
    return refundClientPayload({ authorization: doc.toObject(), executed: false }, { _id: doc.orderId });
  }

  doc.status = 'APPROVED';
  doc.approvedByUserId = String(actorUserId);
  doc.approvedByEmail = String(actorEmail || '');
  await doc.save();

  await logPaymentEvent({
    storeId,
    orderId: doc.orderId,
    eventType: 'REFUND_APPROVED',
    provider: doc.provider,
    amount: doc.amount,
    status: 'APPROVED',
    actorUserId,
    actorRole: 'seller',
    meta: { refundAuthId: String(doc._id) },
  });

  const executed = await executeApprovedRefund(doc._id, { actorUserId, actorEmail });
  const order = await Order.findById(doc.orderId).select('shortOrderNumber orderNumber').lean();
  return refundClientPayload(executed, order || { _id: doc.orderId });
}

async function executeApprovedRefund(refundAuthId, { actorUserId, actorEmail = '', skipApproverCheck = false } = {}) {
  await connectDB();
  const doc = await PaymentRefundAuthorization.findById(refundAuthId);
  if (!doc) throw new Error('Refund authorization not found');
  if (!['APPROVED', 'FAILED'].includes(doc.status) && !skipApproverCheck) {
    throw new Error('Refund is not approved');
  }

  try {
    if (doc.provider !== 'STRIPE') {
      throw new Error('Only Stripe refunds are executed in-app');
    }

    const stripe = getStripe();
    const order = await Order.findById(doc.orderId).lean();
    const sessionId = String(order?.stripeCheckoutSessionId || doc.providerReference || '');
    if (!sessionId) throw new Error('Missing Stripe session reference');

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
    if (!paymentIntentId) throw new Error('Missing PaymentIntent for refund');

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.round(Number(doc.amount) * 100),
      reason: 'requested_by_customer',
      metadata: {
        orderId: String(doc.orderId),
        refundAuthId: String(doc._id),
        authorizedBy: String(actorUserId || doc.approvedByUserId || ''),
      },
    });

    doc.status = 'EXECUTED';
    doc.providerRefundId = refund.id;
    doc.executedAt = new Date();
    doc.errorMessage = '';
    await doc.save();

    await blockOrdersForPaymentReversal([doc.orderId], {
      provider: 'STRIPE',
      providerReference: refund.id,
      source: 'authorized_stripe_refund',
      paymentStatus: 'REFUNDED',
      reason: 'Authorized Stripe refund executed from seller dashboard',
    }).catch(() => {});

    await logPaymentEvent({
      storeId: doc.storeId,
      orderId: doc.orderId,
      eventType: 'REFUND_EXECUTED',
      provider: 'STRIPE',
      providerReference: refund.id,
      amount: doc.amount,
      status: 'EXECUTED',
      actorUserId: actorUserId || doc.approvedByUserId,
      actorRole: 'seller',
      meta: { refundAuthId: String(doc._id), actorEmail },
    });

    return { authorization: doc.toObject(), executed: true, refundId: refund.id };
  } catch (error) {
    doc.status = 'FAILED';
    doc.errorMessage = String(error?.message || error).slice(0, 500);
    await doc.save();
    await logPaymentEvent({
      storeId: doc.storeId,
      orderId: doc.orderId,
      eventType: 'REFUND_FAILED',
      provider: doc.provider,
      amount: doc.amount,
      status: 'FAILED',
      actorUserId,
      meta: { refundAuthId: String(doc._id), error: doc.errorMessage },
    });
    throw error;
  }
}

export async function listRefundAuthorizations({ storeId, status = '', limit = 40 } = {}) {
  await connectDB();
  const filter = { storeId: String(storeId) };
  if (status) filter.status = String(status).toUpperCase();
  return PaymentRefundAuthorization.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 40, 100))
    .lean();
}
