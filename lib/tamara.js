import crypto from 'crypto';
import { buildCheckoutRedirectUrl, resolveTamaraMerchantBaseUrl } from '@/lib/checkoutOrigin';
import { getProductAbsoluteUrl, getProductPath } from '@/lib/productUrl';

const TAMARA_API_URL = String(process.env.TAMARA_API_URL || 'https://api.tamara.co').replace(/\/+$/, '');
const TAMARA_API_TOKEN = String(process.env.TAMARA_API_TOKEN || '').trim();
const TAMARA_NOTIFICATION_TOKEN = String(process.env.TAMARA_NOTIFICATION_TOKEN || '').trim();

const DEFAULT_TAMARA_WEBHOOK_EVENTS = [
    'order_approved',
    'order_declined',
    'order_authorised',
    'order_canceled',
    'order_captured',
    'order_refunded',
    'order_expired',
];

function assertTamaraConfigured() {
    if (!TAMARA_API_TOKEN) {
        throw new Error('Tamara is not configured (missing TAMARA_API_TOKEN)');
    }
}

/** Public HTTPS URL Tamara should call for order status updates. */
export function resolveTamaraWebhookUrl(request) {
    const explicit = String(process.env.TAMARA_WEBHOOK_URL || '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');

    const base = resolveTamaraMerchantBaseUrl(request);
    return buildCheckoutRedirectUrl(base, '/api/tamara/webhook');
}

/**
 * Register Tamara webhook (POST /webhooks).
 * @see https://docs.tamara.co/reference/registerwebhookurl
 */
export async function registerTamaraWebhook({ url, events, request } = {}) {
    assertTamaraConfigured();

    const body = {
        type: 'order',
        url: url || resolveTamaraWebhookUrl(request),
        events: events || DEFAULT_TAMARA_WEBHOOK_EVENTS,
    };

    const res = await fetch(`${TAMARA_API_URL}/webhooks`, {
        method: 'POST',
        headers: tamaraHeaders(),
        body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`Tamara webhook registration error: ${formatTamaraError(data)}`);
    }

    return data;
}

/** List registered Tamara webhooks (GET /webhooks). */
export async function listTamaraWebhooks() {
    assertTamaraConfigured();

    const res = await fetch(`${TAMARA_API_URL}/webhooks`, {
        headers: tamaraHeaders(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`Tamara webhook list error: ${formatTamaraError(data)}`);
    }

    return data;
}

function mapTamaraCaptureItems(items = [], baseSiteUrl = 'https://www.store1920.com') {
    return (items || []).map((item, index) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const totalAmount = Number(item.total_amount ?? unitPrice * quantity);
        const referenceId = String(item.sku || item.productId || item.id || `item-${index + 1}`);
        const product = item?.productId && typeof item.productId === 'object' ? item.productId : null;

        return {
            reference_id: referenceId,
            type: 'Physical',
            name: String(item.name || product?.name || 'Product').slice(0, 255),
            sku: referenceId.slice(0, 128),
            quantity,
            unit_price: buildTamaraMoney(unitPrice),
            total_amount: buildTamaraMoney(totalAmount),
            item_url: resolveTamaraItemUrl(
                {
                    ...item,
                    slug: item.slug || product?.slug,
                    useProductsPath: item.useProductsPath ?? product?.useProductsPath,
                },
                baseSiteUrl,
            ),
        };
    });
}

function tamaraHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAMARA_API_TOKEN}`,
    };
}

function normalizeTamaraPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('971')) return digits.slice(3);
    if (digits.startsWith('00971')) return digits.slice(5);
    if (digits.startsWith('0') && digits.length > 9) return digits.slice(1);
    return digits;
}

function requireCheckoutUrl(url, label) {
    const value = String(url || '').trim();
    if (!value || !/^https?:\/\//i.test(value)) {
        throw new Error(`Tamara ${label} URL is missing or invalid`);
    }

    try {
        const parsed = new URL(value);
        if (!parsed.pathname || parsed.pathname === '/') {
            throw new Error(`Tamara ${label} URL is missing a path`);
        }
    } catch (error) {
        if (error.message.includes('missing a path')) throw error;
        throw new Error(`Tamara ${label} URL is missing or invalid`);
    }

    return value;
}

function buildTamaraMoney(amount) {
    return {
        amount: Number(Number(amount || 0).toFixed(2)),
        currency: 'AED',
    };
}

function formatTamaraError(data) {
    if (!data || typeof data !== 'object') return 'Unknown Tamara error';

    if (Array.isArray(data.errors) && data.errors.length > 0) {
        return data.errors
            .map((entry) => {
                const field = entry?.field || entry?.property || entry?.path;
                const message = entry?.message || entry?.error_code;
                if (field && message) return `${field}: ${message}`;
                return message || entry?.error_code || JSON.stringify(entry);
            })
            .join('; ');
    }

    return data.message || data.error_code || JSON.stringify(data);
}

function resolveTamaraItemUrl(item, baseSiteUrl) {
    const explicit = String(item?.item_url || '').trim();
    if (explicit) {
        try {
            const parsed = new URL(explicit);
            if (parsed.pathname && parsed.pathname !== '/') {
                return parsed.toString();
            }
        } catch {
            // Fall through to generated URL.
        }
    }

    const slug = String(item?.slug || '').trim();
    if (slug) {
        return getProductAbsoluteUrl(
            { slug, useProductsPath: item?.useProductsPath === true },
            baseSiteUrl,
        );
    }

    const productPath = getProductPath(item?.product || item);
    if (productPath && productPath !== '/shop') {
        return buildCheckoutRedirectUrl(baseSiteUrl, productPath);
    }

    return buildCheckoutRedirectUrl(baseSiteUrl, '/shop');
}

/**
 * Create a Tamara checkout session
 */
export async function createTamaraSession({
    orderId,
    amount,
    consumer,
    shippingAddress,
    items = [],
    successUrl,
    failureUrl,
    cancelUrl,
    notificationUrl,
    siteUrl,
    description = 'Order Payment',
    instalments = 4,
}) {
    if (!TAMARA_API_TOKEN) {
        throw new Error('Tamara is not configured (missing TAMARA_API_TOKEN)');
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Tamara checkout requires at least one order item');
    }

    const baseSiteUrl = String(
        siteUrl || process.env.TAMARA_MERCHANT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.store1920.com',
    ).replace(/\/+$/, '');

    const phoneNumber = normalizeTamaraPhone(consumer?.phone_number || shippingAddress?.phone_number);
    if (!phoneNumber) {
        throw new Error('A valid phone number is required for Tamara checkout');
    }

    const resolvedCancelUrl = cancelUrl || failureUrl;
    const merchantUrl = {
        success: requireCheckoutUrl(successUrl, 'success'),
        failure: requireCheckoutUrl(failureUrl, 'failure'),
        cancel: requireCheckoutUrl(resolvedCancelUrl, 'cancel'),
    };

    if (notificationUrl) {
        merchantUrl.notification = requireCheckoutUrl(notificationUrl, 'notification');
    }

    const mappedItems = items.map((item, index) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const totalAmount = Number(item.total_amount ?? unitPrice * quantity);
        const referenceId = String(item.sku || item.productId || item.id || `item-${index + 1}`);

        return {
            reference_id: referenceId,
            type: 'Physical',
            name: String(item.name || 'Product').slice(0, 255),
            sku: referenceId.slice(0, 128),
            quantity,
            unit_price: buildTamaraMoney(unitPrice),
            total_amount: buildTamaraMoney(totalAmount),
            item_url: resolveTamaraItemUrl(item, baseSiteUrl),
        };
    });

    const body = {
        order_reference_id: String(orderId),
        total_amount: buildTamaraMoney(amount),
        description: String(description || 'Order Payment').slice(0, 256),
        country_code: 'AE',
        payment_type: 'PAY_BY_INSTALMENTS',
        instalments: Number(instalments) || 4,
        locale: 'en_AE',
        platform: 'Store1920',
        items: mappedItems,
        consumer: {
            first_name: consumer.first_name || 'Customer',
            last_name: consumer.last_name || '-',
            phone_number: phoneNumber,
            email: consumer.email || undefined,
        },
        billing_address: {
            first_name: shippingAddress.first_name || consumer.first_name || 'Customer',
            last_name: shippingAddress.last_name || consumer.last_name || '-',
            line1: shippingAddress.line1 || shippingAddress.street || shippingAddress.address || 'UAE',
            city: shippingAddress.city || 'Dubai',
            country_code: 'AE',
            phone_number: phoneNumber,
        },
        shipping_address: {
            first_name: shippingAddress.first_name || consumer.first_name || 'Customer',
            last_name: shippingAddress.last_name || consumer.last_name || '-',
            line1: shippingAddress.line1 || shippingAddress.street || shippingAddress.address || 'UAE',
            city: shippingAddress.city || 'Dubai',
            country_code: 'AE',
            phone_number: phoneNumber,
        },
        merchant_url: merchantUrl,
        tax_amount: buildTamaraMoney(0),
        shipping_amount: buildTamaraMoney(0),
    };

    const res = await fetch(`${TAMARA_API_URL}/checkout`, {
        method: 'POST',
        headers: tamaraHeaders(),
        body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
        console.error('[tamara] checkout session failed:', JSON.stringify(data));
        throw new Error(`Tamara session error: ${formatTamaraError(data)}`);
    }

    return {
        checkout_url: data.checkout_url,
        tamara_order_id: data.order_id,
    };
}

/**
 * Get Tamara order details
 */
export async function getTamaraOrder(tamaraOrderId) {
    assertTamaraConfigured();

    const resolvedOrderId = String(tamaraOrderId || '').trim();
    if (!resolvedOrderId) {
        throw new Error('Tamara order id is required');
    }

    const res = await fetch(`${TAMARA_API_URL}/orders/${encodeURIComponent(resolvedOrderId)}`, {
        headers: tamaraHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(`Tamara order lookup error: ${formatTamaraError(data)}`);
    }
    return data;
}

function getTamaraStatusFromPayload(payload = {}) {
    return String(payload?.status || payload?.order_status || '').trim().toLowerCase();
}

const TAMARA_CAPTURED_STATUSES = new Set(['captured', 'fully_captured', 'completed']);

/**
 * Authorise an approved Tamara order (required before capture unless merchant auto-authorise is on).
 * @see https://docs.tamara.co/reference/authoriseorder
 */
export async function authoriseTamaraOrder(tamaraOrderId) {
    assertTamaraConfigured();

    const resolvedOrderId = String(tamaraOrderId || '').trim();
    if (!resolvedOrderId) {
        throw new Error('Tamara order id is required');
    }

    const res = await fetch(
        `${TAMARA_API_URL}/orders/${encodeURIComponent(resolvedOrderId)}/authorise`,
        {
            method: 'POST',
            headers: tamaraHeaders(),
        },
    );
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const message = formatTamaraError(data).toLowerCase();
        const statusHint = getTamaraStatusFromPayload(data);
        // Idempotent retries: order may already be authorised or captured.
        if (
            res.status === 409
            || /already|authoris|authoriz|captured/.test(message)
            || TAMARA_CAPTURED_STATUSES.has(statusHint)
            || statusHint === 'authorised'
            || statusHint === 'authorized'
        ) {
            return { ...data, idempotent: true };
        }
        throw new Error(`Tamara authorise error: ${formatTamaraError(data)}`);
    }

    return data;
}

/**
 * Capture a Tamara payment (call after order is authorised)
 */
export async function captureTamaraPayment(tamaraOrderId, { orderId, amount, items = [], siteUrl } = {}) {
    const baseSiteUrl = String(
        siteUrl || process.env.TAMARA_MERCHANT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.store1920.com',
    ).replace(/\/+$/, '');

    const body = {
        order_id: tamaraOrderId,
        captures: [{
            reference_id: String(orderId),
            total_amount: buildTamaraMoney(amount),
            tax_amount: buildTamaraMoney(0),
            shipping_amount: buildTamaraMoney(0),
            discount_amount: buildTamaraMoney(0),
            items: mapTamaraCaptureItems(items, baseSiteUrl),
        }],
    };

    const res = await fetch(`${TAMARA_API_URL}/payments/capture`, {
        method: 'POST',
        headers: tamaraHeaders(),
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Tamara capture error: ${formatTamaraError(data)}`);
    }
    return data;
}

