import { NextResponse } from "next/server";
import connectDB from '@/lib/mongodb';
import Coupon from '@/models/Coupon';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';

function parseCouponNumber(value, emptyValue) {
    if (value === '' || value === null || value === undefined) return emptyValue;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : emptyValue;
}

async function resolveStoreId(req) {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return null;

    try {
        const decoded = await getAuth().verifyIdToken(authHeader.replace('Bearer ', ''));
        return authSeller(decoded.uid);
    } catch {
        return null;
    }
}

// GET - Fetch all coupons for the store
export async function GET(req) {
    try {
        const storeId = await resolveStoreId(req);
        if (!storeId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const coupons = await Coupon.find({ storeId })
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
        const storeId = await resolveStoreId(req);
        if (!storeId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

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

        if (!code || !description || discount === undefined || !discountType || !expiresAt) {
            return NextResponse.json({
                error: "Missing required fields: code, description, discount, discountType, expiresAt"
            }, { status: 400 });
        }

        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() }).lean();
        if (existingCoupon) {
            return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 });
        }

        const coupon = await Coupon.create({
            code: code.toUpperCase(),
            title: `${discount}${discountType === 'percentage' ? '% Off' : ' Off'}`,
            description,
            discount: parseCouponNumber(discount, 0),
            discountType: discountType || 'percentage',
            discountValue: parseCouponNumber(discount, 0),
            maxDiscount: parseCouponNumber(maxDiscount, undefined),
            minPrice: parseCouponNumber(minPrice, 0),
            minOrderValue: parseCouponNumber(minPrice, 0),
            minProductCount: parseCouponNumber(minProductCount, null),
            specificProducts: specificProducts || [],
            forNewUser: forNewUser || false,
            forMember: forMember || false,
            firstOrderOnly: firstOrderOnly || false,
            oneTimePerUser: oneTimePerUser || false,
            usageLimit: usageLimit ? parseInt(usageLimit) : null,
            maxUses: usageLimit ? parseInt(usageLimit) : null,
            isPublic: isPublic !== undefined ? isPublic : true,
            isActive: true,
            storeId,
            expiresAt: new Date(expiresAt)
        });

        return NextResponse.json({ coupon, success: true }, { status: 201 });
    } catch (error) {
        console.error("Error creating coupon:", error);
        return NextResponse.json({ error: error.message || "Failed to create coupon" }, { status: 500 });
    }
}
