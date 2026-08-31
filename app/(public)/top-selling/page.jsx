'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import ProductCard from '@/components/ProductCard';
import ProductFilterSidebar from '@/components/ProductFilterSidebar';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

const PAGE_SIZE = 25;

const DEFAULT_FILTERS = {
  categories: [],
  priceRange: { min: 0, max: 100000 },
  rating: 0,
  inStock: false,
  sortBy: 'popularity',
};

function GridSkeleton({ count = 10 }) {
  return (
    <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="aspect-[3/4] animate-pulse rounded-lg border border-gray-200 bg-white"
        />
      ))}
    </div>
  );
}

export default function TopSellingPage() {
  const { isArabic } = useStorefrontI18n();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [activeFilters, setActiveFilters] = useState(DEFAULT_FILTERS);

  const sentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const nextOffsetRef = useRef(0);
  const seenIdsRef = useRef(new Set());
  const requestSeqRef = useRef(0);
  const abortRef = useRef(null);
  const productsRef = useRef([]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const fetchPage = useCallback(async ({ offset, append, bust = false } = {}) => {
    if (append) {
      if (loadingMoreRef.current || !hasMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      abortRef.current?.abort();
      requestSeqRef.current += 1;
      setLoading(true);
      setLoadError('');
      seenIdsRef.current = new Set();
      nextOffsetRef.current = 0;
      hasMoreRef.current = true;
    }

    const seq = requestSeqRef.current;
    const controller = new AbortController();
    if (!append) abortRef.current = controller;

    try {
      const { data } = await axios.get('/api/products/top-selling', {
        params: {
          limit: PAGE_SIZE,
          offset,
          ...(bust ? { bust: 1 } : {}),
        },
        signal: controller.signal,
      });

      // Ignore stale responses from an older first-page request.
      if (!append && seq !== requestSeqRef.current) return;

      const list = Array.isArray(data?.products) ? data.products : [];
      const unique = [];
      for (const product of list) {
        const id = String(product?._id || product?.id || '');
        if (!id || seenIdsRef.current.has(id)) continue;
        seenIdsRef.current.add(id);
        unique.push(product);
      }

      if (append) {
        setProducts((prev) => [...prev, ...unique]);
      } else {
        setProducts(unique);
      }

      const more = Boolean(data?.hasMore) && unique.length > 0;
      const upcoming = Number.isFinite(Number(data?.nextOffset))
        ? Number(data.nextOffset)
        : offset + list.length;

      hasMoreRef.current = more;
      nextOffsetRef.current = upcoming;
      setHasMore(more);
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
      console.error('[top-selling] load failed', error);
      if (!append && seq === requestSeqRef.current) {
        // Keep whatever is already on screen if a refresh fails.
        if (!productsRef.current.length) {
          setLoadError(error?.response?.data?.error || 'Failed to load top selling products');
          setProducts([]);
        }
        hasMoreRef.current = productsRef.current.length > 0 ? hasMoreRef.current : false;
        setHasMore(hasMoreRef.current);
      }
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPage({ offset: 0, append: false });
    return () => {
      abortRef.current?.abort();
      requestSeqRef.current += 1;
    };
  }, [fetchPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loadingMoreRef.current || !hasMoreRef.current) return;
        fetchPage({ offset: nextOffsetRef.current, append: true });
      },
      { root: null, rootMargin: '400px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchPage, loading, products.length]);

  const applyFilters = useCallback((productsToFilter) => {
    const min = Number(activeFilters.priceRange?.min) || 0;
    const maxRaw = Number(activeFilters.priceRange?.max);
    // Treat missing/tiny max as "no price cap" so a sidebar glitch cannot blank the grid.
    const max = Number.isFinite(maxRaw) && maxRaw >= 10 ? maxRaw : 100000;

    return productsToFilter.filter((product) => {
      if (activeFilters.categories.length > 0) {
        const productCategories = [
          product.category,
          ...(Array.isArray(product.categories) ? product.categories : []),
        ].filter(Boolean);

        const hasMatchingCategory = productCategories.some((cat) =>
          activeFilters.categories.includes(cat)
          || activeFilters.categories.includes(String(cat?._id || cat)),
        );
        if (!hasMatchingCategory) return false;
      }

      const price = Number(product.price) || Number(product.AED) || 0;
      if (price < min || price > max) return false;

      if (activeFilters.rating > 0) {
        const avgRating = product.averageRating || 0;
        if (avgRating < activeFilters.rating) return false;
      }

      if (activeFilters.inStock && product.inStock === false) {
        return false;
      }

      return true;
    });
  }, [activeFilters]);

  const sortProducts = useCallback((productsToSort) => {
    const sorted = [...productsToSort];

    switch (activeFilters.sortBy) {
      case 'price-low-high':
        return sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      case 'price-high-low':
        return sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      case 'newest':
        return sorted.sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
        );
      case 'rating':
        return sorted.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
      case 'discount':
        return sorted.sort((a, b) => {
          const discountA = a.AED > a.price ? ((a.AED - a.price) / a.AED) * 100 : 0;
          const discountB = b.AED > b.price ? ((b.AED - b.price) / b.AED) * 100 : 0;
          return discountB - discountA;
        });
      case 'popularity':
      default:
        return sorted.sort((a, b) => {
          const soldA = Number(a.unitsSold ?? a.soldCount) || 0;
          const soldB = Number(b.unitsSold ?? b.soldCount) || 0;
          return soldB - soldA;
        });
    }
  }, [activeFilters.sortBy]);

  const filteredAndSortedProducts = useMemo(() => {
    const filtered = applyFilters(products);
    return sortProducts(filtered);
  }, [products, applyFilters, sortProducts]);

  const handleFilterChange = useCallback((filters) => {
    setActiveFilters(filters);
  }, []);

  const handleRetry = useCallback(() => {
    fetchPage({ offset: 0, append: false, bust: true });
  }, [fetchPage]);

  return (
    <div className="min-h-screen bg-gray-50" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <div className="mb-6 mt-6">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">
            {isArabic ? 'الأكثر مبيعًا' : 'Top Selling Products'}
          </h1>
          <p className="text-gray-600">
            {isArabic
              ? 'منتجات مرتبة حسب كمية الطلبات الحقيقية من العملاء'
              : 'Ranked by real customer order quantities — our best-selling items'}
          </p>
        </div>

        <div className="flex gap-6">
          <div className="hidden flex-shrink-0 lg:block">
            <ProductFilterSidebar
              products={products}
              onFilterChange={handleFilterChange}
              initialFilters={activeFilters}
            />
          </div>

          <div className="flex-1">
            {loading && products.length === 0 ? (
              <GridSkeleton />
            ) : loadError && products.length === 0 ? (
              <div className="rounded-lg border border-red-200 bg-white py-16 text-center">
                <p className="text-lg text-red-600">{loadError}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-4 rounded-lg bg-orange-500 px-6 py-2 text-white transition hover:bg-orange-600"
                >
                  {isArabic ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            ) : filteredAndSortedProducts.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
                <p className="text-lg text-gray-500">
                  {products.length === 0
                    ? (isArabic ? 'لا توجد منتجات مبيعة بعد.' : 'No sold products yet.')
                    : (isArabic ? 'لا توجد منتجات تطابق الفلاتر.' : 'No products match your filters.')}
                </p>
                {products.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveFilters(DEFAULT_FILTERS)}
                    className="mt-4 rounded-lg bg-orange-500 px-6 py-2 text-white transition hover:bg-orange-600"
                  >
                    {isArabic ? 'مسح الفلاتر' : 'Clear Filters'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-4 rounded-lg bg-orange-500 px-6 py-2 text-white transition hover:bg-orange-600"
                  >
                    {isArabic ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                )}
              </div>
            ) : (
              <>
                {loading ? (
                  <p className="mb-3 text-sm text-slate-500">
                    {isArabic ? 'جارٍ التحديث…' : 'Updating…'}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {filteredAndSortedProducts.map((product) => (
                    <ProductCard key={product._id || product.id} product={product} />
                  ))}
                </div>

                <div ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />

                {loadingMore ? (
                  <div className="mt-4">
                    <GridSkeleton count={5} />
                  </div>
                ) : null}

                {!hasMore && products.length > 0 ? (
                  <p className="mt-6 text-center text-sm text-slate-500">
                    {isArabic ? 'تم عرض كل المنتجات الأكثر مبيعًا' : 'You’ve reached the end of top sellers'}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
