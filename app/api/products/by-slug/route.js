import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextResponse } from "next/server";
import { localizeRecord, resolveStorefrontLanguage } from "@/lib/storefrontLanguage";
import { getCachedData, setCachedData } from "@/lib/cache";
import { isProductPublished } from '@/lib/productVisibility';

const CACHE_TTL_SECONDS = 300;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const requestedLanguage = searchParams.get("lang");
    const language = requestedLanguage === 'ar' || requestedLanguage === 'en'
        ? requestedLanguage
        : resolveStorefrontLanguage(request);
    const slug = searchParams.get("slug");

    if (!slug) {
        return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const cacheKey = `product:slug:${slug}:${language}`;
    const cached = getCachedData(cacheKey);
    if (cached) {
        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(cached, {
            headers: {
                'Cache-Control': isDev ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600',
                'X-Cache': 'HIT',
            },
        });
    }

    await dbConnect();
    const selectFields = 'name nameAr slug description descriptionAr shortDescription shortDescriptionAr shortDescription2 aPlusDesktop aPlusMobile aPlusDesktopAr aPlusMobileAr brand brandAr AED price images category categories sku inStock stockQuantity hasVariants variants attributes hasBulkPricing bulkPricing fastDelivery freeShippingEligible allowReturn allowReplacement specTableEnabled specTableColumns specTableRows storeId imageAspectRatio cardVideoPreviewEnabled cardVideoPreviewDelaySec createdAt updatedAt seoTitle seoDescription seoKeywords tags';
    let product = await Product.findOne({ slug })
        .select(selectFields)
        .lean();

    if (!product && /^[a-fA-F0-9]{24}$/.test(slug)) {
        product = await Product.findById(slug)
            .select(selectFields)
            .lean();
    }

    if (!product || !isProductPublished(product)) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const payload = {
        product: localizeRecord(product, language, ['name', 'description', 'shortDescription', 'brand']),
    };

    setCachedData(cacheKey, payload, CACHE_TTL_SECONDS);

    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(payload, {
        headers: {
            'Cache-Control': isDev ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600',
            'X-Cache': 'MISS',
        },
    });
}
