import { parseWhatsAppApiError, classifyElasticWabaResponse, formatWhatsAppErrorMessage } from '@/lib/whatsapp/formatWhatsAppError';

const DEFAULT_BASE_URL = 'https://wabacrmapi.elastic.ae/api/meta/v19.0';
const DEFAULT_PHONE_NUMBER_ID = '855078217693024';

const TEMPLATE_TOKENS = {
  store1920_order_confirmed: 'WABA_TOKEN_ORDER_CONFIRMATION',
  order_confirmation_final: 'WABA_TOKEN_ORDER_CONFIRMATION',
  confirmation_paid_order: 'WABA_TOKEN_PAID_ORDER',
  order_shipped: 'WABA_TOKEN_SHIPPED',
  order_reminder_: 'WABA_TOKEN_REMINDER',
  cart_reminder_1920: 'WABA_TOKEN_CART_REMINDER',
  abandoned_checkout_reminder: 'WABA_TOKEN_ABANDONED_CHECKOUT',
  cod_confirmation: 'WABA_TOKEN_COD_CONFIRMATION',
  store1920_order_delivered: 'WABA_TOKEN_ORDER_DELIVERED',
  promotional_offer__coupon: 'WABA_TOKEN_PROMOTIONAL_OFFER',
  store1920_otp: 'WABA_TOKEN_OTP',
};

function hasAnyWabaToken() {
  return Boolean(
    process.env.WABA_API_TOKEN
    || process.env.WABA_TOKEN_ORDER_CONFIRMATION
    || process.env.WABA_TOKEN_PAID_ORDER
    || process.env.WABA_TOKEN_SHIPPED
    || process.env.WABA_TOKEN_REMINDER
    || process.env.WABA_TOKEN_CART_REMINDER
    || process.env.WABA_TOKEN_ABANDONED_CHECKOUT
    || process.env.WABA_TOKEN_COD_CONFIRMATION
    || process.env.WABA_TOKEN_ORDER_DELIVERED
    || process.env.WABA_TOKEN_PROMOTIONAL_OFFER
    || process.env.WABA_TOKEN_OTP
  );
}

function isWhatsAppEnabled() {
  if (String(process.env.WABA_ENABLED || 'true').toLowerCase() === 'false') return false;
  return hasAnyWabaToken();
}

function resolveTokenForTemplate(templateName) {
  const normalized = String(templateName || '').trim();
  const envKey = TEMPLATE_TOKENS[normalized];
  if (envKey && process.env[envKey]) return process.env[envKey];

  if (normalized.includes('cart_reminder') && process.env.WABA_TOKEN_CART_REMINDER) {
    return process.env.WABA_TOKEN_CART_REMINDER;
  }

  if (normalized.includes('abandoned_checkout') && process.env.WABA_TOKEN_ABANDONED_CHECKOUT) {
    return process.env.WABA_TOKEN_ABANDONED_CHECKOUT;
  }

  if (
    normalized === 'store1920_order_confirmed'
    || normalized === 'cod_confirmation'
    || normalized === 'order_confirmation_final'
  ) {
    const token = process.env.WABA_TOKEN_ORDER_CONFIRMATION || process.env.WABA_TOKEN_COD_CONFIRMATION;
    if (token) return token;
  }

  if (normalized.includes('order_delivered') && process.env.WABA_TOKEN_ORDER_DELIVERED) {
    return process.env.WABA_TOKEN_ORDER_DELIVERED;
  }

  if (normalized.includes('promotional_offer') && process.env.WABA_TOKEN_PROMOTIONAL_OFFER) {
    return process.env.WABA_TOKEN_PROMOTIONAL_OFFER;
  }

  if (normalized.includes('reminder') && process.env.WABA_TOKEN_REMINDER) {
    return process.env.WABA_TOKEN_REMINDER;
  }

  if (normalized.includes('shipped') && process.env.WABA_TOKEN_SHIPPED) {
    return process.env.WABA_TOKEN_SHIPPED;
  }

  if (normalized.includes('paid') && process.env.WABA_TOKEN_PAID_ORDER) {
    return process.env.WABA_TOKEN_PAID_ORDER;
  }

  if (normalized.includes('confirmation') && process.env.WABA_TOKEN_ORDER_CONFIRMATION) {
    return process.env.WABA_TOKEN_ORDER_CONFIRMATION;
  }

  if ((normalized.includes('otp') || normalized.includes('login')) && process.env.WABA_TOKEN_OTP) {
    return process.env.WABA_TOKEN_OTP;
  }

  return process.env.WABA_API_TOKEN || '';
}

