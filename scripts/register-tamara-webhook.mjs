/**
 * Register the Store1920 Tamara webhook with Tamara's live API.
 *
 * Usage:
 *   node --env-file=.env scripts/register-tamara-webhook.mjs
 *   node --env-file=.env scripts/register-tamara-webhook.mjs --list
 */

const TAMARA_API_URL = (process.env.TAMARA_API_URL || 'https://api.tamara.co').replace(/\/+$/, '');
const TAMARA_API_TOKEN = (process.env.TAMARA_API_TOKEN || '').trim();
const listOnly = process.argv.includes('--list');

const DEFAULT_EVENTS = [
    'order_approved',
    'order_declined',
    'order_authorised',
    'order_canceled',
    'order_captured',
    'order_refunded',
    'order_expired',
];

function resolveWebhookUrl() {
    const explicit = String(process.env.TAMARA_WEBHOOK_URL || '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');

    const base = String(process.env.TAMARA_MERCHANT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.store1920.com')
        .trim()
        .replace(/\/+$/, '');
    return `${base}/api/tamara/webhook`;
}

function tamaraHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TAMARA_API_TOKEN}`,
    };
}

async function listWebhooks() {
    const res = await fetch(`${TAMARA_API_URL}/webhooks`, { headers: tamaraHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || data?.error || JSON.stringify(data));
    }
    return data;
}

async function registerWebhook() {
    const url = resolveWebhookUrl();
    const body = {
        type: 'order',
        url,
        events: DEFAULT_EVENTS,
    };

    const res = await fetch(`${TAMARA_API_URL}/webhooks`, {
        method: 'POST',
        headers: tamaraHeaders(),
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.message || data?.error || JSON.stringify(data));
    }
    return data;
}

async function main() {
    if (!TAMARA_API_TOKEN) {
        throw new Error('TAMARA_API_TOKEN is not set in .env');
    }

    if (listOnly) {
        console.log(JSON.stringify(await listWebhooks(), null, 2));
        return;
    }

    const webhookUrl = resolveWebhookUrl();
    console.log('Registering Tamara webhook for:', webhookUrl);
    console.log(JSON.stringify(await registerWebhook(), null, 2));
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
