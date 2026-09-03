import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailMarketingCampaign from '@/models/EmailMarketingCampaign';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { uniqueDailyTimes } from '@/lib/emailMarketingSchedule';
import { getPresetBlocks } from '@/lib/emailCampaignPresets';
import { assertMarketingRecipientLimit } from '@/lib/emailMarketingLimits';

export const dynamic = 'force-dynamic';

async function getSellerContext(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
    const storeId = await authSeller(decoded.uid);
    if (!storeId) return null;
    return { storeId, uid: decoded.uid };
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const seller = await getSellerContext(request);
    if (!seller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get('status') || 'active').trim();
    const query = { storeId: seller.storeId };
    if (status !== 'all') query.status = status;

    const campaigns = await EmailMarketingCampaign.find(query)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ success: true, campaigns });
  } catch (error) {
    console.error('[email-marketing campaigns GET]', error);
    return NextResponse.json({ error: error.message || 'Failed to load campaigns' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const seller = await getSellerContext(request);
    if (!seller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const scheduleMode = body.scheduleMode === 'once' ? 'once' : 'daily';
    const recipientCheck = assertMarketingRecipientLimit(body.customerEmails);
    if (!recipientCheck.ok) {
      return NextResponse.json({
        error: recipientCheck.error,
        maxRecipients: recipientCheck.max,
        recipientCount: recipientCheck.count,
      }, { status: 400 });
    }
    const customerEmails = recipientCheck.emails;

    if (!customerEmails.length) {
      return NextResponse.json({ error: 'Select at least one customer email' }, { status: 400 });
    }

    let blocks = Array.isArray(body.blocks) ? body.blocks : [];
    if (!blocks.length && body.templateId) {
      blocks = getPresetBlocks(body.templateId) || [];
    }

    const subject = String(body.subject || '').trim();
    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    if (!blocks.length && !body.customTemplateId && !body.templateId) {
      return NextResponse.json({ error: 'Choose a template or build email content' }, { status: 400 });
    }

    const dailyTimes = uniqueDailyTimes(body.dailyTimes || body.autoTimes || ['09:00']);
    const onceAtList = (Array.isArray(body.onceAtList) ? body.onceAtList : [])
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));

    if (scheduleMode === 'daily' && !dailyTimes.length) {
      return NextResponse.json({ error: 'Add at least one daily send time (HH:mm)' }, { status: 400 });
    }
    if (scheduleMode === 'once' && !onceAtList.length) {
      return NextResponse.json({ error: 'Add at least one schedule datetime' }, { status: 400 });
    }

    await connectDB();

    const campaign = await EmailMarketingCampaign.create({
      storeId: seller.storeId,
      name: String(body.name || subject).trim() || 'Daily campaign',
      status: 'active',
      scheduleMode,
      onceAtList: scheduleMode === 'once' ? onceAtList : [],
      dailyTimes: scheduleMode === 'daily' ? dailyTimes : [],
      timezone: String(body.timezone || 'Asia/Dubai').trim() || 'Asia/Dubai',
      audience: String(body.audience || 'all').trim() || 'all',
      customerEmails,
      templateId: String(body.templateId || '').trim(),
      customTemplateId: String(body.customTemplateId || '').trim(),
      subject,
      preheader: String(body.preheader || '').trim(),
      blocks,
      createdBy: seller.uid,
    });

    return NextResponse.json({
      success: true,
      campaign,
      message: scheduleMode === 'daily'
        ? `Daily campaign active. Sends at ${dailyTimes.join(', ')} (Asia/Dubai) until you disable it.`
        : `Scheduled campaign queued for ${onceAtList.length} send time${onceAtList.length === 1 ? '' : 's'}.`,
    }, { status: 201 });
  } catch (error) {
    console.error('[email-marketing campaigns POST]', error);
    return NextResponse.json({ error: error.message || 'Failed to create campaign' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const seller = await getSellerContext(request);
    if (!seller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Campaign id is required' }, { status: 400 });
    }

    await connectDB();
    const campaign = await EmailMarketingCampaign.findOne({
      _id: id,
      storeId: seller.storeId,
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const action = String(body.action || body.status || '').trim().toLowerCase();
    if (action === 'stop' || action === 'stopped' || action === 'disable') {
      campaign.status = 'stopped';
      campaign.stoppedAt = new Date();
    } else if (action === 'pause' || action === 'paused') {
      campaign.status = 'paused';
    } else if (action === 'resume' || action === 'active' || action === 'enable') {
      campaign.status = 'active';
      campaign.stoppedAt = null;
    } else if (Array.isArray(body.dailyTimes)) {
      const times = uniqueDailyTimes(body.dailyTimes);
      if (!times.length) {
        return NextResponse.json({ error: 'Add at least one valid daily time' }, { status: 400 });
      }
      campaign.dailyTimes = times;
    } else {
      return NextResponse.json({ error: 'Unknown action. Use stop, pause, or resume.' }, { status: 400 });
    }

    await campaign.save();
    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error('[email-marketing campaigns PATCH]', error);
    return NextResponse.json({ error: error.message || 'Failed to update campaign' }, { status: 500 });
  }
}