function getMessagesUrl() {
  const fullUrl = String(process.env.WABA_MESSAGES_URL || '').trim();
  if (fullUrl) return fullUrl;

  const baseUrl = String(process.env.WABA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const phoneNumberId = String(process.env.WABA_PHONE_NUMBER_ID || DEFAULT_PHONE_NUMBER_ID).trim();
  return `${baseUrl}/${phoneNumberId}/messages`;
}

export function normalizePhoneForWaba(phone, phoneCode = '') {
  const codeDigits = String(phoneCode || '').replace(/\D/g, '');
  let phoneDigits = String(phone || '').replace(/\D/g, '');
  if (!phoneDigits) return null;

  // Already E.164 without "+"
  if (phoneDigits.startsWith('971') && phoneDigits.length === 12) return phoneDigits;
  if (phoneDigits.startsWith('91') && phoneDigits.length >= 12) return phoneDigits;

  // Local UAE numbers often include a leading 0 (050xxxxxxx) while phoneCode is +971
  if (codeDigits === '971' && phoneDigits.startsWith('0')) {
    phoneDigits = phoneDigits.replace(/^0+/, '');
  }

  let combined = phoneDigits;
  if (codeDigits && !phoneDigits.startsWith(codeDigits)) {
    combined = `${codeDigits}${phoneDigits}`;
  }

  if (!combined) return null;

  if (combined.startsWith('971')) {
    return combined.length === 12 ? combined : null;
  }

  if (combined.startsWith('91') && combined.length >= 12) return combined;

  if (combined.startsWith('0')) {
    const local = combined.replace(/^0+/, '');
    if (local.length === 9 && local.startsWith('5')) return `971${local}`;
    return null;
  }

  if (combined.length === 9 && combined.startsWith('5')) return `971${combined}`;

  return null;
}

function sanitizeTemplateText(value, maxLength = 1024) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isValidHeaderImageUrl(url) {
  const value = String(url || '').trim();
  return /^https:\/\/.+/i.test(value);
}

export function resolveWhatsAppHeaderImage(primaryUrl, fallbackUrl = '') {
  if (isValidHeaderImageUrl(primaryUrl)) return primaryUrl.trim();
  if (isValidHeaderImageUrl(fallbackUrl)) return fallbackUrl.trim();
  return '';
}

function buildTemplateComponents({ bodyParams = [], headerImageUrl, buttonUrlSuffix }) {
  const components = [];

  if (isValidHeaderImageUrl(headerImageUrl)) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: {
            link: headerImageUrl.trim(),
          },
        },
      ],
    });
  }

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({
        type: 'text',
        text: sanitizeTemplateText(text),
      })),
    });
  }

  if (buttonUrlSuffix) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [
        {
          type: 'text',
          text: sanitizeTemplateText(buttonUrlSuffix, 256),
        },
      ],
    });
  }

  return components;
}

const RECENT_SEND_TTL_MS = Number(process.env.WABA_DEDUPE_WINDOW_MS || 6 * 60 * 60 * 1000);
const recentTemplateSends = new Map();

function buildTemplateSendKey(templateName, recipient) {
  return `${String(templateName || '').trim()}:${String(recipient || '').trim()}`;
}

function getRecentTemplateSend(templateName, recipient) {
  const key = buildTemplateSendKey(templateName, recipient);
  const timestamp = recentTemplateSends.get(key);
  if (!timestamp) return null;
  if (Date.now() - timestamp > RECENT_SEND_TTL_MS) {
    recentTemplateSends.delete(key);
    return null;
  }
  return timestamp;
}

function markRecentTemplateSend(templateName, recipient) {
  recentTemplateSends.set(buildTemplateSendKey(templateName, recipient), Date.now());
}

