import { DEFAULT_APP_URL, getCustomerSiteUrl } from '@/lib/appUrl';

function escapeXml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildGoogleMerchantFeedXml(items = [], {
  title = 'Store1920 Products',
  link = getCustomerSiteUrl() || DEFAULT_APP_URL,
  description = 'Store1920 product feed for Google Merchant Center',
} = {}) {
  const itemXml = items.map((item) => `
    <item>
      <g:id>${escapeXml(item.id)}</g:id>
      <g:title>${escapeXml(item.title)}</g:title>
      <g:description>${escapeXml(item.description)}</g:description>
      <g:link>${escapeXml(item.link)}</g:link>
      <g:image_link>${escapeXml(item.imageLink)}</g:image_link>
      <g:availability>${escapeXml(item.availability)}</g:availability>
      <g:price>${escapeXml(item.price)}</g:price>
      <g:brand>${escapeXml(item.brand)}</g:brand>
      <g:condition>${escapeXml(item.condition)}</g:condition>
      <g:google_product_category>${escapeXml(item.googleProductCategory)}</g:google_product_category>
      <g:mpn>${escapeXml(item.mpn)}</g:mpn>
      <g:identifier_exists>${item.mpn ? 'yes' : 'no'}</g:identifier_exists>
      <g:shipping>
        <g:country>AE</g:country>
        <g:service>Standard</g:service>
      </g:shipping>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>${itemXml}
  </channel>
</rss>`;
}
