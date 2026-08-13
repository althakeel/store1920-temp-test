import { emailLogoImg } from '@/lib/brandLogo';
import { withEmbeddedEmailLogo } from '@/lib/brandLogoEmail';
import { buildTrackOrderPageUrl, getDisplayOrderNumber } from '@/lib/orderDisplay';
import { buildCustomerSitePath } from '@/lib/appUrl';
import { STORE1920_SUPPORT_EMAIL, getAdminOrderNotificationEmails } from '@/lib/storeContact';
import {
  buildTransactionalEmail,
  buildAddressBlock,
  mapOrderItemsForEmail,
  mapCartItemsForEmail,
  renderEmailItemsList,
  renderEmailTotals,
  renderEmailAddressColumns,
  renderEmailCta,
  formatEmailDate,
  formatEmailMoney,
  formatPaymentMethodForEmail,
  resolveEmailShippingAddress,
  escapeHtml,
} from '@/lib/transactionalEmailLayout';
import { Resend } from 'resend';
import mailjet from 'node-mailjet';
import nodemailer from 'nodemailer';
import connectDB from '@/lib/mongodb';
import Store from '@/models/Store';

function orderNoLabel(order) {
  return getDisplayOrderNumber(order) || 'Pending';
}

/**
 * Resolve customer email/name for status emails.
 * Order.userId is a Firebase UID string (not a mongoose ref), so populate() is a no-op —
 * fall back to shippingAddress, Address, User, then Firebase Auth.
 */
async function resolveStatusEmailRecipient(order = {}) {
  const shipping = order.shippingAddress || {};
  let email = String(order.guestEmail || order.email || shipping.email || '').trim();
  let name = String(order.guestName || order.name || shipping.name || '').trim();

  const populatedUser = order.userId && typeof order.userId === 'object' ? order.userId : null;
  if (populatedUser) {
    if (!email && populatedUser.email) email = String(populatedUser.email).trim();
    if (!name && populatedUser.name) name = String(populatedUser.name).trim();
  }

  const uid = populatedUser
    ? String(populatedUser._id || '').trim()
    : String(order.userId || '').trim();

  if (!email && order.addressId) {
    try {
      await connectDB();
      const Address = (await import('@/models/Address')).default;
      const address = await Address.findById(order.addressId).select('email name').lean();
      if (address?.email) email = String(address.email).trim();
      if (!name && address?.name) name = String(address.name).trim();
    } catch {
      // ignore
    }
  }

  if ((!email || !name) && uid) {
    try {
      await connectDB();
      const User = (await import('@/models/User')).default;
      const user = await User.findById(uid).select('email name').lean();
      if (!email && user?.email) email = String(user.email).trim();
      if (!name && user?.name) name = String(user.name).trim();
    } catch {
      // ignore
    }
  }

  if (!email && uid) {
    try {
      const { getAuth } = await import('@/lib/firebase-admin');
      const firebaseUser = await getAuth().getUser(uid);
      if (firebaseUser?.email) email = String(firebaseUser.email).trim();
      if (!name && firebaseUser?.displayName) name = String(firebaseUser.displayName).trim();
    } catch {
      // ignore
    }
  }

  return { email, name: name || 'Customer' };
}

// Send order status update email (generic dispatcher)
export async function sendOrderStatusEmail(order, status) {
  const { getPublicTrackingDisplayId } = await import('@/lib/orderDisplay');
  const { buildEmxTrackingUrl } = await import('@/lib/waslahTracking');
  const trackingId = getPublicTrackingDisplayId(order)
    || String(order?.waslah?.trackingNumber || order?.trackingId || '').trim()
    || null;
  const trackingUrl = buildEmxTrackingUrl(trackingId) || order?.trackingUrl || null;
  const courier = order?.courier || (trackingId ? 'EMX' : order?.courier);
  const { email, name } = await resolveStatusEmailRecipient(order);
  if (!email) {
    console.error('[sendOrderStatusEmail] no customer email', {
      orderId: String(order?._id || ''),
      status,
      isGuest: Boolean(order?.isGuest),
      hasGuestEmail: Boolean(order?.guestEmail),
      hasShippingEmail: Boolean(order?.shippingAddress?.email),
    });
    return { sent: false, reason: 'no_email' };
  }
  let result;
  switch (status) {
    case 'ORDER_PLACED': {
      const { sendOrderPlacedNotificationOnce } = await import('@/lib/orderConfirmationNotifications');
      result = await sendOrderPlacedNotificationOnce(order, { email, name });
      break;
    }
    case 'CONFIRMED': {
      const { sendOrderConfirmedNotificationOnce } = await import('@/lib/orderConfirmationNotifications');
      result = await sendOrderConfirmedNotificationOnce(order, { email, name });
      break;
    }
    case 'PROCESSING':
      result = await sendOrderProcessingEmail({ email, name, order });
      break;
    case 'PICKUP_REQUESTED':
      result = await sendOrderPickupRequestedEmail({ email, name, order });
      break;
    case 'WAITING_FOR_PICKUP':
      result = await sendOrderWaitingForPickupEmail({ email, name, order });
      break;
    case 'PICKED_UP':
      result = await sendOrderPickedUpEmail({ email, name, order });
      break;
    case 'WAREHOUSE_RECEIVED':
      result = await sendOrderWarehouseReceivedEmail({ email, name, order });
      break;
    case 'SHIPPED':
      result = await sendOrderShippedEmail({
        email,
        name,
        orderId: order._id,
        shortOrderNumber: order.shortOrderNumber,
        trackingId,
        trackingUrl,
        courier,
        waslah: order.waslah,
      });
      break;
    case 'OUT_FOR_DELIVERY':
      result = await sendOrderOutForDeliveryEmail({ email, name, order });
      break;
    case 'DELIVERED':
      result = await sendOrderDeliveredEmail({ email, name, order });
      break;
    case 'RETURN_REQUESTED':
      result = await sendOrderReturnRequestedEmail({ email, name, order });
      break;
    case 'REPLACEMENT':
      result = await sendOrderReplacementEmail({ email, name, order });
      break;
    case 'RTO':
    case 'RETURN':
    case 'RETURNED':
      result = await sendOrderReturnedEmail({ email, name, order });
      break;
    case 'SHIPMENT_CANCELLED':
      result = await sendOrderShipmentCancelledEmail({ email, name, order });
      break;
    case 'CANCELLED':
      result = await sendOrderCancelledEmail({ email, name, order });
      break;
    default:
      result = await sendOrderCustomStatusEmail({ email, name, order, status });
      break;
  }
  if (result && typeof result === 'object' && ('sent' in result || 'reason' in result)) {
    return result;
  }
  return { sent: true, email, providerResult: result };
}

