import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import User from '@/models/User';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  aggregateAllStoreCustomers,
  enrichCustomersWithUsers,
} from '@/lib/storeCustomersApi';
import {
  EMAIL_AUDIENCES,
  filterCustomersByEmailAudience,
  normalizeEmailAudience,
  summarizeEmailAudiences,
  toEmailAudienceRecipient,
  dedupeEmailAudienceRecipients,
} from '@/lib/emailAudiences';

async function getStoreId(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
    return authSeller(decoded.uid);
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const audience = normalizeEmailAudience(searchParams.get('audience') || 'all');
    const includeCustomers = searchParams.get('customers') !== '0';

    await connectDB();

    const rawCustomers = await aggregateAllStoreCustomers(Order, storeId, { view: 'all' });
    const registeredIds = rawCustomers
      .filter((customer) => !customer.isGuest && customer.userId)
      .map((customer) => String(customer.userId));

    const profileUsers = registeredIds.length
      ? await User.find({ _id: { $in: registeredIds } })
        .select('_id name email image emailPreferences')
        .lean()
      : [];

    const enriched = enrichCustomersWithUsers(
      rawCustomers.map((customer) => ({
        ...customer,
        id: customer.id || customer._id,
        latestCountry: customer.latestCountry,
        latestPhoneCode: customer.latestPhoneCode,
      })),
      profileUsers,
    );

    const emails = Array.from(
      new Set(
        enriched
          .map((customer) => String(customer.email || '').trim().toLowerCase())
          .filter((email) => email.includes('@')),
      ),
    );

    const unsubscribedUsers = await User.find({
      'emailPreferences.promotional': false,
    })
      .select('email emailPreferences')
      .lean();

    const optOutByEmail = new Set(
      unsubscribedUsers
        .map((user) => String(user.email || '').trim().toLowerCase())
        .filter((email) => email.includes('@')),
    );

    const withPrefs = enriched.map((customer) => {
      const email = String(customer.email || '').trim().toLowerCase();
      const promotionalOptOut = optOutByEmail.has(email);
      return {
        ...customer,
        promotionalOptOut,
        emailPreferences: {
          promotional: promotionalOptOut ? false : true,
        },
      };
    });

    const audiences = summarizeEmailAudiences(withPrefs);
    const filtered = dedupeEmailAudienceRecipients(
      filterCustomersByEmailAudience(withPrefs, audience).map(toEmailAudienceRecipient),
    );

    return NextResponse.json({
      success: true,
      audience,
      audiences: includeCustomers ? audiences : EMAIL_AUDIENCES,
      customers: includeCustomers ? filtered : undefined,
      count: filtered.length,
    });
  } catch (error) {
    console.error('[email-marketing audiences]', error);
    return NextResponse.json({ error: error.message || 'Failed to load audiences' }, { status: 500 });
  }
}
