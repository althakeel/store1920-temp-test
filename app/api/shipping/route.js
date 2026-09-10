import dbConnect from "@/lib/mongodb";
import ShippingSetting from "@/models/ShippingSetting";
import authSeller from "@/middlewares/authSeller";
import {
  resolveShippingOptions,
  sanitizeShippingOptionsPayload,
  syncLegacyFieldsFromOptions,
} from "@/lib/shippingOptions";

import { NextResponse } from "next/server";

function getPublicShippingFallback() {
  return {
    enabled: false,
    shippingType: "FLAT_RATE",
    flatRate: 0,
    perItemFee: 0,
    maxItemFee: null,
    weightUnit: "kg",
    baseWeight: 1,
    baseWeightFee: 0,
    additionalWeightFee: 0,
    freeShippingMin: 100,
    enableProductSpecificFreeShipping: false,
    productSpecificFreeShippingMode: "ORDER_LEVEL",
    localDeliveryFee: null,
    regionalDeliveryFee: null,
    estimatedDays: "2-5",
    enableCOD: true,
    enableCard: true,
    enableTabby: true,
    enableTamara: true,
    codFee: 0,
    maxCODAmount: 0,
    maxCardAmount: 0,
    maxTabbyAmount: 0,
    maxTamaraAmount: 0,
    enableExpressShipping: false,
    expressShippingFee: 0,
    expressEstimatedDays: "1-2",
    stateCharges: [],
    shippingOptions: resolveShippingOptions(null),
  };
}

async function resolveShippingStoreContext(request) {
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get("storeId");
  let isSeller = false;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const idToken = authHeader.split(" ")[1];
      const { getAuth } = await import("firebase-admin/auth");
      const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
      if (getApps().length === 0) {
        initializeApp({ credential: applicationDefault() });
      }
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const sellerStoreId = await authSeller(decodedToken.uid);
      if (sellerStoreId) {
        storeId = String(sellerStoreId);
        isSeller = true;
      }
    } catch {
      // Invalid token — continue as public request.
    }
  }

  return { storeId, isSeller };
}

