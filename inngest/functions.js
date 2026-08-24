import {inngest} from './client'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'
import Coupon from '@/models/Coupon'
import Store from '@/models/Store'
import EmailHistory from '@/models/EmailHistory'
import mongoose from 'mongoose'

// Inngest Function to save user data to a database
export const syncUserCreation = inngest.createFunction(
    {id: 'sync-user-create'},
 
    async ({ event }) => {
        await connectDB();
        const {data} = event
        await User.create({
            _id: data.id,
            email: data.email_addresses[0].email_address,
            name: `${data.first_name} ${data.last_name}`,
            image: data.image_url,
        })
    }
)

// Inngest Function to update user data in database 
export const syncUserUpdation = inngest.createFunction(
    {id: 'sync-user-update'},

    async ({ event }) => {
        await connectDB();
        const { data } = event
        await User.findByIdAndUpdate(data.id, {
            email: data.email_addresses[0].email_address,
            name: `${data.first_name} ${data.last_name}`,
            image: data.image_url,
        })
    }
)

// Inngest Function to delete user from database
export const syncUserDeletion = inngest.createFunction(
    {id: 'sync-user-delete'},
 
    async ({ event }) => {
        await connectDB();
        const { data } = event
        await User.findByIdAndDelete(data.id)
    }
)

// Inngest Function to delete coupon on expiry
export const deleteCouponOnExpiry = inngest.createFunction(
    {id: 'delete-coupon-on-expiry'},
    { event: 'app/coupon.expired' },
    async ({ event, step }) => {
        const { data } = event
        const expiryDate = new Date(data.expires_at)
        await step.sleepUntil('wait-for-expiry', expiryDate)

        await step.run('delete-coupon-from-database', async () => {
            await connectDB();
            await Coupon.findOneAndDelete({ code: data.code })
        })
    }
)

// Durable automatic EMX fulfillment for newly enrolled COD/verified-paid orders.
export const autoShipWaslahOrder = inngest.createFunction(
    {
        id: 'auto-ship-waslah-order',
        retries: 5,
        concurrency: { limit: 1, key: 'event.data.orderId' },
    },
    { event: 'app/order.ready-for-waslah' },
    async ({ event, step }) => step.run('create-emx-shipment-and-awb', async () => {
        const { processWaslahAutoShipment } = await import('@/lib/waslahAutoShipment');
        const result = await processWaslahAutoShipment(event.data.orderId, {
            source: event.data.source || 'inngest',
        });
        if (result?.retryable) {
            throw new Error(result.error || 'Retryable automatic EMX shipment failure');
        }
        return result;
    }),
)

// Sweep only explicitly enrolled new orders whose first event was missed, a
// retry became due, or a worker lease expired. The per-order database lease in
// processWaslahAutoShipment keeps this safe alongside the event-driven worker.
export const recoverWaslahAutoShipments = inngest.createFunction(
    {
        id: 'recover-waslah-auto-shipments',
        retries: 2,
        concurrency: { limit: 1 },
    },
    { cron: '*/5 * * * *' },
    async ({ step }) => step.run('recover-due-emx-shipments', async () => {
        const { processDueWaslahAutoShipments } = await import('@/lib/waslahAutoShipment');
        return processDueWaslahAutoShipments({ limit: 10 });
    }),
)

export const sendAbandonedCartWhatsAppReminders = inngest.createFunction(
    {
        id: 'send-abandoned-cart-whatsapp-reminders',
        retries: 2,
        concurrency: { limit: 1 },
    },
    { cron: '*/2 * * * *' },
    async ({ step }) => step.run('send-due-abandoned-cart-whatsapp', async () => {
        const { processDueAbandonedCartWhatsAppReminders } = await import('@/lib/abandonedCheckoutWhatsAppReminder');
        return processDueAbandonedCartWhatsAppReminders({ limit: 20 });
    }),
)

// Repair the narrow crash window where provider capture and atomic stock/paid
// state committed, but trusted payment proof was not persisted before the
// process stopped. Only newly enrolled, active, reservation-backed orders are
// considered; provider APIs are re-read before proof can be restored.
export const recoverWaslahPaymentProofs = inngest.createFunction(
    {
        id: 'recover-waslah-payment-proofs',
        retries: 2,
        concurrency: { limit: 1 },
    },
    { cron: '*/10 * * * *' },
    async ({ step }) => {
        const storeIds = await step.run('find-payment-proof-gaps', async () => {
            await connectDB();
            const Order = (await import('@/models/Order')).default;
            const since = new Date(Date.now() - (72 * 60 * 60 * 1000));
            return Order.distinct('storeId', {
                createdAt: { $gte: since },
                status: { $in: ['ORDER_PLACED', 'PROCESSING'] },
                paymentMethod: { $in: ['STRIPE', 'TABBY', 'TAMARA', 'CARD'] },
                'waslah.autoShipEnrolled': true,
                fulfillmentStockReservedAt: { $type: 'date' },
                $or: [
                    { isPaid: true },
                    { paymentStatus: { $in: ['PAID', 'CAPTURED', 'COMPLETED', 'SUCCEEDED', 'SETTLED'] } },
                ],
                paymentStatus: {
                    $not: /^(REFUNDED|PARTIALLY_REFUNDED|DISPUTED|CHARGEBACK|VOID|CANCELLED|CANCELED|EXPIRED)$/i,
                },
                'paymentVerification.status': {
                    $not: /^(VERIFIED|REVERSED|REVOKED)$/i,
                },
            });
        });

        const results = [];
        for (const storeId of storeIds.slice(0, 20)) {
            results.push(await step.run(`reconcile-payment-proof-${String(storeId)}`, async () => {
                const { reconcileStoreOrderPayments } = await import('@/lib/orderPaymentReconciliation');
                return reconcileStoreOrderPayments(String(storeId), { hours: 72, limit: 30 });
            }));
        }
        return { stores: storeIds.length, results };
    },
)

