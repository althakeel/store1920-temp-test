import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailMarketingLead from '@/models/EmailMarketingLead';
import { checkRateLimit } from '@/lib/apiSecurity';
import {
  clientIpFromRequest,
  resolvePublicStoreId,
  sanitizeLeadPayload,
  validateLeadContact,
} from '@/lib/emailMarketingLeads';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const ip = clientIpFromRequest(request) || 'unknown';
    const rate = checkRateLimit(`email-leads:${ip}`, 8, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.waitTime || 60) },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const payload = sanitizeLeadPayload(body);
    const validationError = validateLeadContact(payload);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await connectDB();
    const storeId = await resolvePublicStoreId();
    if (!storeId) {
      return NextResponse.json({ error: 'Store not available.' }, { status: 503 });
    }

    const now = new Date();
    const userAgent = String(request.headers.get('user-agent') || '').slice(0, 300);

    const sharedFields = {
      source: payload.source,
      formStyle: payload.formStyle,
      formType: payload.formType,
      heading: payload.heading,
      campaignId: payload.campaignId,
      campaignName: payload.campaignName,
      ip,
      userAgent,
      lastSubmittedAt: now,
      status: 'new',
    };
    if (payload.name) sharedFields.name = payload.name;
    if (payload.phone) sharedFields.phone = payload.phone;

    let lead;
    if (payload.email) {
      lead = await EmailMarketingLead.findOneAndUpdate(
        { storeId, email: payload.email },
        {
          $set: sharedFields,
          $setOnInsert: {
            storeId,
            email: payload.email,
          },
          $inc: { submittedCount: 1 },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      );
    } else {
      lead = await EmailMarketingLead.create({
        storeId,
        email: '',
        name: payload.name,
        phone: payload.phone,
        ...sharedFields,
        submittedCount: 1,
      });
    }

    return NextResponse.json({
      success: true,
      leadId: String(lead._id),
      message: 'Thanks — you are on the list.',
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return NextResponse.json({
        success: true,
        message: 'Thanks — you are already on the list.',
      });
    }
    console.error('[public email-leads POST]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save signup.' },
      { status: 500 },
    );
  }
}
