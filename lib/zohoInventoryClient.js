import {
  getZohoAccessToken,
  getZohoApiDomain,
  getZohoOrganizationId,
  isLikelyZohoInventoryScopeError,
  isZohoInventoryConfigured,
  ZOHO_INVENTORY_SCOPE_HINT,
  zohoInventoryApiFetch,
} from './zoho.js';

let cachedLocationId = null;
let cachedLocationName = null;

export async function zohoInventoryRequest(path, { method = 'GET', body, query, skipOrgId = false } = {}) {
  const res = await zohoInventoryApiFetch(path, {
    method,
    query,
    skipOrgId,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message
      || data?.error?.message
      || data?.code
      || res.statusText;
    const hint = isLikelyZohoInventoryScopeError(data, res.status)
      ? ` ${ZOHO_INVENTORY_SCOPE_HINT}`
      : '';
    throw new Error(`Zoho Inventory ${method} ${path} failed: ${message}${hint}`);
  }
  return data;
}

export async function findInventoryItemBySku(sku) {
  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) return null;

  const data = await zohoInventoryRequest('/items', { query: { sku: normalizedSku } });
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.find((item) => String(item.sku || '').trim() === normalizedSku) || items[0] || null;
}

function locationDisplayName(location = {}) {
  return String(location.location_name || location.name || '').trim();
}

export async function resolveInventoryLocationId() {
  const configuredName = String(
    process.env.ZOHO_INVENTORY_LOCATION_NAME || 'Store1920',
  ).trim();
  const configuredId = String(process.env.ZOHO_INVENTORY_LOCATION_ID || '').trim();

  if (configuredId) {
    cachedLocationId = configuredId;
    cachedLocationName = configuredName;
    return configuredId;
  }

  if (cachedLocationId && cachedLocationName === configuredName) {
    return cachedLocationId;
  }

  const data = await zohoInventoryRequest('/locations');
  const locations = Array.isArray(data?.locations) ? data.locations : [];
  const wanted = configuredName.toLowerCase();
  const exact = locations.find(
    (loc) => locationDisplayName(loc).toLowerCase() === wanted,
  );
  const fuzzy = exact || locations.find((loc) => {
    const name = locationDisplayName(loc).toLowerCase();
    return name.includes(wanted) && !name.includes('nexso');
  });

  if (!fuzzy?.location_id) {
    const available = locations.map((loc) => locationDisplayName(loc) || loc.location_id).filter(Boolean);
    throw new Error(
      `Zoho Inventory location "${configuredName}" was not found. Available: ${available.join(', ') || 'none'}. Set ZOHO_INVENTORY_LOCATION_ID.`,
    );
  }

  cachedLocationId = String(fuzzy.location_id);
  cachedLocationName = configuredName;
  return cachedLocationId;
}

export async function uploadInventoryItemImage(itemId, imageUrl, { filenamePrefix = 'store1920-item' } = {}) {
  const url = String(imageUrl || '').trim();
  if (!itemId || !url) return false;

  const imageRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!imageRes.ok) {
    throw new Error(`Could not download product image (${imageRes.status})`);
  }

  const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  if (!buffer.length) return false;

  const ext = contentType.includes('png') ? 'png'
    : contentType.includes('webp') ? 'webp'
    : contentType.includes('gif') ? 'gif'
    : 'jpg';
  const filename = `${filenamePrefix}.${ext}`;

  const form = new FormData();
  form.append('image', new Blob([buffer], { type: contentType }), filename);

  const token = await getZohoAccessToken();
  const orgId = getZohoOrganizationId();
  const uploadUrl = `https://${getZohoApiDomain()}/inventory/v1/items/${itemId}/image?organization_id=${encodeURIComponent(orgId)}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Image upload failed (${res.status})`);
  }
  return true;
}

export async function uploadInventoryItemImages(itemId, imageUrls = [], { force = false, hasImage = false } = {}) {
  const urls = [...new Set(imageUrls.map((url) => String(url || '').trim()).filter(Boolean))];
  if (!itemId || !urls.length) return { uploaded: 0, skipped: urls.length };

  if (hasImage && !force) {
    return { uploaded: 0, skipped: urls.length };
  }

  let uploaded = 0;
  for (let index = 0; index < urls.length; index += 1) {
    try {
      await uploadInventoryItemImage(itemId, urls[index], {
        filenamePrefix: `store1920-item-${index + 1}`,
      });
      uploaded += 1;
      if (index === 0) {
        // Primary image endpoint only supports one main image; stop after first unless forcing all.
        if (!force) break;
      }
    } catch (error) {
      console.warn(`[zoho-product-sync] image ${index + 1} upload failed:`, error?.message || error);
    }
  }

  return { uploaded, skipped: Math.max(urls.length - uploaded, 0) };
}

export function assertZohoInventoryReady() {
  if (!isZohoInventoryConfigured()) {
    throw new Error('Zoho Inventory is not configured. Set ZOHO_* and ZOHO_ORGANIZATION_ID in .env');
  }
}
