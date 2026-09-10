/**
 * Checks WhatsApp (Elastic WABA) configuration (no send).
 * Run: node --env-file=.env scripts/audit-whatsapp-config.js
 */

function getCustomerSiteUrl() {
  const explicit = String(process.env.CUSTOMER_FACING_URL || process.env.NEXT_PUBLIC_CUSTOMER_URL || '').trim();
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit.replace(/\/+$/, '');
  const base = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.store1920.com').replace(/\/+$/, '');
  try {
    const { hostname } = new URL(base);
    if (hostname === 'store1920.store' || hostname === 'www.store1920.store') return 'https://www.store1920.com';
    if (hostname === 'store1920.com') return 'https://www.store1920.com';
  } catch { /* ignore */ }
  return base;
}

function status(label, ok, detail = '') {
  console.log(`[${ok ? 'OK' : 'WARN'}] ${label}${detail ? ` — ${detail}` : ''}`);
}

const templateKeys = [
  'WABA_TEMPLATE_COD_CONFIRMATION',
  'WABA_TEMPLATE_PAID_ORDER',
  'WABA_TEMPLATE_SHIPPED',
  'WABA_TEMPLATE_ORDER_DELIVERED',
  'WABA_TEMPLATE_CART_REMINDER',
  'WABA_TEMPLATE_ABANDONED_CHECKOUT',
  'WABA_TEMPLATE_ORDER_REMINDER',
  'WABA_TEMPLATE_PROMOTIONAL_OFFER',
  'WABA_TEMPLATE_OTP',
];

console.log('\n=== WhatsApp environment ===\n');
[
  'WABA_ENABLED',
  'WABA_API_TOKEN',
  'WABA_TOKEN_OTP',
  'WABA_MESSAGES_URL',
  'WABA_PHONE_NUMBER_ID',
  'WABA_CART_REMINDER_FALLBACK_IMAGE',
  'CRON_SECRET',
  'ORDER_CONFIRM_WEBHOOK_SECRET',
  'ABANDONED_CART_WHATSAPP_AUTO_SEND',
  'ABANDONED_CART_WHATSAPP_DELAY_MS',
  'WABA_ABANDONED_CHECKOUT_DISCOUNT_PERCENT',
].forEach((k) => {
  const v = process.env[k];
  const show = v && (k.includes('TOKEN') || k.includes('SECRET')) ? '[set]' : (v || '[missing — uses default]');
  console.log(`${k}: ${show}`);
});

console.log('\n=== Meta template names ===\n');
templateKeys.forEach((k) => {
  console.log(`${k}: ${process.env[k] || '[default from code]'}`);
});

const wabaEnabled = String(process.env.WABA_ENABLED || 'true').toLowerCase() !== 'false';
const hasToken = Boolean(process.env.WABA_API_TOKEN);
const hasPerTemplateTokens = Boolean(
  process.env.WABA_TOKEN_COD_CONFIRMATION
  || process.env.WABA_TOKEN_PAID_ORDER
  || process.env.WABA_TOKEN_SHIPPED,
);

console.log('\n=== Provider readiness ===\n');
status('WABA integration enabled', wabaEnabled);
status('API bearer token', hasToken || hasPerTemplateTokens, hasToken ? 'WABA_API_TOKEN covers all templates' : 'per-template tokens only');
status('Fallback header image (HTTPS)', Boolean(process.env.WABA_CART_REMINDER_FALLBACK_IMAGE));
status('Abandoned cart cron auth', Boolean(process.env.CRON_SECRET), 'required on Vercel for scheduled reminders');
status('Order webhook auth', Boolean(process.env.ORDER_CONFIRM_WEBHOOK_SECRET || process.env.WABA_WEBHOOK_SECRET), 'optional external trigger');

console.log('\n=== Customer URLs in WhatsApp messages ===\n');
const base = getCustomerSiteUrl();
console.log('Store base:', base);
console.log('Cart link:', `${base}/cart`);
console.log('Orders link:', `${base}/orders`);
console.log('Track order:', `${base}/track-order`);

console.log('\n=== WhatsApp flows (code audit) ===\n');
const flows = [
  ['COD order placed', 'store1920_order_confirmed — after checkout; no Confirm Order button'],
  ['Paid order placed', 'confirmation_paid_order template — Card/Wallet at checkout'],
  ['Paid after Tamara/Tabby/Stripe', 'sendOrderPaidWhatsApp — payment webhooks'],
  ['Order shipped', 'sendOrderShippedWhatsApp — store status SHIPPED'],
  ['Order delivered', 'store1920_order_delivered — store status DELIVERED'],
  ['Abandoned cart (browse)', 'cart_reminder_1920 — cron after ~5 min idle'],
  ['Abandoned checkout', 'abandoned_checkout_reminder — 5% off default, product image'],
  ['Order reminder', 'order_reminder_ — manual from store dashboard'],
  ['Promotional offer', 'promotional_offer__coupon — webhook / manual'],
  ['Payment cancelled recovery', 'abandoned checkout variant via paymentCancellationRecovery'],
];

flows.forEach(([name, note]) => console.log(`• ${name}: ${note}`));

console.log('\n=== Requirements for delivery ===\n');
console.log('• Customer phone must be valid UAE format (971 + 9 digits, e.g. 05xxxxxxxx)');
console.log('• Templates with product image need HTTPS header image URL');
console.log('• COD / delivered / abandoned cart use product image + fallback logo');
console.log('• Deferred payments (Tamara/Tabby): WhatsApp sent after payment webhook, not at checkout');

if (!wabaEnabled || (!hasToken && !hasPerTemplateTokens)) {
  console.error('\nWhatsApp is not fully configured. Set WABA_API_TOKEN in .env\n');
  process.exit(1);
}

console.log('\nAudit complete.\n');