async function sendStyledStatusEmail({ email, name, order, subject, title, intro, bodyHtml = '' }) {
  const { loadOrderForNotifications } = await import('@/lib/orderConfirmationNotifications');
  const hydratedOrder = (await loadOrderForNotifications(order)) || order;
  const currency = hydratedOrder?.currency || 'AED';
  const items = mapOrderItemsForEmail(hydratedOrder?.orderItems || [], hydratedOrder);
  const shippingAddress = resolveEmailShippingAddress(hydratedOrder, { name, email });
  const totals = [];
  if (hydratedOrder?.subtotal != null) {
    totals.push({ label: 'Subtotal', value: hydratedOrder.subtotal });
  }
  if (Number(hydratedOrder?.shippingFee) > 0) {
    totals.push({ label: 'Shipping', value: hydratedOrder.shippingFee });
  }
  if (hydratedOrder?.total != null) {
    totals.push({ label: 'Total', value: hydratedOrder.total, isTotal: true });
  }
  const detailsHtml = [
    items.length ? renderEmailItemsList(items, { currency, label: 'ITEMS ORDERED' }) : '',
    totals.length ? renderEmailTotals(totals, { currency }) : '',
    shippingAddress.street || shippingAddress.city || shippingAddress.email
      ? renderEmailAddressColumns({
        billing: buildAddressBlock({ ...shippingAddress, email }, name),
        shipping: buildAddressBlock(shippingAddress, name),
      })
      : '',
    bodyHtml,
  ].filter(Boolean).join('');

  const html = await buildTransactionalEmail({
    title,
    greeting: name || 'there',
    intro,
    orderNo: orderNoLabel(hydratedOrder),
    orderDate: formatEmailDate(hydratedOrder?.createdAt),
    bodyHtml: detailsHtml,
  });
  return sendOrderMail({ to: email, subject, html, storeId: hydratedOrder?.storeId });
}

async function sendOrderWaitingForPickupEmail({ email, name, order }) {
  const packed = order?.warehousePacking?.packed === true;
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: packed
      ? `Your order is packed and waiting for pickup - ${orderNoLabel(order)}`
      : `Waiting for Pickup - ${orderNoLabel(order)}`,
    title: packed ? 'Order Packed — Waiting for Pickup' : 'Waiting for Pickup',
    intro: packed
      ? 'Your order has been packed at our warehouse and is now waiting for pickup by our delivery partner. We will email you again as soon as it is picked up and on the way.'
      : 'Your order is ready and waiting for pickup by our delivery partner. We will notify you as soon as it is picked up from our warehouse.',
  });
}

async function sendOrderOutForDeliveryEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Out for Delivery - ${orderNoLabel(order)}`,
    title: 'Out for Delivery',
    intro: 'Your order is out for delivery and will reach you soon. Our delivery partner is on the way to your address.',
  });
}

async function sendOrderReturnRequestedEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Return Requested - ${orderNoLabel(order)}`,
    title: 'Return Requested',
    intro: 'Your return request has been received. We will notify you when your return is picked up or processed.',
  });
}

export async function sendOrderConfirmedEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Confirmed - ${orderNoLabel(order)}`,
    title: 'Order Confirmed',
    intro: 'Your order has been confirmed by our team and will move to processing soon. We will notify you when it ships.',
  });
}

export async function sendOrderPickupRequestedEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Pickup Requested - ${orderNoLabel(order)}`,
    title: 'Pickup Requested',
    intro: 'Your order is ready for pickup by our delivery partner. We will notify you as soon as it leaves our warehouse.',
  });
}

export async function sendOrderPickedUpEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Picked Up - ${orderNoLabel(order)}`,
    title: 'Order Picked Up',
    intro: 'Your order has been picked up from our warehouse and is on its way to you.',
  });
}

export async function sendOrderWarehouseReceivedEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Warehouse Received - ${orderNoLabel(order)}`,
    title: 'Received at Warehouse',
    intro: 'Your order has arrived at our warehouse and is being prepared for the next step.',
  });
}

export async function sendOrderCustomStatusEmail({ email, name, order, status }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Update (${status}) - ${orderNoLabel(order)}`,
    title: 'Order Update',
    intro: `Your order status has been updated to ${status}.`,
  });
}

export async function sendOrderProcessingEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Processing - ${orderNoLabel(order)}`,
    title: 'Order Processing',
    intro: 'We have received your order and our team is getting it ready. You will receive another update when it ships.',
  });
}

export async function sendOrderDeliveredEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Delivered - ${orderNoLabel(order)}`,
    title: 'Order Delivered',
    intro: 'Your order has been delivered. We hope you enjoy your purchase.',
  });
}

export async function sendOrderShipmentCancelledEmail({ email, name, order }) {
  const awb = String(
    order?.waslah?.cancelledTrackingNumber
    || order?.trackingId
    || order?.waslah?.trackingNumber
    || '',
  ).trim();
  const awbNote = awb ? ` (tracking ${awb})` : '';
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Delivery cancelled - ${orderNoLabel(order)}`,
    title: 'Delivery Cancelled',
    intro: `The courier shipment for your order has been cancelled${awbNote}. Your order is still active — we will arrange a new delivery and email you again when it ships.`,
  });
}

export async function sendOrderCancelledEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Cancelled - ${orderNoLabel(order)}`,
    title: 'Order Cancelled',
    intro: 'Your order has been cancelled. If you did not request this cancellation, please contact us immediately.',
  });
}

export async function sendOrderReturnedEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Order Returned - ${orderNoLabel(order)}`,
    title: 'Order Returned',
    intro: 'Your return has been processed. Refunds, if applicable, will be issued soon.',
  });
}

export async function sendOrderReplacementEmail({ email, name, order }) {
  return sendStyledStatusEmail({
    email,
    name,
    order,
    subject: `Replacement started - ${orderNoLabel(order)}`,
    title: 'Replacement Started',
    intro: 'We have started a replacement for your delivered order. Our team will arrange collection of the original item and send the replacement. We will email you with the next update.',
  });
}

const resendApiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const mailjetClient = (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY)
  ? mailjet.apiConnect(process.env.MAILJET_API_KEY, process.env.MAILJET_SECRET_KEY)
  : null;

const smtpHost = String(process.env.SMTP_HOST || 'smtp.hostinger.com').trim();
const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 465;
const smtpSecure = process.env.SMTP_SECURE !== 'false';
const platformSmtpTransporterCache = new Map();

function stripEnvQuotes(value = '') {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isMarketingFromType(fromType) {
  return fromType === 'marketing' || fromType === 'promotional';
}

function getPlatformSmtpCredentials(fromType) {
  if (isMarketingFromType(fromType)) {
    const user = stripEnvQuotes(process.env.SMTP_PROMO_USER || process.env.SMTP_USER || '');
    const pass = stripEnvQuotes(process.env.SMTP_PROMO_PASS || process.env.SMTP_PASS || '');
    return user && pass ? { user, pass } : null;
  }

  const user = stripEnvQuotes(process.env.SMTP_USER || '');
  const pass = stripEnvQuotes(process.env.SMTP_PASS || '');
  return user && pass ? { user, pass } : null;
}

function getPlatformSmtpTransporter(fromType) {
  const creds = getPlatformSmtpCredentials(fromType);
  if (!creds || !smtpHost) return null;

  const cacheKey = `${fromType}:${creds.user}`;
  if (platformSmtpTransporterCache.has(cacheKey)) {
    return platformSmtpTransporterCache.get(cacheKey);
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: creds,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
    tls: { minVersion: 'TLSv1.2' },
  });
  platformSmtpTransporterCache.set(cacheKey, transporter);
  return transporter;
}

function platformSmtpConfigured() {
  return Boolean(smtpHost && getPlatformSmtpCredentials('transactional'));
}

function prefersPlatformSmtp() {
  const provider = String(process.env.EMAIL_SERVICE_PROVIDER || '').toLowerCase();
  return provider === 'smtp' || platformSmtpConfigured();
}

function normalizeEmailAddress(value = '') {
  return String(value || '').trim().toLowerCase();
}

function resolveBccRecipients(to, { bcc = [], adminCopy = false } = {}) {
  const recipients = new Set(
    (Array.isArray(bcc) ? bcc : [bcc])
      .map(normalizeEmailAddress)
      .filter(Boolean),
  );

  if (adminCopy) {
    getAdminOrderNotificationEmails().forEach((email) => recipients.add(email));
  }

  recipients.delete(normalizeEmailAddress(to));
  return [...recipients];
}

/** Sends transactional order emails to the customer only (no admin BCC). */
export async function sendOrderMail(options = {}) {
  return sendMail({ ...options, adminCopy: false });
}

async function sendViaPlatformSmtp({ to, subject, html, headers, fromType, attachments = [], bcc = [] }) {
  const transporter = getPlatformSmtpTransporter(fromType);
  if (!transporter) return null;

  const resolvedFrom = (() => {
    if (isMarketingFromType(fromType)) {
      return process.env.EMAIL_FROM_MARKETING
        || process.env.EMAIL_FROM
        || process.env.SMTP_PROMO_USER
        || process.env.SMTP_USER
        || 'onboarding@resend.dev';
    }
    return process.env.EMAIL_FROM_TRANSACTIONAL
      || process.env.EMAIL_FROM
      || process.env.SMTP_USER
      || 'onboarding@resend.dev';
  })();

  const fromParsed = parseFromAddress(resolvedFrom);
  return transporter.sendMail({
    from: `${fromParsed.name} <${fromParsed.email}>`,
    to,
    ...(bcc.length ? { bcc: bcc.join(', ') } : {}),
    subject,
    html,
    headers,
    attachments,
  });
}

const storeSmtpCache = new Map();

function parseFromAddress(from = '') {
  const raw = String(from || '').trim();
  const match = raw.match(/^(.*?)<\s*([^>\s]+)\s*>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, '') || process.env.EMAIL_FROM_NAME || 'Store1920',
      email: match[2].trim(),
    };
  }

  return {
    name: process.env.EMAIL_FROM_NAME || 'Store1920',
    email: raw,
  };
}

function formatEmailProviderError(error, provider = 'Email') {
  if (!error) return `${provider}: Unknown error`;
  if (typeof error === 'string') return `${provider}: ${error}`;
  if (error?.message) return `${provider}: ${error.message}`;
  if (error?.error?.message) return `${provider}: ${error.error.message}`;
  try {
    return `${provider}: ${JSON.stringify(error)}`;
  } catch {
    return `${provider}: Failed to send email`;
  }
}

const normalizeStoreSmtpSection = (section = {}) => ({
  host: String(section?.host || '').trim(),
  port: Number(section?.port || 465),
  user: String(section?.user || '').trim(),
  pass: String(section?.pass || '').trim(),
  secure: typeof section?.secure === 'boolean' ? section.secure : Number(section?.port || 465) === 465,
  fromEmail: String(section?.fromEmail || '').trim(),
  fromName: String(section?.fromName || '').trim(),
});

async function getStoreSmtpSettings(storeId, fromType) {
  const normalizedStoreId = String(storeId || '').trim();
  if (!normalizedStoreId) return null;

  const cacheKey = `${normalizedStoreId}:${fromType}`;
  if (storeSmtpCache.has(cacheKey)) {
    return storeSmtpCache.get(cacheKey);
  }

  await connectDB();
  const store = await Store.findById(normalizedStoreId).select('smtpSettings').lean();
  if (!store?.smtpSettings) {
    storeSmtpCache.set(cacheKey, null);
    return null;
  }

  const usePromotional = fromType === 'marketing' || fromType === 'promotional';
  const section = usePromotional
    ? (store.smtpSettings.promotional || store.smtpSettings)
    : (store.smtpSettings.transactional || store.smtpSettings);

  const normalized = normalizeStoreSmtpSection(section);
  const usable = normalized.host && normalized.user && normalized.pass ? normalized : null;
  storeSmtpCache.set(cacheKey, usable);
  return usable;
}

/**
 * Send email using either Resend or Mailjet, depending on available credentials.
 * @param {Object} param0
 * @param {string} param0.to
 * @param {string} param0.subject
 * @param {string} param0.html
 * @param {Array} param0.tags - Optional tags for email categorization
 * @param {Object} param0.headers - Optional custom headers
 */
