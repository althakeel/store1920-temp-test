import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Store from '@/models/Store';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';

const MAX_LIBRARY = 200;

function cleanUrls(urls = []) {
  const seen = new Set();
  const next = [];
  (Array.isArray(urls) ? urls : []).forEach((item) => {
    const url = String(item || '').trim();
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    next.push(url);
  });
  return next.slice(0, MAX_LIBRARY);
}

async function resolveStore(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
    const storeId = await authSeller(decoded.uid);
    if (!storeId) return null;
    await connectDB();
    return Store.findById(storeId);
  } catch {
    return null;
  }
}

export async function GET(request) {
  try {
    const store = await resolveStore(request);
    if (!store) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({
      success: true,
      images: cleanUrls(store.emailMarketingImageLibrary),
    });
  } catch (error) {
    console.error('[email-marketing library GET]', error);
    return NextResponse.json({ error: 'Failed to load image library' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const store = await resolveStore(request);
    if (!store) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const incoming = Array.isArray(body.images)
      ? body.images
      : [body.url, body.image].filter(Boolean);

    const merged = cleanUrls([...incoming, ...(store.emailMarketingImageLibrary || [])]);
    store.emailMarketingImageLibrary = merged;
    await store.save();

    return NextResponse.json({ success: true, images: merged });
  } catch (error) {
    console.error('[email-marketing library POST]', error);
    return NextResponse.json({ error: 'Failed to save image library' }, { status: 500 });
  }
}
