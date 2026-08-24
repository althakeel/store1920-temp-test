import { NextResponse } from 'next/server';
import {
  buildZohoInventoryAuthorizeUrl,
  getZohoRedirectUri,
  ZOHO_INVENTORY_FULL_SCOPE,
} from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/zoho/authorize
 * Starts Zoho Inventory OAuth (official browser flow).
 * Register this callback URL on the API client:
 *   {origin}/api/zoho/callback
 */
export async function GET(request) {
  const url = new URL(request.url);
  const includeCrm = url.searchParams.get('crm') === '1';
  const redirectUri = getZohoRedirectUri() || `${url.origin}/api/zoho/callback`;

  if (!process.env.ZOHO_CLIENT_ID) {
    return NextResponse.json({
      ok: false,
      message: 'Set ZOHO_CLIENT_ID first.',
      requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
    }, { status: 400 });
  }

  try {
    const authorizeUrl = buildZohoInventoryAuthorizeUrl({
      redirectUri,
      includeCrm,
      state: includeCrm ? 'inventory+crm' : 'inventory',
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error?.message || String(error),
      requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
      docs: 'https://www.zoho.com/inventory/api/v1/oauth/#overview',
    }, { status: 400 });
  }
}
