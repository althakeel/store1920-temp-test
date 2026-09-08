import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Rating from "@/models/Rating";
import Category from "@/models/Category";
import { NextResponse } from "next/server";
import { getCachedData, setCachedData, generateCacheKey, invalidateCachePattern } from "@/lib/cache";
import { resolveStorefrontLanguage } from "@/lib/storefrontLanguage";
import {
  applyCategoriesFilter,
  applyStorefrontVisibilityFilters,
  buildProductListSort,
  buildShopMatchStage,
} from '@/lib/shopProductQuery';
import {
  countProductsDedupedBySku,
  dedupeProductsBySku,
  fetchProductsDedupedBySku,
} from '@/lib/productSkuDedupe';

function isMongoConnectionError(error) {
    const message = error?.message || '';
    return (
        message.includes('Could not connect to any servers in your MongoDB Atlas cluster') ||
        message.includes('Server selection timed out') ||
        message.includes('marked stale due to electionId/setVersion mismatch') ||
        message.includes('ReplicaSetNoPrimary') ||
        message.includes('no primary server available') ||
        message.includes('ECONNREFUSED') ||
        message.includes('ENOTFOUND')
    );
}

function createProductsResponse(payload, headers = {}) {
    const isDev = process.env.NODE_ENV !== 'production';
    const body = Array.isArray(payload) ? { products: payload } : payload;
    return NextResponse.json(
        body,
        {
            headers: {
                'Cache-Control': isDev ? 'no-store' : 'public, s-maxage=600, stale-while-revalidate=1200',
                'X-Cache': 'MISS',
                ...headers,
            },
        }
    );
}

export async function POST(request) {
    try {
        await dbConnect();
        const body = await request.json();
        const { name, description, shortDescription, AED, price, images, category, sku, inStock, hasVariants, variants, attributes, hasBulkPricing, bulkPricing, fastDelivery, freeShippingEligible, allowReturn, allowReplacement, storeId, slug, imageAspectRatio = '1:1' } = body;

        // Normalize images to array format
        let normalizedImages = [];
        if (Array.isArray(images)) {
            normalizedImages = images.filter(img => {
                if (typeof img === 'string') return img.trim().length > 0;
                if (typeof img === 'object' && img !== null) return img.url || img.src || img.path || img.data;
                return false;
            });
        } else if (typeof images === 'object' && images !== null && (images.url || images.src || images.path || images.data)) {
            normalizedImages = [images];
        } else if (typeof images === 'string' && images.trim().length > 0) {
            normalizedImages = [images];
        }

        // Generate slug from name if not provided
        const productSlug = slug || name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');

        // Check if slug is unique
        const existing = await Product.findOne({ slug: productSlug });
        if (existing) {
            return NextResponse.json({ error: "Slug already exists. Please use a different product name." }, { status: 400 });
        }

        const product = await Product.create({
            name,
            slug: productSlug,
            description,
            shortDescription,
            AED,
            price,
            images: normalizedImages,
            category,
            sku,
            inStock,
            hasVariants,
            variants,
            attributes,
            hasBulkPricing,
            bulkPricing,
            fastDelivery,
            freeShippingEligible,
            allowReturn,
            allowReplacement,
            storeId,
            imageAspectRatio,
        });

        invalidateCachePattern('products:');

        return NextResponse.json({ product }, { status: 201 });
    } catch (error) {
        console.error('Error creating product:', error);
        return NextResponse.json({ error: 'Error creating product', details: error.message, stack: error.stack }, { status: 500 });
    }
}