/**
 * Ensure Tamara order reaches a captured status: approved → authorise → capture.
 * Returns the latest provider order payload from GET /orders/{id}.
 */
export async function ensureTamaraOrderCaptured(tamaraOrderId, captureArgs = {}) {
    assertTamaraConfigured();

    let providerOrder = await getTamaraOrder(tamaraOrderId);
    let status = getTamaraStatusFromPayload(providerOrder);

    if (TAMARA_CAPTURED_STATUSES.has(status)) {
        return providerOrder;
    }

    // Capture is rejected while status is only "approved". Authorise first.
    if (status === 'approved') {
        try {
            const authoriseResult = await authoriseTamaraOrder(tamaraOrderId);
            const authoriseStatus = getTamaraStatusFromPayload(authoriseResult);
            if (
                TAMARA_CAPTURED_STATUSES.has(authoriseStatus)
                || authoriseResult?.auto_captured === true
            ) {
                return getTamaraOrder(tamaraOrderId);
            }
        } catch (authoriseError) {
            console.error('[tamara] authorise failed:', authoriseError.message);
        }

        providerOrder = await getTamaraOrder(tamaraOrderId);
        status = getTamaraStatusFromPayload(providerOrder);
        if (TAMARA_CAPTURED_STATUSES.has(status)) {
            return providerOrder;
        }
        // Still approved → do not call capture (provider will reject it).
        if (status === 'approved') {
            return providerOrder;
        }
    }

    if (
        status === 'authorised'
        || status === 'authorized'
        || (!TAMARA_CAPTURED_STATUSES.has(status) && status !== 'approved')
    ) {
        try {
            await captureTamaraPayment(tamaraOrderId, captureArgs);
        } catch (captureError) {
            // Concurrent webhook/reconcile may have captured already; re-read below.
            console.error('[tamara] capture failed:', captureError.message);
        }
        providerOrder = await getTamaraOrder(tamaraOrderId);
    }

    return providerOrder;
}

