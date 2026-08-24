import { deleteCacheKey, invalidateCachePattern } from '@/lib/cache';

/** Clear storefront + store dashboard category list caches after mutations. */
export function invalidateCategoryCaches() {
  invalidateCachePattern('public:categories:tree:v2');
  invalidateCachePattern('public:categories:tree:v7');
  deleteCacheKey('public:categories:tree:v3');
  deleteCacheKey('public:categories:tree:v5');
}
