import { revalidatePath } from 'next/cache';
import { deleteCacheKey, invalidateCachePattern } from '@/lib/cache';

export const FEATURED_SECTIONS_CACHE_KEY = 'public:featured-sections:v7';
export const HOMEPAGE_CACHE_KEY = 'server:homepage:v8';

/** Clear storefront caches that embed category slider sections. */
export function invalidateCategorySliderCaches() {
  deleteCacheKey(FEATURED_SECTIONS_CACHE_KEY);
  deleteCacheKey('public:featured-sections-count:v1');
  deleteCacheKey(HOMEPAGE_CACHE_KEY);
  invalidateCachePattern('public:featured-sections');
  invalidateCachePattern('server:homepage');
  // Legacy keys from earlier deployments.
  deleteCacheKey('public:featured-sections:v2');
  deleteCacheKey('public:featured-sections:v4');
  deleteCacheKey('server:homepage:v3');
  deleteCacheKey('server:homepage:v5');
  deleteCacheKey('server:homepage:v6');
  deleteCacheKey('server:homepage:v7');
  deleteCacheKey('public:featured-sections:v5');

  try {
    revalidatePath('/');
  } catch {
    // Safe when called outside a Next.js request context.
  }
}
