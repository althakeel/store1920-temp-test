import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import Product from '@/models/Product';
import { verifyWhatsAppWebhookRequest } from '@/lib/whatsapp/webhookAuth';
import { buildWhatsAppProductPayload } from '@/lib/whatsapp/productPayload';
import { getStoreOrderDisplayItems } from '@/lib/storeOrderLineItems';
import {
  sendOrderPaidWhatsApp,
  sendOrderShippedWhatsApp,
  sendOrderReminderWhatsApp,
  sendOrderDeliveredWhatsApp,
  sendPromotionalOfferWhatsApp,
  sendCartReminderWhatsApp,
  sendAbandonedCheckoutWhatsApp,
} from '@/lib/whatsapp/orderNotifications';
import { resolveAbandonedCheckoutOfferTotal } from '@/lib/whatsapp/abandonedCartOffer';
import {
  ensureCartRestoreToken,
  resolveWhatsAppCartButtonPath,
} from '@/lib/abandonedCartRestore';
import { WABA_TEMPLATE_NAMES } from '@/lib/whatsapp/templates';

const WEBHOOK_PATH = '/api/order-confirm-webhook';

async function findOrder({ orderId, orderNumber }) {
  if (orderId) {
    const order = await Order.findById(orderId).lean();
    if (order) return order;
  }

  const normalizedNumber = String(orderNumber || '').replace(/\D/g, '');
  if (!normalizedNumber) return null;

  const numericOrderNumber = Number(normalizedNumber);
  if (Number.isFinite(numericOrderNumber)) {
    const order = await Order.findOne({ shortOrderNumber: numericOrderNumber }).lean();
    if (order) return order;
  }

  return null;
}

async function resolveProductFromBody(body = {}) {
  if (body?.product && body.product.slug) {
    return body.product;
  }

  const productId = body?.productId;
  const slug = body?.slug || body?.productSlug;

  let product = null;
  if (productId) {
    product = await Product.findById(productId).lean();
  } else if (slug) {
    product = await Product.findOne({ slug: String(slug).trim() }).lean();
  }

  return product ? buildWhatsAppProductPayload(product) : null;
}

async function getPrimaryProductPayload(order) {
  const displayItems = getStoreOrderDisplayItems(order);
  const firstDisplay = displayItems[0];
  const firstItem = Array.isArray(order?.orderItems) ? order.orderItems[0] : null;
  const productId = firstItem?.productId?._id || firstItem?.productId;
  if (!productId) return null;

  const product = await Product.findById(productId).lean();
  if (!product) return null;

  const payload = buildWhatsAppProductPayload(product);
  if (firstDisplay?.isBulkBundle && Number(firstDisplay.bundleUnits) > 0) {
    payload.name = `${payload.name} — Bundle of ${firstDisplay.bundleUnits}`;
  }
  return payload;
}

function getCustomerContext(order) {
  const shipping = order?.shippingAddress || {};
  return {
    customerName: shipping.name || order?.guestName || 'Customer',
    phone: shipping.phone || order?.guestPhone || '',
    phoneCode: shipping.phoneCode || order?.alternatePhoneCode || '+971',
    orderNumber: order?.shortOrderNumber
      ? `ST1920-${order.shortOrderNumber}`
      : String(order?._id || '').slice(-8).toUpperCase(),
  };
}

function getStandaloneCustomerContext(body = {}) {
  return {
    customerName: body.customerName || body.name || 'Customer',
    phone: body.phone || '',
    phoneCode: body.phoneCode || '+971',
    cartTotal: body.cartTotal ?? body.total ?? null,
  };
}

