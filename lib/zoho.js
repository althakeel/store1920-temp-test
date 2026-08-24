/**
 * Zoho OAuth 2.0 (server-to-server + optional browser consent).
 *
 * Order sync uses **Zoho Inventory** (`/inventory/v1/salesorders`), not CRM Deals.
 * The refresh token MUST be generated with Inventory scopes. A CRM-only token
 * can acquire an access token and still fail every Inventory API call.
 *
 * Official Inventory OAuth:
 *   https://www.zoho.com/inventory/api/v1/oauth/#overview
 *
 * Required env:
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REFRESH_TOKEN
 *   ZOHO_ORGANIZATION_ID     (Inventory org id — GET /inventory/v1/organizations)
 *   ZOHO_REGION              com | eu | in | com.au | jp | sa | ca
 *   ZOHO_REDIRECT_URI        required for browser OAuth (not Self Client Generate Code)
 *
 * Inventory grant scopes (required for orders):
 *   ZohoInventory.FullAccess.all
 *
 * Optional CRM (Contacts + Deals) on the same token:
 *   ZohoInventory.FullAccess.all,ZohoCRM.modules.ALL,ZohoCRM.settings.ALL
 */

export const ZOHO_INVENTORY_FULL_SCOPE = 'ZohoInventory.FullAccess.all';

export const ZOHO_INVENTORY_ORDER_SCOPES = [
  'ZohoInventory.contacts.CREATE',
  'ZohoInventory.contacts.READ',
  'ZohoInventory.contacts.UPDATE',
  'ZohoInventory.items.CREATE',
  'ZohoInventory.items.READ',
  'ZohoInventory.items.UPDATE',
  'ZohoInventory.salesorders.CREATE',
  'ZohoInventory.salesorders.READ',
  'ZohoInventory.salesorders.UPDATE',
  'ZohoInventory.settings.READ',
].join(',');

export const ZOHO_INVENTORY_SCOPE_HINT = [
  'This OAuth token does not have Zoho Inventory access (it may be Zoho CRM only).',
  'Generate a new grant/refresh token with scope ZohoInventory.FullAccess.all.',
  'See https://www.zoho.com/inventory/api/v1/oauth/#overview',
].join(' ');

const REGION_ACCOUNTS_DOMAINS = {
  com: 'accounts.zoho.com',
  eu: 'accounts.zoho.eu',
  in: 'accounts.zoho.in',
  'com.au': 'accounts.zoho.com.au',
  au: 'accounts.zoho.com.au',
  jp: 'accounts.zoho.jp',
  sa: 'accounts.zoho.sa',
  ca: 'accounts.zohocloud.ca',
};

const REGION_API_DOMAINS = {
  com: 'www.zohoapis.com',
  eu: 'www.zohoapis.eu',
  in: 'www.zohoapis.in',
  'com.au': 'www.zohoapis.com.au',
  au: 'www.zohoapis.com.au',
  jp: 'www.zohoapis.jp',
  sa: 'www.zohoapis.sa',
  ca: 'www.zohoapis.ca',
};

function getRegion() {
  return String(process.env.ZOHO_REGION || 'com').trim().toLowerCase();
}

export function getZohoRedirectUri() {
  return String(process.env.ZOHO_REDIRECT_URI || '').trim();
}

