import Product from '@/models/Product';
import Order from '@/models/Order';
import { getStoreOrderDisplayItems } from '@/lib/storeOrderLineItems';
import { sendWhatsAppTemplate, normalizePhoneForWaba, resolveWhatsAppHeaderImage } from '@/lib/whatsapp/elasticWaba';
import { formatWhatsAppErrorMessage, isWhatsAppMediaError } from '@/lib/whatsapp/formatWhatsAppError';
import { buildWhatsAppProductPayload, resolveWhatsAppFreeShippingLabel } from '@/lib/whatsapp/productPayload';
import {
  WABA_TEMPLATE_NAMES,
  formatAedPrice,
  formatPaymentMethodLabel,
  getAppBaseUrl,
  toWhatsAppProductUrlSuffix,
} from '@/lib/whatsapp/templates';
import { resolveAbandonedCheckoutOfferTotal } from '@/lib/whatsapp/abandonedCartOffer';
import { STORE1920_LOGO_URL } from '@/lib/brandLogo';
import { buildTrackOrderPageUrl, getDisplayOrderNumber } from '@/lib/orderDisplay';
import { resolveOrderLineItems, resolveOrderLineProductId } from '@/lib/gtmEcommerceHelpers';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import {
  isConfirmedPaidOrder,
  isFailedOrCancelledOrder,
  shouldSendOrderConfirmationOnCreate,
} from '@/lib/orderConfirmationPolicy';
import { isAwaitingPaymentOrder } from '@/lib/deferredOrderStatus';

async function claimOrderWhatsAppSend(orderId, fieldKey) {
  const id = String(orderId || '').trim();
  const field = `whatsappSentAt.${fieldKey}`;
  if (!id || !fieldKey) return false;

  const claimed = await Order.findOneAndUpdate(
    {
      _id: id,
      $or: [
        { [field]: null },
        { [field]: { $exists: false } },
      ],
    },
    { $set: { [field]: new Date() } },
    { new: true },
  ).select('_id').lean();

  return Boolean(claimed);
}

async function releaseOrderWhatsAppSend(orderId, fieldKey) {
  const id = String(orderId || '').trim();
  if (!id || !fieldKey) return;
  await Order.findByIdAndUpdate(id, { $unset: { [`whatsappSentAt.${fieldKey}`]: '' } });
}

function buildOrderWhatsAppAlreadySent(order, fieldKey) {
  const { phone, phoneCode } = getCustomerPhone(order);
  return {
    success: true,
    alreadySent: true,
    skipped: false,
    message: 'WhatsApp was already sent for this order.',
    to: normalizePhoneForWaba(phone, phoneCode) || undefined,
    templateKey: fieldKey,
  };
}

async function sendGuardedOrderWhatsApp(order, fieldKey, sender) {
  const orderId = order?._id;
  if (orderId) {
    const claimed = await claimOrderWhatsAppSend(orderId, fieldKey);
    if (!claimed) {
      return buildOrderWhatsAppAlreadySent(order, fieldKey);
    }
  }

  try {
    const result = await sender();
    if (result?.skipped || result?.success === false) {
      if (orderId) await releaseOrderWhatsAppSend(orderId, fieldKey);
    }
    return result;
  } catch (error) {
    if (orderId) await releaseOrderWhatsAppSend(orderId, fieldKey);
    throw error;
  }
}

function getCustomerName(order) {
  return (
    order?.shippingAddress?.name
    || order?.guestName
    || order?.userId?.name
    || 'Customer'
  );
}

function getCustomerPhone(order) {
  const shipping = order?.shippingAddress || {};
  return {
    phone: shipping.phone || order?.guestPhone || '',
    phoneCode: shipping.phoneCode || order?.alternatePhoneCode || '+971',
  };
}

function isPopulatedWhatsAppProduct(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && value._bsontype !== 'ObjectId'
    && (value.name || value.slug || value.image || Array.isArray(value.images)),
  );
}

function extractLineImageUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return String(value.url || value.src || value.path || '').trim();
  }
  return '';
}

function toAbsoluteHttpsImageUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === '/placeholder.png') return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return value.replace(/^http:/i, 'https:');
  const base = getAppBaseUrl();
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value.replace(/^\//, '')}`;
}

function mergeProductOntoLine(item, productById) {
  if (isPopulatedWhatsAppProduct(item?.productId)) {
    return { ...item, name: item.name || item.productId.name };
  }
  const productId = resolveOrderLineProductId(item);
  const product = productById.get(String(productId || ''));
  if (!product) return item;
  return {
    ...item,
    name: item.name || item.productName || product.name,
    productId: product,
  };
}

async function hydrateOrderForWhatsApp(order) {
  const plain = typeof order?.toObject === 'function' ? order.toObject() : { ...(order || {}) };
  const orderId = String(plain._id || '').trim();
  let source = plain;

  if (!resolveOrderLineItems(source).length && orderId) {
    const fresh = await Order.findById(orderId)
      .populate({ path: 'orderItems.productId', select: 'name slug images image sku brand price AED' })
      .lean();
    if (fresh) {
      source = {
        ...plain,
        ...fresh,
        shippingAddress: fresh.shippingAddress || plain.shippingAddress,
      };
    }
  }

  const items = resolveOrderLineItems(source);
  const missingIds = items
    .map((item) => {
      const product = isPopulatedWhatsAppProduct(item?.productId) ? item.productId : null;
      const hasImage = Boolean(product?.image || (Array.isArray(product?.images) && product.images.length));
      return hasImage ? '' : resolveOrderLineProductId(item);
    })
    .filter(Boolean);

  let productById = new Map();
  if (missingIds.length) {
    const products = await Product.find({ _id: { $in: missingIds } })
      .select('name slug images image sku brand price AED')
      .lean();
    productById = new Map(products.map((product) => [String(product._id), product]));
  }

  return {
    ...source,
    orderItems: Array.isArray(source.orderItems)
      ? source.orderItems.map((item) => mergeProductOntoLine(item, productById))
      : source.orderItems,
    items: Array.isArray(source.items)
      ? source.items.map((item) => mergeProductOntoLine(item, productById))
      : source.items,
  };
}

function formatAddress(order) {
  const address = order?.shippingAddress || {};
  const parts = [
    address.street,
    address.district,
    address.city,
    address.state,
    address.country,
  ].filter(Boolean);
  return parts.join(', ') || 'Address on file';
}

function formatOrderTotalForWhatsApp(order, includeCurrency = true) {
  const total = Number(order?.total || 0);
  const formatted = Number.isFinite(total)
    ? (total % 1 === 0 ? total.toFixed(0) : total.toFixed(2))
    : '0';
  return includeCurrency ? `${formatted} AED` : formatted;
}

