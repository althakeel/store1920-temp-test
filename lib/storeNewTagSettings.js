import Store from '@/models/Store';
import connectDB from '@/lib/mongodb';
import { deleteCacheKey, getCachedData, setCachedData } from '@/lib/cache';
import { DEFAULT_NEW_TAG_SETTINGS, normalizeNewTagSettings } from '@/lib/newProductTag';

export const NEW_TAG_CACHE_KEY = 'public:new-tag:v2';

async function findPrimaryStore() {
  let store = await Store.findOne({
    $or: [{ isActive: true }, { status: 'approved' }],
  })
    .select('newTagSettings updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  if (!store) {
    store = await Store.findOne().select('newTagSettings updatedAt').sort({ updatedAt: -1 }).lean();
  }

  return store;
}

export async function getPublicNewTagSettings() {
  const cached = getCachedData(NEW_TAG_CACHE_KEY);
  if (cached) return cached;

  await connectDB();
  const store = await findPrimaryStore();
  const settings = normalizeNewTagSettings(store?.newTagSettings || DEFAULT_NEW_TAG_SETTINGS);
  setCachedData(NEW_TAG_CACHE_KEY, settings, 120);
  return settings;
}

export function clearNewTagSettingsCache() {
  deleteCacheKey(NEW_TAG_CACHE_KEY);
}
