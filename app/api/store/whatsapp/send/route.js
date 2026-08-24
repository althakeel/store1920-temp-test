import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import AbandonedCart from '@/models/AbandonedCart';
import Order from '@/models/Order';
import { getDisplayOrderNumber } from '@/lib/orderDisplay';
import { sendAbandonedCartWhatsAppReminder } from '@/lib/whatsapp/abandonedCartMessaging';
import {
  sendOrderCreatedWhatsApp,
  sendOrderPaidWhatsApp,
  sendOrderReminderWhatsApp,
  sendOrderShippedWhatsApp,
  sendOrderDeliveredWhatsApp,
  sendPromotionalOfferWhatsApp,
} from '@/lib/whatsapp/orderNotifications';
import { WABA_TEMPLATE_NAMES } from '@/lib/whatsapp/templates';
import { isConfirmedPaidOrder } from '@/lib/orderConfirmationPolicy';
import { isAwaitingPaymentOrder } from '@/lib/deferredOrderStatus';
import {
  appendOrderCommunicationLog,
  WHATSAPP_TEMPLATE_LABELS,
} from '@/lib/orderCommunicationLog';

const ALLOWED_TEMPLATES = new Set([
  'cart_reminder',
  'abandoned_checkout',
  'order_reminder',
  'order_confirmation',
  'order_paid',
  'order_shipped',
  'order_delivered',
  'promotional_offer',
]);

function getOrderPhone(order = {}) {
  const shipping = order.shippingAddress || {};
  return {
    phone: shipping.phone || order.guestPhone || '',
    phoneCode: shipping.phoneCode || order.alternatePhoneCode || '+971',
    customerName: shipping.name || order.guestName || 'Customer',
  };
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const template = String(body?.template || body?.type || '').trim().toLowerCase();
    if (!ALLOWED_TEMPLATES.has(template)) {
      return NextResponse.json({ error: 'Unsupported WhatsApp template' }, { status: 400 });
    }

    await dbConnect();

    if (template === 'cart_reminder' || template === 'abandoned_checkout') {
      const cartId = String(body?.cartId || '').trim();
      if (!cartId) {
        return NextResponse.json({ error: 'cartId is required' }, { status: 400 });
      }

      const cart = await AbandonedCart.findOne({ _id: cartId, storeId: String(storeId) }).lean();
      if (!cart) {
        return NextResponse.json({ error: 'Abandoned cart not found' }, { status: 404 });
      }

      const whatsapp = await sendAbandonedCartWhatsAppReminder(cart, {
        variant: template === 'abandoned_checkout' ? 'checkout' : 'cart',
        buttonPath: body?.buttonPath,
        offerTotal: body?.offerTotal ?? cart.recoveryOfferTotal ?? null,
      });

      return NextResponse.json({ success: true, template, whatsapp });
    }

    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const order = await Order.findOne({ _id: orderId, storeId: String(storeId) })
      .populate({ path: 'orderItems.productId', select: 'name slug images image sku brand price AED' })
      .populate({ path: 'userId', select: 'name email' })
      .lean();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const confirmationTemplates = new Set(['order_confirmation', 'order_paid']);
    if (confirmationTemplates.has(template) && !isConfirmedPaidOrder(order)) {
      const awaiting = isAwaitingPaymentOrder(order);
      return NextResponse.json({
        error: awaiting
          ? 'Payment is not confirmed yet. Wait for Tabby/Tamara/Card payment before sending order confirmation.'
          : 'This order is not paid or has failed. Order confirmation cannot be sent.',
      }, { status: 400 });
    }

    let whatsapp;
    switch (template) {
      case 'order_reminder': {
        const customer = getOrderPhone(order);
        if (!customer.phone) {
          return NextResponse.json({ error: 'No customer phone on this order' }, { status: 400 });
        }
        whatsapp = await sendOrderReminderWhatsApp({
          customerName: customer.customerName,
          orderNumber: getDisplayOrderNumber(order) || 'N/A',
          phone: customer.phone,
          phoneCode: customer.phoneCode,
        });
        break;
      }
      case 'order_confirmation':
        whatsapp = await sendOrderCreatedWhatsApp(order, order.paymentMethod);
        break;
      case 'order_paid':
        whatsapp = await sendOrderPaidWhatsApp(order);
        break;
      case 'order_shipped':
        whatsapp = await sendOrderShippedWhatsApp(order);
        break;
      case 'order_delivered':
        whatsapp = await sendOrderDeliveredWhatsApp(order);
        break;
      case 'promotional_offer': {
        const customer = getOrderPhone(order);
        if (!customer.phone) {
          return NextResponse.json({ error: 'No customer phone on this order' }, { status: 400 });
        }
        const { buildWhatsAppProductPayload } = await import('@/lib/whatsapp/productPayload');
        const firstItem = Array.isArray(order.orderItems) ? order.orderItems[0] : null;
        const product = firstItem?.productId && typeof firstItem.productId === 'object'
          ? buildWhatsAppProductPayload(firstItem.productId)
          : null;
        whatsapp = await sendPromotionalOfferWhatsApp({
          customerName: customer.customerName,
          phone: customer.phone,
          phoneCode: customer.phoneCode,
          couponCode: body?.couponCode || order?.coupon?.code,
          discountLabel: body?.discountLabel
            || (order?.coupon?.discountType === 'percentage'
              ? `${order?.coupon?.discount}%`
              : order?.coupon?.discount),
          product,
        });
        break;
      }
      default:
        return NextResponse.json({ error: 'Unsupported WhatsApp template' }, { status: 400 });
    }

    const sellerName = decodedToken.name || decodedToken.email || 'Store staff';
    const customer = getOrderPhone(order);
    const recipient = customer.phone
      ? `${customer.phoneCode || ''} ${customer.phone}`.trim()
      : '';

    await appendOrderCommunicationLog(orderId, {
      channel: 'whatsapp',
      template,
      label: WHATSAPP_TEMPLATE_LABELS[template] || `WhatsApp: ${template}`,
      status: whatsapp?.success ? 'sent' : 'failed',
      recipient,
      sentByUid: decodedToken.uid,
      sentByName: sellerName,
      details: whatsapp?.success ? '' : (whatsapp?.reason || whatsapp?.error || 'Send failed'),
    });

    return NextResponse.json({ success: true, template, whatsapp });
  } catch (error) {
    console.error('[store/whatsapp/send]', error);
    return NextResponse.json({
      error: error?.message || 'Failed to send WhatsApp message',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    templates: {
      cartReminder: WABA_TEMPLATE_NAMES.cartReminder,
      abandonedCheckout: WABA_TEMPLATE_NAMES.abandonedCheckout,
      codConfirmation: WABA_TEMPLATE_NAMES.codConfirmation,
      orderDelivered: WABA_TEMPLATE_NAMES.orderDelivered,
      promotionalOffer: WABA_TEMPLATE_NAMES.promotionalOffer,
      orderConfirmation: WABA_TEMPLATE_NAMES.codConfirmation,
      paidOrderConfirmation: WABA_TEMPLATE_NAMES.paidOrderConfirmation,
      orderShipped: WABA_TEMPLATE_NAMES.orderShipped,
      orderReminder: WABA_TEMPLATE_NAMES.orderReminder,
    },
    usage: 'POST with { template, cartId? | orderId? }',
  });
}
