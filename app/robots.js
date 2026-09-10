import { headers } from 'next/headers';
import { SITE_URL } from '@/lib/sitemapData';
import { getRequestHostFromHeaders, isStagingStoreHost } from '@/lib/stagingHost';

export default async function robots() {
  const requestHeaders = await headers();
  if (isStagingStoreHost(getRequestHostFromHeaders(requestHeaders))) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: '/',
        },
      ],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/store/',
          '/admin/',
          '/dashboard/',
          '/api/',
          '/checkout',
          '/cart',
          '/sign-in',
          '/sign-up',
          '/orders',
          '/profile',
          '/wallet',
          '/order-success',
          '/order-failed',
          '/recover-cart/',
          '/offer/',
          '/create-store',
          '/pricing',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
