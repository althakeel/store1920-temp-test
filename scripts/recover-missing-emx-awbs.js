/**
 * Recover missing EMX Door-To-Door AWBs (1000…) from Waslah order details
 * for store orders that already have waslah.orderId but no trackingId.
 *
 *   node --env-file=.env scripts/recover-missing-emx-awbs.js
 *   node --env-file=.env scripts/recover-missing-emx-awbs.js --apply
 *   node --env-file=.env scripts/recover-missing-emx-awbs.js --apply --awb=1000045491226
 */
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const ONLY_AWB = (process.argv.find((arg) => arg.startsWith('--awb=')) || '')
  .slice('--awb='.length)
  .trim();

function getBaseUrl() {
  return String(process.env.WASLAH_API_BASE_URL || 'https://gateway.waslah.ae/api/v1').replace(/\/$/, '');
}

function getToken() {
  return String(process.env.WASLAH_API_TOKEN || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

function looksLikeEmx(value = '') {
  const text = String(value || '').trim();
  return /^1000\d{9,12}$/.test(text);
}

function findNestedEmx(node, depth = 0) {
  if (!node || depth > 6) return '';
  if (typeof node === 'string' || typeof node === 'number') {
    const value = String(node).trim();
    return looksLikeEmx(value) ? value : '';
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findNestedEmx(entry, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findNestedEmx(value, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function buildEmxTrackingUrl(awb) {
  return `https://www.emx.ae/all-services/track-a-package?trackingnumber=${encodeURIComponent(awb)}`;
}

async function fetchWaslahOrder(waslahOrderId) {
  const token = getToken();
  if (!token) throw new Error('WASLAH_API_TOKEN missing');
  const res = await fetch(`${getBaseUrl()}/orders/${waslahOrderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message || data?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    const error = new Error(String(message));
    error.status = res.status;
    throw error;
  }
  return data?.data || data?.order || data;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing');
  if (!getToken()) throw new Error('WASLAH_API_TOKEN missing');

  await mongoose.connect(uri);
  const orders = mongoose.connection.collection('orders');

  const query = {
    'waslah.orderId': { $type: 'string', $ne: '' },
    $and: [
      {
        $or: [
          { 'waslah.trackingNumber': { $in: [null, ''] } },
          { 'waslah.trackingNumber': { $exists: false } },
        ],
      },
      {
        $or: [
          { trackingId: { $in: [null, ''] } },
          { trackingId: { $exists: false } },
        ],
      },
    ],
  };

  const candidates = await orders
    .find(query, {
      projection: {
        shortOrderNumber: 1,
        status: 1,
        storeId: 1,
        'waslah.orderId': 1,
        'waslah.reference': 1,
        trackingId: 1,
      },
    })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();

  let scanned = 0;
  let recovered = 0;
  let matchedTarget = null;
  const samples = [];
  const failures = [];

  for (const order of candidates) {
    scanned += 1;
    const waslahOrderId = String(order?.waslah?.orderId || '').trim();
    if (!waslahOrderId) continue;

    try {
      const detail = await fetchWaslahOrder(waslahOrderId);
      const awb = findNestedEmx(detail);
      if (!awb) {
        if (samples.length < 8) {
          samples.push({
            shortOrderNumber: order.shortOrderNumber || null,
            waslahOrderId,
            awb: null,
          });
        }
        await sleep(120);
        continue;
      }

      if (ONLY_AWB && awb !== ONLY_AWB) {
        await sleep(80);
        continue;
      }

      if (awb === ONLY_AWB || !ONLY_AWB) {
        samples.push({
          shortOrderNumber: order.shortOrderNumber || null,
          reference: order?.waslah?.reference || null,
          waslahOrderId,
          awb,
        });
      }

      if (awb === '1000045491226' || awb === ONLY_AWB) {
        matchedTarget = {
          shortOrderNumber: order.shortOrderNumber || null,
          reference: order?.waslah?.reference || null,
          orderId: String(order._id),
          awb,
        };
      }

      if (APPLY) {
        await orders.updateOne(
          { _id: order._id },
          {
            $set: {
              trackingId: awb,
              courier: 'EMX',
              trackingUrl: buildEmxTrackingUrl(awb),
              'waslah.trackingNumber': awb,
              'waslah.emxTrackingNumber': awb,
              'waslah.processed': true,
            },
          },
        );
        recovered += 1;
      } else {
        recovered += 1; // would recover
      }

      if (ONLY_AWB && awb === ONLY_AWB) break;
      await sleep(120);
    } catch (error) {
      failures.push({
        shortOrderNumber: order.shortOrderNumber || null,
        waslahOrderId,
        error: error.message,
        status: error.status || null,
      });
      await sleep(200);
    }
  }

  console.log(JSON.stringify({
    apply: APPLY,
    onlyAwb: ONLY_AWB || null,
    candidateCount: candidates.length,
    scanned,
    recovered,
    matchedTarget,
    samples: samples.slice(0, 20),
    failures: failures.slice(0, 10),
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
