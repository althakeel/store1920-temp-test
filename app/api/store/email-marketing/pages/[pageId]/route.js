import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
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

export async function GET(_request, { params }) {
  try {
    const auth = await requireSeller(_request);
    if (auth.error) return auth.error;

    const { pageId } = await params;
    if (!pageId || !mongoose.Types.ObjectId.isValid(pageId)) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }

    await connectDB();
    const page = await EmailCampaignPage.findOne({
      _id: pageId,
      storeId: resolveStoreObjectId(auth.storeId),
    }).lean();

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, page: toStoreCampaignPage(page) });
  } catch (error) {
    console.error('[email-marketing pages GET id]', error);
    return NextResponse.json({ error: error.message || 'Failed to load page' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await requireSeller(request);
    if (auth.error) return auth.error;

    const { pageId } = await params;
    if (!pageId || !mongoose.Types.ObjectId.isValid(pageId)) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }

    const body = await request.json();
    await connectDB();
    const storeObjectId = resolveStoreObjectId(auth.storeId);
    const page = await EmailCampaignPage.findOne({ _id: pageId, storeId: storeObjectId });
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    if (body.title !== undefined) {
      const title = String(body.title || '').trim();
      if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      page.title = title;
    }
    if (body.titleAr !== undefined) page.titleAr = String(body.titleAr || '').trim();
    if (body.subtitle !== undefined) page.subtitle = String(body.subtitle || '').trim();
    if (body.subtitleAr !== undefined) page.subtitleAr = String(body.subtitleAr || '').trim();
    if (body.heroImage !== undefined) page.heroImage = String(body.heroImage || '').trim();
    if (body.ctaLabel !== undefined) page.ctaLabel = String(body.ctaLabel || '').trim();
    if (body.ctaUrl !== undefined) page.ctaUrl = String(body.ctaUrl || '').trim();
    if (body.backgroundColor !== undefined) {
      page.backgroundColor = String(body.backgroundColor || '#f8fafc').trim() || '#f8fafc';
    }
    if (body.accentColor !== undefined) {
      page.accentColor = String(body.accentColor || '#0f766e').trim() || '#0f766e';
    }
    if (body.seoTitle !== undefined) page.seoTitle = String(body.seoTitle || '').trim();
    if (body.seoDescription !== undefined) page.seoDescription = String(body.seoDescription || '').trim();
    if (body.productIds !== undefined) {
      const productIds = normalizeCampaignPageProductIds(body.productIds);
      if (!productIds.length) {
        return NextResponse.json({ error: 'Select at least one product' }, { status: 400 });
      }
      page.productIds = productIds;
    }
    if (body.slug !== undefined || body.title !== undefined) {
      const desired = body.slug
        ? slugifyCampaignPageTitle(body.slug)
        : slugifyCampaignPageTitle(page.slug || page.title);
      page.slug = await ensureUniqueCampaignPageSlug(
        EmailCampaignPage,
        storeObjectId,
        desired,
        page._id,
      );
    }
    if (body.status !== undefined) {
      const nextStatus = body.status === 'published' ? 'published' : 'draft';
      if (nextStatus === 'published' && page.status !== 'published') {
        page.publishedAt = new Date();
      }
      if (nextStatus === 'draft') page.publishedAt = page.publishedAt || null;
      page.status = nextStatus;
    }

    await page.save();
    return NextResponse.json({ success: true, page: toStoreCampaignPage(page.toObject()) });
  } catch (error) {
    console.error('[email-marketing pages PATCH]', error);
    return NextResponse.json({ error: error.message || 'Failed to update page' }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const auth = await requireSeller(_request);
    if (auth.error) return auth.error;

    const { pageId } = await params;
    if (!pageId || !mongoose.Types.ObjectId.isValid(pageId)) {
      return NextResponse.json({ error: 'Invalid page id' }, { status: 400 });
    }

    await connectDB();
    const deleted = await EmailCampaignPage.findOneAndDelete({
      _id: pageId,
      storeId: resolveStoreObjectId(auth.storeId),
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[email-marketing pages DELETE]', error);
    return NextResponse.json({ error: error.message || 'Failed to delete page' }, { status: 500 });
  }
}