// Re-check failed/pending Tabby/Tamara/Stripe/card payments every 5 minutes
// even when the seller dashboard is closed (browser only runs while /store/orders is open).
export const reconcileFailedOnlinePayments = inngest.createFunction(
    {
        id: 'reconcile-failed-online-payments',
        retries: 2,
        concurrency: { limit: 1 },
    },
    { cron: '*/5 * * * *' },
    async ({ step }) => step.run('reconcile-all-stores', async () => {
        await connectDB();
        const { reconcileFailedOnlinePaymentsForAllStores } = await import('@/lib/orderPaymentReconciliation');
        return reconcileFailedOnlinePaymentsForAllStores({
            hours: 72,
            limitPerStore: 60,
            maxStores: 20,
        });
    }),
)


// Inngest Function to send daily promotional emails
export const sendDailyPromotionalEmail = inngest.createFunction(
    { id: 'send-daily-promotional-email' },
    { cron: '30 16 * * *' },
    async ({ step }) => {
        const storeObjectId = await step.run('resolve-store-id', async () => {
            await connectDB();
            const envStoreId = process.env.PROMOTIONAL_STORE_ID;
            let storeId = envStoreId;
            if (!storeId) {
                const store = await Store.findOne({}).select('_id').lean();
                storeId = store?._id?.toString();
            }
            if (!storeId) return null;
            return new mongoose.Types.ObjectId(storeId);
        });

        const template = await step.run('get-random-template', async () => {
            const { getRandomTemplate } = await import('@/lib/promotionalEmailTemplates');
            return getRandomTemplate();
        });
        const customers = await step.run('fetch-customers', async () => {
            await connectDB();
            const users = await User.find({
                email: { $exists: true, $ne: null, $ne: '' },
                'emailPreferences.promotional': { $ne: false }
            }).lean();
            return users;
        });
        const products = await step.run('fetch-products', async () => {
            await connectDB();
            const Product = (await import('@/models/Product')).default;
            const featuredProducts = await Product.find({ inStock: true, stockQuantity: { $gt: 0 } }).sort({ createdAt: -1 }).limit(4).select('_id name slug AED price images description category stockQuantity').lean();
            return featuredProducts.map(p => ({ 
              id: p._id.toString(), 
              slug: p.slug, 
              name: p.name,
              description: p.description || '',
              category: p.category || 'Product',
              price: p.price, 
              originalPrice: p.AED || null, 
              image: p.images?.[0],
              images: p.images || [],
              stock: p.stockQuantity || 0
            }));
        });
        const emailResults = await step.run('send-emails', async () => {
            const { sendMail } = await import('@/lib/email');
            const results = [];
            for (const customer of customers) {
                try {
                    // Personalize subject with customer name
                    const customerFirstName = customer.name ? customer.name.split(' ')[0] : 'there';
                    const personalizedSubject = `HEY ${customerFirstName.toUpperCase()}! ${template.subject}`;
                    
                    await sendMail({ to: customer.email, subject: personalizedSubject, html: template.template(products), fromType: 'marketing' });
                    if (storeObjectId) {
                        try {
                            await EmailHistory.create({
                                storeId: storeObjectId,
                                type: 'promotional',
                                recipientEmail: customer.email,
                                recipientName: customer.name || 'Customer',
                                subject: personalizedSubject,
                                status: 'sent',
                                customMessage: `template:${template.id}`,
                                sentAt: new Date()
                            });
                        } catch (historyError) {
                            console.error('[promotional-email] Failed to save email history:', historyError);
                        }
                    }
                    results.push({ email: customer.email, status: 'sent', template: template.id });
                } catch (error) {
                    if (storeObjectId) {
                        try {
                            await EmailHistory.create({
                                storeId: storeObjectId,
                                type: 'promotional',
                                recipientEmail: customer.email,
                                recipientName: customer.name || 'Customer',
                                subject: template.subject,
                                status: 'failed',
                                errorMessage: error.message || 'Unknown error',
                                customMessage: `template:${template.id}`,
                                sentAt: new Date()
                            });
                        } catch (historyError) {
                            console.error('[promotional-email] Failed to save failed email history:', historyError);
                        }
                    }
                    results.push({ email: customer.email, status: 'failed', error: error.message });
                }
            }
            return results;
        });
        return { template: template.id, totalCustomers: customers.length, emailsSent: emailResults.filter(r => r.status === 'sent').length, emailsFailed: emailResults.filter(r => r.status === 'failed').length };
    }
)
