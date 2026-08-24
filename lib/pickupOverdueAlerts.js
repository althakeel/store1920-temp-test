import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';
import { findOverduePickupOrders } from '@/lib/storePickupQueue';
import { sendAdminPickupOverdueEmail } from '@/lib/email';

/**
 * Find pickups waiting 24h+, email admin once per order, mark notified.
 */
export async function runPickupOverdueAlerts({ dryRun = false, limit = 100 } = {}) {
  await dbConnect();

  const { count, orders, rawOrders, cutoff } = await findOverduePickupOrders({
    onlyUnnotified: true,
    limit,
  });

  if (!count) {
    return {
      scanned: 0,
      emailed: 0,
      skipped: 0,
      dryRun: Boolean(dryRun),
      cutoff,
    };
  }

  if (dryRun) {
    return {
      scanned: count,
      emailed: 0,
      skipped: 0,
      dryRun: true,
      cutoff,
      sample: orders.slice(0, 10),
    };
  }

  let emailed = 0;
  let skipped = 0;
  const now = new Date();

  try {
    await sendAdminPickupOverdueEmail({
      orders: rawOrders,
      cutoff,
    });
    emailed = 1;
  } catch (error) {
    console.error('[pickup-overdue] admin email failed', error?.message || error);
    skipped = 1;
    return {
      scanned: count,
      emailed: 0,
      skipped,
      dryRun: false,
      cutoff,
      error: error?.message || 'email_failed',
    };
  }

  const ids = rawOrders.map((order) => order._id).filter(Boolean);
  if (ids.length) {
    await Order.updateMany(
      { _id: { $in: ids } },
      { $set: { 'waslah.pickupOverdueNotifiedAt': now } },
    );
  }

  return {
    scanned: count,
    emailed,
    notifiedOrders: ids.length,
    skipped,
    dryRun: false,
    cutoff,
  };
}
