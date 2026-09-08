/**
 * Register the Store1920 Tabby webhook with Tabby's API.
 *
 * Usage:
 *   node --env-file=.env scripts/register-tabby-webhook.mjs
 *   node --env-file=.env scripts/register-tabby-webhook.mjs --list
 */

const TABBY_API_URL = (process.env.TABBY_API_URL || 'https://api.tabby.ai').replace(/\/+$/, '');
const TABBY_SECRET_KEY = process.env.TABBY_SECRET_KEY;
const TABBY_MERCHANT_CODE = process.env.TABBY_MERCHANT_CODE || 'Store1920';
const TABBY_WEBHOOK_SECRET = process.env.TABBY_WEBHOOK_SECRET || '';
const listOnly = process.argv.includes('--list');

function resolveWebhookUrl() {
    const explicit = String(process.env.TABBY_WEBHOOK_URL || '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');

    const base = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://www.store1920.com')
        .trim()
        .replace(/\/+$/, '');
    return `${base}/api/tabby/webhook`;
}

function tabbyHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TABBY_SECRET_KEY}`,
        'X-Merchant-Code': TABBY_MERCHANT_CODE,
    };
}

async function listWebhooks() {
    const res = await fetch(`${TABBY_API_URL}/api/v1/webhooks`, {
        headers: tabbyHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.message || data?.error || JSON.stringify(data));
    }
    return data;
}

async function registerWebhook() {
    const url = resolveWebhookUrl();
    const body = { url };

    if (TABBY_WEBHOOK_SECRET) {
        body.header = {
            title: process.env.TABBY_WEBHOOK_HEADER || 'x-tabby-signature',
            value: TABBY_WEBHOOK_SECRET,
        };
    }

    const res = await fetch(`${TABBY_API_URL}/api/v1/webhooks`, {
        method: 'POST',
        headers: tabbyHeaders(),
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.message || data?.error || JSON.stringify(data));
    }
    return data;
}

async function main() {
    if (!TABBY_SECRET_KEY) {
        throw new Error('TABBY_SECRET_KEY is not set in .env');
    }

    if (listOnly) {
        console.log(JSON.stringify(await listWebhooks(), null, 2));
        return;
    }

    const webhookUrl = resolveWebhookUrl();
    console.log('Registering Tabby webhook for:', webhookUrl);
    console.log(JSON.stringify(await registerWebhook(), null, 2));
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
