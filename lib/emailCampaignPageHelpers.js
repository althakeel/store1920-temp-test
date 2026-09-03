import { getCustomerSiteUrl } from '@/lib/appUrl';

export const EMAIL_CAMPAIGN_PAGE_MAX_PRODUCTS = 48;

function looksLikeObjectId(value = '') {
  return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
}

export function slugifyCampaignPageTitle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'campaign';
}

export async function ensureUniqueCampaignPageSlug(Model, storeId, desiredSlug, excludeId = null) {
  const base = slugifyCampaignPageTitle(desiredSlug);
  let slug = base;
  let attempt = 1;
  while (attempt < 50) {
    const filter = { storeId, slug };
    if (excludeId && looksLikeObjectId(excludeId)) {
      filter._id = { $ne: excludeId };
    }
    // eslint-disable-next-line no-await-in-loop
    const exists = await Model.exists(filter);
    if (!exists) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function normalizeCampaignPageProductIds(ids = []) {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, EMAIL_CAMPAIGN_PAGE_MAX_PRODUCTS);
}

export function campaignPagePublicPath(slug = '') {
  const clean = slugifyCampaignPageTitle(slug);
  return `/c/${clean}`;
}

export function campaignPageAbsoluteUrl(slug = '') {
  const base = getCustomerSiteUrl().replace(/\/$/, '');
  return `${base}${campaignPagePublicPath(slug)}`;
}

export function toStoreCampaignPage(doc = {}) {
  const id = String(doc._id || doc.id || '');
  const slug = String(doc.slug || '').trim();
  const productIds = normalizeCampaignPageProductIds(doc.productIds);
  return {
    id,
    _id: id,
    title: String(doc.title || ''),
    titleAr: String(doc.titleAr || ''),
    slug,
    subtitle: String(doc.subtitle || ''),
    subtitleAr: String(doc.subtitleAr || ''),
    heroImage: String(doc.heroImage || ''),
    productIds,
    productCount: productIds.length,
    ctaLabel: String(doc.ctaLabel || ''),
    ctaUrl: String(doc.ctaUrl || ''),
    backgroundColor: String(doc.backgroundColor || '#f8fafc'),
    accentColor: String(doc.accentColor || '#0f766e'),
    status: doc.status === 'published' ? 'published' : 'draft',
    publishedAt: doc.publishedAt || null,
    seoTitle: String(doc.seoTitle || ''),
    seoDescription: String(doc.seoDescription || ''),
    publicPath: campaignPagePublicPath(slug),
    publicUrl: campaignPageAbsoluteUrl(slug),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

/** Keep as plain string — mongoose casts ObjectId fields on query/save. */
export function resolveStoreObjectId(storeId) {
  return String(storeId || '').trim();
}
