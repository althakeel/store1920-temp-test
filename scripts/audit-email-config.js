/**
 * Checks email provider configuration (no send).
 * Run: node --env-file=.env scripts/audit-email-config.js
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

function buildCustomerSitePath(pathname = '/') {
  const base = getCustomerSiteUrl();
  const path = String(pathname || '/').trim();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function status(label, ok, detail = '') {
  const mark = ok ? 'OK' : 'WARN';
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

const keys = {
  EMAIL_SERVICE_PROVIDER: process.env.EMAIL_SERVICE_PROVIDER,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS ? '[set]' : '',
  SMTP_PROMO_USER: process.env.SMTP_PROMO_USER,
  SMTP_PROMO_PASS: process.env.SMTP_PROMO_PASS ? '[set]' : '',
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_FROM_TRANSACTIONAL: process.env.EMAIL_FROM_TRANSACTIONAL,
  EMAIL_FROM_MARKETING: process.env.EMAIL_FROM_MARKETING,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  RESEND_API_KEY: process.env.RESEND_API_KEY ? '[set]' : '',
  MAILJET_API_KEY: process.env.MAILJET_API_KEY ? '[set]' : '',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
};

console.log('\n=== Email environment ===\n');
Object.entries(keys).forEach(([k, v]) => console.log(`${k}: ${v || '[missing]'}`));

const smtpReady = Boolean(keys.SMTP_HOST && keys.SMTP_USER && process.env.SMTP_PASS);
const resendReady = Boolean(process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY);
const mailjetReady = Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY);
const provider = String(keys.EMAIL_SERVICE_PROVIDER || '').toLowerCase();

console.log('\n=== Provider readiness ===\n');
status('Platform SMTP (transactional)', smtpReady || provider === 'smtp');
status('Resend fallback', resendReady);
status('Mailjet fallback', mailjetReady);
status('Admin order notifications', Boolean(keys.ADMIN_EMAIL), keys.ADMIN_EMAIL || 'set ADMIN_EMAIL');

console.log('\n=== Customer link URLs (emails) ===\n');
console.log('Customer site:', getCustomerSiteUrl());
console.log('Track order:', `${buildCustomerSitePath('/track-order')}?orderNo=615361&auto=1`);
console.log('Profile:', buildCustomerSitePath('/dashboard/profile'));

console.log('\n=== Email flows (code audit) ===\n');
const flows = [
  ['Order placed (COD / paid)', 'sendOrderPlacedEmail — after checkout'],
  ['Admin new order', 'sendAdminNewOrderEmail — sent to ADMIN_EMAIL on new order only'],
  ['Order status updates', 'sendOrderStatusEmail — customer only, no admin copy'],
  ['Login alert', 'sendLoginAlertEmail — on sign-in'],
  ['Welcome', 'sendWelcomeEmail — on new account'],
  ['Sign-out', 'send-signout-email API — on logout'],
  ['Abandoned cart', 'sendAbandonedCart* — marketing SMTP'],
  ['Payment cancelled recovery', 'sendPaymentCancelledRecoveryEmail'],
  ['Support tickets', 'emailService — ticket created/reply'],
  ['Guest account invite', 'DISABLED intentionally'],
  ['Password setup', 'sendPasswordSetupEmail — guest convert'],
  ['Promotional campaigns', 'promotional-emails API + Inngest'],
  ['Team invite', 'store/users/invite'],
];

flows.forEach(([name, note]) => console.log(`• ${name}: ${note}`));

if (!smtpReady && !resendReady && !mailjetReady) {
  console.error('\nNo email provider configured. Set SMTP or Resend/Mailjet in .env\n');
  process.exit(1);
}

console.log('\nAudit complete.\n');