export async function sendMail({
  to,
  subject,
  html,
  tags,
  headers,
  fromType = 'transactional',
  storeId,
  skipStoreSmtp = false,
  bcc,
  adminCopy = false,
}) {
  const {
    html: emailHtml,
    attachments: logoAttachments,
    mailjetInline,
    resendAttachment,
  } = withEmbeddedEmailLogo(html);

  const bccRecipients = resolveBccRecipients(to, { bcc, adminCopy });

  const resolvedFrom = (() => {
    if (fromType === 'marketing') {
      return process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
    }
    return process.env.EMAIL_FROM_TRANSACTIONAL || process.env.EMAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
  })();

  const providerErrors = [];
  const storeSmtpSettings = skipStoreSmtp ? null : await getStoreSmtpSettings(storeId, fromType);

  if (prefersPlatformSmtp()) {
    try {
      const info = await sendViaPlatformSmtp({
        to, subject, html: emailHtml, headers, fromType, attachments: logoAttachments, bcc: bccRecipients,
      });
      if (info) return info;
    } catch (error) {
      console.error('Failed to send email (SMTP):', error);
      providerErrors.push(formatEmailProviderError(error, 'SMTP'));
    }
  }

  if (storeSmtpSettings) {
    try {
      const transporter = nodemailer.createTransport({
        host: storeSmtpSettings.host,
        port: storeSmtpSettings.port,
        secure: storeSmtpSettings.secure,
        auth: {
          user: storeSmtpSettings.user,
          pass: storeSmtpSettings.pass,
        },
      });

      const fromEmail = storeSmtpSettings.fromEmail || storeSmtpSettings.user;
      const fromName = storeSmtpSettings.fromName || 'Store1920';

      return await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to,
        ...(bccRecipients.length ? { bcc: bccRecipients.join(', ') } : {}),
        subject,
        html: emailHtml,
        headers,
        attachments: logoAttachments,
      });
    } catch (error) {
      console.error('Failed to send email (store SMTP):', error);
      providerErrors.push(formatEmailProviderError(error, 'Store SMTP'));
    }
  }

  if (resend) {
    try {
      const emailPayload = {
        from: resolvedFrom,
        to: [to],
        subject,
        html: emailHtml,
      };

      if (bccRecipients.length) {
        emailPayload.bcc = bccRecipients;
      }

      if (resendAttachment) {
        emailPayload.attachments = [resendAttachment];
      }

      if (tags && tags.length > 0) {
        emailPayload.tags = tags;
      }
      if (headers && Object.keys(headers).length > 0) {
        emailPayload.headers = headers;
      }

      const { data, error } = await resend.emails.send(emailPayload);
      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Failed to send email (Resend):', error);
      providerErrors.push(formatEmailProviderError(error, 'Resend'));
    }
  }

  if (mailjetClient) {
    try {
      const { email, name } = parseFromAddress(resolvedFrom);
      const message = {
        From: {
          Email: email,
          Name: name,
        },
        To: [
          {
            Email: to,
          },
        ],
        Subject: subject,
        HTMLPart: emailHtml,
      };

      if (mailjetInline) {
        message.InlinedAttachments = [mailjetInline];
      }

      if (bccRecipients.length) {
        message.Bcc = bccRecipients.map((Email) => ({ Email }));
      }

      const result = await mailjetClient
        .post('send', { version: 'v3.1' })
        .request({
          Messages: [message],
        });
      return result.body;
    } catch (error) {
      console.error('Failed to send email (Mailjet):', error);
      providerErrors.push(formatEmailProviderError(error, 'Mailjet'));
    }
  }

  if (!prefersPlatformSmtp()) {
    try {
      const info = await sendViaPlatformSmtp({
        to, subject, html: emailHtml, headers, fromType, attachments: logoAttachments, bcc: bccRecipients,
      });
      if (info) return info;
    } catch (error) {
      console.error('Failed to send email (SMTP):', error);
      providerErrors.push(formatEmailProviderError(error, 'SMTP'));
    }
  }

  if (providerErrors.length > 0) {
    throw new Error(providerErrors.join(' | '));
  }

  throw new Error('No email provider configured. Please set SMTP credentials, RESEND_API_KEY, or MAILJET_API_KEY/MAILJET_SECRET_KEY.');
}

