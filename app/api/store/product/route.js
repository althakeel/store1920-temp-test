
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Category from '@/models/Category';
import Store from '@/models/Store';
import { invalidateStorefrontProductCaches } from '@/lib/cache';
import authSeller from "@/middlewares/authSeller";
import { buildCategoryLookup, getProductCategoryLabels } from '@/lib/categoryLookup';
import {
  fetchPickerPage,
  fetchPickerProductIds,
  fetchPickerProductsByIds,
} from '@/lib/storeProductPicker';
import { NextResponse } from "next/server";
import { getAuth } from '@/lib/firebase-admin';
import { sanitizeCategoryIdsForSave } from '@/lib/productCategoryRefs';
import { createProductFromJson, updateProductFromJson } from '@/lib/productJsonSave';
import { resolveDashboardAccess } from '@/lib/storeAccessControl';
import {
  canChangeProductPricing,
  resolveProductCreatePricing,
  resolveProductUpdatePricing,
} from '@/lib/productSaveGuards';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const parseCsvOrJsonList = (value) => {
    if (value == null) return [];

    if (Array.isArray(value)) {
        return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
    }

    const raw = String(value || '').trim();
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean)));
        }
    } catch {}

    return Array.from(new Set(raw.split(',').map((item) => item.trim()).filter(Boolean)));
};

const parseSpecTableColumns = (value) => {
    if (value == null) return ['Property', 'Value'];
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (Array.isArray(parsed)) {
            const normalized = parsed.map((item) => String(item || '').trim()).filter(Boolean);
            return normalized.length > 0 ? normalized : ['Property', 'Value'];
        }
    } catch {}
    return ['Property', 'Value'];
};

const parseSpecTableRows = (value, columnCount) => {
    if (value == null) return [];
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((row) => {
                if (Array.isArray(row)) {
                    const next = Array.from({ length: columnCount }, (_, idx) => String(row[idx] || '').trim());
                    return next;
                }
                return null;
            })
            .filter((row) => Array.isArray(row) && row.some((cell) => cell.length > 0));
    } catch {
        return [];
    }
};

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.avi', '.mkv']

const isVideoFile = (file) => {
    const mime = String(file?.type || '').toLowerCase()
    if (mime.startsWith('video/')) return true
    const fileName = String(file?.name || '').toLowerCase()
    return VIDEO_EXTENSIONS.some((ext) => fileName.endsWith(ext))
}

// Helper: Upload media (images/videos) to S3 — lazy-loaded so GET/list routes do not require sharp.
const uploadMedia = async (files) => {
    const [{ uploadToS3 }, { optimizeUploadBuffer }] = await Promise.all([
        import('@/lib/storage'),
        import('@/lib/optimizeUploadBuffer'),
    ]);

    return Promise.all(
        files.map(async (file) => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const optimized = await optimizeUploadBuffer(buffer, {
                contentType: file.type,
                fileName: file.name,
            });
            const uploadName = optimized.optimized && !String(file.name || '').toLowerCase().endsWith('.jpg')
                ? String(file.name || 'product').replace(/\.[^.]+$/, '.jpg')
                : file.name;
            const response = await uploadToS3({
                buffer: optimized.buffer,
                fileName: uploadName,
                folder: "products",
                contentType: optimized.contentType || file.type || undefined,
            });

            return response.url;
        })
    );
};

