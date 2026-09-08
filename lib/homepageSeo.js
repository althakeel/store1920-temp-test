import { DEFAULT_APP_URL, getCustomerSiteUrl } from '@/lib/appUrl';

export const HOME_PAGE_META_TITLE =
  'Store1920: Shop Online UAE – Electronics, Mobiles, Fashion & More';

export const HOME_PAGE_META_DESCRIPTION =
  'Shop 10,000+ products at the best prices in UAE. Electronics, Mobiles, Fashion, Home Appliances & more. Fast delivery across Dubai, Abu Dhabi & all Emirates. Shipping offers available on eligible orders. Shop now at Store1920!';

const HOME_CANONICAL = getCustomerSiteUrl() || DEFAULT_APP_URL;

export const HOME_PAGE_METADATA = {
  title: HOME_PAGE_META_TITLE,
  description: HOME_PAGE_META_DESCRIPTION,
  alternates: {
    canonical: HOME_CANONICAL,
  },
  openGraph: {
    title: HOME_PAGE_META_TITLE,
    description: HOME_PAGE_META_DESCRIPTION,
    url: HOME_CANONICAL,
    type: 'website',
    siteName: 'Store1920',
  },
};
