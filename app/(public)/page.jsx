import { getHomepageData } from '@/lib/homepageData';
import { HOME_PAGE_METADATA } from '@/lib/homepageSeo';
import HomePageClient from './HomePageClient';

export const revalidate = 120;

export const metadata = HOME_PAGE_METADATA;

export default async function Home() {
  const initialData = await getHomepageData();
  return <HomePageClient initialData={initialData} />;
}
