import { NextResponse } from "next/server";
import authAdmin from "@/middlewares/authAdmin";
import authSeller from "@/middlewares/authSeller";
import connectDB from '@/lib/mongodb';
import Category from '@/models/Category';
import { localizeRecord, resolveStorefrontLanguage } from '@/lib/storefrontLanguage';
import { cleanDisplayText, sanitizeCategoryFields, sanitizeCategoryTree } from '@/lib/displayText';
import { buildCategoryLookup, getProductCategoryLabels } from '@/lib/categoryLookup';
import { getCachedData, setCachedData } from '@/lib/cache';
import { invalidateCategoryCaches } from '@/lib/categoryCache';

const CATEGORY_TREE_CACHE_KEY = 'public:categories:tree:v2';

// GET - Fetch all categories with their children
export async function GET(req) {
    try {
        const language = resolveStorefrontLanguage(req);
        const cacheKey = `${CATEGORY_TREE_CACHE_KEY}:${language}`;
        const isStoreDashboardRequest = Boolean(req.headers.get('authorization')?.startsWith('Bearer '));
        const cached = !isStoreDashboardRequest ? getCachedData(cacheKey) : null;
        if (cached) {
            const isDev = process.env.NODE_ENV !== 'production';
            return NextResponse.json(cached, {
                status: 200,
                headers: {
                    'Cache-Control': isDev ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=900',
                    'X-Cache': 'HIT',
                },
            });
        }

        await connectDB();

        const allCategories = await Category.find({ isActive: { $ne: false } })
            .sort({ level: 1, sortOrder: 1, name: 1 })
            .lean();

        const childrenByParent = new Map();
        for (const category of allCategories) {
            const parentId = category.parentId ? String(category.parentId) : '';
            if (!parentId) continue;
            if (!childrenByParent.has(parentId)) {
                childrenByParent.set(parentId, []);
            }
            childrenByParent.get(parentId).push(category);
        }

        const categoriesWithChildren = allCategories.map((category) => {
            const children = (childrenByParent.get(String(category._id)) || [])
                .sort((first, second) => (first.sortOrder || 0) - (second.sortOrder || 0)
                    || String(first.name || '').localeCompare(String(second.name || '')))
                .map((child) => localizeRecord(sanitizeCategoryFields(child), language, ['name', 'description']));

            return localizeRecord(sanitizeCategoryFields({
                ...category,
                children,
            }), language, ['name', 'description']);
        });

        const lookup = buildCategoryLookup(allCategories);

        const payload = {
            categories: sanitizeCategoryTree(categoriesWithChildren),
            lookup,
        };

        setCachedData(cacheKey, payload, 300);

        const isDev = process.env.NODE_ENV !== 'production';
        return NextResponse.json(payload, {
            status: 200,
            headers: {
                'Cache-Control': isDev ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=900',
                'X-Cache': 'MISS',
            },
        });
    } catch (error) {
        console.error("Error fetching categories:", error);
        return NextResponse.json({ error: "Failed to fetch categories", details: error.message }, { status: 500 });
    }
}

// POST - Create a new category
export async function POST(req) {

    try {
        await connectDB();
        
        // Firebase Auth
        const authHeader = req.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const idToken = authHeader.split(" ")[1];
        const { getAuth } = await import('firebase-admin/auth');
        const { initializeApp, applicationDefault, getApps } = await import('firebase-admin/app');
        if (getApps().length === 0) {
            initializeApp({ credential: applicationDefault() });
        }
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (e) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = decodedToken.uid;
        const email = decodedToken.email;
        
        // Allow if admin, else fallback to store owner check
        let isAuthorized = false;
        if (userId && email && await authAdmin(userId, email)) {
            isAuthorized = true;
        } else if (userId) {
            const storeId = await authSeller(userId);
            if (storeId) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { name, nameAr, description, descriptionAr, image, parentId, metaTitle, metaDescription } = await req.json();
        const cleanedName = sanitizeCategoryFields({ name }).name;
        if (!cleanedName) {
            return NextResponse.json({ error: "Category name is required" }, { status: 400 });
        }

        // Generate slug from name
        const slug = cleanedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Check if slug already exists
        const existingCategory = await Category.findOne({ slug }).lean();

        if (existingCategory) {
            return NextResponse.json({ error: "Category with this name already exists" }, { status: 400 });
        }

        // Create category
        const category = await Category.create({
            name: cleanedName,
            nameAr: cleanDisplayText(nameAr || ''),
            slug,
            description: cleanDisplayText(description || '') || null,
            descriptionAr: cleanDisplayText(descriptionAr || ''),
            image: image || null,
            parentId: parentId || null,
            metaTitle: cleanDisplayText(metaTitle || '').slice(0, 120),
            metaDescription: cleanDisplayText(metaDescription || '').slice(0, 320),
        });

        invalidateCategoryCaches();

        // Populate parent and children
        const parent = category.parentId ? await Category.findById(category.parentId).lean() : null;
        const children = await Category.find({ parentId: category._id }).lean();

        return NextResponse.json({ category: { ...category.toObject(), parent, children } }, { status: 201 });
    } catch (error) {
        console.error("Error creating category:", error);
        return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
    }
}
