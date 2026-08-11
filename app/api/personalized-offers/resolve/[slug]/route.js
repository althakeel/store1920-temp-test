import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PersonalizedOffer from "@/models/PersonalizedOffer";
import Product from "@/models/Product";

function extractSlugFromRequest(req, paramsSlug) {
  const fromParams = decodeURIComponent(String(paramsSlug || "").trim());
  if (fromParams) return fromParams;

  try {
    const { pathname, searchParams } = new URL(req.url);
    const fromQuery = decodeURIComponent(
      String(searchParams.get("slug") || "").trim()
    );
    if (fromQuery) return fromQuery;

    // /api/personalized-offers/resolve/:slug
    const parts = pathname.split("/").filter(Boolean);
    const resolveIdx = parts.findIndex((p) => p === "resolve");
    if (resolveIdx >= 0 && parts[resolveIdx + 1]) {
      return decodeURIComponent(String(parts[resolveIdx + 1]).trim());
    }
  } catch {
    // ignore parse errors
  }

  return "";
}

// GET: Resolve latest active personalized offer by product slug
export async function GET(req, context) {
  try {
    await dbConnect();

    const resolvedParams = context?.params ? await context.params : {};
    const slug = extractSlugFromRequest(req, resolvedParams?.slug);

    if (!slug) {
      return NextResponse.json(
        { error: "Product slug is required" },
        { status: 400 }
      );
    }

    const product = await Product.findOne({ slug })
      .select(
        "_id name slug price mrp AED images description shortDescription category categories inStock stockQuantity sku hasVariants variants attributes hasBulkPricing bulkPricing fastDelivery allowReturn allowReplacement imageAspectRatio"
      )
      .lean();

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const now = new Date();

    // Match productId stored as string or ObjectId-like value
    const productIdStr = String(product._id);
    const offer = await PersonalizedOffer.findOne({
      $or: [{ productId: productIdStr }, { productId: product._id }],
      isActive: true,
      isUsed: false,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!offer) {
      return NextResponse.json(
        { error: "No active offer found for this product" },
        { status: 404 }
      );
    }

    const discountAmount = (product.price * offer.discountPercent) / 100;
    const discountedPrice =
      Math.round((product.price - discountAmount) * 100) / 100;
    const savings = Math.round(discountAmount * 100) / 100;
    const timeRemaining = new Date(offer.expiresAt) - now;

    return NextResponse.json({
      success: true,
      valid: true,
      expired: false,
      used: false,
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
    console.error("Error resolving offer by slug:", error);
    return NextResponse.json(
      { error: "Failed to resolve offer", details: error.message },
      { status: 500 }
    );
  }
}
