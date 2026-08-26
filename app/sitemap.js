import { buildSitemapEntriesForId, getSitemapIds, SITEMAP_ID } from '@/lib/sitemapData';

/** Rebuild from live MongoDB at most once per hour. */
export const revalidate = 3600;

export async function generateSitemaps() {
  return getSitemapIds();
}

export default async function sitemap(props = {}) {
  const rawId = props?.id;
  const resolvedId = rawId != null && typeof rawId?.then === 'function'
    ? await rawId
    : rawId;
  const sitemapId = resolvedId == null || resolvedId === '' ? SITEMAP_ID.PAGES : resolvedId;
  return buildSitemapEntriesForId(sitemapId);
}
