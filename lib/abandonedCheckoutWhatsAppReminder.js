import connectDB from '@/lib/mongodb';
import AbandonedCart from '@/models/AbandonedCart';
import { sendAbandonedCartWhatsAppReminder } from '@/lib/whatsapp/abandonedCartMessaging';
import { formatWhatsAppErrorMessage } from '@/lib/whatsapp/formatWhatsAppError';

export const ABANDONED_CART_WHATSAPP_DELAY_MS = Number(
  process.env.ABANDONED_CART_WHATSAPP_DELAY_MS
  || process.env.ABANDONED_CHECKOUT_WHATSAPP_DELAY_MS
  || 5 * 60 * 1000
);

const TRACKED_SOURCES = ['checkout', 'cart', 'guest-cart'];
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const NOT_DELETED = { deletedAt: { $in: [null, undefined] } };
const MAX_REMINDER_AGE_MS = Number(
  process.env.ABANDONED_CART_WHATSAPP_MAX_AGE_MS || 7 * 24 * 60 * 60 * 1000
);

export function isAbandonedCartWhatsAppAutoSendEnabled() {
  const raw = process.env.ABANDONED_CART_WHATSAPP_AUTO_SEND
    ?? process.env.ABANDONED_CHECKOUT_WHATSAPP_AUTO_SEND
    ?? 'true';
  const flag = String(raw).toLowerCase();
  return flag !== 'false' && flag !== '0';
}

export function getAbandonedCartWhatsAppDueAt(fromDate = new Date()) {
  return new Date(fromDate.getTime() + ABANDONED_CART_WHATSAPP_DELAY_MS);
}

export function getWhatsAppVariantForAbandonedSource(source = '') {
  return source === 'checkout' ? 'checkout' : 'cart';
}

export async function scheduleAbandonedCartWhatsAppReminder(filter, { now = new Date(), phone } = {}) {
  const normalizedPhone = String(phone || '').trim();
  if (!normalizedPhone || !isAbandonedCartWhatsAppAutoSendEnabled()) {
    return;
  }

  await AbandonedCart.updateOne(
    {
      ...filter,
      status: 'active',
      whatsappCheckoutReminderStatus: { $nin: ['sent', 'processing'] },
    },
    {
      $set: {
        whatsappCheckoutReminderDueAt: getAbandonedCartWhatsAppDueAt(now),
        whatsappCheckoutReminderStatus: 'pending',
        whatsappCheckoutReminderError: null,
      },
    }
  );
}

export function queueAbandonedCartWhatsAppDrain({ limit = 8 } = {}) {
  if (!isAbandonedCartWhatsAppAutoSendEnabled()) return;

  const run = async () => {
    try {
      await connectDB();
      await processDueAbandonedCartWhatsAppReminders({ limit });
    } catch (error) {
      console.error('[abandoned-whatsapp] drain failed:', error);
    }
  };

  void import('next/server')
    .then(({ after }) => {
      if (typeof after !== 'function') {
        void run();
        return;
      }
      try {
        after(run);
      } catch {
        void run();
      }
    })
    .catch((error) => {
      console.warn('[abandoned-whatsapp] after() unavailable, running inline:', error?.message || error);
      void run();
    });
}

async function recoverAbandonedCartWhatsAppQueue(now = new Date()) {
  const minLastSeen = new Date(now.getTime() - MAX_REMINDER_AGE_MS);

  await AbandonedCart.updateMany(
    {
      status: 'active',
      source: { $in: TRACKED_SOURCES },
      whatsappCheckoutReminderStatus: 'processing',
      updatedAt: { $lte: new Date(now.getTime() - STALE_PROCESSING_MS) },
      ...NOT_DELETED,
    },
    { $set: { whatsappCheckoutReminderStatus: 'pending' } },
  );

  await AbandonedCart.updateMany(
    {
      status: 'active',
      source: { $in: TRACKED_SOURCES },
      whatsappCheckoutReminderStatus: 'pending',
      lastSeenAt: { $lt: minLastSeen },
      ...NOT_DELETED,
    },
    {
      $set: {
        whatsappCheckoutReminderStatus: 'skipped',
        whatsappCheckoutReminderError: 'Customer left too long ago to send reminder',
      },
    },
  );

  await AbandonedCart.updateMany(
    {
      status: 'active',
      source: { $in: TRACKED_SOURCES },
      phone: { $exists: true, $nin: [null, ''] },
      lastSeenAt: { $gte: minLastSeen },
      ...NOT_DELETED,
      $or: [
        { whatsappCheckoutReminderStatus: null },
        { whatsappCheckoutReminderStatus: { $exists: false } },
      ],
    },
    {
      $set: {
        whatsappCheckoutReminderStatus: 'pending',
        whatsappCheckoutReminderDueAt: now,
      },
    },
  );
}

