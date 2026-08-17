/**
 * Backfill waslah.emxTrackingNumber from trackingNumber/trackingId when missing.
 * Dry-run by default. Pass --apply to write.
 *
 *   node --env-file=.env scripts/backfill-emx-tracking-number.js
 *   node --env-file=.env scripts/backfill-emx-tracking-number.js --apply
 */
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

function looksLikeEmx(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^62\d{10,14}$/.test(text)) return false;
  if (/^1000\d{9,12}$/.test(text)) return true;
  return /^\d{10,16}$/.test(text) && !/^62\d+$/.test(text);
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing');
  await mongoose.connect(uri);
  const orders = mongoose.connection.collection('orders');

  const cursor = orders.find({
    $and: [
      {
        $or: [
          { 'waslah.emxTrackingNumber': { $in: [null, ''] } },
          { 'waslah.emxTrackingNumber': { $exists: false } },
        ],
      },
      {
        $or: [
          { 'waslah.trackingNumber': { $type: 'string', $ne: '' } },
          { trackingId: { $type: 'string', $ne: '' } },
        ],
      },
    ],
  });

  let scanned = 0;
  let eligible = 0;
  let updated = 0;
  const samples = [];

  while (await cursor.hasNext()) {
    const order = await cursor.next();
    scanned += 1;
    const candidate = String(order?.waslah?.trackingNumber || order?.trackingId || '').trim();
    if (!looksLikeEmx(candidate)) continue;
    eligible += 1;
    if (samples.length < 10) {
      samples.push({
        shortOrderNumber: order.shortOrderNumber || null,
        trackingId: order.trackingId || null,
        trackingNumber: order?.waslah?.trackingNumber || null,
      });
    }
    if (APPLY) {
      await orders.updateOne(
        { _id: order._id },
        { $set: { 'waslah.emxTrackingNumber': candidate } },
      );
      updated += 1;
    }
  }

  console.log(JSON.stringify({ apply: APPLY, scanned, eligible, updated, samples }, null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
