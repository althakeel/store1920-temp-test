import Product from '@/models/Product';
import { getAbandonedCartTotal, getAbandonedCartDisplayName } from '@/lib/abandonedCartUtils';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getCustomerSiteUrl } from '@/lib/appUrl';
import { getAbandonedCartDisplayItems } from '@/lib/abandonedCartLineItems';
import { buildWhatsAppProductPayload } from '@/lib/whatsapp/productPayload';
import { resolveAbandonedCheckoutOfferTotal } from '@/lib/whatsapp/abandonedCartOffer';
import {
  sendAbandonedCheckoutWhatsApp,
} from '@/lib/whatsapp/orderNotifications';
import { normalizePhoneForWaba } from '@/lib/whatsapp/elasticWaba';
import { formatWhatsAppErrorMessage } from '@/lib/whatsapp/formatWhatsAppError';
import { ensureCartRestoreToken, resolveWhatsAppCartButtonPath, buildCartRestorePath } from '@/lib/abandonedCartRestore';

function ensureAbsoluteHttpsUrl(url) {
  const value = String(url || '').trim();
  if (!value || value === '/placeholder.png') return '';
  if (/^https:\/\//i.test(value)) return value;
  const base = getCustomerSiteUrl();
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value.replace(/^\//, '')}`;
}

export async function resolveAbandonedCartProductPayload(cart = {}) {
  const items = Array.isArray(cart.items)
    ? cart.items.filter((item) => String(item?.productId || item?.id || '').trim())
    : [];
  if (!items.length) return null;

  const sortedItems = [...getAbandonedCartDisplayItems(cart)].sort(
    (a, b) => Number(b.lineTotal || 0) - Number(a.lineTotal || 0),
  );
  const primaryItem = sortedItems[0];
  if (!primaryItem) return null;

  const productId = String(primaryItem?.productId?._id || primaryItem?.productId || '').trim();
  if (!productId) return null;

  const product = await Product.findById(productId).lean();
  if (!product) return null;

  const payload = buildWhatsAppProductPayload(product);
  if (primaryItem.isBulkBundle) {
    const bundleUnits = Number(primaryItem.bundleUnits || primaryItem.quantity || 0);
    if (bundleUnits > 0) {
      payload.name = `${payload.name} — Bundle of ${bundleUnits}`;
    }
  }
  const itemImage = ensureAbsoluteHttpsUrl(primaryItem?.imageUrl || primaryItem?.image || '');
  if (itemImage) {
    payload.imageUrl = itemImage;
  } else if (!payload.imageUrl) {
    payload.imageUrl = ensureAbsoluteHttpsUrl(getProductThumbnailUrl(product, { fallback: '' }));
  }

  return payload;
}

function buildAbandonedCartWhatsAppUrl(cart = {}, options = {}) {
  const base = getCustomerSiteUrl().replace(/\/$/, '');
  let path = options.cartUrl || options.buttonPath;
  if (!path) {
    if (options.useRecoveryLink === false) {
      // Skip the discount recovery link, but still deep-link with the cart
      // restore token so the customer reopens their cart (not an empty /cart).
      const restoreToken = String(cart.cartRestoreToken || '').trim();
      path = restoreToken ? buildCartRestorePath(restoreToken) : '/cart';
    } else {
      path = resolveWhatsAppCartButtonPath(cart);
    }
  }
  const value = String(path || '/cart').trim();
  if (/^https:\/\//i.test(value)) return value;
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

export async function sendAbandonedCartWhatsAppReminder(cart = {}, options = {}) {
  const phone = String(cart?.phone || '').trim();
  if (!phone) {
    return { skipped: true, reason: 'No customer phone on abandoned cart' };
  }

  const phoneCode = cart?.phoneCode || options.phoneCode || '+971';
  const reminderStatus = String(cart?.whatsappCheckoutReminderStatus || '').toLowerCase();
  if (
    !options.forceResend
    && reminderStatus === 'sent'
    && cart?.whatsappCheckoutReminderSentAt
  ) {
    return {
      success: true,
      alreadySent: true,
      message: formatWhatsAppErrorMessage('sorry nothing to update'),
      to: normalizePhoneForWaba(phone, phoneCode) || phone,
    };
  }

  const hydrated = cart?._id
    ? await ensureCartRestoreToken(cart._id).catch(() => cart)
    : cart;
  const mergedCart = { ...cart, ...(hydrated || {}) };

  const product = await resolveAbandonedCartProductPayload(mergedCart);
  const cartTotal = getAbandonedCartTotal(mergedCart);
  const customerName = getAbandonedCartDisplayName(mergedCart);
  const { original: originalTotal, discounted: computedOfferTotal } = resolveAbandonedCheckoutOfferTotal(
    mergedCart,
    cartTotal,
  );
  const offerTotal = options.offerTotal ?? mergedCart.recoveryOfferTotal ?? computedOfferTotal;
  const cartUrl = buildAbandonedCartWhatsAppUrl(mergedCart, options);

  return sendAbandonedCheckoutWhatsApp({
    customerName,
    phone,
    phoneCode: cart?.phoneCode || options.phoneCode || '+971',
    product,
    cartTotal: originalTotal || cartTotal,
    offerTotal: offerTotal ?? computedOfferTotal,
    cartUrl,
  });
}
