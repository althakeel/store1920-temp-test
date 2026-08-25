import { SITE_URL, getSitemapIds, toPublicSitemapFilename } from '@/lib/sitemapData';

export const revalidate = 3600;

export async function GET() {
  const ids = await getSitemapIds();
  const lastmod = new Date().toISOString();

  const sitemapsXml = ids
    .map(({ id }) => {
      const filename = toPublicSitemapFilename(id);
      return `  <sitemap>
    <loc>${SITE_URL}/${filename}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapsXml}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
