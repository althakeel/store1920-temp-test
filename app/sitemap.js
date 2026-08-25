import { buildSitemapEntriesForId, getSitemapIds, SITEMAP_ID } from '@/lib/sitemapData';

/** Rebuild from live MongoDB at most once per hour. */
export const revalidate = 3600;

export async function generateSitemaps() {
  return getSitemapIds();
}

export default async function sitemap({ id } = {}) {
  const sitemapId = id == null || id === '' ? SITEMAP_ID.PAGES : id;
  return buildSitemapEntriesForId(sitemapId);
}
