import { NextResponse } from 'next/server';
import { ZOHO_INVENTORY_FULL_SCOPE, ZOHO_INVENTORY_SCOPE_HINT } from '@/lib/zoho';

export const dynamic = 'force-dynamic';

const ACCOUNTS_DOMAINS = {
  com: 'accounts.zoho.com',
  sa: 'accounts.zoho.sa',
  eu: 'accounts.zoho.eu',
  in: 'accounts.zoho.in',
  'com.au': 'accounts.zoho.com.au',
  jp: 'accounts.zoho.jp',
  ca: 'accounts.zohocloud.ca',
};

const API_DOMAINS = {
  com: 'www.zohoapis.com',
  sa: 'www.zohoapis.sa',
  eu: 'www.zohoapis.eu',
  in: 'www.zohoapis.in',
  'com.au': 'www.zohoapis.com.au',
  jp: 'www.zohoapis.jp',
  ca: 'www.zohoapis.ca',
};

async function probePath(apiDomain, token, path) {
  try {
    const res = await fetch(`https://${apiDomain}${path}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : (data?.message || data?.code || `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// GET /api/zoho/diagnose — region + whether the token can call Inventory (not only CRM).
export async function GET() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json(
      { ok: false, message: 'Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET or ZOHO_REFRESH_TOKEN.' },
      { status: 200 },
    );
  }

  const results = {};
  let workingRegion = null;
  let accessToken = null;
  let tokenScope = null;
  let apiDomainFromToken = null;

  for (const [region, domain] of Object.entries(ACCOUNTS_DOMAINS)) {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });
      const res = await fetch(`https://${domain}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.access_token) {
        results[region] = 'OK';
        if (!workingRegion) {
          workingRegion = region;
          accessToken = data.access_token;
          tokenScope = data.scope || null;
          apiDomainFromToken = String(data.api_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || null;
        }
      } else {
        results[region] = data.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      results[region] = `fetch failed: ${String(err?.message || err)}`;
    }
  }

  let productProbe = null;
  if (accessToken && workingRegion) {
    const apiDomain = apiDomainFromToken || API_DOMAINS[workingRegion] || API_DOMAINS.com;
    const inventory = await probePath(apiDomain, accessToken, '/inventory/v1/organizations');
    const crm = await probePath(apiDomain, accessToken, '/crm/v6/org');
    productProbe = {
      apiDomain,
      scope: tokenScope,
      inventoryAccess: inventory.ok,
      crmAccess: crm.ok,
      inventoryError: inventory.error,
      crmError: crm.error,
      hint: inventory.ok ? null : ZOHO_INVENTORY_SCOPE_HINT,
    };
  }

  return NextResponse.json({
    ok: Boolean(workingRegion),
    workingRegion,
    requiredScope: ZOHO_INVENTORY_FULL_SCOPE,
    docs: 'https://www.zoho.com/inventory/api/v1/oauth/#overview',
    hint: workingRegion
      ? (productProbe?.inventoryAccess
        ? `Set ZOHO_REGION=${workingRegion} in .env. Inventory OAuth is working.`
        : `Set ZOHO_REGION=${workingRegion}. Token refreshes, but Inventory APIs failed — reconnect with ${ZOHO_INVENTORY_FULL_SCOPE} (not Zoho CRM).`)
      : 'No region accepted this refresh token. Generate a fresh Inventory grant from the same client and exchange it.',
    resultsByRegion: results,
    productProbe,
  });
}
