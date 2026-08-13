import { NextResponse } from 'next/server';
import productRedirects from '@/data/productRedirects.json';
import categoryRedirects from '@/data/categoryRedirects.json';

const PRODUCT_REDIRECT_MAP = new Map(
  Object.entries(productRedirects || {}).map(([key, target]) => [
    String(key || '').trim().toLowerCase(),
    String(target || '').trim(),
  ]),
);

const CATEGORY_REDIRECT_MAP = new Map(
  Object.entries(categoryRedirects || {}).map(([key, target]) => [
    String(key || '').trim().toLowerCase().replace(/^\/+/, '').replace(/^category\//i, ''),
    String(target || '').trim(),
  ]),
);

export function middleware(request) {
  const { pathname, search } = request.nextUrl;

  // Legacy product slugs (WooCommerce / renamed products), incl. trailing slash + ?add-to-cart=
  const productMatch = pathname.match(/^\/(product|products)\/([^/]+)\/?$/i);
  if (productMatch) {
    const slug = decodeURIComponent(productMatch[2] || '').trim().toLowerCase();
    const destination = PRODUCT_REDIRECT_MAP.get(slug);
    if (destination) {
      const url = new URL(destination, request.url);
      // Drop WooCommerce leftovers; never overwrite destination query (e.g. search-results).
      if (search) {
        const params = new URLSearchParams(search);
        params.delete('add-to-cart');
        const kept = params.toString();
        if (kept && !url.search) url.search = kept;
      }
      return NextResponse.redirect(url, 308);
    }

    // Unknown mapped slug but still has legacy add-to-cart → strip query to clean URL.
    if (search && new URLSearchParams(search).has('add-to-cart')) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete('add-to-cart');
      return NextResponse.redirect(clean, 308);
    }
  }

  // Legacy category deep paths
  const categoryMatch = pathname.match(/^\/category\/(.+?)\/?$/i);
  if (categoryMatch) {
    const path = decodeURIComponent(categoryMatch[1] || '')
      .trim()
      .toLowerCase()
      .replace(/\/+$/, '');
    const destination = CATEGORY_REDIRECT_MAP.get(path);
    if (destination) {
      return NextResponse.redirect(new URL(destination, request.url), 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/product/:path*',
    '/products/:path*',
    '/category/:path*',
  ],
};
