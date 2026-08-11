import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PersonalizedOffer from "@/models/PersonalizedOffer";
import Product from "@/models/Product";

function extractTokenFromRequest(req, paramsToken) {
  const fromParams = String(paramsToken || "").trim();
  if (fromParams) return fromParams;

  try {
    const { pathname, searchParams } = new URL(req.url);
    const fromQuery = String(searchParams.get("token") || "").trim();
    if (fromQuery) return fromQuery;

    // /api/personalized-offers/validate/:token
    const parts = pathname.split("/").filter(Boolean);
    const validateIdx = parts.findIndex((p) => p === "validate");
    if (validateIdx >= 0 && parts[validateIdx + 1]) {
      return decodeURIComponent(String(parts[validateIdx + 1]).trim());
    }
  } catch {
    // ignore
  }

  return "";
}

// GET: Validate and fetch offer details by token
export async function GET(req, context) {
  try {
    await dbConnect();

    const resolvedParams = context?.params ? await context.params : {};
    const token = extractTokenFromRequest(req, resolvedParams?.token);

    if (!token) {
      return NextResponse.json(
        { error: "Offer token is required" },
        { status: 400 }
      );
    }

    // Find offer by token
    const offer = await PersonalizedOffer.findOne({ offerToken: token }).lean();

    if (!offer) {
      return NextResponse.json(
        { error: "Invalid offer link", expired: false, notFound: true },
        { status: 404 }
      );
    }

    // Check if offer is valid
    const now = new Date();
    const isExpired = now > new Date(offer.expiresAt);
    const isValid = offer.isActive && !offer.isUsed && !isExpired;

    // Fetch product details
    const product = await Product.findById(offer.productId)
      .select(
        "_id name slug price mrp AED images description shortDescription category categories inStock stockQuantity sku hasVariants variants attributes hasBulkPricing bulkPricing fastDelivery allowReturn allowReplacement imageAspectRatio"
      )
      .lean();

    if (!product) {
      return NextResponse.json(
        { error: "Product not found for this offer" },
        { status: 404 }
      );
    }

    // Calculate discounted price
    const discountAmount = (product.price * offer.discountPercent) / 100;
    const discountedPrice =
      Math.round((product.price - discountAmount) * 100) / 100;
    const savings = Math.round(discountAmount * 100) / 100;

    // Calculate time remaining
    const timeRemaining = isExpired ? 0 : new Date(offer.expiresAt) - now;

    return NextResponse.json({
      success: true,
      valid: isValid,
      expired: isExpired,
      used: offer.isUsed,
      offer: {
        id: offer._id,
        offerToken: offer.offerToken,
        customerEmail: offer.customerEmail,
        customerName: offer.customerName,
        discountPercent: offer.discountPercent,
        expiresAt: offer.expiresAt,
        isActive: offer.isActive,
        isUsed: offer.isUsed,
        timeRemaining,
        notes: offer.notes,
      },
      product: {
        id: product._id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        shortDescription: product.shortDescription,
        images: product.images,
        originalPrice: product.price,
        AED: product.AED,
        discountedPrice,
        savings,
        discountPercent: offer.discountPercent,
        category: product.category,
        categories: product.categories,
        inStock: product.inStock,
        stockQuantity: product.stockQuantity,
        sku: product.sku,
        hasVariants: product.hasVariants,
        variants: product.variants,
        attributes: product.attributes,
        hasBulkPricing: product.hasBulkPricing,
        bulkPricing: product.bulkPricing,
        fastDelivery: product.fastDelivery,
        allowReturn: product.allowReturn,
        allowReplacement: product.allowReplacement,
        imageAspectRatio: product.imageAspectRatio || "1:1",
      },
    });
  } catch (error) {
    console.error("Error validating offer:", error);
    return NextResponse.json(
      { error: "Failed to validate offer", details: error.message },
      { status: 500 }
    );
  }
}

// POST: Mark offer as used (when customer completes purchase)
export async function POST(req, context) {
  try {
    await dbConnect();

    const resolvedParams = context?.params ? await context.params : {};
    const token = extractTokenFromRequest(req, resolvedParams?.token);
    const body = await req.json();
    const { orderId } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Offer token is required" },
        { status: 400 }
      );
    }

    const offer = await PersonalizedOffer.findOne({ offerToken: token });

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    // Check if already used
    if (offer.isUsed) {
      return NextResponse.json(
        { error: "This offer has already been used" },
        { status: 400 }
      );
    }

    // Check if expired
    if (new Date() > new Date(offer.expiresAt)) {
      return NextResponse.json(
        { error: "This offer has expired" },
        { status: 400 }
      );
    }

    // Mark as used
    offer.isUsed = true;
    offer.usedAt = new Date();
    if (orderId) {
      offer.orderId = orderId;
    }
    await offer.save();

    return NextResponse.json({
      success: true,
      message: "Offer marked as used",
    });
  } catch (error) {
    console.error("Error marking offer as used:", error);
    return NextResponse.json(
      { error: "Failed to mark offer as used", details: error.message },
      { status: 500 }
    );
  }
}
