import { NextResponse } from 'next/server';
import {
  isZohoConfigured,
  probeZohoProductAccess,
} from '@/lib/zoho';
import { getZohoCrmPublicConfig } from '@/lib/zohoCrm';
import { getZohoInventoryPublicConfig } from '@/lib/zohoInventory';

export const dynamic = 'force-dynamic';

// GET /api/zoho/status — verifies Zoho OAuth and whether Inventory (not only CRM) works.
export async function GET() {
  if (!isZohoConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        message: 'Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET or ZOHO_REFRESH_TOKEN.',
        requiredScope: 'ZohoInventory.FullAccess.all',
        docs: 'https://www.zoho.com/inventory/api/v1/oauth/#overview',
      },
      { status: 200 },
    );
  }

  try {
    const probe = await probeZohoProductAccess();
    return NextResponse.json({
      configured: true,
      product: 'Zoho Inventory',
      crm: getZohoCrmPublicConfig(),
      inventory: {
        ...getZohoInventoryPublicConfig(),
        ...probe.inventory,
      },
      ...probe,
    });
  } catch (err) {
    return NextResponse.json(
      { configured: true, tokenAcquired: false, error: String(err?.message || err) },
      { status: 500 },
    );
  }
}