// POST: Create a new product
export async function POST(request) {
    try {
        await connectDB();

        // Firebase Auth: Extract token from Authorization header
        const authHeader = request.headers.get('authorization');
        let userId = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const { getAuth } = await import('@/lib/firebase-admin');
                const adminAuth = getAuth();
                const decodedToken = await adminAuth.verifyIdToken(idToken);
                userId = decodedToken.uid;
            } catch (e) {
                console.error('Auth verification failed (POST /api/store/product):', e.message);
                // Don't fail on auth error - just log it and continue without userId
                userId = null;
            }
        }
        const storeId = await authSeller(userId);
        if (!storeId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const contentType = request.headers.get('content-type')?.toLowerCase() || '';
        if (contentType.includes('application/json')) {
            try {
                const body = await request.json();
                const product = await createProductFromJson(body, storeId);
                return NextResponse.json({ message: "Product added successfully", product });
            } catch (error) {
                const message = error?.message || 'Failed to save product';
                const status = error?.statusCode
                    || (message.includes('Slug already exists') || message.includes('Missing') || message.includes('required') || message.includes('Cannot') || message.includes('Add at least')
                        ? 400
                        : 500);
                return NextResponse.json({ error: message }, { status });
            }
        }

        // Try FormData first (most common case for product creation with images)
        let formData;
        try {
            formData = await request.formData();
        } catch (err) {
            // If FormData parsing fails, return specific error
            console.error('FormData parsing failed:', err.message, err.stack);
            return NextResponse.json({ 
                error: "Failed to parse FormData", 
                detail: err.message,
                hint: "Check if images are too large or request body exceeds limits"
            }, { status: 400 });
        }

        // FormData successfully parsed - proceed with multipart/form-data path
        const name = formData.get("name");
        const nameAr = formData.get("nameAr") || '';
        const description = formData.get("description");
        const descriptionAr = formData.get("descriptionAr") || '';
        const category = formData.get("category"); // Kept for backward compatibility
        const categoriesRaw = formData.get("categories"); // New: JSON array of category IDs
        
        console.log('POST: Raw formData values:', {
            category,
            categoriesRaw,
            categoryType: typeof category,
            categoriesRawType: typeof categoriesRaw
        });
        
        const sku = formData.get("sku") || null;
        const brand = formData.get("brand") || '';
        const brandAr = formData.get("brandAr") || '';
        const shortDescriptionRaw = formData.get("shortDescription");
        const shortDescriptionArRaw = formData.get("shortDescriptionAr");
        const shortDescription2Raw = formData.get("shortDescription2") || '';
        const aPlusDesktop = formData.get("aPlusDesktop") || '';
        const aPlusMobile = formData.get("aPlusMobile") || '';
        const aPlusDesktopAr = formData.get("aPlusDesktopAr") || '';
        const aPlusMobileAr = formData.get("aPlusMobileAr") || '';
        const aPlusDesktopImages = parseCsvOrJsonList(formData.get("aPlusDesktopImages"));
        const aPlusMobileImages = parseCsvOrJsonList(formData.get("aPlusMobileImages"));
        const specTableEnabled = String(formData.get("specTableEnabled") || "false").toLowerCase() === "true";
        const specTableColumnsRaw = formData.get("specTableColumns");
        const specTableRowsRaw = formData.get("specTableRows");
        const images = formData.getAll("images");
        const stockQuantity = formData.get("stockQuantity") ? Number(formData.get("stockQuantity")) : 0;
        const soldCount = Math.max(0, Number(formData.get("soldCount") || 0) || 0);
        // New: variants support
        const hasVariants = String(formData.get("hasVariants") || "false").toLowerCase() === "true";
        const variantsRaw = formData.get("variants"); // expected JSON string if hasVariants
        const attributesRaw = formData.get("attributes"); // optional JSON of attribute definitions
        // Fast delivery toggle
        const fastDelivery = String(formData.get("fastDelivery") || "false").toLowerCase() === "true";
        const freeShippingEligible = String(formData.get("freeShippingEligible") || "false").toLowerCase() === "true";
        const hsCode = String(formData.get("hsCode") || '').trim();
        const originCountry = String(formData.get("originCountry") || '').trim().toUpperCase();
        const shippingWeightKg = Math.max(0, Number(formData.get("shippingWeightKg") || 0) || 0);
        const useProductsPath = String(formData.get("useProductsPath") || "false").toLowerCase() === "true";
        const imageAspectRatio = formData.get("imageAspectRatio") || "1:1";
        const cardVideoPreviewEnabled = String(formData.get("cardVideoPreviewEnabled") || "true").toLowerCase() === "true";
        const cardVideoPreviewDelaySec = Math.min(
            120,
            Math.max(0, Number(formData.get("cardVideoPreviewDelaySec") || 24) || 24)
        );
        const tags = parseCsvOrJsonList(formData.get("tags"));
        const seoKeywords = parseCsvOrJsonList(formData.get("seoKeywords"));
        const seoTitle = (formData.get("seoTitle") || '').toString().trim();
        const seoDescription = (formData.get("seoDescription") || '').toString().trim();

        // Base pricing (used when no variants)
        const AED = Number(formData.get("AED"));
        const price = Number(formData.get("price"));
        // Slug from form (manual or auto)
        let slug = formData.get("slug")?.toString().trim() || "";
        if (slug) {
            // Clean up slug: only allow a-z, 0-9, dash
            slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
            slug = slug.replace(/(^-|-$)+/g, '');
        } else {
            // Generate slug from name
            slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '');
        }
        // Ensure slug is unique
        const existing = await Product.findOne({ slug }).lean();
        if (existing) {
            return NextResponse.json({ error: "Slug already exists. Please use a different slug." }, { status: 400 });
        }

        // Validate core fields
        if (!name || !description || images.length < 1) {
            return NextResponse.json({ error: "Missing product details" }, { status: 400 });
        }

        // Parse categories - support both single category (backward compat) and multiple
        let categories = [];
        console.log('DEBUG: Starting category parsing with categoriesRaw:', categoriesRaw);
        
        // PRIORITY: If categoriesRaw (multiple categories) is provided, use it
        if (categoriesRaw) {
            try {
                const parsed = JSON.parse(categoriesRaw);
                console.log('DEBUG: JSON parsed result:', parsed, 'isArray:', Array.isArray(parsed));
                categories = Array.isArray(parsed) ? parsed : [];
                console.log('DEBUG: Using categoriesRaw, categories:', categories, 'length:', categories.length);
                console.log('POST: Parsed categories from form:', { raw: categoriesRaw, parsed, categories });
            } catch (e) {
                console.error('POST: Error parsing categories:', categoriesRaw, e);
                categories = [];
            }
        } 
        // FALLBACK: Only use single category if no multiple categories provided
        else if (category) {
            categories = [category];
            console.log('DEBUG: Using fallback single category:', category);
        }

        if (categories.length === 0) {
            return NextResponse.json({ error: "At least one category is required" }, { status: 400 });
        }
        
        console.log('POST: Final categories to save:', categories, 'count:', categories.length);
        categories = sanitizeCategoryIdsForSave(categories);

        let variants = [];
        if (hasVariants) {
            try {
                variants = JSON.parse(variantsRaw || "[]");
            } catch (e) {
                return NextResponse.json({ error: "Invalid variants JSON" }, { status: 400 });
            }
        }

        let finalPrice;
        let finalAED;
        let inStock;
        try {
            const priced = resolveProductCreatePricing({
                hasVariants,
                variants,
                price,
                AED,
                stockQuantity,
            });
            variants = priced.variants;
            finalPrice = priced.finalPrice;
            finalAED = priced.finalAED;
            inStock = priced.inStock;
        } catch (error) {
            return NextResponse.json({ error: error?.message || 'Invalid pricing' }, { status: error?.statusCode || 400 });
        }

        // Support both file uploads and string URLs
        let imagesUrl = [];
        const filesToUpload = images.filter(img => typeof img !== 'string');
        const urls = images.filter(img => typeof img === 'string');
        if (filesToUpload.length > 0) {
            const uploaded = await uploadMedia(filesToUpload);
            imagesUrl = [...urls, ...uploaded];
        } else {
            imagesUrl = urls;
        }

        // Parse attributes optionally
        let attributes = {};
        let shortDescription = null;
        let shortDescriptionAr = shortDescriptionArRaw || '';
        if (attributesRaw) {
            try {
                attributes = JSON.parse(attributesRaw) || {};
                // Extract shortDescription from attributes
                if (attributes.shortDescription) {
                    shortDescription = attributes.shortDescription;
                }
            } catch {
                attributes = {};
            }
        }

        if (typeof shortDescriptionRaw === 'string' && shortDescriptionRaw.trim()) {
            shortDescription = shortDescriptionRaw;
        }

        console.log('DEBUG: About to create product with categories:', categories);
        console.log('DEBUG: categories isArray?', Array.isArray(categories));
        console.log('DEBUG: categories length:', categories.length);
        console.log('DEBUG: categories JSON:', JSON.stringify(categories));

        const specTableColumns = parseSpecTableColumns(specTableColumnsRaw);
        const specTableRows = parseSpecTableRows(specTableRowsRaw, specTableColumns.length);
        
        const product = await Product.create({
            name,
            nameAr,
            slug,
            brand,
            brandAr,
            description,
            descriptionAr,
            shortDescription,
            shortDescriptionAr,
            shortDescription2: shortDescription2Raw,
            aPlusDesktop,
            aPlusMobile,
            aPlusDesktopAr,
            aPlusMobileAr,
            aPlusDesktopImages,
            aPlusMobileImages,
            specTableEnabled,
            specTableColumns,
            specTableRows,
            AED: finalAED,
            price: finalPrice,
            category: categories[0], // Keep first category for backward compatibility
            categories, // New: store all categories
            sku,
            images: imagesUrl,
            hasVariants,
            variants,
            attributes,
            inStock,
            fastDelivery,
            freeShippingEligible,
            hsCode,
            originCountry,
            shippingWeightKg,
            useProductsPath,
            imageAspectRatio,
            cardVideoPreviewEnabled,
            cardVideoPreviewDelaySec,
            tags,
            seoTitle,
            seoDescription,
            seoKeywords,
            stockQuantity,
            soldCount,
            storeId,
        });

        console.log('DEBUG: Product created, checking saved data:');
        console.log('  - product.category:', product.category);
        console.log('  - product.categories:', product.categories);
        console.log('  - product.categories type:', typeof product.categories);
        console.log('  - product.categories isArray:', Array.isArray(product.categories));
        console.log('  - product.categories length:', product.categories?.length);
        
        // Verify by querying MongoDB directly
        const verifyProduct = await Product.findById(product._id)
          .select('_id price mrp AED')
          .lean();
        console.log('VERIFY from DB - product.categories:', verifyProduct.categories);
        console.log('VERIFY from DB - categories length:', verifyProduct.categories?.length);
        
        console.log('POST: Product created with categories:', product.categories);

        await Store.findByIdAndUpdate(storeId, {
            $addToSet: { featuredProductIds: String(product._id) },
        });
        invalidateStorefrontProductCaches();

        return NextResponse.json({ message: "Product added successfully", product });
    } catch (error) {
        console.error('========== ERROR IN POST /api/store/product ==========');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Error code:', error.code);
        console.error('=====================================================');
        return NextResponse.json({ 
            error: error.message || "Internal server error",
            errorCode: error.code,
            errorName: error.name
        }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        await connectDB();

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const storeId = await authSeller(decodedToken.uid);
        if (!storeId) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const slim = searchParams.get('slim') === 'true';
        const picker = searchParams.get('picker') === 'true';
        const idsOnly = searchParams.get('idsOnly') === 'true';
        const pageParam = searchParams.get('page');
        const isPaginated = pageParam !== null && pageParam !== '';
        const search = String(searchParams.get('search') || '').trim();

        const idsParam = String(searchParams.get('ids') || '').trim();
        const productId = String(searchParams.get('productId') || '').trim();

        if (productId) {
            if (!productId.match(/^[a-fA-F0-9]{24}$/)) {
                return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
            }

            const product = await Product.findOne({ _id: productId, storeId }).lean();
            if (!product) {
                return NextResponse.json({ error: 'Product not found' }, { status: 404 });
            }

            return NextResponse.json(
                { product },
                { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } }
            );
        }

        if (idsParam) {
            const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 20);
            const products = await fetchPickerProductsByIds(Product, storeId, ids);
            return NextResponse.json(
                { products },
                { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } }
            );
        }

        if (idsOnly) {
            const { productIds, total } = await fetchPickerProductIds(Product, storeId, search);
            return NextResponse.json(
                { productIds, total },
                { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } }
            );
        }

        if (isPaginated) {
            const page = Math.max(1, Number.parseInt(pageParam || '1', 10) || 1);
            const manage = searchParams.get('manage') === 'true';
            const maxLimit = manage ? 500 : 48;
            const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(searchParams.get('limit') || '24', 10) || 24));
            const sort = searchParams.get('sort') || 'newest';
            const category = String(searchParams.get('category') || '').trim();
            const media = searchParams.get('media') === 'true';
            const detailsProgress = String(searchParams.get('detailsProgress') || 'all').trim();
            const pickerResult = await fetchPickerPage(Product, {
                storeId,
                page,
                limit,
                search,
                sort,
                category,
                mode: manage ? 'manage' : media ? 'media' : 'picker',
                detailsProgress: manage ? detailsProgress : 'all',
            });

            if (manage) {
                const categories = await Category.find({})
                    .select('_id name nameAr slug legacySourceId parentId')
                    .lean();
                const categoryLookup = buildCategoryLookup(categories);
                pickerResult.products = pickerResult.products.map((product) => ({
                    ...product,
                    categoryNames: getProductCategoryLabels(product, categoryLookup),
                }));
                pickerResult.categoryLookup = categoryLookup;
            }

            return NextResponse.json(
                pickerResult,
                { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } }
            );
        }

        if (picker) {
            if (!search || search.length < 2) {
                return NextResponse.json(
                    {
                        products: [],
                        pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
                    },
                    { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } },
                );
            }

            const limit = Math.min(48, Math.max(1, Number.parseInt(searchParams.get('limit') || '12', 10) || 12));
            const pickerResult = await fetchPickerPage(Product, {
                storeId,
                page: 1,
                limit,
                search,
                sort: 'relevance',
                mode: 'picker',
            });

            return NextResponse.json(
                { products: pickerResult.products, pagination: pickerResult.pagination },
                { headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' } },
            );
        }

        const STORE_PRODUCT_LIST_SELECT =
            '_id name slug sku price AED mrp images category categories inStock stockQuantity fastDelivery freeShippingEligible createdAt updatedAt tags hasVariants imageAspectRatio';

        const [products, categories] = await Promise.all([
            Product.find({ storeId })
                .select(slim ? '_id name slug sku price AED images category inStock createdAt' : STORE_PRODUCT_LIST_SELECT)
                .sort({ createdAt: -1 })
                .lean(),
            Category.find({}).select('_id name nameAr slug legacySourceId parentId').lean(),
        ]);

        const enrichedProducts = products.map((product) => ({
                ...product,
                categoryNames: getProductCategoryLabels(product, buildCategoryLookup(categories)),
            }));

        const responsePayload = {
                products: enrichedProducts,
                categoryLookup: buildCategoryLookup(categories),
            };

        return NextResponse.json(
            responsePayload,
            {
                headers: {
                    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
                },
            }
        );
    } catch (error) {
        console.error('[GET /api/store/product]', error);
        return NextResponse.json(
            { error: error?.message || 'Failed to load products' },
            { status: 500 },
        );
    }
}