// Send welcome email when customer creates account
export async function sendWelcomeEmail(email, name) {
  const subject = 'Welcome to Store1920! 🎉';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          margin: 0;
          padding: 0;
          background: #f0f2f5;
        }
        .container { 
          max-width: 620px;
          width: 100%;
          margin: 20px auto; 
          background: #fff; 
          border-radius: 16px; 
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .header { 
          background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
          color: white; 
          padding: 40px 30px; 
          text-align: center;
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .header p {
          margin: 0;
          font-size: 16px;
          opacity: 0.95;
        }
        .content { 
          background: #f8fafc; 
          padding: 40px 30px;
        }
        .greeting {
          font-size: 24px;
          margin: 0 0 20px 0;
          color: #1e293b;
        }
        .intro-text {
          font-size: 16px;
          color: #475569;
          margin-bottom: 30px;
          line-height: 1.7;
        }
        .benefits {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin: 30px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .benefits h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          color: #1e293b;
          font-weight: 600;
        }
        .benefit-item {
          display: flex;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #e2e8f0;
          font-size: 15px;
        }
        .benefit-item:last-child {
          border-bottom: none;
        }
        .benefit-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: #10b981;
          border-radius: 50%;
          margin-right: 12px;
          font-size: 14px;
          flex-shrink: 0;
        }
        .button-container {
          text-align: center;
          margin: 35px 0;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: white;
          padding: 16px 40px;
          text-decoration: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 16px;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(249, 115, 22, 0.4);
        }
        .support-section {
          background: #fef3c7;
          border-left: 4px solid #fbbf24;
          padding: 16px 20px;
          margin: 25px 0;
          border-radius: 8px;
          font-size: 14px;
        }
        .support-section p {
          margin: 0;
          color: #78350f;
        }
        .support-section a {
          color: #92400e;
          font-weight: 600;
          text-decoration: none;
        }
        .footer {
          text-align: center;
          padding: 30px 20px;
          color: #64748b;
          font-size: 13px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${emailLogoImg('max-width:180px;height:auto;margin-bottom:16px;')}
          <h1>Welcome to Store1920!</h1>
          <p>Your journey to amazing products starts here</p>
        </div>
        <div class="content">
          <h2 class="greeting">Hi ${name || 'there'}! 👋</h2>
          <p class="intro-text">Thank you for creating an account with Store1920. We're excited to have you as part of our community!</p>
          
          <div class="benefits">
            <h3>Here's what you can enjoy:</h3>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span>Fast & secure checkout</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span>Order tracking & history</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span>Exclusive deals & offers</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span>Wishlist & saved items</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span>Easy returns within 7 days</span>
            </div>
          </div>

          <div class="button-container">
            <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://Store1920.com'}" class="button">Start Shopping</a>
          </div>

          <div class="support-section">
            <p>💬 <strong>Need help?</strong> Our support team is here for you! Contact us at <a href="mailto:${STORE1920_SUPPORT_EMAIL}">${STORE1920_SUPPORT_EMAIL}</a></p>
          </div>
        </div>
        <div class="footer">
          <p><strong>Store1920</strong> - Shop smarter, live better</p>
          <p>© ${new Date().getFullYear()} Store1920. All rights reserved.</p>
          <p style="margin-top:10px; color: #94a3b8;">You're receiving this because you created an account with us.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendMail({ to: email, subject, html, storeId: order?.storeId });
}

// Send order placed email (after checkout / successful payment)
export async function sendOrderPlacedEmail(orderData) {
  const {
    email,
    name,
    shortOrderNumber,
    total,
    orderItems,
    shippingAddress,
    createdAt,
    paymentMethod,
  } = orderData;

  const displayOrderNumber = getDisplayOrderNumber({ shortOrderNumber }) || 'Pending';
  const currency = 'AED';
  const items = mapOrderItemsForEmail(orderItems, orderData);
  const resolvedAddress = resolveEmailShippingAddress(
    { shippingAddress, guestEmail: email, guestName: name },
    { email, name },
  );
  const addressBlock = buildAddressBlock(resolvedAddress, name);
  const totals = [];
  if (orderData.subtotal != null) {
    totals.push({ label: 'Subtotal', value: orderData.subtotal });
  }
  if (Number(orderData.shippingFee) > 0) {
    totals.push({ label: 'Shipping', value: orderData.shippingFee });
  }
  totals.push({ label: 'Total', value: total || 0, isTotal: true });

  const bodyHtml = [
    items.length ? renderEmailItemsList(items, { currency, label: 'ITEMS ORDERED' }) : '',
    renderEmailTotals(totals, { currency }),
    paymentMethod
      ? `<div style="margin-top:24px;font-size:14px;color:#666666;">Payment method: <strong>${formatPaymentMethodForEmail(paymentMethod)}</strong></div>`
      : '',
    renderEmailAddressColumns({
      billing: addressBlock,
      shipping: buildAddressBlock(resolvedAddress, name),
    }),
    renderEmailCta({
      label: 'Track Order',
      href: buildTrackOrderPageUrl({ shortOrderNumber, shippingAddress, email }),
      align: 'center',
    }),
    `<p style="margin-top:24px;font-size:14px;line-height:1.7;color:#666666;">We have received your order. You will receive another email when your order is confirmed and when it ships. If you have any questions, contact us at <a href="mailto:${STORE1920_SUPPORT_EMAIL}" style="color:#111111;text-decoration:underline;font-weight:600;">${STORE1920_SUPPORT_EMAIL}</a></p>`,
  ].join('');

  const html = await buildTransactionalEmail({
    title: 'Order Placed',
    greeting: name || 'there',
    intro: 'Thank you for shopping with Store1920. Your order has been placed successfully.',
    orderNo: displayOrderNumber,
    orderDate: formatEmailDate(createdAt),
    bodyHtml,
  });

  return sendMail({
    to: email,
    subject: `Order Placed - ${displayOrderNumber}`,
    html,
    storeId: orderData?.storeId,
    adminCopy: false,
  });
}

export async function sendAdminNewOrderEmail(order = {}) {
  const adminEmails = getAdminOrderNotificationEmails();
  if (!adminEmails.length) {
    console.warn('[email] No ADMIN_EMAIL configured — skipping admin new-order notification');
    return { skipped: true, reason: 'no_admin_email' };
  }

  const displayOrderNumber = getDisplayOrderNumber(order) || 'Pending';
  const currency = 'AED';
  const items = mapOrderItemsForEmail(order.orderItems || [], order);
  const shipping = resolveEmailShippingAddress(order);
  const customerName = shipping.name || 'Customer';
  const customerEmail = shipping.email || '—';
  const customerPhone = shipping.phone
    ? `${shipping.phoneCode || '+971'} ${shipping.phone}`.trim()
    : '—';
  const paymentMethod = formatPaymentMethodForEmail(order.paymentMethod);
  const paymentStatus = String(order.paymentStatus || (order.isPaid ? 'PAID' : 'PENDING')).toUpperCase();
  const orderStatus = String(order.status || 'ORDER_PLACED').replace(/_/g, ' ');
  const storeOrdersUrl = buildCustomerSitePath('/store/orders');

  const bodyHtml = [
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444444;">A new order was placed on Store1920.</p>`,
    `<div style="margin:0 0 20px;padding:16px;border:1px solid #e8e8e8;background:#fafafa;">
      <p style="margin:0 0 8px;font-size:14px;color:#111111;"><strong>Customer:</strong> ${customerName}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#111111;"><strong>Email:</strong> ${customerEmail}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#111111;"><strong>Phone:</strong> ${customerPhone}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#111111;"><strong>Payment:</strong> ${paymentMethod} · ${paymentStatus}</p>
      <p style="margin:0;font-size:14px;color:#111111;"><strong>Status:</strong> ${orderStatus}</p>
    </div>`,
    items.length ? renderEmailItemsList(items, { currency, label: 'ITEMS ORDERED' }) : '',
    order.total != null
      ? renderEmailTotals([{ label: 'Order total', value: order.total, isTotal: true }], { currency })
      : '',
    shipping.street || shipping.city || shipping.district
      ? renderEmailAddressColumns({
        shipping: buildAddressBlock(shipping, customerName),
      })
      : '',
    renderEmailCta({
      label: 'Open in store dashboard',
      href: storeOrdersUrl,
      align: 'center',
    }),
  ].filter(Boolean).join('');

  const html = await buildTransactionalEmail({
    title: 'New order received',
    greeting: 'Team',
    intro: `Order #${displayOrderNumber} needs your attention in the store dashboard.`,
    orderNo: displayOrderNumber,
    orderDate: formatEmailDate(order.createdAt),
    bodyHtml,
  });

  const [primaryAdmin, ...otherAdmins] = adminEmails;

  await sendMail({
    to: primaryAdmin,
    bcc: otherAdmins,
    subject: `New order #${displayOrderNumber} · ${formatEmailMoney(order.total || 0, currency)}`,
    html,
    storeId: order.storeId,
    adminCopy: false,
  });

  return { sent: true, to: adminEmails };
}

/** @deprecated Use sendOrderPlacedEmail */
export const sendOrderConfirmationEmail = sendOrderPlacedEmail;

// Send order shipped email
export async function sendOrderShippedEmail(orderData) {
  const { email, name, shortOrderNumber, trackingId, courier } = orderData;
  const displayOrderNumber = getDisplayOrderNumber({ shortOrderNumber }) || 'Pending';
  const storeTrackUrl = buildTrackOrderPageUrl(orderData);

  const trackingHtml = (trackingId || storeTrackUrl || courier)
    ? `
      <div style="margin-top:28px;padding:20px;border:1px solid #e8e8e8;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9a9a9a;font-weight:600;margin-bottom:12px;">TRACKING INFO</div>
        ${courier ? `<p style="margin:0 0 8px;font-size:14px;color:#444444;"><strong>Courier:</strong> ${courier}</p>` : ''}
        ${trackingId ? `<p style="margin:0 0 8px;font-size:14px;color:#444444;"><strong>Tracking number:</strong> ${trackingId}</p>` : ''}
        ${storeTrackUrl ? renderEmailCta({ label: 'Track Order', href: storeTrackUrl, align: 'left' }) : ''}
      </div>
    `
    : '';

  const bodyHtml = [
    trackingHtml,
    storeTrackUrl
      ? ''
      : renderEmailCta({
        label: 'Track Order',
        href: 'https://store1920.com/track-order',
        align: 'center',
      }),
  ].filter(Boolean).join('');

  const html = await buildTransactionalEmail({
    title: 'Order Shipped',
    greeting: name || 'there',
    intro: 'Great news! Your order has been shipped and is on its way to you.',
    orderNo: displayOrderNumber,
    bodyHtml,
  });

  return sendOrderMail({
    to: email,
    subject: `Order Shipped - ${displayOrderNumber}`,
    html,
    storeId: orderData?.storeId,
  });
}

// Sends a guest account creation invitation email
export async function sendGuestAccountCreationEmail(guestData) {
  const { email, name, orderId, shortOrderNumber } = guestData;
  
  const displayOrderNumber = getDisplayOrderNumber({ shortOrderNumber }) || 'Pending';

  const subject = `Complete Your Account - Order ${displayOrderNumber}`;
  const signInUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://Store1920.com'}/sign-in`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f6fb; }
        .container { max-width: 620px; width: 100%; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 16px rgba(40,116,240,0.07); }
        .header {
          background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
          color: white;
          padding: 40px 24px;
          text-align: center;
        }
        .header h1 {
          margin: 0 0 8px 0;
          font-size: 28px;
          font-weight: 700;
        }
        .content { background: #f8f9fa; padding: 40px 24px; }
        .greeting { font-size: 18px; color: #1e293b; margin: 0 0 20px 0; }
        .info-box { 
          background: #fff; 
          padding: 24px; 
          border-radius: 8px; 
          margin: 20px 0; 
          border-left: 4px solid #ff9800;
          line-height: 1.8;
        }
        .info-box p { margin: 8px 0; }
        .highlight { color: #ff9800; font-weight: 600; }
        .button-container { text-align: center; margin: 30px 0; }
        .button { 
          display: inline-block; 
          background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
          color: white; 
          padding: 14px 36px; 
          text-decoration: none; 
          border-radius: 8px; 
          font-weight: bold; 
          font-size: 16px;
          box-shadow: 0 2px 8px rgba(255,152,0,0.3);
        }
        .button:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(255,152,0,0.4); }
        .benefits { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .benefit-item { 
          padding: 12px 0; 
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
        }
        .benefit-item:last-child { border-bottom: none; }
        .benefit-icon { 
          display: inline-block;
          width: 24px;
          height: 24px;
          background: #ff9800;
          color: white;
          border-radius: 12px;
          text-align: center;
          line-height: 24px;
          font-weight: bold;
          margin-right: 12px;
        }
        .footer { 
          text-align: center; 
          margin-top: 30px; 
          padding: 24px; 
          color: #6b7280; 
          font-size: 14px; 
          background: #fff;
          border-top: 1px solid #e5e7eb;
        }
        @media (max-width: 620px) {
          .container, .content, .header { padding: 16px !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${emailLogoImg('max-width:180px;height:auto;margin-bottom:16px;')}
          <h1>🎉 Your Order is Confirmed!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Order #${displayOrderNumber}</p>
        </div>

        <div class="content">
          <p class="greeting">Hi ${name || 'Guest'},</p>

          <div class="info-box">
            <p style="margin-top: 0;">Thank you for your order! You placed it as a guest, but we'd love to make your shopping experience even better.</p>
            <p><span class="highlight">Create your account with this email address</span> to:</p>
          </div>

          <div class="benefits">
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span><strong>Track your order</strong> in real-time</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span><strong>View all your orders</strong> in one place</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span><strong>Save your addresses</strong> for faster checkout</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span><strong>Get exclusive offers</strong> and rewards</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">✓</span>
              <span><strong>Earn reward points</strong> on every purchase</span>
            </div>
          </div>

          <div class="button-container">
            <a href="${signInUrl}" class="button">Create Account or Sign In</a>
          </div>

          <div class="info-box">
            <p style="margin-top: 0; color: #666; font-size: 14px;">
              <strong>Already have an account?</strong><br>
              Just sign in with <span class="highlight">${email}</span> and you'll see all your orders, including this one!
            </p>
          </div>
        </div>

        <div class="footer">
          <p style="margin-bottom: 0;">Need help? Contact us at <a href="mailto:${STORE1920_SUPPORT_EMAIL}" style="color:#111111;text-decoration:underline;font-weight:600;">${STORE1920_SUPPORT_EMAIL}</a></p>
          <p>© ${new Date().getFullYear()} Store1920. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendOrderMail({ to: email, subject, html });
}
export async function sendPasswordSetupEmail(email, name) {
  const subject = 'Set up your password';
  const html = `<p>Hi ${name || ''},</p><p>Please click the link below to set your password for your new account.</p>`;
  return sendMail({ to: email, subject, html });
}

function formatLoginAlertDateTime(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return value.toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function renderLoginSessionDetails({ email, loginTime = new Date() } = {}) {
  const safeEmail = escapeHtml(email || '');
  const time = escapeHtml(formatLoginAlertDateTime(loginTime));
  const row = (label, valueHtml) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:13px;color:#8a8a8a;width:34%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:14px;color:#111111;font-weight:600;vertical-align:top;">${valueHtml}</td>
    </tr>
  `;

  return `
    <div style="margin-top:28px;padding:20px 22px;border:1px solid #e8e8e8;background:#fafafa;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9a9a9a;font-weight:600;margin-bottom:12px;">Sign-in details</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;">
        ${row('Time', time)}
        ${row('Email', safeEmail ? `<a href="mailto:${safeEmail}" style="color:#111111;text-decoration:underline;">${safeEmail}</a>` : '—')}
        ${row('Status', '<span style="color:#111111;">Successful sign-in</span>')}
      </table>
    </div>
  `;
}

export async function sendLoginAlertEmail({ email, name, loginTime = new Date() } = {}) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) {
    throw new Error('Customer email is required');
  }

  const safeName = String(name || 'there').trim() || 'there';
  const profileUrl = buildCustomerSitePath('/dashboard/profile');

  const bodyHtml = [
    renderLoginSessionDetails({ email: recipient, loginTime }),
    `<div style="margin-top:24px;padding:18px 20px;border:1px solid #e8e8e8;border-left:3px solid #111111;background:#ffffff;">
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111111;">Wasn't you?</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#666666;">If you didn't sign in, secure your account by changing your password and reviewing recent activity.</p>
    </div>`,
    renderEmailCta({ label: 'Manage account', href: profileUrl, align: 'center' }),
    `<p style="margin-top:8px;font-size:13px;line-height:1.7;color:#9a9a9a;text-align:center;">This is an automated security notification from Store1920.</p>`,
  ].join('');

  const html = await buildTransactionalEmail({
    title: 'New Sign-In',
    preheader: 'We noticed a new sign-in to your Store1920 account.',
    greeting: safeName,
    intro: 'Your Store1920 account was just signed in to. Here are the details:',
    bodyHtml,
    includeFastSelling: false,
  });

  return sendMail({
    to: recipient,
    subject: 'New sign-in to your Store1920 account',
    html,
    fromType: 'transactional',
  });
}

export async function sendAbandonedCartConversionEmail({
  email,
  customerName,
  storeName,
  amount,
  currency = 'AED',
  paymentMethodLabel,
  paymentLink,
  items = [],
  storeId,
}) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) {
    throw new Error('Customer email is required');
  }

  const safeName = String(customerName || 'there').trim() || 'there';
  const cartItems = mapCartItemsForEmail(items, { cartTotal: amount });

  // The saved conversion total (`amount`) can be 0 when the cart was converted
  // without a final value. Fall back to the sum of the priced line items so the
  // customer never sees a "Total AED 0.00" alongside items that have real prices.
  const itemsSubtotal = cartItems.reduce((sum, item) => {
    const lineTotal = Number(item?.lineTotal ?? ((Number(item?.price) || 0) * Number(item?.quantity || 1)));
    return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
  }, 0);
  const resolvedAmount = Number(amount) > 0 ? Number(amount) : itemsSubtotal;
  const formattedAmount = formatEmailMoney(resolvedAmount, currency);

  const paymentSection = paymentLink
    ? [
      renderEmailCta({ label: `Complete payment — ${formattedAmount}`, href: paymentLink, align: 'center' }),
      `<p style="margin-top:12px;font-size:13px;color:#666666;word-break:break-all;">Or copy this link: <a href="${paymentLink}" style="color:#111111;">${paymentLink}</a></p>`,
    ].join('')
    : `<p style="margin-top:20px;font-size:14px;color:#444444;">Payment method: <strong>${paymentMethodLabel || 'Cash on delivery'}</strong><br>Total amount: <strong>${formattedAmount}</strong></p>`;

  const bodyHtml = [
    paymentSection,
    renderEmailItemsList(cartItems, { currency, label: 'ITEMS IN YOUR CART' }),
    renderEmailTotals([{ label: 'Total', value: resolvedAmount, isTotal: true }], { currency }),
  ].join('');

  const subject = paymentLink
    ? `Complete your order — ${formattedAmount}`
    : `Your order update — ${formattedAmount}`;

  const html = await buildTransactionalEmail({
    title: 'Complete Your Cart',
    greeting: safeName,
    intro: `We saved your cart and prepared your order for ${formattedAmount}.`,
    bodyHtml,
  });

  return sendMail({ to: recipient, subject, html, storeId, fromType: 'marketing' });
}

export async function sendAbandonedCartRecoveryLinkEmail({
  email,
  customerName,
  storeName,
  originalTotal,
  offerTotal,
  currency = 'AED',
  discountLabel,
  recoveryLink,
  items = [],
  storeId,
}) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) {
    throw new Error('Customer email is required');
  }

  const safeName = String(customerName || 'there').trim() || 'there';
  const formattedOriginal = formatEmailMoney(originalTotal, currency);
  const formattedOffer = formatEmailMoney(offerTotal, currency);
  const cartItems = mapCartItemsForEmail(items, { cartTotal: originalTotal });

  const offerBlock = `
    <div style="margin-top:24px;padding:18px;border:1px solid #e8e8e8;background:#fafafa;">
      <span style="text-decoration:line-through;color:#9a9a9a;">${formattedOriginal}</span>
      <strong style="font-size:20px;margin-left:8px;color:#111111;">${formattedOffer}</strong>
      ${discountLabel ? `<div style="font-size:14px;color:#666666;margin-top:8px;">${discountLabel}</div>` : ''}
    </div>
  `;

  const bodyHtml = [
    offerBlock,
    renderEmailCta({ label: 'View your discounted cart', href: recoveryLink, align: 'center' }),
    `<p style="margin-top:12px;font-size:13px;color:#666666;word-break:break-all;">Or copy this private link: <a href="${recoveryLink}" style="color:#111111;">${recoveryLink}</a></p>`,
    renderEmailItemsList(cartItems, { currency, label: 'ITEMS IN YOUR CART' }),
    `<p style="margin-top:20px;font-size:13px;color:#666666;">This link is private. Only you can see the discounted prices shown there.</p>`,
  ].join('');

  const subject = `Your exclusive cart offer — ${formattedOffer}`;
  const html = await buildTransactionalEmail({
    title: 'Your Cart Offer',
    greeting: safeName,
    intro: 'We saved your cart and prepared a private offer for you.',
    bodyHtml,
  });

  return sendMail({ to: recipient, subject, html, storeId, fromType: 'marketing' });
}

export async function sendPaymentCancelledRecoveryEmail({
  email,
  customerName,
  storeName = 'Store1920',
  amount,
  currency = 'AED',
  checkoutUrl,
  items = [],
  cancelReason = 'Payment was not completed',
  storeId,
}) {
  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) {
    return { skipped: true, reason: 'No customer email' };
  }

  const safeName = String(customerName || 'there').trim() || 'there';
  const safeStoreName = String(storeName || 'Store1920').trim() || 'Store1920';
  const formattedAmount = `${currency} ${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const checkoutLink = checkoutUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.store1920.com'}/checkout`;
  const safeReason = String(cancelReason || 'Payment was not completed').trim();
  const subject = `Your order was not completed — complete it for ${formattedAmount}`;

  const bodyHtml = [
    `<div style="margin-top:20px;padding:16px;border:1px solid #e8e8e8;background:#fafafa;font-size:14px;color:#444444;"><strong>Reason:</strong> ${safeReason}</div>`,
    `<p style="margin-top:20px;font-size:15px;line-height:1.7;color:#444444;">Good news — your items are still waiting for you. Complete checkout now for <strong>${formattedAmount}</strong>.</p>`,
    renderEmailCta({ label: 'Complete your order', href: checkoutLink, align: 'center' }),
    renderEmailItemsList(mapCartItemsForEmail(items, { cartTotal: amount }), { currency, label: 'ITEMS IN YOUR CART' }),
    `<p style="margin-top:20px;font-size:13px;color:#666666;">You have not been charged.</p>`,
  ].join('');

  const html = await buildTransactionalEmail({
    title: 'Order Not Completed',
    greeting: safeName,
    intro: `Your payment at ${safeStoreName} was not completed, so your order was not placed.`,
    bodyHtml,
  });

  await sendMail({ to: recipient, subject, html, storeId, fromType: 'marketing' });
  return { sent: true };
}

function digestMoney(amount) {
  return formatEmailMoney(amount || 0, 'AED');
}

export async function sendAdminDailyOrdersDigestEmail({ window = {}, summary = {} } = {}) {
  const adminEmails = getAdminOrderNotificationEmails();
  if (!adminEmails.length) {
    console.warn('[email] No ADMIN_EMAIL configured — skipping daily orders digest');
    return { skipped: true, reason: 'no_admin_email' };
  }

  const periodLabel = escapeHtml(window.label || 'Selected period');
  const storeOrdersUrl = buildCustomerSitePath('/store/orders');
  const salesUrl = buildCustomerSitePath('/store/orders-by-product');

  const statusRows = (summary.byStatus || []).map((row) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;">${escapeHtml(row.label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;text-align:right;">${Number(row.count || 0)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#111;text-align:right;">${escapeHtml(digestMoney(row.revenue))}</td>
    </tr>
  `).join('');

  const bodyHtml = [
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444444;">Daily orders digest for <strong>${periodLabel}</strong> — counts only.</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
      <tr>
        <td style="padding:12px;border:1px solid #e8e8e8;background:#fafafa;width:25%;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Total orders</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;color:#111;">${Number(summary.totalOrders || 0)}</div>
        </td>
        <td style="padding:12px;border:1px solid #e8e8e8;background:#ecfdf5;width:25%;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#047857;">Sales</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;color:#047857;">${Number(summary.salesOrders || 0)}</div>
          <div style="margin-top:4px;font-size:12px;color:#047857;">${escapeHtml(digestMoney(summary.salesRevenue))}</div>
        </td>
        <td style="padding:12px;border:1px solid #e8e8e8;background:#fff7ed;width:25%;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;">Failed / unpaid</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;color:#b45309;">${Number(summary.failedOrders || 0)}</div>
        </td>
        <td style="padding:12px;border:1px solid #e8e8e8;background:#fef2f2;width:25%;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#b91c1c;">Cancelled</div>
          <div style="margin-top:6px;font-size:22px;font-weight:700;color:#b91c1c;">${Number(summary.cancelledOrders || 0)}</div>
        </td>
      </tr>
    </table>`,
    statusRows
      ? `<div style="margin:0 0 8px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#9a9a9a;font-weight:600;">By status</div>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e8e8e8;border-collapse:collapse;">
           <tr style="background:#fafafa;">
             <th align="left" style="padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Status</th>
             <th align="right" style="padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Count</th>
             <th align="right" style="padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">Revenue</th>
           </tr>
           ${statusRows}
         </table>`
      : `<p style="margin:0 0 20px;font-size:14px;color:#666;">No orders in this period.</p>`,
    renderEmailCta({
      label: 'Open store orders',
      href: storeOrdersUrl,
      align: 'center',
    }),
    `<p style="margin:16px 0 0;text-align:center;font-size:12px;"><a href="${escapeHtml(salesUrl)}" style="color:#666;">View Sales data / Orders by product</a></p>`,
  ].filter(Boolean).join('');

  const html = await buildTransactionalEmail({
    title: 'Daily orders digest',
    greeting: 'Team',
    intro: `Order counts from ${window.label || 'the last business day'} (Asia/Dubai).`,
    bodyHtml,
    preheader: `${summary.salesOrders || 0} sales · ${summary.failedOrders || 0} failed · ${digestMoney(summary.salesRevenue)}`,
  });

  const [primaryAdmin, ...otherAdmins] = adminEmails;
  const subject = `Daily orders · ${summary.salesOrders || 0} sales · ${digestMoney(summary.salesRevenue)} · ${window.startDate || ''}→${window.endDate || ''}`;

  await sendMail({
    to: primaryAdmin,
    bcc: otherAdmins,
    subject,
    html,
    adminCopy: false,
  });

  return { sent: true, to: adminEmails, subject };
}

