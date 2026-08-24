/**
 * Test Zoho Inventory connection from CLI.
 * Usage: npm run test:zoho-inventory
 */
import {
  getZohoAccessToken,
  getZohoApiDomain,
  getZohoAccountsDomain,
  getZohoOrganizationId,
  isZohoConfigured,
  zohoInventoryApiFetch,
} from '../lib/zoho.js';

async function testZohoInventoryConnection() {
  const res = await zohoInventoryApiFetch('/organizations', { skipOrgId: true });
  const orgData = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(orgData?.message || orgData?.code || res.statusText);
  }

  const organizations = Array.isArray(orgData?.organizations) ? orgData.organizations : [];
  const configuredOrgId = getZohoOrganizationId();
  const matchedOrg = organizations.find(
    (org) => String(org.organization_id) === configuredOrgId,
  ) || null;

  return {
    connected: true,
    organizationCount: organizations.length,
    organizations: organizations.map((org) => ({
      organization_id: org.organization_id,
      name: org.name,
      is_default: org.is_default,
    })),
    configuredOrganizationId: configuredOrgId || null,
    configuredOrganizationMatched: Boolean(matchedOrg),
    configuredOrganizationName: matchedOrg?.name || null,
  };
}

async function main() {
  if (!isZohoConfigured()) {
    console.error('Missing ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET or ZOHO_REFRESH_TOKEN in .env');
    process.exit(1);
  }

  console.log('Accounts domain:', getZohoAccountsDomain());
  console.log('API domain:', getZohoApiDomain());
  console.log('ZOHO_ORGANIZATION_ID:', getZohoOrganizationId() || '(not set)');

  const token = await getZohoAccessToken({ force: true });
  console.log('Zoho token connected:', Boolean(token));

  try {
    const result = await testZohoInventoryConnection();
    console.log(JSON.stringify(result, null, 2));

    if (!result.configuredOrganizationId) {
      console.log('\nNext step: copy organization_id from the list above into .env as ZOHO_ORGANIZATION_ID');
    } else if (!result.configuredOrganizationMatched) {
      console.log('\nWarning: ZOHO_ORGANIZATION_ID does not match any organization returned by Zoho.');
    } else {
      console.log(`\nOrganization matched: ${result.configuredOrganizationName} (${result.configuredOrganizationId})`);
    }
  } catch (err) {
    console.error('\nInventory API failed. If this token was created for Zoho CRM, reconnect with:');
    console.error('  ZohoInventory.FullAccess.all');
    console.error('Docs: https://www.zoho.com/inventory/api/v1/oauth/#overview');
    throw err;
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
