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

function parsePage(value) {
  const page = parseInt(String(value || '1'), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export async function generateMetadata({ searchParams }) {
  try {
    const params = await searchParams;
    const language = await getStorefrontLanguage();
    const data = await getCachedPublicOffersPage({
      page: parsePage(params?.page),
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

export default async function OffersPage({ searchParams }) {
  const params = await searchParams;
  const language = await getStorefrontLanguage();
  const initialData = await getCachedPublicOffersPage({
    page: parsePage(params?.page),
    limit: OFFERS_PAGE_SIZE,
    language,
  });

  return <OffersPageClient initialData={initialData} />;
}
