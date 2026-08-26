import {
  SITEMAP_ID,
  buildSitemapEntriesForId,
} from '@/lib/sitemapData';

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** Render a standard urlset sitemap XML string. */
export function renderSitemapUrlset(entries = []) {
  const urlsXml = entries
    .map((entry) => {
      const parts = [
        '  <url>',
        `    <loc>${escapeXml(entry.url)}</loc>`,
        `    <lastmod>${toIsoDate(entry.lastModified)}</lastmod>`,
      ];
      if (entry.changeFrequency) {
        parts.push(`    <changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`);
      }
      if (entry.priority != null && entry.priority !== '') {
        parts.push(`    <priority>${Number(entry.priority)}</priority>`);
      }
      parts.push('  </url>');
      return parts.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;
}

/** Map public filename stem (pages, products-2, …) to internal sitemap id. */
export function publicSitemapStemToId(stem = '') {
  const key = String(stem || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'pages') return SITEMAP_ID.PAGES;
  if (key === 'categories') return SITEMAP_ID.CATEGORIES;
  if (key === 'blog') return SITEMAP_ID.BLOG;
  if (key === 'products') return SITEMAP_ID.PRODUCTS;
  if (/^products-\d+$/.test(key)) return key;
  return null;
}

export async function buildSitemapXmlResponse(stem = '') {
  const sitemapId = publicSitemapStemToId(stem);
  if (!sitemapId) {
    return new Response('Sitemap not found', { status: 404 });
  }

  const entries = await buildSitemapEntriesForId(sitemapId);
  const xml = renderSitemapUrlset(entries);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