function buildAlreadySentResult(templateName, recipient) {
  return {
    success: true,
    alreadySent: true,
    queued: false,
    delivered: false,
    queueId: null,
    status: 'already_sent',
    templateName,
    to: recipient,
    // Neutral status only — never echo Elastic "Error, null, sorry nothing to update"
    // (some WhatsApp bot flows forward this string to the customer).
    message: 'Already processed',
  };
}

export async function sendWhatsAppTemplate({
  to,
  phoneCode = '',
  templateName,
  bodyParams = [],
  languageCode = 'en',
  token,
  headerImageUrl,
  buttonUrlSuffix,
  skipDedupe = false,
}) {
  if (!isWhatsAppEnabled()) {
    console.warn('[whatsapp] skipped:', templateName, '— WABA tokens not configured in .env');
    return { skipped: true, reason: 'WhatsApp integration disabled or missing token' };
  }

  const recipient = normalizePhoneForWaba(to, phoneCode);
  if (!recipient) {
    console.warn('[whatsapp] skipped:', templateName, '— missing phone for recipient');
    return { skipped: true, reason: 'Missing or invalid phone number' };
  }

  if (recipient.startsWith('971') && recipient.length !== 12) {
    console.warn('[whatsapp] skipped:', templateName, '— invalid UAE number', recipient);
    return { skipped: true, reason: 'Invalid UAE phone number. Use 05xxxxxxxx format.' };
  }

  const bearerToken = token || resolveTokenForTemplate(templateName);
  if (!bearerToken) {
    console.warn('[whatsapp] skipped:', templateName, '— no bearer token for this template');
    return { skipped: true, reason: `Missing WABA API token for template ${templateName}` };
  }

  if (!skipDedupe && getRecentTemplateSend(templateName, recipient)) {
    console.warn('[whatsapp] local dedupe skipped:', templateName, recipient);
    return buildAlreadySentResult(templateName, recipient);
  }

  const components = buildTemplateComponents({
    bodyParams,
    headerImageUrl,
    buttonUrlSuffix,
  });

  const payload = {
    to: recipient,
    recipient_type: 'individual',
    type: 'template',
    template: {
      language: {
        policy: 'deterministic',
        code: languageCode,
      },
      name: templateName,
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const response = await fetch(getMessagesUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  const classified = classifyElasticWabaResponse(data, response);

  if (classified.kind === 'duplicate') {
    if (!skipDedupe) markRecentTemplateSend(templateName, recipient);
    console.warn('[whatsapp] duplicate skipped:', templateName, recipient, classified.raw);
    return buildAlreadySentResult(templateName, recipient, classified.message);
  }

  if (classified.kind === 'error' || !response.ok) {
    const parsed = parseWhatsAppApiError(data, response);
    if (parsed.duplicate) {
      if (!skipDedupe) markRecentTemplateSend(templateName, recipient);
      console.warn('[whatsapp] duplicate skipped:', templateName, recipient, parsed.raw);
      return buildAlreadySentResult(templateName, recipient, parsed.message);
    }

    console.error('[whatsapp] API error:', templateName, recipient, parsed.message, data);
    throw new Error(parsed.message);
  }

  if (!skipDedupe) markRecentTemplateSend(templateName, recipient);
  const queueStatus = data?.message?.message_status || null;
  console.log('[whatsapp] API response:', templateName, recipient, queueStatus, data?.message?.queue_id || '');

  return {
    success: true,
    queued: queueStatus === 'queued' || !queueStatus,
    delivered: queueStatus === 'sent' || queueStatus === 'delivered',
    queueId: data?.message?.queue_id || null,
    status: queueStatus,
    templateName,
    to: recipient,
    raw: data,
  };
}

/** Same payload as the working Elastic store1920_otp curl. */
export async function sendStore1920OtpMessage({ to, phoneCode = '', code, token }) {
  const otp = String(code || '').replace(/\D/g, '');
  return sendWhatsAppTemplate({
    to,
    phoneCode,
    templateName: String(process.env.WABA_TEMPLATE_OTP || 'store1920_otp').trim(),
    languageCode: String(process.env.WABA_OTP_LANGUAGE || 'en').trim() || 'en',
    bodyParams: [otp],
    buttonUrlSuffix: otp,
    skipDedupe: true,
    token,
  });
}
