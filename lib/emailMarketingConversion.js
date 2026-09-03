import connectDB from '@/lib/mongodb';
import EmailHistory from '@/models/EmailHistory';
import EmailMarketingLead from '@/models/EmailMarketingLead';
import { normalizeEmail } from '@/lib/orderIdentity';

const CLICK_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

async function findPromotionalEmailHistory({ storeId, email, trackingToken }) {
  const token = String(trackingToken || '').trim();
  if (token) {
    const byToken = await EmailHistory.findOne({
      storeId,
      trackingToken: token,
      type: 'promotional',
    }).lean();
    if (byToken) return byToken;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const cutoff = new Date(Date.now() - CLICK_LOOKBACK_MS);
  return EmailHistory.findOne({
    storeId,
    recipientEmail: normalizedEmail,
    type: 'promotional',
    clickCount: { $gt: 0 },
    lastClickedAt: { $gte: cutoff },
  })
    .sort({ lastClickedAt: -1 })
    .lean();
}

/**
 * When a customer places an order after clicking a marketing email,
 * mark the send as converted and surface the buyer on Email Marketing → Leads.
 */
export async function recordEmailMarketingOrderConversion({
  storeId,
  email,
  orderId,
  orderTotal,
  trackingToken,
} = {}) {
  if (!storeId || !orderId) return null;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  await connectDB();

  const emailHistory = await findPromotionalEmailHistory({
    storeId,
    email: normalizedEmail,
    trackingToken,
  });

  if (!emailHistory?._id) return null;

  const now = new Date();
  const orderIdStr = String(orderId);
  const total = Number(orderTotal);
  const safeTotal = Number.isFinite(total) ? total : null;

  await EmailHistory.updateOne(
    { _id: emailHistory._id, convertedAt: null },
    {
      $set: {
        convertedAt: now,
        convertedOrderId: orderIdStr,
        convertedOrderTotal: safeTotal,
        updatedAt: now,
      },
    },
  );

  const leadFields = {
    status: 'converted',
    convertedAt: now,
    convertedOrderId: orderIdStr,
    convertedOrderTotal: safeTotal,
    emailHistoryId: String(emailHistory._id),
    lastSubmittedAt: now,
    source: 'email_campaign',
    campaignName: String(emailHistory.subject || '').trim(),
  };

  const lead = await EmailMarketingLead.findOneAndUpdate(
    { storeId, email: normalizedEmail },
    {
      $set: leadFields,
      $setOnInsert: {
        storeId,
        email: normalizedEmail,
        submittedCount: 1,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  ).lean();

  return { emailHistory, lead };
}