async function dispatchWhatsAppEvent(order, event, body = {}) {
  const normalizedEvent = String(event || '').toLowerCase();

  switch (normalizedEvent) {
    case 'order_confirmed':
    case 'cod_confirmation':
      // Customer already tapped "Confirm Order" in WhatsApp. Do not send another
      // template — Elastic returns "Error, null, sorry nothing to update..." and
      // some bot flows echo that string to the customer.
      return {
        success: true,
        skipped: true,
        acknowledged: true,
        reason: 'confirm_ack_no_resend',
      };
    case 'order_paid':
    case 'paid_confirmation':
      return sendOrderPaidWhatsApp(order);
    case 'order_shipped':
      return sendOrderShippedWhatsApp(order);
    case 'order_reminder':
    case 'order_reminder_': {
      const customer = order
        ? getCustomerContext(order)
        : getStandaloneCustomerContext(body);

      return sendOrderReminderWhatsApp({
        customerName: body.customerName || customer.customerName,
        orderNumber: body.orderNumber || customer.orderNumber,
        phone: body.phone || customer.phone,
        phoneCode: body.phoneCode || customer.phoneCode,
      });
    }
    case 'cart_reminder': {
      const product = body.product || (order ? await getPrimaryProductPayload(order) : await resolveProductFromBody(body));
      const customer = order
        ? getCustomerContext(order)
        : getStandaloneCustomerContext(body);

      let buttonPath = body.buttonPath || '/cart';
      if (!body.buttonPath && body.cartId) {
        const cart = await ensureCartRestoreToken(body.cartId).catch(() => null);
        if (cart) {
          buttonPath = resolveWhatsAppCartButtonPath(cart);
        }
      }

      return sendCartReminderWhatsApp({
        customerName: body.customerName || customer.customerName,
        phone: body.phone || customer.phone,
        phoneCode: body.phoneCode || customer.phoneCode,
        product,
        cartTotal: body.cartTotal ?? body.total ?? order?.total ?? null,
        buttonPath,
      });
    }
    case 'abandoned_checkout': {
      const product = body.product || (order ? await getPrimaryProductPayload(order) : await resolveProductFromBody(body));
      const customer = order
        ? getCustomerContext(order)
        : getStandaloneCustomerContext(body);
      const cartTotal = body.cartTotal ?? body.total ?? order?.total ?? null;
      const { original, discounted } = resolveAbandonedCheckoutOfferTotal(
        body?.cart || {},
        cartTotal,
      );
      const offerTotal = body.offerTotal ?? body.recoveryOfferTotal ?? discounted;

      return sendAbandonedCheckoutWhatsApp({
        customerName: body.customerName || customer.customerName,
        phone: body.phone || customer.phone,
        phoneCode: body.phoneCode || customer.phoneCode,
        product,
        cartTotal: original ?? cartTotal,
        offerTotal,
      });
    }
    case 'order_delivered':
      return sendOrderDeliveredWhatsApp(order);
    case 'promotional_offer':
    case 'promotional_offer__coupon': {
      const product = body.product || (order ? await getPrimaryProductPayload(order) : await resolveProductFromBody(body));
      const customer = order
        ? getCustomerContext(order)
        : getStandaloneCustomerContext(body);

      return sendPromotionalOfferWhatsApp({
        customerName: body.customerName || customer.customerName,
        phone: body.phone || customer.phone,
        phoneCode: body.phoneCode || customer.phoneCode,
        couponCode: body.couponCode || body.code || body.coupon?.code,
        discountLabel: body.discountLabel
          || body.discountPercent
          || (body.coupon?.discountType === 'percentage' ? `${body.coupon?.discount}%` : body.coupon?.discount),
        availabilityLabel: body.availabilityLabel || product?.freeShippingLabel || 'Available',
        product,
        buttonPath: body.buttonPath || '/shop',
      });
    }
    default:
      return {
        skipped: true,
        reason: `Unsupported event: ${event}`,
      };
  }
}

function isStandaloneReminderEvent(event) {
  const normalized = String(event || '').toLowerCase();
  return normalized === 'cart_reminder'
    || normalized === 'abandoned_checkout'
    || normalized === 'order_reminder'
    || normalized === 'order_reminder_'
    || normalized === 'promotional_offer'
    || normalized === 'promotional_offer__coupon';
}

