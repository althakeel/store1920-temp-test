import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmailCampaignPage from '@/models/EmailCampaignPage';
import Product from '@/models/Product';
import {
  campaignPageAbsoluteUrl,
  normalizeCampaignPageProductIds,
  slugifyCampaignPageTitle,
  toStoreCampaignPage,
} from '@/lib/emailCampaignPageHelpers';
import { getProductThumbnailUrl } from '@/lib/productMedia';
import { getProductPath } from '@/lib/productUrl';
import { PLACEHOLDER_IMAGE } from '@/lib/mediaUrls';

export const dynamic = 'force-dynamic';

function mapPublicProduct(product) {
  const id = String(product._id || '');
  const image = getProductThumbnailUrl(product, { fallback: PLACEHOLDER_IMAGE, allowVideo: false });
  return {
    id,
    _id: id,
    name: product.name || '',
    nameAr: product.nameAr || '',
    slug: product.slug || '',
    price: product.salePrice ?? product.price ?? product.AED ?? 0,
    originalPrice: product.originalPrice || product.mrp || product.AED || null,
    image: image && image !== PLACEHOLDER_IMAGE ? image : (Array.isArray(product.images) ? (typeof product.images[0] === 'string' ? product.images[0] : product.images[0]?.url) : '') || '',
    href: getProductPath(product),
    inStock: product.inStock !== false,
    brand: product.brand || '',
  };
}

export async function GET(_request, { params }) {
  try {
    const { slug: rawSlug } = await params;
    const slug = slugifyCampaignPageTitle(rawSlug);
    if (!slug) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await connectDB();
    const page = await EmailCampaignPage.findOne({
      slug,
      status: 'published',
    }).lean();

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    const productIds = normalizeCampaignPageProductIds(page.productIds);
    let products = [];
    if (productIds.length) {
      const docs = await Product.find({ _id: { $in: productIds } })
        .select('_id name nameAr slug price salePrice originalPrice mrp AED images brand inStock stockQuantity')
        .lean();
      const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
      products = productIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map(mapPublicProduct);
    }

    const payload = toStoreCampaignPage(page);
    return NextResponse.json({
      success: true,
      page: {
        ...payload,
        publicUrl: campaignPageAbsoluteUrl(page.slug),
      },
      products,
    });
  } catch (error) {
    console.error('[public campaign page GET]', error);
    return NextResponse.json({ error: 'Failed to load page' }, { status: 500 });
  }
}
