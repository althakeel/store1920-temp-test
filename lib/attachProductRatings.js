import mongoose from 'mongoose';
import Rating from '@/models/Rating';

function collectLookupIds(products = []) {
  const stringIds = [];
  const objectIds = [];
  const seen = new Set();

  for (const product of products) {
    const id = String(product?._id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    stringIds.push(id);
    if (mongoose.Types.ObjectId.isValid(id)) {
      objectIds.push(new mongoose.Types.ObjectId(id));
    }

    const legacyId = String(product?.legacySourceId || '').trim();
    if (legacyId && !seen.has(`legacy:${legacyId}`)) {
      seen.add(`legacy:${legacyId}`);
      stringIds.push(legacyId);
    }
  }

  return { stringIds, objectIds };
}

function resolveProductKey(productId, productIds, legacyToId) {
  const raw = String(productId || '').trim();
  if (productIds.has(raw)) return raw;
  return legacyToId.get(raw) || raw;
}

export async function attachProductRatings(products = []) {
  if (!Array.isArray(products) || products.length === 0) return products;

  const { stringIds, objectIds } = collectLookupIds(products);
  if (!stringIds.length) return products;

  const ratingsMap = new Map();

  try {
    const allRatings = await Rating.find({
      productId: { $in: [...stringIds, ...objectIds] },
      $or: [{ approved: true }, { isApproved: true }],
    })
      .select('productId rating')
      .lean();

    const productIds = new Set(products.map((product) => String(product._id)));
    const legacyToId = new Map(
      products
        .filter((product) => product?.legacySourceId)
        .map((product) => [String(product.legacySourceId), String(product._id)])
    );

    for (const review of allRatings) {
      const key = resolveProductKey(review.productId, productIds, legacyToId);
      if (!ratingsMap.has(key)) ratingsMap.set(key, []);
      ratingsMap.get(key).push(Number(review.rating) || 0);
    }
  } catch (error) {
    console.error('[attachProductRatings]', error);
    return products;
  }

  return products.map((product) => {
    const reviews = ratingsMap.get(String(product._id)) || [];
    const ratingCount = reviews.length;
    const averageRating = ratingCount > 0
      ? reviews.reduce((sum, rating) => sum + rating, 0) / ratingCount
      : 0;

    return {
      ...product,
      ratingCount,
      averageRating,
    };
  });
}