export async function handleOrderConfirmWebhookGet() {
  return NextResponse.json({
    success: true,
    service: 'Store1920 WhatsApp order webhook',
    status: 'ready',
    endpoints: {
      product: '/api/whatsapp/product',
      orderConfirmWebhook: WEBHOOK_PATH,
    },
    templates: {
      cartReminder: WABA_TEMPLATE_NAMES.cartReminder,
      abandonedCheckout: WABA_TEMPLATE_NAMES.abandonedCheckout,
      codConfirmation: WABA_TEMPLATE_NAMES.codConfirmation,
      orderDelivered: WABA_TEMPLATE_NAMES.orderDelivered,
      promotionalOffer: WABA_TEMPLATE_NAMES.promotionalOffer,
      paidOrderConfirmation: WABA_TEMPLATE_NAMES.paidOrderConfirmation,
      orderShipped: WABA_TEMPLATE_NAMES.orderShipped,
      orderReminder: WABA_TEMPLATE_NAMES.orderReminder,
    },
  });
}

export async function handleOrderConfirmWebhookPost(request) {
  const auth = verifyWhatsAppWebhookRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const event = String(body?.event || body?.type || '').trim();

    await connectDB();

    const order = await findOrder({
      orderId: body?.orderId,
      orderNumber: body?.orderNumber,
    });

    if (!order && !isStandaloneReminderEvent(event)) {
      return NextResponse.json({
        success: false,
        error: 'Order not found. Provide a valid orderId or orderNumber.',
      }, { status: 404 });
    }

    if (!order && isStandaloneReminderEvent(event)) {
      const customer = getStandaloneCustomerContext(body);
      if (!customer.phone) {
        return NextResponse.json({
          success: false,
          error: 'Phone is required for reminder events when no order is provided.',
        }, { status: 400 });
      }

      const product = body.product || await resolveProductFromBody(body);
      const whatsappResult = await dispatchWhatsAppEvent(null, event, body);

      return NextResponse.json({
        success: true,
        event,
        customer,
        product,
        whatsapp: sanitizeWhatsAppWebhookResult(whatsappResult),
      });
    }

    const product = await getPrimaryProductPayload(order);
    const customer = getCustomerContext(order);
    const whatsappResult = await dispatchWhatsAppEvent(order, event, body);
    const sanitizedWhatsApp = sanitizeWhatsAppWebhookResult(whatsappResult);

    return NextResponse.json({
      success: true,
      event,
      order: {
        id: String(order._id),
        orderNumber: customer.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
      },
      customer,
      product,
      whatsapp: sanitizedWhatsApp,
    });
  } catch (error) {
    console.error('[order-confirm-webhook]', error);
    // Never return Elastic "nothing to update" strings — bots may echo them to customers.
    const raw = String(error?.message || '');
    const isBenignDuplicate = /nothing to update|already sent|sorry nothing/i.test(raw);
    if (isBenignDuplicate) {
      return NextResponse.json({
        success: true,
        acknowledged: true,
        whatsapp: { success: true, skipped: true, reason: 'already_processed' },
      });
    }
    return NextResponse.json({
      success: false,
      error: 'Webhook processing failed',
    }, { status: 500 });
  }
}

function sanitizeWhatsAppWebhookResult(result = {}) {
  if (!result || typeof result !== 'object') {
    return { success: true, acknowledged: true };
  }

  const rawMessage = String(result.message || result.error || result.reason || '');
  if (/nothing to update|Error,\s*null|sorry nothing/i.test(rawMessage)) {
    return {
      success: true,
      skipped: true,
      acknowledged: true,
      reason: 'already_processed',
    };
  }

  const cleaned = { ...result };
  delete cleaned.raw;
  if (cleaned.message && /error/i.test(String(cleaned.message))) {
    delete cleaned.message;
  }
  if (cleaned.error) delete cleaned.error;
  return cleaned;
}