export async function GET(request){
    const language = resolveStorefrontLanguage(request);
    const { searchParams } = new URL(request.url);
    const sortBy = searchParams.get('sortBy') || searchParams.get('sort') || 'newest';
    const fetchAll = searchParams.get('all') === 'true';
    const parsedPage = parseInt(searchParams.get('page') || '1', 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const parsedLimit = parseInt(searchParams.get('limit') || '20', 10);
    const parsedOffset = parseInt(searchParams.get('offset') || '0', 10);
    const paginated = !fetchAll && (searchParams.get('paginated') === 'true' || searchParams.has('page'));
    const limit = fetchAll
        ? null
        : Math.min(Number.isFinite(parsedLimit) ? parsedLimit : (paginated ? 24 : 20), paginated ? 60 : 500);
    const offset = paginated
        ? (page - 1) * limit
        : (Number.isFinite(parsedOffset) ? parsedOffset : 0);
    const fastDelivery = searchParams.get('fastDelivery');
    const categoryParam = searchParams.get('category');
    const categoriesParam = String(searchParams.get('categories') || '').trim();
    const selectedCategories = categoriesParam
        ? categoriesParam.split(',').map((slug) => slug.trim()).filter(Boolean)
        : (categoryParam ? [categoryParam] : []);
    const includeOutOfStock = searchParams.get('includeOutOfStock') === 'true';
    const inStockOnly = searchParams.get('inStockOnly') === 'true';
    const bestSellerOnly = searchParams.get('bestSeller') === 'true';
    const priceFilter = searchParams.get('priceFilter') || 'all';
    const minPrice = searchParams.get('minPrice') || '';
    const maxPrice = searchParams.get('maxPrice') || '';
    const slim = searchParams.get('slim') === 'true' || (!fetchAll && limit <= 50);
    const cacheKey = generateCacheKey('products', {
        limit,
        offset,
        page: paginated ? String(page) : '',
        sortBy,
        fastDelivery: fastDelivery || 'false',
        fetchAll: fetchAll ? 'true' : 'false',
        category: selectedCategories.join(','),
        includeOutOfStock: includeOutOfStock ? 'true' : 'false',
        inStockOnly: inStockOnly ? 'true' : 'false',
        bestSellerOnly: bestSellerOnly ? 'true' : 'false',
        priceFilter,
        minPrice,
        maxPrice,
        slim: slim ? 'true' : 'false',
        language,
        paginated: paginated ? 'true' : 'false',
        skuDedupe: 'true',
    });
    const skipProductCache = selectedCategories.length > 0;

    try {
        const cachedProducts = skipProductCache ? null : getCachedData(cacheKey);
        if (cachedProducts) {
            return createProductsResponse(cachedProducts, { 'X-Cache': 'HIT' });
        }

        try {
            await dbConnect();
        } catch (dbError) {
            const cachedProducts = getCachedData(cacheKey);
            if (cachedProducts) {
                return createProductsResponse(cachedProducts, {
                    'X-Cache': 'STALE',
                    'X-Data-Source': 'memory-cache',
                });
            }

            if (isMongoConnectionError(dbError)) {
                console.warn('[products API] MongoDB unavailable, returning empty product list:', dbError.message);
                return createProductsResponse([], {
                    'Cache-Control': 'no-store',
                    'X-Data-Source': 'fallback-empty',
                });
            }

            throw dbError;
        }

        // OPTIMIZED: Use simple find with field selection (aggregation was causing errors)
        const matchStage = applyStorefrontVisibilityFilters(buildShopMatchStage({
            includeOutOfStock,
            fastDelivery: fastDelivery === 'true',
            inStockOnly,
            bestSellerOnly,
            priceFilter,
            minPrice,
            maxPrice,
        }));

        if (selectedCategories.length > 0) {
            await applyCategoriesFilter(matchStage, selectedCategories, Category);
        }

        const sortStage = buildProductListSort(sortBy);
        const useSkuDedupe = paginated || fetchAll;
        const total = useSkuDedupe
            ? await countProductsDedupedBySku(Product, matchStage)
            : null;

        let products = [];
        const listProjection = slim
            ? 'name nameAr slug sku price mrp AED images category categories inStock stockQuantity fastDelivery freeShippingEligible useProductsPath imageAspectRatio cardVideoPreviewEnabled cardVideoPreviewDelaySec createdAt'
            : 'name nameAr slug description descriptionAr shortDescription shortDescriptionAr brand brandAr price mrp AED images category categories sku hasVariants variants attributes fastDelivery freeShippingEligible stockQuantity imageAspectRatio cardVideoPreviewEnabled cardVideoPreviewDelaySec createdAt';
        try {
            if (useSkuDedupe) {
                products = await fetchProductsDedupedBySku(Product, matchStage, {
                    sort: sortStage,
                    skip: fetchAll ? 0 : offset,
                    limit: fetchAll ? null : limit,
                });
            } else {
                let query = Product.find(matchStage)
                    .select(listProjection)
                    .sort(sortStage)
                    .skip(offset);

                if (limit != null) {
                    query = query.limit(limit);
                }

                products = await query.lean().exec();
                products = dedupeProductsBySku(products);
            }
        } catch (populateError) {
            console.error('Products query error:', populateError);
            if (useSkuDedupe) {
                products = await fetchProductsDedupedBySku(Product, matchStage, {
                    sort: sortStage,
                    skip: fetchAll ? 0 : offset,
                    limit: fetchAll ? null : limit,
                });
            } else {
                let query = Product.find(matchStage)
                    .select(listProjection)
                    .sort(sortStage)
                    .skip(offset);

                if (limit != null) {
                    query = query.limit(limit);
                }

                products = await query.lean().exec();
                products = dedupeProductsBySku(products);
            }
        }

        // Normalize category/categories and calculate discount
        products = products.map((product) => {
            return {
            ...product,
            category: product.category && typeof product.category === 'object'
                ? (language === 'ar' && product.category.nameAr ? product.category.nameAr : (product.category.name || product.category.slug || null))
                : (product.category || null),
            categories: Array.isArray(product.categories)
                ? product.categories.map((cat) => {
                    if (!cat || typeof cat !== 'object') return cat;
                    return language === 'ar' && cat.nameAr ? cat.nameAr : (cat.name || cat.slug || cat);
                })
                : [],
            discount: (product.AED && product.price && product.AED > product.price) 
                ? Math.round(((product.AED - product.price) / product.AED) * 100)
                : null
        }});

        // FIX N+1: Batch fetch all ratings in ONE query (skip for slim list views — much faster shop/catalog)
        const ratingsMap = {};
        if (!slim && products.length > 0) {
            try {
                const productIds = products.map(p => String(p._id));
                const allRatings = await Rating.find({ 
                    productId: { $in: productIds }, 
                    approved: true 
                }).select('productId rating').lean();
                // Create a map of productId -> ratings for O(1) lookup
                allRatings.forEach(review => {
                    if (!ratingsMap[review.productId]) {
                        ratingsMap[review.productId] = [];
                    }
                    ratingsMap[review.productId].push(review.rating);
                });
            } catch (ratingsError) {
                console.error('Ratings fetch error:', ratingsError);
            }
        }

        // Enrich with ratings - synchronous, no async overhead
        const enrichedProducts = products.map(product => {
            if (slim) {
                return {
                    ...product,
                    label: product.discount && product.discount > 0 ? `${product.discount}% Off` : null,
                    labelType: product.discount && product.discount > 0 ? 'offer' : null,
                    ratingCount: 0,
                    averageRating: 0,
                };
            }
            try {
                const reviews = ratingsMap[String(product._id)] || [];
                const ratingCount = reviews.length;
                const averageRating = ratingCount > 0 ? (reviews.reduce((sum, r) => sum + r, 0) / ratingCount) : 0;

                // Calculate label and labelType in JavaScript (simpler than MongoDB)
                let label = null;
                let labelType = null;
                if (product.discount && product.discount >= 50) {
                    label = `Min. ${product.discount}% Off`;
                    labelType = 'offer';
                } else if (product.discount && product.discount > 0) {
                    label = `${product.discount}% Off`;
                    labelType = 'offer';
                }

                return {
                    ...product,
                    label,
                    labelType,
                    ratingCount,
                    averageRating
                };
            } catch (err) {
                console.error('Error enriching product:', err);
                return {
                    ...product,
                    label: null,
                    labelType: null,
                    ratingCount: 0,
                    averageRating: 0
                };
            }
        });

        const responsePayload = (paginated || fetchAll)
            ? {
                products: enrichedProducts,
                total: total ?? enrichedProducts.length,
                page: fetchAll ? 1 : page,
                limit: fetchAll ? enrichedProducts.length : limit,
                totalPages: fetchAll ? 1 : Math.max(1, Math.ceil((total || 0) / limit)),
            }
            : enrichedProducts;

        // CACHE RESULTS - Store in memory for 10 minutes (with error handling)
        if (!skipProductCache) {
            try {
                setCachedData(cacheKey, responsePayload, 600);
            } catch (cacheErr) {
                console.error('Cache set error:', cacheErr.message);
                // Continue without cache if cache fails
            }
        }

        return createProductsResponse(
            responsePayload,
            skipProductCache ? { 'Cache-Control': 'no-store' } : undefined,
        );
    } catch (error) {
        console.error('Error in products API:', error);
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack);
        }

        if (isMongoConnectionError(error)) {
            const cachedProducts = getCachedData(cacheKey);
            if (cachedProducts) {
                return createProductsResponse(cachedProducts, {
                    'X-Cache': 'STALE',
                    'X-Data-Source': 'memory-cache-error-fallback',
                });
            }

            return createProductsResponse([], {
                'Cache-Control': 'no-store',
                'X-Data-Source': 'fallback-empty-query-error',
            });
        }

        return NextResponse.json({ error: "An internal server error occurred.", details: error.message, stack: error.stack }, { status: 500 });
    }
}