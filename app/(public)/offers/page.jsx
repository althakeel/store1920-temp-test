import { cookies, headers } from 'next/headers';
import { resolveStorefrontLanguage } from '@/lib/storefrontLanguage';
import { getCachedPublicOffersPage } from '@/lib/offersPageData';
import { OFFERS_PAGE_SIZE } from '@/lib/offersPageSettings';
import OffersPageClient from './OffersPageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getStorefrontLanguage() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  return resolveStorefrontLanguage({ cookies: cookieStore, headers: requestHeaders });
}

export async function generateMetadata() {
  try {
    const language = await getStorefrontLanguage();
    const data = await getCachedPublicOffersPage({
      page: 1,
      limit: OFFERS_PAGE_SIZE,
      language,
    });
    return {
      title: `${data.title} | Store1920`,
      description: data.subtitle || data.title,
    };
  } catch {
    return {
      title: 'Special Offers | Store1920',
      description: 'Shop current deals and discounted products at Store1920.',
    };
  }
}

export default async function OffersPage() {
  const language = await getStorefrontLanguage();
  const initialData = await getCachedPublicOffersPage({
    page: 1,
    limit: OFFERS_PAGE_SIZE,
    language,
  });

  return <OffersPageClient initialData={initialData} />;
}