export function getZohoAccountsDomain() {
  const override = String(process.env.ZOHO_ACCOUNTS_DOMAIN || '').trim();
  if (override) {
    return override.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  return REGION_ACCOUNTS_DOMAINS[getRegion()] || REGION_ACCOUNTS_DOMAINS.com;
}

let cachedToken = null; // { accessToken, expiresAt, scope, apiDomain }

export function getZohoApiDomain() {
  const fromToken = String(cachedToken?.apiDomain || '').trim();
  if (fromToken) {
    return fromToken.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  const raw = process.env.ZOHO_API_DOMAIN
    || REGION_API_DOMAINS[getRegion()]
    || REGION_API_DOMAINS.com;
  return String(raw).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function getZohoOrganizationId() {
  return String(process.env.ZOHO_ORGANIZATION_ID || '').trim();
}

export function isZohoInventoryConfigured() {
  if (!isZohoConfigured()) return false;
  if (!getZohoOrganizationId()) return false;
  const flag = String(process.env.ZOHO_INVENTORY_ENABLED || 'true').trim().toLowerCase();
  return flag !== 'false' && flag !== '0';
}

export function isZohoConfigured() {
  return Boolean(
    process.env.ZOHO_CLIENT_ID
    && process.env.ZOHO_CLIENT_SECRET
    && process.env.ZOHO_REFRESH_TOKEN,
  );
}

export function parseZohoScopeList(scope = '') {
  return String(scope || '')
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function scopeHasZohoInventory(scope = '') {
  return parseZohoScopeList(scope).some((part) => /^ZohoInventory\./i.test(part));
}

export function scopeHasZohoCrm(scope = '') {
  return parseZohoScopeList(scope).some((part) => /^ZohoCRM\./i.test(part));
}

export function buildZohoInventoryAuthorizeUrl({
  redirectUri = getZohoRedirectUri(),
  state = 'inventory',
  includeCrm = false,
} = {}) {
  if (!process.env.ZOHO_CLIENT_ID) {
    throw new Error('ZOHO_CLIENT_ID is required to build the Zoho Inventory authorize URL');
  }
  if (!redirectUri) {
    throw new Error('ZOHO_REDIRECT_URI is required for browser OAuth (API Console redirect URI)');
  }
  const scope = includeCrm
    ? `${ZOHO_INVENTORY_FULL_SCOPE},ZohoCRM.modules.ALL,ZohoCRM.settings.ALL`
    : ZOHO_INVENTORY_FULL_SCOPE;
  const params = new URLSearchParams({
    scope,
    client_id: process.env.ZOHO_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://${getZohoAccountsDomain()}/oauth/v2/auth?${params.toString()}`;
}

export function getLastZohoTokenMeta() {
  if (!cachedToken) return { scope: '', apiDomain: '', hasInventoryScope: null, hasCrmScope: null };
  return {
    scope: cachedToken.scope || '',
    apiDomain: cachedToken.apiDomain || '',
    hasInventoryScope: cachedToken.scope ? scopeHasZohoInventory(cachedToken.scope) : null,
    hasCrmScope: cachedToken.scope ? scopeHasZohoCrm(cachedToken.scope) : null,
  };
}

function zohoTokenRequestBody(extra = {}) {
  const params = new URLSearchParams(extra);
  params.set('client_id', process.env.ZOHO_CLIENT_ID);
  params.set('client_secret', process.env.ZOHO_CLIENT_SECRET);
  const redirectUri = getZohoRedirectUri();
  if (redirectUri && !params.has('redirect_uri')) params.set('redirect_uri', redirectUri);
  return params;
}

export async function exchangeZohoGrantCode(code, { redirectUri } = {}) {
  const params = zohoTokenRequestBody({
    grant_type: 'authorization_code',
    code: String(code || '').trim(),
  });
  if (redirectUri) params.set('redirect_uri', redirectUri);

  const res = await fetch(`https://${getZohoAccountsDomain()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || data.error_description || `HTTP ${res.status}`);
  }
  return data;
}

export async function getZohoAccessToken({ force = false } = {}) {
  if (!isZohoConfigured()) {
    throw new Error(
      'Zoho is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN.',
    );
  }

  const now = Date.now();
  if (!force && cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.accessToken;
  }

  const params = zohoTokenRequestBody({
    grant_type: 'refresh_token',
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });

  const res = await fetch(`https://${getZohoAccountsDomain()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Zoho token refresh failed: ${data.error || res.status} ${JSON.stringify(data)}`,
    );
  }

  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + expiresInMs,
    scope: String(data.scope || ''),
    apiDomain: String(data.api_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
  return cachedToken.accessToken;
}

export function isLikelyZohoInventoryScopeError(data = {}, status = 0) {
  const blob = JSON.stringify(data || {}).toLowerCase();
  if ([401, 403].includes(Number(status))) return true;
  if (data?.code === 57 || data?.code === 104 || data?.code === 6018) return true;
  return /invalid.?oauth|invalid.?scope|insufficient|not authorized|scope not|no permission|authentication failed/
    .test(blob);
}

export async function zohoApiFetch(path, { baseDomain, headers = {}, ...options } = {}) {
  const token = await getZohoAccessToken();
  const domain = baseDomain || getZohoApiDomain();
  const url = path.startsWith('http') ? path : `https://${domain}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (res.status === 401) {
    const freshToken = await getZohoAccessToken({ force: true });
    return fetch(url, {
      ...options,
      headers: {
        Authorization: `Zoho-oauthtoken ${freshToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  }

  return res;
}

export async function zohoInventoryApiFetch(path, { query = {}, skipOrgId = false, ...options } = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value != null && value !== '') params.set(key, String(value));
  });

  const orgId = getZohoOrganizationId();
  if (!skipOrgId && orgId && !params.has('organization_id')) {
    params.set('organization_id', orgId);
  }

  const inventoryPath = path.startsWith('/inventory/')
    ? path
    : `/inventory/v1${path.startsWith('/') ? path : `/${path}`}`;
  const qs = params.toString();
  const fullPath = qs ? `${inventoryPath}?${qs}` : inventoryPath;

  return zohoApiFetch(fullPath, options);
}

async function probeJson(path) {
  try {
    const res = await zohoApiFetch(path, { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.message || data?.code || `HTTP ${res.status}`,
        scopeError: isLikelyZohoInventoryScopeError(data, res.status),
      };
    }
    return { ok: true, status: res.status, data };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * Live check: can this token call Zoho Inventory (orders) vs only Zoho CRM?
 */
export async function probeZohoProductAccess() {
  await getZohoAccessToken({ force: true });
  const token = getLastZohoTokenMeta();
  const inventoryProbe = await probeJson('/inventory/v1/organizations');
  const crmProbe = await probeJson('/crm/v6/org');

  const organizations = Array.isArray(inventoryProbe.data?.organizations)
    ? inventoryProbe.data.organizations.map((org) => ({
      organization_id: org.organization_id,
      name: org.name,
      is_default: org.is_default,
    }))
    : [];

  const inventoryAccess = inventoryProbe.ok;
  const crmAccess = crmProbe.ok;
  const configuredOrgId = getZohoOrganizationId();
  const matchedOrg = organizations.find(
    (org) => String(org.organization_id) === configuredOrgId,
  ) || null;

  let hint = null;
  if (!inventoryAccess) {
    hint = ZOHO_INVENTORY_SCOPE_HINT;
    if (crmAccess || token.hasCrmScope) {
      hint += ' Current token works for Zoho CRM, which cannot create Inventory sales orders.';
    }
  } else if (!configuredOrgId) {
    hint = 'Inventory OAuth works. Set ZOHO_ORGANIZATION_ID to an organization_id from the organizations list.';
  } else if (!matchedOrg) {
    hint = `ZOHO_ORGANIZATION_ID=${configuredOrgId} was not found in this Inventory account.`;
  }

  return {
    tokenAcquired: true,
    accountsDomain: getZohoAccountsDomain(),
    apiDomain: getZohoApiDomain(),
    scope: token.scope || null,
    hasInventoryScope: token.hasInventoryScope,
    hasCrmScope: token.hasCrmScope,
    inventoryAccess,
    crmAccess,
    inventory: {
      ok: inventoryAccess,
      error: inventoryProbe.ok ? null : inventoryProbe.error,
      organizationCount: organizations.length,
      organizations,
      configuredOrganizationId: configuredOrgId || null,
      configuredOrganizationMatched: Boolean(matchedOrg),
      configuredOrganizationName: matchedOrg?.name || null,
    },
    crm: {
      ok: crmAccess,
      error: crmProbe.ok ? null : crmProbe.error,
    },
    hint,
  };
}
