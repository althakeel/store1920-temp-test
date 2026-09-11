import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { getAuth } from "@/lib/firebase-admin";
import WishlistItem from "@/models/WishlistItem";
import Product from "@/models/Product";

function parseAuthHeader(request) {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    return authHeader.split(' ')[1] || null;
}

async function getUserIdFromRequest(request) {
    const idToken = parseAuthHeader(request);
    if (!idToken) {
        return null;
    }

    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        return decodedToken?.uid || null;
    } catch {
        return null;
    }
}

// GET - Fetch user's wishlist
export async function GET(request) {
    try {
        const userId = await getUserIdFromRequest(request);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view');
        
        // Connect to database
        try {
            await dbConnect();
        } catch (dbError) {
            console.error('Database connection error:', dbError);
            return NextResponse.json({ 
                error: 'Database connection failed',
                details: dbError?.message 
            }, { status: 500 });
        }

        if (view === 'count') {
            const count = await WishlistItem.countDocuments({ userId });
            return NextResponse.json({ count });
        }
        
        const wishlistItems = await WishlistItem.find({ userId }).sort({ createdAt: -1 }).lean();

        // Populate product data in a single query (avoids N+1 DB calls)
        const validProductIds = [...new Set(
            wishlistItems
                .map(item => item?.productId)
                .filter(pid => typeof pid === 'string' && /^[a-fA-F0-9]{24}$/.test(pid))
        )];

        let products = [];

        if (validProductIds.length) {
            try {
                products = await Product.find({ _id: { $in: validProductIds } })
                    .select('_id name nameAr slug price mrp AED images inStock stockQuantity createdAt')
                    .lean();
            } catch (productError) {
                console.error('Error fetching wishlist products:', productError);
            }
        }

        const productMap = new Map(products.map(p => [String(p._id), p]));

        for (const item of wishlistItems) {
            item.product = productMap.get(String(item.productId)) || null;
        }

        return NextResponse.json({ wishlist: wishlistItems });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        const errorMessage = error?.message || 'Failed to fetch wishlist';
        const statusCode = error?.statusCode || 500;
        return NextResponse.json({ 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        }, { status: statusCode });
    }
}

// POST - Add/Remove product from wishlist
export async function POST(request) {
    try {
        const userId = await getUserIdFromRequest(request);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { productId, action } = await request.json();

        if (!productId || !action) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Connect to database
        try {
            await dbConnect();
        } catch (dbError) {
            console.error('Database connection error:', dbError);
            return NextResponse.json({ 
                error: 'Database connection failed',
                details: dbError?.message 
            }, { status: 500 });
        }

        if (action === 'add') {
            // Check if already in wishlist
            const existing = await WishlistItem.findOne({ userId, productId }).lean();

            if (existing) {
                return NextResponse.json({ message: 'Already in wishlist', inWishlist: true });
            }

            // Add to wishlist
            await WishlistItem.create({
                userId,
                productId
            });

            return NextResponse.json({ message: 'Added to wishlist', inWishlist: true });
        } else if (action === 'remove') {
            // Remove from wishlist
            await WishlistItem.findOneAndDelete({ userId, productId });

            return NextResponse.json({ message: 'Removed from wishlist', inWishlist: false });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error updating wishlist:', error);
        const errorMessage = error?.message || 'Failed to update wishlist';
        const statusCode = error?.statusCode || 500;
        return NextResponse.json({ 
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        }, { status: statusCode });
    }
}
