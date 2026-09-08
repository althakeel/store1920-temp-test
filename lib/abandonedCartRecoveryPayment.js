import Stripe from 'stripe';
import { stripeSecureCheckoutOptions } from '@/lib/paymentSecurity';
import { DEFAULT_APP_URL, normalizePublicSiteUrl } from '@/lib/appUrl';

const PAYMENT_METHODS = new Set(['cod', 'card', 'stripe', 'tabby', 'tamara']);

export function isAllowedConversionPaymentMethod(method) {
  return PAYMENT_METHODS.has(String(method || '').toLowerCase());
}

export function normalizeConversionPaymentMethod(method) {
  const normalized = String(method || 'cod').toLowerCase();
  return isAllowedConversionPaymentMethod(normalized) ? normalized : 'cod';
}

export function getConversionPaymentMethodLabel(method) {
  const labels = {
    cod: 'Cash on delivery (COD)',
    card: 'Card payment',
    stripe: 'Stripe online link',
    tabby: 'Tabby payment link',
    tamara: 'Tamara payment link',
  };
  return labels[normalizeConversionPaymentMethod(method)] || method;
}

export function conversionRequiresPaymentConfirmation(method) {
  const normalized = normalizeConversionPaymentMethod(method);
  return normalized === 'stripe' || normalized === 'tabby' || normalized === 'tamara';
}

export function isValidPaymentLink(url) {
  const value = String(url || '').trim();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function createStripeRecoveryPaymentLink({
  amount,
  currency = 'AED',
  customerName,
  customerEmail,
  abandonedCartId,
  storeId,
  origin,
}) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('Stripe is not configured on this store');
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error('Invalid payment amount for Stripe link');
  }

  const stripe = new Stripe(secret);
  const baseOrigin = normalizePublicSiteUrl(origin || process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_APP_URL);
  const safeName = String(customerName || 'Customer').trim() || 'Customer';

  const session = await stripe.checkout.sessions.create({
    ...stripeSecureCheckoutOptions(),
    line_items: [{
      price_data: {
        currency: String(currency || 'AED').toLowerCase(),
        product_data: {
          name: `Abandoned cart recovery — ${safeName}`,
        },
        unit_amount: Math.round(parsedAmount * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
    success_url: `${baseOrigin}/abandoned-cart-payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseOrigin}/cart?recovery=cancelled`,
    customer_email: customerEmail || undefined,
    metadata: {
      type: 'abandoned_cart_recovery',
      abandonedCartId: String(abandonedCartId),
      storeId: String(storeId),
    },
  });

  if (!session?.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

export async function resolveConversionPaymentLink({
  paymentMethod,
  pastedLink,
  amount,
  currency,
  customerName,
  customerEmail,
  abandonedCartId,
  storeId,
  origin,
}) {
  const method = normalizeConversionPaymentMethod(paymentMethod);

  if (method === 'cod' || method === 'card') {
    return { paymentMethod: method, paymentLink: null, paymentLinkId: null };
  }

  if (method === 'stripe') {
    const stripeLink = await createStripeRecoveryPaymentLink({
      amount,
      currency,
      customerName,
      customerEmail,
      abandonedCartId,
      storeId,
      origin,
    });

    return {
      paymentMethod: method,
      paymentLink: stripeLink.url,
      paymentLinkId: stripeLink.sessionId,
    };
  }

  const trimmedLink = String(pastedLink || '').trim();
  if (!isValidPaymentLink(trimmedLink)) {
    throw new Error(`Enter a valid ${method === 'tabby' ? 'Tabby' : 'Tamara'} payment link`);
  }

  return {
    paymentMethod: method,
    paymentLink: trimmedLink,
    paymentLinkId: null,
  };
}
