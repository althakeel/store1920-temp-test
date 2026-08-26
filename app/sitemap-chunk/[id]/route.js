import { buildSitemapXmlResponse } from '@/lib/sitemapXml';

export const revalidate = 3600;

export async function GET(_request, { params }) {
  const { id } = await params;
  return buildSitemapXmlResponse(id);
}