/**
 * Cancel a Tamara order
 */
export async function cancelTamaraOrder(tamaraOrderId) {
    const res = await fetch(`${TAMARA_API_URL}/orders/${tamaraOrderId}/cancel`, {
        method: 'POST',
        headers: tamaraHeaders(),
        body: JSON.stringify({}),
    });
    return res.json();
}

/**
 * Verify Tamara webhook notification token (HS256 JWT)
 */
export function verifyTamaraWebhookToken(token) {
    if (!TAMARA_NOTIFICATION_TOKEN) return null;

    const rawToken = String(token || '').trim().replace(/^Bearer\s+/i, '');
    if (!rawToken) return null;

    try {
        const parts = rawToken.split('.');
        if (parts.length !== 3) return null;

        const [header, payload, signature] = parts;
        const signedContent = `${header}.${payload}`;
        const expected = crypto
            .createHmac('sha256', TAMARA_NOTIFICATION_TOKEN)
            .update(signedContent)
            .digest('base64url');
        const expectedLegacy = crypto
            .createHmac('sha256', TAMARA_NOTIFICATION_TOKEN)
            .update(signedContent)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');

        const signatureMatches = signature === expected || signature === expectedLegacy;
        if (!signatureMatches) return null;

        const payloadJson = Buffer.from(payload, 'base64url').toString('utf8');
        return JSON.parse(payloadJson);
    } catch {
        return null;
    }
}

export function extractTamaraWebhookToken(request) {
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('tamaraToken');
    if (queryToken) return queryToken;

    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    return bearerToken || null;
}

export function buildTamaraCaptureItemsFromOrder(order = {}) {
    return (order.orderItems || []).map((item) => {
        const product = item?.productId && typeof item.productId === 'object' ? item.productId : null;
        return {
            productId: product?._id?.toString() || String(item.productId || ''),
            name: product?.name || item.name || 'Product',
            slug: product?.slug || '',
            useProductsPath: product?.useProductsPath === true,
            sku: product?._id?.toString() || String(item.productId || ''),
            quantity: item.quantity,
            unit_price: item.price,
            total_amount: Number((Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)),
        };
    });
}