// Backward-compatible aliases
export const ABANDONED_CHECKOUT_WHATSAPP_DELAY_MS = ABANDONED_CART_WHATSAPP_DELAY_MS;
export const isAbandonedCheckoutWhatsAppAutoSendEnabled = isAbandonedCartWhatsAppAutoSendEnabled;
export const getAbandonedCheckoutWhatsAppDueAt = getAbandonedCartWhatsAppDueAt;

export async function processDueAbandonedCartWhatsAppReminders({ limit = 25 } = {}) {
  if (!isAbandonedCartWhatsAppAutoSendEnabled()) {
    return { processed: 0, results: [], disabled: true };
  }

  const now = new Date();
  await recoverAbandonedCartWhatsAppQueue(now);

  const dueCarts = await AbandonedCart.find({
    status: 'active',
    source: { $in: TRACKED_SOURCES },
    phone: { $exists: true, $nin: [null, ''] },
    whatsappCheckoutReminderStatus: 'pending',
    whatsappCheckoutReminderDueAt: { $lte: now },
    lastSeenAt: { $gte: new Date(now.getTime() - MAX_REMINDER_AGE_MS) },
    ...NOT_DELETED,
  })
    .sort({ whatsappCheckoutReminderDueAt: 1 })
    .limit(limit)
    .lean();

  const results = [];

  for (const dueCart of dueCarts) {
    const claimed = await AbandonedCart.findOneAndUpdate(
      {
        _id: dueCart._id,
        status: 'active',
        source: { $in: TRACKED_SOURCES },
        whatsappCheckoutReminderStatus: 'pending',
        whatsappCheckoutReminderDueAt: { $lte: now },
        lastSeenAt: { $gte: new Date(now.getTime() - MAX_REMINDER_AGE_MS) },
        ...NOT_DELETED,
      },
      { $set: { whatsappCheckoutReminderStatus: 'processing' } },
      { new: true }
    ).lean();

    if (!claimed) continue;

    const variant = getWhatsAppVariantForAbandonedSource(claimed.source);

    try {
      const whatsapp = await sendAbandonedCartWhatsAppReminder(claimed, { variant });
      const sentAt = new Date();

      if (whatsapp?.success) {
        await AbandonedCart.updateOne(
          { _id: claimed._id },
          {
            $set: {
              whatsappCheckoutReminderStatus: 'sent',
              whatsappCheckoutReminderSentAt: sentAt,
              whatsappCheckoutReminderError: null,
            },
          }
        );
        results.push({ cartId: String(claimed._id), source: claimed.source, variant, success: true });
        continue;
      }

      const status = whatsapp?.skipped ? 'skipped' : 'failed';
      const error = formatWhatsAppErrorMessage(whatsapp?.reason || whatsapp?.error || 'WhatsApp send failed');

      await AbandonedCart.updateOne(
        { _id: claimed._id },
        {
          $set: {
            whatsappCheckoutReminderStatus: status,
            whatsappCheckoutReminderError: error,
          },
        }
      );
      results.push({
        cartId: String(claimed._id),
        source: claimed.source,
        variant,
        success: false,
        status,
        error,
      });
    } catch (error) {
      const errorText = formatWhatsAppErrorMessage(error?.message || error || 'WhatsApp send failed');
      await AbandonedCart.updateOne(
        { _id: claimed._id },
        {
          $set: {
            whatsappCheckoutReminderStatus: 'failed',
            whatsappCheckoutReminderError: errorText,
          },
        }
      );
      results.push({
        cartId: String(claimed._id),
        source: claimed.source,
        variant,
        success: false,
        status: 'failed',
        error: errorText,
      });
    }
  }

  return { processed: results.length, results };
}

export const processDueAbandonedCheckoutWhatsAppReminders = processDueAbandonedCartWhatsAppReminders;
