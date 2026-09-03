import { NextResponse } from "next/server";
import connectDB from '@/lib/mongodb';
import Coupon from '@/models/Coupon';
import Store from '@/models/Store';

// GET - Fetch all coupons for the store
export async function GET(req) {
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

        // Get store
        const store = await Store.findOne({ userId }).lean();

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        // Get all coupons for this store
        const coupons = await Coupon.find({ storeId: store._id.toString() })
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json({ coupons }, { status: 200 });
    } catch (error) {
        console.error("Error fetching coupons:", error);
        return NextResponse.json({ error: "Failed to fetch coupons" }, { status: 500 });
    }
}

// POST - Create a new coupon
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

        // Get store
        const store = await Store.findOne({ userId }).lean();

        if (!store) {
            return NextResponse.json({ error: "Store not found" }, { status: 404 });
        }

        const body = await req.json();
        const {
            code,
            description,
            discount,
            discountType,
            maxDiscount,
            minPrice,
            minProductCount,
            specificProducts,
            forNewUser,
            forMember,
            firstOrderOnly,
            oneTimePerUser,
            usageLimit,
            isPublic,
            expiresAt
        } = body;

        // Validate required fields
        if (!code || !description || discount === undefined || !discountType || !expiresAt) {
            return NextResponse.json({ 
                error: "Missing required fields: code, description, discount, discountType, expiresAt" 
            }, { status: 400 });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() }).lean();

        if (existingCoupon) {
            return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 });
        }

        // Create coupon
        const coupon = await Coupon.create({
            code: code.toUpperCase(),
            title: `${discount}${discountType === 'percentage' ? '% Off' : ' Off'}`, // Auto-generate title
            description,
            discount: parseFloat(discount),
            discountType: discountType || 'percentage',
            discountValue: parseFloat(discount), // Add new field
            maxDiscount: maxDiscount !== undefined && maxDiscount !== '' && maxDiscount !== null
                ? parseFloat(maxDiscount)
                : undefined,
            minPrice: minPrice ? parseFloat(minPrice) : 0,
            minOrderValue: minPrice ? parseFloat(minPrice) : 0, // Add new field
            minProductCount: minProductCount ? parseInt(minProductCount) : null,
            specificProducts: specificProducts || [],
            forNewUser: forNewUser || false,
            forMember: forMember || false,
            firstOrderOnly: firstOrderOnly || false,
            oneTimePerUser: oneTimePerUser || false,
            usageLimit: usageLimit ? parseInt(usageLimit) : null,
            maxUses: usageLimit ? parseInt(usageLimit) : null, // Add new field
            isPublic: isPublic !== undefined ? isPublic : true,
            isActive: true,
            storeId: store._id.toString(),
            expiresAt: new Date(expiresAt)
        });

        console.log('Coupon created:', {
            code: coupon.code,
            storeId: coupon.storeId,
            isActive: coupon.isActive,
            expiresAt: coupon.expiresAt
        });

        return NextResponse.json({ coupon, success: true }, { status: 201 });
    } catch (error) {
        console.error("Error creating coupon:", error);
        return NextResponse.json({ error: error.message || "Failed to create coupon" }, { status: 500 });
    }
}
