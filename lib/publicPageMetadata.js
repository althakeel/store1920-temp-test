import { SITE_URL } from '@/lib/sitemapData';

export function publicPageMetadata({ title, description, path, index = true }) {
  const normalized = String(path || '/').startsWith('/') ? String(path) : `/${path}`;
  const canonical = `${SITE_URL}${normalized}`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Store1920',
      type: 'website',
    },
    robots: index
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
  };
}
