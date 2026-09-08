import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextResponse } from "next/server";
import { localizeRecord, resolveStorefrontLanguage } from "@/lib/storefrontLanguage";
import { getProductThumbnailUrl } from "@/lib/productMedia";
import { PLACEHOLDER_IMAGE } from "@/lib/mediaUrls";
import { isProductPublished } from '@/lib/productVisibility';
import { attachProductRatings } from '@/lib/attachProductRatings';

function hasDisplayableImage(product) {
  const thumbnail = getProductThumbnailUrl(product, { fallback: PLACEHOLDER_IMAGE });
  return Boolean(thumbnail && thumbnail !== PLACEHOLDER_IMAGE);
}

export async function POST(req) {
    try {
        await connectDB();
        const language = resolveStorefrontLanguage(req);
        const { productIds } = await req.json();

        if (!productIds || !Array.isArray(productIds)) {
            return NextResponse.json({ error: 'Invalid product IDs' }, { status: 400 });
        }

        if (productIds.length === 0) {
            return NextResponse.json({ products: [] });
        }

        const validProductIds = Array.from(new Set(
          productIds.map((id) => String(id || '').trim()).filter(Boolean)
        ));

        if (validProductIds.length === 0) {
            return NextResponse.json({ products: [] });
        }

        const products = await Product.find({
            _id: { $in: validProductIds },
            published: { $ne: false },
        })
            .select('name nameAr slug price mrp AED images externalImages brand brandAr category categories inStock fastDelivery freeShippingEligible useProductsPath imageAspectRatio shortDescription shortDescriptionAr shortDescription2 sku hasVariants variants allowReturn allowReplacement published createdAt legacySourceId')
            .lean();

        const productMap = new Map(products.map((product) => [String(product._id), product]));
        const orderedProducts = await attachProductRatings(
          validProductIds
            .map((id) => productMap.get(id))
            .filter((product) => product && isProductPublished(product) && product.name && product.slug && hasDisplayableImage(product))
            .map((product) => localizeRecord(product, language, ['name', 'shortDescription', 'brand']))
            .filter(Boolean)
        );

        return NextResponse.json({ products: orderedProducts }, {
            headers: {
                'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
            },
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
