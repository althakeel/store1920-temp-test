import { NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import { getCachedData, setCachedData, invalidateStorefrontProductCaches } from '@/lib/cache'
import { buildFeaturedProductsListQuery, isManualFeaturedSelection, resolvePublicFeaturedStore } from '@/lib/featuredProducts'
import { getAuth } from '@/lib/firebase-admin'
import authSeller from '@/middlewares/authSeller'
import Store from '@/models/Store'
import Product from '@/models/Product'
import { attachProductRatings } from '@/lib/attachProductRatings'

const DEFAULT_FEATURED_RESPONSE = {
    productIds: [],
    sourceMode: 'manual',
    categoryIds: [],
    tags: [],
    sectionTitle: 'Craziest sale of the year!',
    sectionDescription: "Grab the best deals before they're gone!",
    sectionTitleAr: '',
    sectionDescriptionAr: '',
}

function createFeaturedResponse(payload, cacheable = false) {
    return NextResponse.json(payload, {
        headers: cacheable
            ? { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' }
            : { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }
    })
}

const normalizeList = (value) => {
    if (!Array.isArray(value)) return []
    return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)))
}

const normalizeMode = (value) => {
    if (value === 'category' || value === 'tag' || value === 'latest') return value
    return 'manual'
}

const normalizeId = (value) => {
    if (!value) return null
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (typeof value === 'object') {
        if (value.$oid) return String(value.$oid)
        const stringValue = value.toString?.()
        return stringValue && stringValue !== '[object Object]' ? String(stringValue) : null
    }
    return null
}

const buildProductProjection = '_id name nameAr slug price mrp AED images category categories tags inStock stockQuantity createdAt'

async function getUserIdFromAuthHeader(request) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null

    const idToken = authHeader.split('Bearer ')[1]
    try {
        const decodedToken = await getAuth().verifyIdToken(idToken)
        return decodedToken.uid || null
    } catch {
        return null
    }
}

export async function GET(request) {
    try {
        await connectDB()

        const { searchParams } = new URL(request.url)
        const includeProducts = searchParams.get('includeProducts') === 'true'
        const limit = Number(searchParams.get('limit') || 0)

        // If authenticated, always return the caller's own store data.
        let userId = null
        try {
            userId = await getUserIdFromAuthHeader(request)
        } catch (authError) {
            console.warn('[featured-products GET] auth lookup failed, falling back to public data:', authError?.message || authError)
        }

        const isPublicRequest = !userId
        const cacheKey = isPublicRequest ? `public:featured-products:api:v4:${includeProducts}:${limit}` : null
        if (cacheKey) {
            const cached = getCachedData(cacheKey)
            if (cached) {
                return createFeaturedResponse(cached, true)
            }
        }

        let store = null
        if (userId) {
            try {
                const storeId = await authSeller(userId)
                if (storeId) {
                    store = await Store.findById(storeId).lean()
                }
            } catch (sellerError) {
                console.warn('[featured-products GET] seller lookup failed, falling back to public data:', sellerError?.message || sellerError)
            }
        }

        // Public fallback: use the store that most recently listed an in-stock product.
        if (!store) {
            store = await resolvePublicFeaturedStore(Store, Product)
        }
        const sourceMode = normalizeMode(store?.featuredProductsSource)
        const productIds = normalizeList(store?.featuredProductIds)
        const categoryIds = normalizeList(store?.featuredProductsCategoryIds)
        const tags = normalizeList(store?.featuredProductsTags)
        const sectionTitle = store?.featuredSectionTitle || 'Craziest sale of the year!'
        const sectionDescription = store?.featuredSectionDescription || "Grab the best deals before they're gone!"
        const sectionTitleAr = store?.featuredSectionTitleAr || ''
        const sectionDescriptionAr = store?.featuredSectionDescriptionAr || ''

        const resolveProducts = async () => {
            if (isManualFeaturedSelection(sourceMode, productIds)) {
                const productsRaw = await Product.find({ _id: { $in: productIds } })
                    .select(buildProductProjection)
                    .lean()
                const productMap = new Map(productsRaw.map((product) => [product._id.toString(), product]))
                return productIds.map((id) => productMap.get(id)).filter(Boolean)
            }

            const { query, sort } = buildFeaturedProductsListQuery({
                sourceMode,
                productIds,
                categoryIds,
                tags,
                storeId: store?._id,
            })

            const productsRaw = await Product.find(query)
                .sort(sort)
                .select(buildProductProjection)
                .lean()

            return productsRaw
        }

        if (!includeProducts) {
            const payload = {
                productIds,
                sourceMode,
                categoryIds,
                tags,
                sectionTitle,
                sectionDescription,
                sectionTitleAr,
                sectionDescriptionAr,
            }
            if (cacheKey) setCachedData(cacheKey, payload, 120)
            return createFeaturedResponse(payload, isPublicRequest)
        }

        let products = await resolveProducts()

        if (limit > 0) {
            products = products.slice(0, limit)
        }
        products = await attachProductRatings(products)

        const resolvedProductIds = products.map((product) => normalizeId(product?._id || product?.id)).filter(Boolean)

        const payload = {
            productIds: resolvedProductIds,
            sourceMode,
            categoryIds,
            tags,
            sectionTitle,
            sectionDescription,
            sectionTitleAr,
            sectionDescriptionAr,
            products
        }
        if (cacheKey) setCachedData(cacheKey, payload, 120)
        return createFeaturedResponse(payload, isPublicRequest)
    } catch (error) {
        console.error('Error fetching featured products:', error)
        return createFeaturedResponse({
            ...DEFAULT_FEATURED_RESPONSE,
            products: []
        })
    }
}

