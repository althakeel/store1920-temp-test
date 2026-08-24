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

// GET /api/zoho/exchange?code=THE_GRANT_CODE
// Exchanges a grant code for a refresh token. The grant MUST include
// ZohoInventory.FullAccess.all or Inventory order APIs will fail.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const redirectUri = url.searchParams.get('redirect_uri') || getZohoRedirectUri();

  if (!code) {
    return NextResponse.json({
      ok: false,
      message: 'Add ?code=YOUR_GRANT_CODE to the URL.',
      requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
      docs: 'https://www.zoho.com/inventory/api/v1/oauth/#overview',
      selfClientHint: 'In Zoho API Console → Self Client → Generate Code, paste ZohoInventory.FullAccess.all (not ZohoCRM.*).',
    }, { status: 400 });
  }
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) {
    return NextResponse.json({ ok: false, message: 'Missing ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET.' }, { status: 400 });
  }

  try {
    const data = await exchangeZohoGrantCode(code, { redirectUri });
    const scope = String(data.scope || '');
    const inventory = scopeHasZohoInventory(scope);
    const crm = scopeHasZohoCrm(scope);

    return NextResponse.json({
      ok: true,
      refresh_token: data.refresh_token,
      api_domain: data.api_domain,
      scope: scope || null,
      inventoryAccess: scope ? inventory : null,
      crmAccess: scope ? crm : null,
      message: inventory
        ? 'Success. Copy refresh_token into ZOHO_REFRESH_TOKEN, set ZOHO_ORGANIZATION_ID from GET /api/zoho/status, and restart.'
        : ZOHO_INVENTORY_SCOPE_HINT,
      warning: !inventory && (crm || !scope)
        ? 'This token looks like Zoho CRM (or missing Inventory scopes). Orders will not sync until you reconnect with ZohoInventory.FullAccess.all.'
        : null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err?.message || err),
      hint: 'If error is invalid_code: the grant expired (~60s in browser OAuth, ~10 min in Self Client) or was already used. Generate a fresh Inventory grant.',
      requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
    }, { status: 200 });
  }
}
