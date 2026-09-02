import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { getProductThumbnailUrl, isVideoSource, normalizeProductImages } from '@/lib/productMedia';
import { getCustomerSiteUrl } from '@/lib/appUrl';

async function getStoreId(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
    return authSeller(decoded.uid);
  } catch {
    return null;
  }
}

function toAbsoluteMediaUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw || isVideoSource(raw)) return '';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  const base = (getCustomerSiteUrl() || 'https://store1920.com').replace(/\/$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  if (/^(uploads|images|media|products)\//i.test(raw)) return `${base}/${raw}`;
  return raw;
}

function mapProduct(product) {
  const rawImages = normalizeProductImages(product.images);
  const images = rawImages
    .map((entry) => {
      if (typeof entry === 'string') return toAbsoluteMediaUrl(entry);
      return toAbsoluteMediaUrl(entry?.url || entry?.src || entry?.path || '');
    })
    .filter(Boolean);
  const image = toAbsoluteMediaUrl(getProductThumbnailUrl(product, { fallback: '', allowVideo: false }))
    || images[0]
    || null;
  const categoryName = String(product.categoryName || '').trim();
  const categoryRaw = String(product.category || '').trim();
  const categoryLooksLikeId = /^[a-f0-9]{24}$/i.test(categoryRaw);
  const category = categoryName || (categoryLooksLikeId ? 'Product' : categoryRaw) || 'Product';

  return {
    id: product._id.toString(),
    _id: product._id.toString(),
    slug: product.slug,
    name: product.name,
    description: String(product.description || ''),
    shortDescription: String(product.shortDescription || ''),
    category,
    categoryName: category,
    price: product.price,
    originalPrice: product.mrp || product.AED || null,
    image,
    images,
    stock: product.stockQuantity || 0,
    createdAt: product.createdAt,
  };
}

export async function GET(request) {
  try {
    const storeId = await getStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(4, Number(searchParams.get('limit') || 48) || 48));
    const category = String(searchParams.get('category') || '').trim();

    await connectDB();

    let products = await Product.find({
      storeId: String(storeId),
      inStock: true,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('_id name slug price mrp AED images description shortDescription category categoryName stockQuantity createdAt')
      .lean();

    if (!products.length) {
      products = await Product.find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .select('_id name slug price mrp AED images description shortDescription category categoryName stockQuantity createdAt storeId')
        .lean();
      products = products.filter((product) => String(product.storeId || '') === String(storeId));
    }

    const mapped = products
      .map(mapProduct)
      .filter((product) => Boolean(product.image));

    const categories = Array.from(
      new Set(mapped.map((product) => String(product.category || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));

    const filtered = category
      ? mapped.filter((product) => String(product.category) === category)
      : mapped;

    const page = filtered.slice(0, limit);
    const latest = [...page].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const relatedSeed = page[0]?.category;
    const related = relatedSeed
      ? page.filter((item) => String(item.category) === String(relatedSeed))
      : page;

    return NextResponse.json({
      success: true,
      products: page,
      categories,
      buckets: {
        featured: page,
        latest,
        related: related.length ? related : page,
      },
      heroImages: page.slice(0, 12).map((product) => product.image).filter(Boolean),
    });
  } catch (error) {
    console.error('[email-marketing products]', error);
    return NextResponse.json({ error: error.message || 'Failed to load products' }, { status: 500 });
  }
}
