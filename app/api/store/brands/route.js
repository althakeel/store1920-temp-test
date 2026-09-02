import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import authSeller from '@/middlewares/authSeller';
import { getAuth } from '@/lib/firebase-admin';
import { invalidateStorefrontProductCaches } from '@/lib/cache';
import { escapeRegex } from '@/lib/productSearch';

export const runtime = 'nodejs';

async function getStoreIdFromRequest(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const idToken = authHeader.replace('Bearer ', '');
  const decodedToken = await getAuth().verifyIdToken(idToken);
  return authSeller(decodedToken.uid);
}

function normalizeBrandLabel(value = '') {
  return String(value || '').trim();
}

export async function GET(request) {
  try {
    const storeId = await getStoreIdFromRequest(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const storeKey = String(storeId);

    const rows = await Product.aggregate([
      {
        $match: {
          storeId: storeKey,
          brand: { $type: 'string', $ne: '' },
        },
      },
      {
        $group: {
          _id: '$brand',
          productCount: { $sum: 1 },
        },
      },
      { $sort: { productCount: -1, _id: 1 } },
    ]);

    const brands = (rows || [])
      .map((row) => ({
        name: normalizeBrandLabel(row?._id),
        productCount: Number(row?.productCount || 0),
      }))
      .filter((row) => row.name);

    // Case-insensitive duplicate groups (e.g. Apple / apple / APPLE)
    const groupsMap = new Map();
    for (const brand of brands) {
      const key = brand.name.toLowerCase();
      const existing = groupsMap.get(key) || {
        key,
        names: [],
        productCount: 0,
      };
      existing.names.push(brand.name);
      existing.productCount += brand.productCount;
      groupsMap.set(key, existing);
    }

    const duplicateGroups = Array.from(groupsMap.values())
      .filter((group) => group.names.length > 1)
      .sort((a, b) => b.productCount - a.productCount || a.key.localeCompare(b.key));

    return NextResponse.json({
      brands,
      totalBrands: brands.length,
      duplicateGroups,
      totalProductsWithBrand: brands.reduce((sum, brand) => sum + brand.productCount, 0),
    });
  } catch (error) {
    console.error('[store brands GET] error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to load brands' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const storeId = await getStoreIdFromRequest(request);
    if (!storeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body?.action || 'rename').trim().toLowerCase();
    const fromBrand = normalizeBrandLabel(body?.from);
    const toBrand = normalizeBrandLabel(body?.to);

    if (!fromBrand) {
      return NextResponse.json({ error: 'Current brand name is required.' }, { status: 400 });
    }
    if (!toBrand) {
      return NextResponse.json({ error: 'New brand name is required.' }, { status: 400 });
    }
    if (fromBrand === toBrand && action !== 'merge-case') {
      return NextResponse.json({ error: 'New brand name must be different.' }, { status: 400 });
    }

    await connectDB();
    const storeKey = String(storeId);

    let filter;
    let message;

    if (action === 'merge-case') {
      // Merge all case variants of `from` into canonical `to`
      filter = {
        storeId: storeKey,
        brand: { $regex: `^${escapeRegex(fromBrand)}$`, $options: 'i' },
      };
      message = `Merged case variants of “${fromBrand}” into “${toBrand}”.`;
    } else if (action === 'merge') {
      filter = {
        storeId: storeKey,
        brand: fromBrand,
      };
      message = `Merged “${fromBrand}” into “${toBrand}”.`;
    } else {
      filter = {
        storeId: storeKey,
        brand: fromBrand,
      };
      message = `Renamed “${fromBrand}” to “${toBrand}”.`;
    }

    const result = await Product.updateMany(filter, {
      $set: { brand: toBrand },
    });

    invalidateStorefrontProductCaches();

    return NextResponse.json({
      success: true,
      matchedCount: Number(result?.matchedCount || 0),
      modifiedCount: Number(result?.modifiedCount || 0),
      from: fromBrand,
      to: toBrand,
      message: `${message} Updated ${Number(result?.modifiedCount || 0)} product(s).`,
    });
  } catch (error) {
    console.error('[store brands PATCH] error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to update brand' }, { status: 500 });
  }
}
