import { NextResponse } from 'next/server';

const ALLOWED_HOST_SUFFIXES = [
  'store1920.com',
  'store1920.store',
  'amazonaws.com',
  'imagekit.io',
  'ik.imagekit.io',
  'googleusercontent.com',
  'cloudfront.net',
  'digitaloceanspaces.com',
  'cdn.shopify.com',
  'supabase.co',
  'r2.dev',
  'localhost',
];

function isAllowedMediaUrl(raw = '', requestHost = '') {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (requestHost && host === String(requestHost).toLowerCase()) return true;
    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/**
 * Same-origin image proxy for email builder preview iframes.
 * about:blank / srcdoc previews often fail to load S3/CDN images due to referrer rules.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = String(searchParams.get('url') || '').trim();
    const requestHost = request.headers.get('host')?.split(':')[0] || '';
    if (!target || !isAllowedMediaUrl(target, requestHost)) {
      return NextResponse.json({ error: 'Invalid media URL' }, { status: 400 });
    }

    const upstream = await fetch(target, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Store1920EmailPreview/1.0',
      },
      redirect: 'follow',
      cache: 'force-cache',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 415 });
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('[email-marketing media proxy]', error);
    return NextResponse.json({ error: 'Failed to load media' }, { status: 500 });
  }
}
