import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/firebase-admin';
import authSeller from '@/middlewares/authSeller';
import { isZohoConfigured, probeZohoProductAccess } from '@/lib/zoho';
import { getZohoCrmPublicConfig } from '@/lib/zohoCrm';
import { getZohoInventoryPublicConfig } from '@/lib/zohoInventory';

export const dynamic = 'force-dynamic';

/** GET /api/store/zoho/status — seller dashboard Zoho Inventory + optional CRM */
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storeId = await authSeller(decodedToken.uid);
    if (!storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const crm = getZohoCrmPublicConfig();
    const inventory = getZohoInventoryPublicConfig();
    if (!isZohoConfigured()) {
      return NextResponse.json({
        configured: false,
        crm,
        inventory,
        message: 'Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET or ZOHO_REFRESH_TOKEN.',
        requiredScope: 'ZohoInventory.FullAccess.all',
      });
    }

    const probe = await probeZohoProductAccess();
    return NextResponse.json({
      configured: true,
      product: 'Zoho Inventory',
      crm,
      inventory: { ...inventory, ...probe.inventory },
      ...probe,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: isZohoConfigured(),
        tokenAcquired: false,
        crm: getZohoCrmPublicConfig(),
        inventory: getZohoInventoryPublicConfig(),
        error: String(err?.message || err),
      },
      { status: 500 },
    );
  }
}
