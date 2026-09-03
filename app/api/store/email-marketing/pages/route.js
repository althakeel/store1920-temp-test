import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailCampaignPage from '@/models/EmailCampaignPage';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import {
  ensureUniqueCampaignPageSlug,
  normalizeCampaignPageProductIds,
  resolveStoreObjectId,
  slugifyCampaignPageTitle,
  toStoreCampaignPage,
} from '@/lib/emailCampaignPageHelpers';

export const dynamic = 'force-dynamic';

async function requireSeller(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    const storeId = await authSeller(decoded.uid);
    if (!storeId) {
      return { error: NextResponse.json({ error: 'Not authorized as seller' }, { status: 403 }) };
    }
    return { storeId, uid: decoded.uid };
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

function parseBody(body = {}) {
  const title = String(body.title || '').trim();
  const status = body.status === 'published' ? 'published' : 'draft';
  return {
    title,
    titleAr: String(body.titleAr || '').trim(),
    subtitle: String(body.subtitle || '').trim(),
    subtitleAr: String(body.subtitleAr || '').trim(),
    heroImage: String(body.heroImage || '').trim(),
    productIds: normalizeCampaignPageProductIds(body.productIds),
    ctaLabel: String(body.ctaLabel || '').trim(),
    ctaUrl: String(body.ctaUrl || '').trim(),
    backgroundColor: String(body.backgroundColor || '#f8fafc').trim() || '#f8fafc',
    accentColor: String(body.accentColor || '#0f766e').trim() || '#0f766e',
    status,
    seoTitle: String(body.seoTitle || '').trim(),
    seoDescription: String(body.seoDescription || '').trim(),
    desiredSlug: body.slug ? slugifyCampaignPageTitle(body.slug) : '',
  };
}

export async function GET(request) {
  try {
    const auth = await requireSeller(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get('status') || '').trim();

    await connectDB();
    const filter = { storeId: resolveStoreObjectId(auth.storeId) };
    if (status === 'draft' || status === 'published') filter.status = status;

    const pages = await EmailCampaignPage.find(filter)
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      success: true,
      pages: pages.map(toStoreCampaignPage),
    });
  } catch (error) {
    console.error('[email-marketing pages GET]', error);
    return NextResponse.json({ error: error.message || 'Failed to load pages' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await requireSeller(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = parseBody(body);
    if (!parsed.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!parsed.productIds.length) {
      return NextResponse.json({ error: 'Select at least one product' }, { status: 400 });
    }

    await connectDB();
    const storeObjectId = resolveStoreObjectId(auth.storeId);
    const slug = await ensureUniqueCampaignPageSlug(
      EmailCampaignPage,
      storeObjectId,
      parsed.desiredSlug || parsed.title,
    );

    const page = await EmailCampaignPage.create({
      storeId: storeObjectId,
      title: parsed.title,
      titleAr: parsed.titleAr,
      slug,
      subtitle: parsed.subtitle,
      subtitleAr: parsed.subtitleAr,
      heroImage: parsed.heroImage,
      productIds: parsed.productIds,
      ctaLabel: parsed.ctaLabel,
      ctaUrl: parsed.ctaUrl,
      backgroundColor: parsed.backgroundColor,
      accentColor: parsed.accentColor,
      status: parsed.status,
      publishedAt: parsed.status === 'published' ? new Date() : null,
      seoTitle: parsed.seoTitle,
      seoDescription: parsed.seoDescription,
      createdBy: auth.uid || '',
    });

    return NextResponse.json({
      success: true,
      page: toStoreCampaignPage(page.toObject()),
    }, { status: 201 });
  } catch (error) {
    console.error('[email-marketing pages POST]', error);
    return NextResponse.json({ error: error.message || 'Failed to create page' }, { status: 500 });
  }
}
