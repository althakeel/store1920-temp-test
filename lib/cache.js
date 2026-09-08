/**
 * Simple in-memory cache with TTL support
 * Used for caching API responses to avoid repeated MongoDB queries
 */

const cacheStore = new Map();

/**
 * Get value from cache if not expired
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/not found
 */
export function getCachedData(key) {
    const cached = cacheStore.get(key);
    if (!cached) return null;
    
    // Check if TTL expired
    if (Date.now() > cached.expiresAt) {
        cacheStore.delete(key);
        return null;
    }
    
    return cached.data;
}

/**
 * Set value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttlSeconds - Time to live in seconds
 */
export function setCachedData(key, data, ttlSeconds = 600) {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    cacheStore.set(key, { data, expiresAt });
}

/**
 * Clear all cache
 */
export function clearCache() {
    cacheStore.clear();
}

/**
 * Delete specific cache key
 * @param {string} key - Cache key to delete
 */
export function deleteCacheKey(key) {
    cacheStore.delete(key);
}

/**
 * Generate cache key from parameters
 * @param {string} prefix - Cache prefix (e.g., 'products')
 * @param {object} params - Parameters to include in key
 * @returns {string} - Generated cache key
 */
export function generateCacheKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join(':');
    
    return sortedParams ? `${prefix}:${sortedParams}` : prefix;
}

/**
 * Invalidate cache patterns (e.g., clear all products cache)
 * @param {string} pattern - Pattern to match (e.g., 'products:')
 */
export function invalidateCachePattern(pattern) {
    for (const key of cacheStore.keys()) {
        if (key.startsWith(pattern)) {
            cacheStore.delete(key);
        }
    }
}

const STOREFRONT_CACHE_PREFIXES = [
    'products:',
    'public:featured-products',
    'server:homepage',
    'public:shop-showcase',
    'public:featured-sections',
    'public:appearance-sections',
    'public:offers',
    'product-page:',
    'product:slug:',
];

/** Clear caches that affect homepage, shop listings, featured sections, and product pages. */
export function invalidateStorefrontProductCaches() {
    for (const key of cacheStore.keys()) {
        if (STOREFRONT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
            cacheStore.delete(key);
        }
    }
}