// PUT: Update a product
export async function PUT(request) {
    try {
        await connectDB();

        // Firebase Auth: Extract token from Authorization header
        const authHeader = request.headers.get('authorization');
        let userId = null;
        let decodedToken = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const { getAuth } = await import('@/lib/firebase-admin');
                const adminAuth = getAuth();
                decodedToken = await adminAuth.verifyIdToken(idToken);
                userId = decodedToken.uid;
            } catch (e) {
                console.error('Auth verification failed (PUT /api/store/product):', e.message);
                return NextResponse.json({ error: 'Auth verification failed', detail: e.message }, { status: 401 });
            }
        }
        const storeId = await authSeller(userId);
        if (!storeId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const access = await resolveDashboardAccess(userId, decodedToken || {});
        const canChangePrice = canChangeProductPricing(access);

        const contentType = request.headers.get('content-type')?.toLowerCase() || '';
        if (contentType.includes('application/json')) {
            const body = await request.json();

            // Legacy: images-only quick update
            if (body?.productId && Array.isArray(body?.images) && body?.name === undefined && body?.description === undefined) {
                const { productId, images } = body || {};
                if (!productId || typeof productId !== 'string' || !productId.match(/^[a-fA-F0-9]{24}$/)) {
                    return NextResponse.json({ error: "Product ID required or invalid format" }, { status: 400 });
                }

                const product = await Product.findById(productId)
                    .select('_id storeId images')
                    .lean();
                if (!product || String(product.storeId) !== String(storeId)) {
                    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
                }

                const updated = await Product.findByIdAndUpdate(
                    productId,
                    { images: images.filter(Boolean) },
                    { new: true }
                ).lean();

                invalidateStorefrontProductCaches();
                return NextResponse.json({ message: "Product updated successfully", product: updated });
            }

            try {
                const updated = await updateProductFromJson(body, storeId, { canChangePrice });
                return NextResponse.json({ message: "Product updated successfully", product: updated });
            } catch (error) {
                const message = error?.message || 'Failed to update product';
                const status = error?.statusCode
                    || (message.includes('Not authorized') ? 401
                        : (message.includes('Slug') || message.includes('required') || message.includes('invalid')
                            || message.includes('Cannot') || message.includes('Switch') || message.includes('Only the store')
                            ? 400 : 500));
                return NextResponse.json({ error: message }, { status });
            }
        }

        const formData = await request.formData();
        
        // Debug: print formData keys and values
        const debugFormData = {};
        for (const key of formData.keys()) {
            debugFormData[key] = formData.get(key);
        }
        console.log('PUT /api/store/product formData:', debugFormData);
        const productId = formData.get("productId");
        const name = formData.get("name");
        const nameAr = formData.get("nameAr") || undefined;
        const description = formData.get("description");
        const descriptionAr = formData.get("descriptionAr") || undefined;
        const category = formData.get("category"); // Kept for backward compatibility
        const categoriesRaw = formData.get("categories"); // New: JSON array of category IDs
        const sku = formData.get("sku");
        const brand = formData.get("brand") || undefined;
        const brandAr = formData.get("brandAr") || undefined;
        const shortDescriptionRaw = formData.get("shortDescription");
        const shortDescriptionArRaw = formData.get("shortDescriptionAr");
        const shortDescription2Raw = formData.get("shortDescription2");
        const aPlusDesktop = formData.get("aPlusDesktop");
        const aPlusMobile = formData.get("aPlusMobile");
        const aPlusDesktopAr = formData.get("aPlusDesktopAr");
        const aPlusMobileAr = formData.get("aPlusMobileAr");
        const aPlusDesktopImagesRaw = formData.get("aPlusDesktopImages");
        const aPlusMobileImagesRaw = formData.get("aPlusMobileImages");
        const specTableEnabledRaw = formData.get("specTableEnabled");
        const specTableColumnsRaw = formData.get("specTableColumns");
        const specTableRowsRaw = formData.get("specTableRows");
        const images = formData.getAll("images");
        const stockQuantity = formData.get("stockQuantity") ? Number(formData.get("stockQuantity")) : undefined;
        const soldCountRaw = formData.get("soldCount");
        const soldCount = soldCountRaw === null || soldCountRaw === undefined || soldCountRaw === ''
            ? undefined
            : Math.max(0, Number(soldCountRaw) || 0);
        // Variants support (resolved below — do not treat missing field as "clear variants")
        const variantsRaw = formData.get("variants");
        const attributesRaw = formData.get("attributes");
        const AED = formData.get("AED") ? Number(formData.get("AED")) : undefined;
        const price = formData.get("price") ? Number(formData.get("price")) : undefined;
        const fastDelivery = String(formData.get("fastDelivery") || "").toLowerCase() === "true";
        const freeShippingEligible = String(formData.get("freeShippingEligible") || "").toLowerCase() === "true";
        const hsCode = formData.get("hsCode") != null ? String(formData.get("hsCode") || '').trim() : undefined;
        const originCountry = formData.get("originCountry") != null ? String(formData.get("originCountry") || '').trim().toUpperCase() : undefined;
        const shippingWeightKgRaw = formData.get("shippingWeightKg");
        const shippingWeightKg = shippingWeightKgRaw != null && shippingWeightKgRaw !== ''
            ? Math.max(0, Number(shippingWeightKgRaw) || 0)
            : undefined;
        const useProductsPath = String(formData.get("useProductsPath") || "").toLowerCase() === "true";
        const imageAspectRatioRaw = formData.get("imageAspectRatio");
        const cardVideoPreviewEnabledRaw = formData.get("cardVideoPreviewEnabled");
        const cardVideoPreviewDelaySecRaw = formData.get("cardVideoPreviewDelaySec");
        const tags = parseCsvOrJsonList(formData.get("tags"));
        const seoKeywords = parseCsvOrJsonList(formData.get("seoKeywords"));
        const seoTitle = (formData.get("seoTitle") || '').toString().trim();
        const seoDescription = (formData.get("seoDescription") || '').toString().trim();
        let slug = formData.get("slug")?.toString().trim() || "";
        if (slug) {
            slug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
            slug = slug.replace(/(^-|-$)+/g, '');
        }


        if (!productId || typeof productId !== 'string' || !productId.match(/^[a-fA-F0-9]{24}$/)) {
            console.error('Invalid or missing productId:', productId);
            return NextResponse.json({ error: "Product ID required or invalid format" }, { status: 400 });
        }

        let product;
        try {
                        product = await Product.findById(productId)
                            .select('_id storeId name slug price AED images description variants attributes inStock shortDescription shortDescriptionAr shortDescription2 specTableEnabled specTableColumns specTableRows imageAspectRatio categories category hasVariants freeShippingEligible useProductsPath fastDelivery stockQuantity sku')
              .lean();
        } catch (err) {
            console.error('Product.findById error:', err, 'productId:', productId);
            return NextResponse.json({ error: "Invalid productId format" }, { status: 400 });
        }
                if (!product || String(product.storeId) !== String(storeId)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        let imagesUrl = product.images;
        // If images are all strings (URLs), treat as full replacement (for deletion)
        if (images.length > 0) {
            if (images.every(img => typeof img === 'string')) {
                imagesUrl = images;
            } else {
                const uploaded = await uploadMedia(images.filter(img => typeof img !== 'string'));
                // Keep existing URLs, append new uploads
                imagesUrl = [...product.images, ...uploaded];
            }
        }

        // Compute variants/price/AED/inStock — never auto-min or silently clear packs
        let variants = product.variants || [];
        let attributes = product.attributes || {};
        if (attributesRaw) {
            try {
                const parsed = JSON.parse(attributesRaw) || {};
                attributes = { ...(product.attributes || {}), ...parsed };
                if (!attributes.variantType) {
                    delete attributes.variantType;
                }
            } catch {}
        }

        let incomingVariants = undefined;
        const hasVariantsField = formData.get("hasVariants");
        const requestedHasVariants = hasVariantsField !== null && hasVariantsField !== undefined && String(hasVariantsField) !== ''
            ? String(hasVariantsField).toLowerCase() === 'true'
            : undefined;
        if (variantsRaw !== null && variantsRaw !== undefined && String(variantsRaw) !== '') {
            try { incomingVariants = JSON.parse(variantsRaw || "[]"); } catch { incomingVariants = []; }
        }

        let finalPrice;
        let finalAED;
        let inStock;
        let hasVariantsResolved;
        try {
            const priced = resolveProductUpdatePricing({
                existing: product,
                body: {
                    hasVariants: requestedHasVariants,
                    variants: incomingVariants,
                    price,
                    AED,
                    stockQuantity,
                    attributes,
                },
                canChangePrice,
            });
            hasVariantsResolved = priced.hasVariants;
            variants = priced.variants;
            finalPrice = priced.finalPrice;
            finalAED = priced.finalAED;
            inStock = priced.inStock;
        } catch (error) {
            return NextResponse.json(
                { error: error?.message || 'Invalid pricing update' },
                { status: error?.statusCode || 400 },
            );
        }

        let shortDescription = typeof shortDescriptionRaw === 'string' ? shortDescriptionRaw : product.shortDescription;
        let shortDescriptionAr = typeof shortDescriptionArRaw === 'string' ? shortDescriptionArRaw : product.shortDescriptionAr;
        let shortDescription2 = typeof shortDescription2Raw === 'string' ? shortDescription2Raw : (product.shortDescription2 || '');
        const specTableEnabled = specTableEnabledRaw !== null && specTableEnabledRaw !== undefined
            ? String(specTableEnabledRaw).toLowerCase() === 'true'
            : (product.specTableEnabled || false);
        const specTableColumns = specTableColumnsRaw !== null && specTableColumnsRaw !== undefined
            ? parseSpecTableColumns(specTableColumnsRaw)
            : (Array.isArray(product.specTableColumns) && product.specTableColumns.length > 0 ? product.specTableColumns : ['Property', 'Value']);
        const specTableRows = specTableRowsRaw !== null && specTableRowsRaw !== undefined
            ? parseSpecTableRows(specTableRowsRaw, specTableColumns.length)
            : (Array.isArray(product.specTableRows) ? parseSpecTableRows(product.specTableRows, specTableColumns.length) : []);
        if (attributes.shortDescription !== undefined) {
            shortDescription = attributes.shortDescription;
        }

        const imageAspectRatio = imageAspectRatioRaw || product.imageAspectRatio || "1:1";
        const cardVideoPreviewEnabled = cardVideoPreviewEnabledRaw !== null && cardVideoPreviewEnabledRaw !== undefined
            ? String(cardVideoPreviewEnabledRaw).toLowerCase() === 'true'
            : (product.cardVideoPreviewEnabled !== false);
        const cardVideoPreviewDelaySec = cardVideoPreviewDelaySecRaw !== null && cardVideoPreviewDelaySecRaw !== undefined
            ? Math.min(120, Math.max(0, Number(cardVideoPreviewDelaySecRaw) || 24))
            : (Number(product.cardVideoPreviewDelaySec) || 24);

        // Parse categories - support both single category (backward compat) and multiple
        let categories = product.categories || [];
        console.log('DEBUG PUT: Starting with product.categories:', product.categories);
        
        // PRIORITY: If categoriesRaw (multiple categories) is provided, use it
        if (categoriesRaw) {
            try {
                const parsed = JSON.parse(categoriesRaw);
                console.log('DEBUG PUT: JSON parsed result:', parsed, 'isArray:', Array.isArray(parsed));
                if (Array.isArray(parsed) && parsed.length > 0) {
                    categories = parsed;
                }
                console.log('DEBUG PUT: Using categoriesRaw, categories:', categories, 'length:', categories.length);
                console.log('PUT: Parsed categories from form:', { raw: categoriesRaw, parsed, categories });
            } catch (e) {
                console.error('PUT: Error parsing categories:', categoriesRaw, e);
            }
        } 
        // FALLBACK: Only use single category if no multiple categories provided and nothing in DB
        else if (category && categories.length === 0) {
            categories = [category];
            console.log('DEBUG PUT: Using fallback single category:', category);
        }
        
        console.log('PUT: Final categories to save:', categories, 'count:', categories.length);
        categories = sanitizeCategoryIdsForSave(categories);

        // If slug is provided and changed, check uniqueness
        let updateData = {
            name,
            ...(nameAr !== undefined ? { nameAr } : {}),
            description,
            ...(descriptionAr !== undefined ? { descriptionAr } : {}),
            shortDescription,
            shortDescriptionAr,
            shortDescription2,
            ...(aPlusDesktop != null ? { aPlusDesktop } : {}),
            ...(aPlusMobile != null ? { aPlusMobile } : {}),
            ...(aPlusDesktopAr != null ? { aPlusDesktopAr } : {}),
            ...(aPlusMobileAr != null ? { aPlusMobileAr } : {}),
            ...(aPlusDesktopImagesRaw != null ? { aPlusDesktopImages: parseCsvOrJsonList(aPlusDesktopImagesRaw) } : {}),
            ...(aPlusMobileImagesRaw != null ? { aPlusMobileImages: parseCsvOrJsonList(aPlusMobileImagesRaw) } : {}),
            specTableEnabled,
            specTableColumns,
            specTableRows,
            ...(brand !== undefined ? { brand } : {}),
            ...(brandAr !== undefined ? { brandAr } : {}),
            AED: finalAED,
            price: finalPrice,
            category: categories[0], // Keep first category for backward compatibility
            categories, // New: store all categories
            images: imagesUrl,
            hasVariants: hasVariantsResolved,
            variants,
            attributes,
            inStock,
            fastDelivery,
            freeShippingEligible,
            ...(hsCode !== undefined ? { hsCode } : {}),
            ...(originCountry !== undefined ? { originCountry } : {}),
            ...(shippingWeightKg !== undefined ? { shippingWeightKg } : {}),
            useProductsPath,
            imageAspectRatio,
            cardVideoPreviewEnabled,
            cardVideoPreviewDelaySec,
            tags,
            seoTitle,
            seoDescription,
            seoKeywords,
        };

        // SKU is seller-managed only. Accept FormData SKU only when non-empty
        // (typed in the product form). Never wipe an existing SKU with blank "".
        const nextSku = sku !== null ? String(sku).trim() : '';
        if (nextSku) {
            updateData.sku = nextSku;
        }

        // Add stockQuantity if provided
        if (stockQuantity !== undefined) {
            updateData.stockQuantity = stockQuantity;
        }
        if (soldCount !== undefined) {
            updateData.soldCount = soldCount;
        }
        if (slug && slug !== product.slug) {
            const existing = await Product.findOne({ slug })
              .select('_id name slug')
              .lean();
            if (existing && existing._id.toString() !== productId) {
                return NextResponse.json({ error: "Slug already exists. Please use a different slug." }, { status: 400 });
            }
            updateData.slug = slug;
        }
        console.log('Product updateData:', updateData);
        console.log('PUT: Saving categories:', updateData.categories);
        product = await Product.findByIdAndUpdate(
            productId,
            updateData,
            { new: true }
        ).lean();
        
        console.log('PUT: Product updated with categories:', product.categories);
        
        // Verify by querying MongoDB directly
        const verifyUpdatedProduct = await Product.findById(product._id)
          .select('_id price mrp AED')
          .lean();
        console.log('VERIFY PUT from DB - product.categories:', verifyUpdatedProduct.categories);
        console.log('VERIFY PUT from DB - categories length:', verifyUpdatedProduct.categories?.length);

        invalidateStorefrontProductCaches();

        return NextResponse.json({ message: "Product updated successfully", product });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 });
    }
}

// DELETE: Delete a product
export async function DELETE(request) {
    try {
        await connectDB();

        // Firebase Auth: Extract token from Authorization header
        const authHeader = request.headers.get('authorization');
        let userId = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            const { getAuth } = await import('firebase-admin/auth');
            const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
            if (getApps().length === 0) {
                initializeApp({ credential: applicationDefault() });
            }
            try {
                const decodedToken = await getAuth().verifyIdToken(idToken);
                userId = decodedToken.uid;
            } catch (e) {
                // Not signed in, userId remains null
            }
        }
        const storeId = await authSeller(userId);
        if (!storeId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");
        if (!productId) return NextResponse.json({ error: "Product ID required" }, { status: 400 });

        const product = await Product.findById(productId).lean();
        if (!product || product.storeId !== storeId) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        await Product.findByIdAndDelete(productId);
        await Store.findByIdAndUpdate(storeId, {
            $pull: { featuredProductIds: productId },
        });
        invalidateStorefrontProductCaches();

        return NextResponse.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.code || error.message }, { status: 400 });
    }
}

