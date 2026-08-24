import { NextResponse } from 'next/server';
import {
  exchangeZohoGrantCode,
  getZohoRedirectUri,
  scopeHasZohoCrm,
  scopeHasZohoInventory,
  ZOHO_INVENTORY_FULL_SCOPE,
  ZOHO_INVENTORY_SCOPE_HINT,
} from '@/lib/zoho';

export const dynamic = 'force-dynamic';

/**
 * GET /api/zoho/callback
 * Zoho redirects here with ?code= after Inventory consent.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const redirectUri = getZohoRedirectUri() || `${url.origin}/api/zoho/callback`;

  if (error) {
    return NextResponse.json({
      ok: false,
      error,
      message: 'Zoho denied the Inventory OAuth request.',
    }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({
      ok: false,
      message: 'Missing code. Start at /api/zoho/authorize',
      requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
    }, { status: 400 });
  }

  try {
    const data = await exchangeZohoGrantCode(code, { redirectUri });
    const scope = String(data.scope || '');
    const inventory = scopeHasZohoInventory(scope);
    return NextResponse.json({
      ok: true,
      refresh_token: data.refresh_token,
      api_domain: data.api_domain,
      scope: scope || null,
      inventoryAccess: scope ? inventory : null,
      crmAccess: scope ? scopeHasZohoCrm(scope) : null,
      message: inventory
        ? 'Copy refresh_token into ZOHO_REFRESH_TOKEN and restart the server.'
        : ZOHO_INVENTORY_SCOPE_HINT,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err?.message || err),
      requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
    }, { status: 400 });
  }
}
