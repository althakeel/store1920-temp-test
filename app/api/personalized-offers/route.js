import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PersonalizedOffer from "@/models/PersonalizedOffer";
import Product from "@/models/Product";
import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@/lib/firebase-admin";
import crypto from "crypto";
import { buildCustomerSitePath } from "@/lib/appUrl";

// Generate unique offer token
function generateOfferToken() {
  return crypto.randomBytes(16).toString('hex');
}

// GET: Fetch all personalized offers for a store
export async function GET(req) {
  try {
    // Authenticate seller
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const storeId = await authSeller(userId);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden - No store access' }, { status: 403 });
    }

    await dbConnect();
    
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // 'active', 'expired', 'used', 'all'

    let query = { storeId };

    // Filter by status
    if (status === 'active') {
      query.isActive = true;
      query.isUsed = false;
      query.expiresAt = { $gt: new Date() };
    } else if (status === 'expired') {
      query.expiresAt = { $lte: new Date() };
    } else if (status === 'used') {
      query.isUsed = true;
    }

    const offers = await PersonalizedOffer.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Fetch product details for each offer
    const offersWithProducts = await Promise.all(
      offers.map(async (offer) => {
        const product = await Product.findById(offer.productId)
          .select('name slug price mrp AED images')
          .lean();
        
        return {
          ...offer,
          product: product || null,
          isExpired: new Date() > new Date(offer.expiresAt),
          isValid: offer.isActive && !offer.isUsed && new Date() < new Date(offer.expiresAt)
        };
      })
    );

    return NextResponse.json({ 
      success: true, 
      offers: offersWithProducts,
      count: offersWithProducts.length,
      storeId: storeId // Include storeId for frontend filtering
    });

  } catch (error) {
    console.error("Error fetching personalized offers:", error);
    return NextResponse.json(
      { error: "Failed to fetch offers", details: error.message },
      { status: 500 }
    );
  }
}

// POST: Create a new personalized offer
export async function POST(req) {
  try {
    // Authenticate seller
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const storeId = await authSeller(userId);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden - No store access' }, { status: 403 });
    }

    await dbConnect();
    
    const body = await req.json();
    const {
      customerEmail,
      customerPhone,
      customerName,
      productId: rawProductId,
      discountPercent,
      expiresAt,
      notes
    } = body;

    const productId =
      rawProductId && typeof rawProductId === "object"
        ? String(rawProductId._id || rawProductId.id || "").trim()
        : String(rawProductId || "").trim();

    // Validation
    if (!storeId || !customerEmail || !productId || !discountPercent || !expiresAt) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (discountPercent < 0 || discountPercent > 100) {
      return NextResponse.json(
        { error: "Discount percent must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Check if valid expiry date
    const expiryDate = new Date(expiresAt);
    if (expiryDate <= new Date()) {
      return NextResponse.json(
        { error: "Expiry date must be in the future" },
        { status: 400 }
      );
    }

    // Generate unique token
    const offerToken = generateOfferToken();

    // Create offer
    const offer = await PersonalizedOffer.create({
      offerToken,
      storeId,
      customerEmail,
      customerPhone,
      customerName,
      productId: String(productId),
      discountPercent,
      expiresAt: expiryDate,
      notes,
      isActive: true
    });

    // Calculate discounted price
    const discountedPrice = offer.calculateDiscountedPrice(product.price);

    // Customer-facing offer URL (store1920.com).
    // Include token so the page can validate the exact offer, then it strips ?token= from the URL.
    const productSlug = String(product.slug || "").trim();
    const offerUrl = productSlug
      ? buildCustomerSitePath(
          `/offer/${encodeURIComponent(productSlug)}?token=${encodeURIComponent(offerToken)}`
        )
      : buildCustomerSitePath(`/offer/${offerToken}`);

    return NextResponse.json({
      success: true,
      message: "Personalized offer created successfully",
      offer: {
        ...offer.toObject(),
        product: {
          name: product.name,
          slug: product.slug,
          price: product.price,
          AED: product.AED,
          image: product.images?.[0]
        },
        discountedPrice,
        offerUrl
      }
    }, { status: 201 });

  } catch (error) {
    console.error("Error creating personalized offer:", error);
    return NextResponse.json(
      { error: "Failed to create offer", details: error.message },
      { status: 500 }
    );
  }
}

// PUT: Update an existing personalized offer
export async function PUT(req) {
  try {
    await dbConnect();
    
    const body = await req.json();
    const {
      offerId,
      discountPercent,
      expiresAt,
      isActive,
      notes
    } = body;

    if (!offerId) {
      return NextResponse.json(
        { error: "Offer ID is required" },
        { status: 400 }
      );
    }

    const updateFields = {};
    if (discountPercent !== undefined) {
      if (discountPercent < 0 || discountPercent > 100) {
        return NextResponse.json(
          { error: "Discount percent must be between 0 and 100" },
          { status: 400 }
        );
      }
      updateFields.discountPercent = discountPercent;
    }
    
    if (expiresAt !== undefined) {
      const expiryDate = new Date(expiresAt);
      if (expiryDate <= new Date()) {
        return NextResponse.json(
          { error: "Expiry date must be in the future" },
          { status: 400 }
        );
      }
      updateFields.expiresAt = expiryDate;
    }
    
    if (isActive !== undefined) updateFields.isActive = isActive;
    if (notes !== undefined) updateFields.notes = notes;

    const offer = await PersonalizedOffer.findByIdAndUpdate(
      offerId,
      { $set: updateFields },
      { new: true }
    );

    if (!offer) {
      return NextResponse.json(
        { error: "Offer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Offer updated successfully",
      offer
    });

  } catch (error) {
    console.error("Error updating personalized offer:", error);
    return NextResponse.json(
      { error: "Failed to update offer", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Delete a personalized offer
export async function DELETE(req) {
  try {
    await dbConnect();
    
    const { searchParams } = new URL(req.url);
    const offerId = searchParams.get("offerId");

    if (!offerId) {
      return NextResponse.json(
        { error: "Offer ID is required" },
        { status: 400 }
      );
    }

    const offer = await PersonalizedOffer.findByIdAndDelete(offerId);

    if (!offer) {
      return NextResponse.json(
        { error: "Offer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Offer deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting personalized offer:", error);
    return NextResponse.json(
      { error: "Failed to delete offer", details: error.message },
      { status: 500 }
    );
  }
}
