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

// PUT - Update a coupon
export async function PUT(req, { params }) {
    try {
        const storeId = await resolveStoreId(req);
        if (!storeId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const { code } = await params;
        const normalizedCode = String(code || '').toUpperCase();

        const existingCoupon = await Coupon.findOne({
            code: normalizedCode,
            storeId,
        }).lean();

        if (!existingCoupon) {
            return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
        }

        const body = await req.json();
        const {
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
            isActive,
            expiresAt
        } = body;

        const updateData = {};
        if (description !== undefined) updateData.description = description;
        if (discount !== undefined) {
            const parsedDiscount = parseCouponNumber(discount, NaN);
            if (!Number.isFinite(parsedDiscount)) {
                return NextResponse.json({ error: 'Discount must be a valid number' }, { status: 400 });
            }
            updateData.discount = parsedDiscount;
            updateData.discountValue = parsedDiscount;
        }
        if (discountType !== undefined) updateData.discountType = discountType;
        if (maxDiscount !== undefined) {
            updateData.maxDiscount = parseCouponNumber(maxDiscount, null);
        }
        if (minPrice !== undefined) {
            const parsedMinPrice = parseCouponNumber(minPrice, 0);
            updateData.minPrice = parsedMinPrice;
            updateData.minOrderValue = parsedMinPrice;
        }
        if (minProductCount !== undefined) {
            updateData.minProductCount = parseCouponNumber(minProductCount, null);
        }
        if (specificProducts !== undefined) updateData.specificProducts = specificProducts;
        if (forNewUser !== undefined) updateData.forNewUser = forNewUser;
        if (forMember !== undefined) updateData.forMember = forMember;
        if (firstOrderOnly !== undefined) updateData.firstOrderOnly = firstOrderOnly;
        if (oneTimePerUser !== undefined) updateData.oneTimePerUser = oneTimePerUser;
        if (usageLimit !== undefined) {
            const parsedLimit = parseCouponNumber(usageLimit, null);
            updateData.usageLimit = parsedLimit;
            updateData.maxUses = parsedLimit;
        }
        if (isPublic !== undefined) updateData.isPublic = isPublic;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (expiresAt) updateData.expiresAt = new Date(expiresAt);

        if (discount !== undefined && discountType !== undefined) {
            updateData.title = `${discount}${discountType === 'percentage' ? '% Off' : ' Off'}`;
        }

        const coupon = await Coupon.findOneAndUpdate(
            { code: normalizedCode, storeId },
            updateData,
            { new: true }
        ).lean();

        if (!coupon) {
            return NextResponse.json({ error: "Failed to update coupon" }, { status: 404 });
        }

        return NextResponse.json({ coupon, success: true }, { status: 200 });
    } catch (error) {
        console.error("Error updating coupon:", error);
        return NextResponse.json({ error: error.message || "Failed to update coupon" }, { status: 500 });
    }
}

// DELETE - Delete a coupon
export async function DELETE(req, { params }) {
    try {
        const storeId = await resolveStoreId(req);
        if (!storeId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const { code } = await params;
        const normalizedCode = String(code || '').toUpperCase();

        const existingCoupon = await Coupon.findOne({ code: normalizedCode }).lean();
        if (!existingCoupon || existingCoupon.storeId !== storeId) {
            return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
        }

        await Coupon.findOneAndDelete({ code: normalizedCode, storeId });

        return NextResponse.json({ message: "Coupon deleted successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting coupon:", error);
        return NextResponse.json({ error: "Failed to delete coupon" }, { status: 500 });
    }
}
