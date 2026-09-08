import { SITE_URL } from '@/lib/sitemapData';

export const HOME_PAGE_META_TITLE =
  'Store1920: Shop Online UAE – Electronics, Mobiles, Fashion & More';

export const HOME_PAGE_META_DESCRIPTION =
  'Shop 10,000+ products at the best prices in UAE. Electronics, Mobiles, Fashion, Home Appliances & more. Fast delivery across Dubai, Abu Dhabi & all Emirates. Shipping offers available on eligible orders. Shop now at Store1920!';

export const HOME_PAGE_METADATA = {
  title: HOME_PAGE_META_TITLE,
  description: HOME_PAGE_META_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: HOME_PAGE_META_TITLE,
    description: HOME_PAGE_META_DESCRIPTION,
    url: SITE_URL,
    type: 'website',
    siteName: 'Store1920',
  },
};
