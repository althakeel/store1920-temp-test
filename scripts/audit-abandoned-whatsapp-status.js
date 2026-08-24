/**
 * Summarize abandoned-cart WhatsApp reminder statuses (no secrets).
 * Run: node --env-file=.env scripts/audit-abandoned-whatsapp-status.js
 */
const mongoose = require('mongoose');

function summarizeError(error) {
  const text = String(error || '').replace(/\s+/g, ' ').trim();
  if (!text) return '(none)';
  return text.slice(0, 180);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const col = mongoose.connection.collection('abandonedcarts');
  const now = new Date();

  const [byStatus, bySource, duePending, stuckProcessing, withPhoneNoStatus, recentFailed, recentSent] = await Promise.all([
    col.aggregate([
      { $match: { status: 'active', $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } },
      { $group: { _id: { $ifNull: ['$whatsappCheckoutReminderStatus', '(none)'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray(),
    col.aggregate([
      { $match: { status: 'active', $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } },
      {
        $group: {
          _id: {
            source: { $ifNull: ['$source', '(none)'] },
            status: { $ifNull: ['$whatsappCheckoutReminderStatus', '(none)'] },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray(),
    col.countDocuments({
      status: 'active',
      whatsappCheckoutReminderStatus: 'pending',
      whatsappCheckoutReminderDueAt: { $lte: new Date() },
      phone: { $exists: true, $nin: [null, ''] },
    }),
    col.countDocuments({
      status: 'active',
      whatsappCheckoutReminderStatus: 'processing',
    }),
    col.countDocuments({
      status: 'active',
      phone: { $exists: true, $nin: [null, ''] },
      $or: [
        { whatsappCheckoutReminderStatus: null },
        { whatsappCheckoutReminderStatus: { $exists: false } },
      ],
    }),
    col.find({
      status: 'active',
      whatsappCheckoutReminderStatus: { $in: ['failed', 'skipped'] },
    }, {
      projection: {
        source: 1,
        whatsappCheckoutReminderStatus: 1,
        whatsappCheckoutReminderError: 1,
        updatedAt: 1,
      },
    }).sort({ updatedAt: -1 }).limit(12).toArray(),
    col.find({
      status: 'active',
      whatsappCheckoutReminderStatus: 'sent',
    }, {
      projection: {
        source: 1,
        whatsappCheckoutReminderSentAt: 1,
        updatedAt: 1,
      },
    }).sort({ whatsappCheckoutReminderSentAt: -1 }).limit(5).toArray(),
  ]);

  console.log('\nActive carts by WhatsApp status:');
  byStatus.forEach((row) => console.log(`  ${row._id}: ${row.count}`));

  console.log('\nActive carts by source + WhatsApp status:');
  bySource.forEach((row) => console.log(`  ${row._id.source} / ${row._id.status}: ${row.count}`));

  console.log(`\nDue pending (should be picked by cron): ${duePending}`);
  console.log(`Stuck processing: ${stuckProcessing}`);
  console.log(`Has phone but never scheduled: ${withPhoneNoStatus}`);

  console.log('\nRecent failed/skipped (no phones):');
  recentFailed.forEach((row) => {
    console.log(`  [${row.source || '?'}] ${row.whatsappCheckoutReminderStatus}: ${summarizeError(row.whatsappCheckoutReminderError)}`);
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 1000);
  const [sentToday, sentYesterday, dueMeta] = await Promise.all([
    col.countDocuments({
      whatsappCheckoutReminderStatus: 'sent',
      whatsappCheckoutReminderSentAt: { $gte: startOfToday },
    }),
    col.countDocuments({
      whatsappCheckoutReminderStatus: 'sent',
      whatsappCheckoutReminderSentAt: { $gte: startOfYesterday, $lt: startOfToday },
    }),
    col.aggregate([
      {
        $match: {
          status: 'active',
          whatsappCheckoutReminderStatus: 'pending',
          phone: { $exists: true, $nin: [null, ''] },
          whatsappCheckoutReminderDueAt: { $lte: now },
        },
      },
      {
        $group: {
          _id: null,
          oldestDue: { $min: '$whatsappCheckoutReminderDueAt' },
          newestDue: { $max: '$whatsappCheckoutReminderDueAt' },
        },
      },
    ]).toArray(),
  ]);

  console.log(`Sent today: ${sentToday}`);
  console.log(`Sent yesterday: ${sentYesterday}`);
  if (dueMeta[0]) {
    console.log(`Oldest due: ${dueMeta[0].oldestDue}`);
    console.log(`Newest due: ${dueMeta[0].newestDue}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