export async function POST(request) {
    try {
        await connectDB()

        const userId = await getUserIdFromAuthHeader(request)
        if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

        const storeId = await authSeller(userId)
        if (!storeId) {
            return NextResponse.json({ error: 'Store not found for user' }, { status: 404 })
        }

        const { productIds, sourceMode, categoryIds, tags, sectionTitle, sectionDescription, sectionTitleAr, sectionDescriptionAr } = await request.json()

        // Validate productIds is an array
        if (!Array.isArray(productIds)) {
            return NextResponse.json({ error: 'productIds must be an array' }, { status: 400 })
        }

        const normalizedSourceMode = normalizeMode(sourceMode)
        const normalizedCategoryIds = normalizeList(categoryIds)
        const normalizedTags = normalizeList(tags)

        // Update store with featured product IDs
        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                featuredProductIds: productIds,
                featuredProductsSource: normalizedSourceMode,
                featuredProductsCategoryIds: normalizedCategoryIds,
                featuredProductsTags: normalizedTags,
                ...(typeof sectionTitle === 'string' ? { featuredSectionTitle: sectionTitle.trim() } : {}),
                ...(typeof sectionDescription === 'string' ? { featuredSectionDescription: sectionDescription.trim() } : {}),
                ...(typeof sectionTitleAr === 'string' ? { featuredSectionTitleAr: sectionTitleAr.trim() } : {}),
                ...(typeof sectionDescriptionAr === 'string' ? { featuredSectionDescriptionAr: sectionDescriptionAr.trim() } : {}),
            },
            { new: true, strict: false }
        )

        invalidateStorefrontProductCaches()

        return NextResponse.json({ 
            message: 'Featured products updated successfully',
            productIds: updatedStore.featuredProductIds,
            sourceMode: updatedStore.featuredProductsSource,
            categoryIds: updatedStore.featuredProductsCategoryIds || [],
            tags: updatedStore.featuredProductsTags || [],
            sectionTitle: updatedStore.featuredSectionTitle,
            sectionDescription: updatedStore.featuredSectionDescription,
            sectionTitleAr: updatedStore.featuredSectionTitleAr || '',
            sectionDescriptionAr: updatedStore.featuredSectionDescriptionAr || '',
        })
    } catch (error) {
        console.error('Error saving featured products:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