function formatOrderNumberForConfirmedTemplate(order) {
  const number = getDisplayOrderNumber(order) || 'N/A';
  const normalized = String(number).trim();
  if (!normalized || normalized === 'N/A') return '#N/A';
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

/** Body params for Meta template `store1920_order_confirmed` (6 variables). */
async function buildStore1920OrderConfirmedBodyParams(order) {
  return [
    getCustomerName(order),
    formatOrderNumberForConfirmedTemplate(order),
    formatPaymentMethodLabel(order?.paymentMethod),
    'Confirmed',
    await resolveProductSummary(order),
    formatOrderTotalForWhatsApp(order, true),
  ];
}

async function buildOrderConfirmationBodyParams(order, { priceIncludesCurrency = true } = {}) {
  const { phone, phoneCode } = getCustomerPhone(order);
  const productSummary = await resolveProductSummary(order);

  return [
    getCustomerName(order),
    getDisplayOrderNumber(order) || 'N/A',
    productSummary,
    formatOrderTotalForWhatsApp(order, priceIncludesCurrency),
    formatAddress(order),
    normalizePhoneForWaba(phone, phoneCode) || String(phone || '').trim(),
    order?.shippingAddress?.email || order?.guestEmail || order?.userId?.email || '',
  ];
}

function usesStore1920OrderConfirmedTemplate(templateName) {
  return String(templateName || '').trim() === 'store1920_order_confirmed';
}

async function sendOrderConfirmationWhatsApp(order, templateName, { priceIncludesCurrency = true } = {}) {
  const { phone, phoneCode } = getCustomerPhone(order);
  if (!phone) {
    return { skipped: true, reason: 'No customer phone on order' };
  }

  const bodyParams = usesStore1920OrderConfirmedTemplate(templateName)
    ? await buildStore1920OrderConfirmedBodyParams(order)
    : await buildOrderConfirmationBodyParams(order, { priceIncludesCurrency });

  return sendWhatsAppTemplate({
    to: phone,
    phoneCode,
    templateName,
    bodyParams,
  });
}

function formatWhatsAppLineName(item = {}) {
  const name = String(item?.name || item?.productName || item?.productId?.name || '').trim();
  if (!name || name.toLowerCase() === 'product' || name.toLowerCase() === 'your order') {
    return '';
  }
  if (item.isBulkBundle && Number(item.bundleUnits) > 0) {
    return `${name} (Bundle of ${item.bundleUnits})`;
  }
  return name;
}

async function resolveProductSummary(order) {
  const displayItems = getStoreOrderDisplayItems(order);
  if (displayItems.length) {
    const firstLabel = formatWhatsAppLineName(displayItems[0]) || 'Your order';
    return displayItems.length > 1
      ? `${firstLabel} +${displayItems.length - 1} more`
      : firstLabel;
  }

  const items = resolveOrderLineItems(order);
  if (!items.length) return 'Your order';

  const firstItem = items[0];
  const populatedName = firstItem?.productId?.name || firstItem?.name || firstItem?.productName;
  if (populatedName) {
    return items.length > 1 ? `${populatedName} +${items.length - 1} more` : populatedName;
  }

  const productIds = items.map((item) => resolveOrderLineProductId(item)).filter(Boolean);
  if (productIds.length) {
    const products = await Product.find({ _id: { $in: productIds } }).select('name').lean();
    const nameById = new Map(products.map((product) => [String(product._id), product.name]));
    const firstName = nameById.get(String(productIds[0])) || 'Your order';
    return items.length > 1 ? `${firstName} +${items.length - 1} more` : firstName;
  }

  return 'Your order';
}

async function resolvePrimaryProductPayload(order) {
  const displayItems = getStoreOrderDisplayItems(order);
  const firstDisplay = displayItems[0];
  const lineItems = resolveOrderLineItems(order);
  const firstItem = firstDisplay || lineItems[0] || null;
  if (!firstItem) return null;

  const populated = isPopulatedWhatsAppProduct(firstItem?.productId)
    ? firstItem.productId
    : (isPopulatedWhatsAppProduct(firstItem?.product) ? firstItem.product : null);

  const productId = resolveOrderLineProductId(firstItem) || populated?._id || populated?.id;
  let product = populated;
  if (productId) {
    const fresh = await Product.findById(productId).lean();
    if (fresh) product = fresh;
  }
  if (!product) return null;

  const payload = buildWhatsAppProductPayload(product);
  const lineImage = toAbsoluteHttpsImageUrl(
    extractLineImageUrl(firstDisplay?.image)
    || extractLineImageUrl(firstItem?.image)
    || extractLineImageUrl(firstItem?.imageUrl)
    || getProductThumbnailUrl(product, { fallback: '' }),
  );
  if (lineImage) payload.imageUrl = lineImage;
  if (!payload.name) payload.name = String(firstItem?.name || firstItem?.productName || '').trim();

  if (payload && firstDisplay?.isBulkBundle && Number(firstDisplay.bundleUnits) > 0) {
    payload.name = `${payload.name} — Bundle of ${firstDisplay.bundleUnits}`;
  }

  return payload;
}

function getFallbackHeaderImage() {
  return String(process.env.WABA_CART_REMINDER_FALLBACK_IMAGE || STORE1920_LOGO_URL || '').trim();
}

function getHeaderImage(product) {
  return resolveWhatsAppHeaderImage(product?.imageUrl, getFallbackHeaderImage());
}

function formatOrderNumberForWhatsApp(order) {
  const number = getDisplayOrderNumber(order);
  if (!number) return 'N/A';
  return String(number).replace(/^#/, '');
}

export async function sendOrderPlacedWhatsApp(order) {
  try {
    return await sendGuardedOrderWhatsApp(order, 'orderPlaced', () =>
      sendOrderConfirmationWhatsApp(order, WABA_TEMPLATE_NAMES.orderPlaced, {
        priceIncludesCurrency: true,
      }),
    );
  } catch (error) {
    console.error('[whatsapp] order placed notification failed:', error);
    return { success: false, error: error.message };
  }
}

/** @deprecated Use sendOrderPlacedWhatsApp */
export const sendCodConfirmationWhatsApp = sendOrderPlacedWhatsApp;

export async function sendOrderCreatedWhatsApp(order, paymentMethod) {
  try {
    if (isFailedOrCancelledOrder(order) || isAwaitingPaymentOrder(order)) {
      return { skipped: true, reason: 'Order is not confirmed' };
    }

    if (!shouldSendOrderConfirmationOnCreate(order, paymentMethod)) {
      return { skipped: true, reason: 'Deferred payment — waiting for payment confirmation' };
    }

    const method = String(paymentMethod || order?.paymentMethod || '').toUpperCase();
    if (method === 'COD') {
      return await sendOrderPlacedWhatsApp(order);
    }

    if (order?.isPaid === true || String(order?.paymentStatus || '').toLowerCase() === 'paid') {
      return await sendOrderPaidWhatsApp(order);
    }

    return await sendOrderPlacedWhatsApp(order);
  } catch (error) {
    console.error('[whatsapp] order created notification failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendOrderPaidWhatsApp(order) {
  try {
    if (!isConfirmedPaidOrder(order)) {
      return { skipped: true, reason: 'Order is not paid' };
    }

    return await sendGuardedOrderWhatsApp(order, 'orderPaid', () =>
      sendOrderConfirmationWhatsApp(order, WABA_TEMPLATE_NAMES.paidOrderConfirmation, {
        priceIncludesCurrency: false,
      }),
    );
  } catch (error) {
    console.error('[whatsapp] paid order notification failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendOrderShippedWhatsApp(order) {
  try {
    const { phone, phoneCode } = getCustomerPhone(order);
    if (!phone) {
      return { skipped: true, reason: 'No customer phone on order' };
    }

    const trackingId = String(order?.trackingId || '').trim() || 'Pending';
    const trackingUrl = String(
      buildTrackOrderPageUrl(order) || `${getAppBaseUrl()}/track-order`,
    ).trim();

    return await sendGuardedOrderWhatsApp(order, 'orderShipped', () =>
      sendWhatsAppTemplate({
        to: phone,
        phoneCode,
        templateName: WABA_TEMPLATE_NAMES.orderShipped,
        bodyParams: [
          getCustomerName(order),
          formatOrderNumberForWhatsApp(order),
          trackingId,
          trackingUrl,
        ],
      }),
    );
  } catch (error) {
    console.error('[whatsapp] shipped notification failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendOrderDeliveredWhatsApp(order) {
  try {
    const hydrated = await hydrateOrderForWhatsApp(order);
    const { phone, phoneCode } = getCustomerPhone(hydrated);
    if (!phone) {
      return { skipped: true, reason: 'No customer phone on order' };
    }

    const product = await resolvePrimaryProductPayload(hydrated);
    const productImage = resolveWhatsAppHeaderImage(product?.imageUrl, '');
    const logoImage = resolveWhatsAppHeaderImage(getFallbackHeaderImage(), '');
    const imageUrl = productImage || logoImage;
    if (!imageUrl) {
      return { skipped: true, reason: 'Missing header image for delivered WhatsApp template' };
    }

    const productSummary = String(product?.name || '').trim()
      || await resolveProductSummary(hydrated);

    const sendDeliveredTemplate = (headerImageUrl) => sendWhatsAppTemplate({
      to: phone,
      phoneCode,
      templateName: WABA_TEMPLATE_NAMES.orderDelivered,
      bodyParams: [
        getCustomerName(hydrated),
        getDisplayOrderNumber(hydrated) || 'N/A',
        productSummary,
      ],
      headerImageUrl,
      buttonUrlSuffix: toWhatsAppProductUrlSuffix(product)
        || toWhatsAppProductUrlSuffix(process.env.WABA_DELIVERED_BUTTON_PATH)
        || 'shop',
    });

    return await sendGuardedOrderWhatsApp(hydrated, 'orderDelivered', async () => {
      try {
        return await sendDeliveredTemplate(imageUrl);
      } catch (error) {
        if (productImage && logoImage && productImage !== logoImage && isWhatsAppMediaError(error?.message)) {
          console.warn('[whatsapp] delivered product image rejected, retrying with logo:', error?.message);
          return sendDeliveredTemplate(logoImage);
        }
        throw error;
      }
    });
  } catch (error) {
    console.error('[whatsapp] delivered notification failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendPromotionalOfferWhatsApp({
  customerName,
  phone,
  phoneCode,
  couponCode,
  discountLabel,
  availabilityLabel = 'Available',
  product,
  buttonPath = '/shop',
}) {
  try {
    if (!phone) {
      return { skipped: true, reason: 'No customer phone' };
    }

    const imageUrl = getHeaderImage(product);
    if (!imageUrl) {
      return { skipped: true, reason: 'Missing header image for promotional WhatsApp template' };
    }

    return await sendWhatsAppTemplate({
      to: phone,
      phoneCode,
      templateName: WABA_TEMPLATE_NAMES.promotionalOffer,
      bodyParams: [
        customerName || 'Customer',
        String(couponCode || '').trim() || 'OFFER',
        String(discountLabel || '').trim() || '5%',
        availabilityLabel || 'Available',
      ],
      headerImageUrl: imageUrl,
      buttonUrlSuffix: toWhatsAppProductUrlSuffix(product)
        || toWhatsAppProductUrlSuffix(buttonPath)
        || 'shop',
    });
  } catch (error) {
    console.error('[whatsapp] promotional offer failed:', error);
    return { success: false, error: error.message };
  }
}

function formatCartReminderPrice(product, cartTotal) {
  if (cartTotal != null && Number.isFinite(Number(cartTotal))) {
    return formatAedPrice(cartTotal);
  }

  const price = Number(product?.price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return '0 AED';
  return formatAedPrice(price);
}

export async function sendCartReminderWhatsApp({
  customerName,
  phone,
  phoneCode,
  product,
  cartTotal,
  buttonPath = '/cart',
}) {
  try {
    if (!phone) {
      return { skipped: true, reason: 'No customer phone' };
    }

    const imageUrl = getHeaderImage(product);
    if (!imageUrl) {
      return {
        skipped: true,
        reason: 'Missing header image for WhatsApp template. Set WABA_CART_REMINDER_FALLBACK_IMAGE in .env',
      };
    }

    const freeShippingLabel = resolveWhatsAppFreeShippingLabel(product, { cartTotal });

    return await sendWhatsAppTemplate({
      to: phone,
      phoneCode,
      templateName: WABA_TEMPLATE_NAMES.cartReminder,
      bodyParams: [
        customerName || 'Customer',
        formatCartReminderPrice(product, cartTotal),
        freeShippingLabel,
      ],
      headerImageUrl: imageUrl,
      buttonUrlSuffix: buttonPath,
    });
  } catch (error) {
    console.error('[whatsapp] cart reminder failed:', error);
    return { success: false, error: formatWhatsAppErrorMessage(error?.message || error) };
  }
}

export async function sendAbandonedCheckoutWhatsApp({
  customerName,
  phone,
  phoneCode,
  product,
  cartTotal,
  offerTotal,
  cartUrl,
}) {
  try {
    if (!phone) {
      return { skipped: true, reason: 'No customer phone' };
    }

    const imageUrl = getHeaderImage(product);
    if (!imageUrl) {
      return { skipped: true, reason: 'Missing header image for abandoned checkout WhatsApp template' };
    }

    const { original: originalTotal, discounted: discountedTotal } = resolveAbandonedCheckoutOfferTotal(
      {},
      Number(cartTotal ?? product?.originalPrice ?? product?.price ?? 0),
    );
    const resolvedOriginal = Number(cartTotal ?? originalTotal ?? product?.originalPrice ?? product?.price ?? 0);
    let resolvedDiscounted = Number(offerTotal);
    if (!Number.isFinite(resolvedDiscounted) || resolvedDiscounted <= 0 || resolvedDiscounted >= resolvedOriginal) {
      resolvedDiscounted = discountedTotal;
    }
    if (resolvedDiscounted >= resolvedOriginal && resolvedOriginal > 0) {
      const fallback = resolveAbandonedCheckoutOfferTotal({}, resolvedOriginal);
      resolvedDiscounted = fallback.discounted;
    }

    const freeShippingLabel = resolveWhatsAppFreeShippingLabel(product, { cartTotal: resolvedDiscounted });
    const resolvedCartUrl = String(cartUrl || product?.cartUrl || `${getAppBaseUrl()}/cart`).trim();

    return await sendWhatsAppTemplate({
      to: phone,
      phoneCode,
      templateName: WABA_TEMPLATE_NAMES.abandonedCheckout,
      bodyParams: [
        customerName || 'Customer',
        formatAedPrice(resolvedOriginal),
        formatAedPrice(resolvedDiscounted),
        freeShippingLabel,
        resolvedCartUrl,
      ],
      headerImageUrl: imageUrl,
    });
  } catch (error) {
    console.error('[whatsapp] abandoned checkout reminder failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendOrderReminderWhatsApp({ customerName, orderNumber, phone, phoneCode }) {
  try {
    if (!phone) {
      return { skipped: true, reason: 'No customer phone' };
    }

    return await sendWhatsAppTemplate({
      to: phone,
      phoneCode,
      templateName: WABA_TEMPLATE_NAMES.orderReminder,
      bodyParams: [
        customerName || 'Customer',
        String(orderNumber || '').trim().replace(/^#/, '') || 'N/A',
      ],
    });
  } catch (error) {
    console.error('[whatsapp] order reminder failed:', error);
    return { success: false, error: error.message };
  }
}

export async function sendOrderStatusWhatsApp(order, status) {
  const normalizedStatus = String(status || '').toUpperCase();
  if (normalizedStatus === 'SHIPPED') {
    return sendOrderShippedWhatsApp(order);
  }
  if (normalizedStatus === 'DELIVERED') {
    return sendOrderDeliveredWhatsApp(order);
  }
  return { skipped: true, reason: 'No WhatsApp template for status' };
}

export async function sendDeferredPaymentWhatsApp(order) {
  try {
    if (!isConfirmedPaidOrder(order)) {
      return { skipped: true, reason: 'Order is not paid yet' };
    }
    return await sendOrderPaidWhatsApp(order);
  } catch (error) {
    console.error('[whatsapp] deferred payment notification failed:', error);
    return { success: false, error: error.message };
  }
}