// GET: Public - return shipping settings for a specific store
// Pass ?storeId=xxx in query params
// Authenticated sellers always receive their own store settings.
export async function GET(request) {
  try {
    await dbConnect();

    const { storeId, isSeller } = await resolveShippingStoreContext(request);

    console.log("=== SHIPPING API GET ===");
    console.log("Resolved storeId:", storeId, "isSeller:", isSeller);

    let setting = null;
    if (storeId) {
      setting = await ShippingSetting.findOne({ storeId }).lean();
    } else if (!isSeller) {
      setting = await ShippingSetting.findOne({}).lean();
    }

    if (setting) {
      const normalizedSetting = {
        ...setting,
        shippingOptions: resolveShippingOptions(setting),
      };
      return NextResponse.json({ setting: normalizedSetting }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    }

    if (isSeller) {
      return NextResponse.json({ setting: null }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      });
    }

    return NextResponse.json({ setting: getPublicShippingFallback() }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// PUT: Seller only - update or create singleton settings
export async function PUT(request) {
  try {
    // Extract userId from Firebase token in Authorization header
    const authHeader = request.headers.get("authorization");
    let userId = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split(" ")[1];
      const { getAuth } = await import("firebase-admin/auth");
      const { initializeApp, applicationDefault, getApps } = await import("firebase-admin/app");
      if (getApps().length === 0) {
        initializeApp({ credential: applicationDefault() });
      }
      try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        userId = decodedToken.uid;
      } catch (e) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const storeId = await authSeller(userId);
    if (!storeId) return NextResponse.json({ error: "not authorized" }, { status: 401 });

    const body = await request.json();

    await dbConnect();

    // Settings → Payments tab: patch enable flags only (do not reset shipping config).
    if (body.paymentMethodsOnly) {
      const patch = {
        enableCOD: body.enableCOD !== false,
        enableCard: body.enableCard !== false,
        enableTabby: body.enableTabby !== false,
        enableTamara: body.enableTamara !== false,
      };
      const setting = await ShippingSetting.findOneAndUpdate(
        { storeId },
        { $set: { storeId, ...patch } },
        { upsert: true, new: true },
      );
      return NextResponse.json({ setting });
    }

    const shippingOptions = sanitizeShippingOptionsPayload(body.shippingOptions);
    const legacyFromOptions = syncLegacyFieldsFromOptions(shippingOptions);
    
    console.log('=== SHIPPING API PUT ===');
    console.log('Received body.maxCODAmount:', body.maxCODAmount, 'Type:', typeof body.maxCODAmount);
    console.log('Received body.codFee:', body.codFee, 'Type:', typeof body.codFee);
    console.log('Received body.enableCOD:', body.enableCOD);
    
    const data = {
      storeId,  // Associate settings with the seller's store
      enabled: Boolean(body.enabled ?? true),
      shippingType: legacyFromOptions.shippingType || body.shippingType || "FLAT_RATE",
      // Flat Rate
      flatRate: Number(legacyFromOptions.flatRate ?? body.flatRate ?? 5),
      // Per Item
      perItemFee: Number(legacyFromOptions.perItemFee ?? body.perItemFee ?? 2),
      maxItemFee: (legacyFromOptions.maxItemFee ?? body.maxItemFee)
        ? Number(legacyFromOptions.maxItemFee ?? body.maxItemFee)
        : null,
      // Weight Based
      weightUnit: legacyFromOptions.weightUnit || body.weightUnit || "kg",
      baseWeight: Number(legacyFromOptions.baseWeight ?? body.baseWeight ?? 1),
      baseWeightFee: Number(legacyFromOptions.baseWeightFee ?? body.baseWeightFee ?? 5),
      additionalWeightFee: Number(legacyFromOptions.additionalWeightFee ?? body.additionalWeightFee ?? 2),
      // Free Shipping
      freeShippingMin: Number(body.freeShippingMin ?? 100),
      enableProductSpecificFreeShipping: Boolean(body.enableProductSpecificFreeShipping ?? false),
      productSpecificFreeShippingMode:
        body.productSpecificFreeShippingMode === 'MARKED_ITEMS_ONLY'
          ? 'MARKED_ITEMS_ONLY'
          : 'ORDER_LEVEL',
      // Regional
      localDeliveryFee: body.localDeliveryFee ? Number(body.localDeliveryFee) : null,
      regionalDeliveryFee: body.regionalDeliveryFee ? Number(body.regionalDeliveryFee) : null,
      // Delivery Time
      estimatedDays: legacyFromOptions.estimatedDays || body.estimatedDays || "2-5",
      // Payment methods (storefront checkout)
      enableCOD: body.enableCOD !== false,
      enableCard: body.enableCard !== false,
      enableTabby: body.enableTabby !== false,
      enableTamara: body.enableTamara !== false,
      codFee: Number(body.codFee ?? 0),
      maxCODAmount: Number(body.maxCODAmount ?? 0),
      maxCardAmount: Number(body.maxCardAmount ?? 0),
      maxTabbyAmount: Number(body.maxTabbyAmount ?? 0),
      maxTamaraAmount: Number(body.maxTamaraAmount ?? 0),
      // Express (legacy sync from options)
      enableExpressShipping: Boolean(
        legacyFromOptions.enableExpressShipping ?? body.enableExpressShipping ?? false,
      ),
      expressShippingFee: Number(
        legacyFromOptions.expressShippingFee ?? body.expressShippingFee ?? 20,
      ),
      expressEstimatedDays:
        legacyFromOptions.expressEstimatedDays || body.expressEstimatedDays || "1-2",
      stateCharges: Array.isArray(body.stateCharges)
        ? body.stateCharges
            .map((entry) => ({
              state: String(entry?.state || '').trim(),
              fee: Number(entry?.fee || 0)
            }))
            .filter((entry) => entry.state)
        : [],
      shippingOptions,
    };
    
    console.log('Data to save - maxCODAmount:', data.maxCODAmount, 'codFee:', data.codFee);

    const setting = await ShippingSetting.findOneAndUpdate(
      { storeId },  // Find by storeId (one setting per store)
      data,
      { upsert: true, new: true }
    );
    console.log('Saved setting - maxCODAmount:', setting.maxCODAmount, 'codFee:', setting.codFee);
    return NextResponse.json({ setting });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
