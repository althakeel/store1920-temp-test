import { getDisplayOrderNumber, getOrderLineProduct, isGenericProductName } from '@/lib/orderDisplay';
import {
  resolveOrderLineItems,
  resolveOrderLineName,
  resolveOrderLinePackQuantity,
  resolveOrderLinePrice,
} from '@/lib/gtmEcommerceHelpers';
import {
  formatMatrixSelectionLabel,
  formatVariantOptionsLabel,
  matchVariantByOptions,
} from '@/lib/productVariantOptions';
import { getEmxTrackingNumber } from '@/lib/waslahTracking';

function splitName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: 'Customer', lastName: 'Store1920' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function normalizeZohoPhone(phone = '', phoneCode = '+971') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('971') && digits.length >= 11) return `+${digits}`;
  const code = String(phoneCode || '+971').replace(/\D/g, '') || '971';
  const local = digits.replace(/^0+/, '');
  return `+${code}${local}`;
}

export function resolveZohoOrderCustomer(order = {}) {
  const shipping = order.shippingAddress || {};
  const user = order.userId && typeof order.userId === 'object' ? order.userId : {};
  const email = String(
    shipping.email || order.guestEmail || user.email || '',
  ).trim().toLowerCase();
  const phone = normalizeZohoPhone(
    shipping.phone || order.guestPhone,
    shipping.phoneCode || order.alternatePhoneCode || '+971',
  );
  const alternatePhone = normalizeZohoPhone(
    order.alternatePhone || shipping.alternatePhone,
    order.alternatePhoneCode || shipping.alternatePhoneCode || shipping.phoneCode || '+971',
  );
  const name = String(
    shipping.name || order.guestName || user.name || 'Customer',
  ).trim();
  const { firstName, lastName } = splitName(name);
  const street = String(shipping.street || shipping.address || '').trim();
  const district = String(shipping.district || '').trim();

  return {
    email,
    phone,
    alternatePhone,
    contactName: name || `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    street,
    street2: district,
    city: String(shipping.city || '').trim(),
    state: String(shipping.state || shipping.district || '').trim(),
    country: String(shipping.country || 'UAE').trim(),
    zip: String(shipping.zip || shipping.postalCode || shipping.pincode || '').trim(),
  };
}

export function buildZohoAddress(customer = {}) {
  const street = [customer.street, customer.street2].filter(Boolean).join(', ');
  return {
    attention: customer.contactName || undefined,
    address: street || undefined,
    street2: customer.street2 || undefined,
    city: customer.city || undefined,
    state: customer.state || undefined,
    zip: customer.zip || undefined,
    country: customer.country || 'UAE',
    phone: customer.phone || undefined,
  };
}

export function resolveZohoProductSku(product = {}, variantOptions = {}) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    const variant = matchVariantByOptions(variants, variantOptions);
    const variantSku = String(variant?.sku || '').trim();
    if (variantSku) return variantSku;
  }
  const productSku = String(product?.sku || '').trim();
  if (productSku) return productSku;
  const productId = product?._id ? String(product._id) : '';
  return productId ? `S1920-${productId}` : '';
}

function getLineProductName(item = {}) {
  const product = getOrderLineProduct(item);
  const catalog = String(product?.name || product?.title || '').trim();
  if (catalog && !isGenericProductName(catalog)) return catalog;
  return resolveOrderLineName(item, product);
}

function getLineVariant(item = {}) {
  const opts = item?.variantOptions && typeof item.variantOptions === 'object'
    ? item.variantOptions
    : {};
  return formatVariantOptionsLabel(opts) || '';
}

function getLineOption(item = {}) {
  const opts = item?.variantOptions && typeof item.variantOptions === 'object'
    ? item.variantOptions
    : {};
  const withoutTitle = { ...opts, title: '' };
  const option = formatMatrixSelectionLabel(withoutTitle);
  if (option) return option;

  const parts = [];
  const optionLabel = String(opts.optionLabel || '').trim();
  const optionValue = String(opts.option || '').trim();
  if (optionValue) {
    parts.push(optionLabel && optionLabel !== 'Option' ? `${optionLabel}: ${optionValue}` : optionValue);
  }
  ['color', 'size', 'model'].forEach((key) => {
    const value = String(opts[key] || '').trim();
    if (value) parts.push(value);
  });
  return parts.join(' · ');
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

export function resolveZohoOrderDiscount(order = {}) {
  const lines = resolveOrderLineItems(order);
  const subtotal = lines.reduce((sum, item) => {
    const qty = resolveOrderLinePackQuantity(item, getOrderLineProduct(item), order);
    return sum + (resolveOrderLinePrice(item) * qty);
  }, 0);

  let couponAmount = 0;
  if (order.isCouponUsed && order.coupon) {
    const raw = Number(order.coupon.discountAmount ?? order.coupon.discount ?? order.coupon.discountValue ?? 0);
    if (String(order.coupon.discountType || '').toLowerCase() === 'percentage') {
      couponAmount = (raw / 100) * Math.max(0, subtotal);
    } else {
      couponAmount = raw;
    }
    if (!Number.isFinite(couponAmount) || couponAmount < 0) couponAmount = 0;
  }
  const manualAmount = Number(order.manualDiscount?.amount || 0);
  const walletAmount = Number(order.walletDiscount || 0);
  return Number((
    couponAmount
    + (manualAmount > 0 ? manualAmount : 0)
    + (walletAmount > 0 ? walletAmount : 0)
  ).toFixed(2));
}

export function buildZohoLineDetails(order = {}) {
  return resolveOrderLineItems(order)
    .map((item) => {
      const product = getOrderLineProduct(item);
      const productName = getLineProductName(item);
      const variant = getLineVariant(item);
      const option = getLineOption(item);
      const quantity = resolveOrderLinePackQuantity(item, product, order);
      const rate = resolveOrderLinePrice(item);
      const sku = resolveZohoProductSku(product, item.variantOptions || {});
      const descriptionParts = [];
      if (variant) descriptionParts.push(`Variant: ${variant}`);
      if (option && option !== variant) descriptionParts.push(`Option: ${option}`);
      if (sku) descriptionParts.push(`SKU: ${sku}`);

      const extras = [variant, option && option !== variant ? option : '']
        .filter(Boolean);
      const name = extras.length ? `${productName} (${extras.join(', ')})` : productName;

      return {
        productName,
        variant: variant || '—',
        option: option || '—',
        sku,
        quantity,
        rate,
        name,
        description: descriptionParts.join(' | '),
        product,
        variantOptions: item.variantOptions || {},
      };
    })
    .filter((line) => line.quantity > 0 && line.productName);
}

function formatStoreOrderStatus(status = '') {
  return String(status || 'ORDER_PLACED')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildZohoOrderNotes(order = {}) {
  const customer = resolveZohoOrderCustomer(order);
  const lines = buildZohoLineDetails(order);
  const orderNumber = getDisplayOrderNumber(order) || String(order._id || '');
  const paymentMethod = String(order.paymentMethod || 'N/A').toUpperCase();
  const paymentStatus = String(order.paymentStatus || (order.isPaid ? 'PAID' : 'UNPAID')).toUpperCase();
  const courier = String(order.courier || '').trim();
  const tracking = String(
    getEmxTrackingNumber(order)
    || order.trackingId
    || order.waslah?.trackingNumber
    || '',
  ).trim();
  const trackingUrl = String(order.trackingUrl || '').trim();
  const couponCode = String(order.coupon?.code || '').trim();
  const discount = resolveZohoOrderDiscount(order);
  const address = [
    customer.street,
    customer.street2,
    customer.city,
    customer.state,
    customer.zip,
    customer.country,
  ].filter(Boolean).join(', ');

  const itemLines = lines.map((line, index) => (
    `${index + 1}. ${line.productName} | Variant: ${line.variant} | Option: ${line.option} | Qty: ${line.quantity} | AED ${money(line.rate)}${line.sku ? ` | SKU: ${line.sku}` : ''}`
  ));

  return [
    `Store1920 Order #${orderNumber}`,
    `Status: ${formatStoreOrderStatus(order.status)}`,
    `Payment: ${paymentMethod} (${paymentStatus})`,
    `Total: AED ${money(order.total)}`,
    Number(order.shippingFee) > 0 ? `Shipping: AED ${money(order.shippingFee)}` : '',
    discount > 0 ? `Discount: AED ${money(discount)}` : '',
    couponCode ? `Coupon: ${couponCode}` : '',
    `Customer: ${customer.contactName}`,
    customer.email ? `Email: ${customer.email}` : '',
    customer.phone ? `Phone: ${customer.phone}` : '',
    customer.alternatePhone ? `Alternate phone: ${customer.alternatePhone}` : '',
    address ? `Address: ${address}` : '',
    courier ? `Courier: ${courier}` : '',
    tracking ? `Tracking: ${tracking}` : '',
    trackingUrl ? `Tracking URL: ${trackingUrl}` : '',
    order.notes ? `Customer notes: ${String(order.notes).trim()}` : '',
    itemLines.length ? `Items:\n${itemLines.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

export function formatZohoOrderStatus(status = '') {
  return formatStoreOrderStatus(status);
}
