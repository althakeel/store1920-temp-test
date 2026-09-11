'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, SlidersHorizontal } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import ProductFilterSidebar from '@/components/ProductFilterSidebar';
import { OFFERS_PAGE_SIZE } from '@/lib/offersPageSettings';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { getContentDirection } from '@/lib/storefrontLanguage';

const DEFAULT_FILTERS = {
  categories: [],
  priceRange: { min: 0, max: 100000 },
  rating: 0,
  inStock: false,
  sortBy: 'popularity',
};

function productKey(product, index) {
  return String(product?._id || product?.id || product?.slug || index);
}

function productId(product) {
  return String(product?._id || product?.id || '');
}

function mergeUniqueProducts(current, incoming) {
  const seen = new Set(current.map(productId).filter(Boolean));
  const next = [...current];
  for (const product of incoming) {
    const id = productId(product);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(product);
  }
  return next;
}

export default function OffersPageClient({ initialData = null }) {
  const router = useRouter();
  const { t } = useStorefrontI18n();
  const [products, setProducts] = useState(() => (
    Array.isArray(initialData?.products) ? initialData.products : []
  ));
  const [eyebrow, setEyebrow] = useState(() => String(initialData?.eyebrow || ''));
  const [title, setTitle] = useState(() => String(initialData?.title || 'Special Offers'));
  const [subtitle, setSubtitle] = useState(() => String(initialData?.subtitle || ''));
  const [activeFilters, setActiveFilters] = useState(DEFAULT_FILTERS);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(OFFERS_PAGE_SIZE);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const sentinelRef = useRef(null);

  const applyCopy = useCallback((data) => {
    if (!data) return;
    if (typeof data.eyebrow === 'string') setEyebrow(data.eyebrow.trim());
    if (typeof data.title === 'string' && data.title.trim()) setTitle(data.title.trim());
    if (typeof data.subtitle === 'string') setSubtitle(data.subtitle.trim());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const totalPages = Math.max(1, Number(initialData?.pagination?.totalPages) || 1);
    if (totalPages <= 1) return undefined;

    const loadRest = async () => {
      setLoadingCatalog(true);
      try {
        for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
          if (cancelled) return;
          const params = new URLSearchParams({
            page: String(nextPage),
            limit: String(OFFERS_PAGE_SIZE),
            t: String(Date.now()),
          });
          const response = await fetch(`/api/public/offers?${params.toString()}`, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            },
          });
          if (!response.ok) return;
          const data = await response.json();
          const incoming = Array.isArray(data?.products) ? data.products : [];
          if (!cancelled && incoming.length) {
            setProducts((prev) => mergeUniqueProducts(prev, incoming));
          }
          if (!cancelled) applyCopy(data);
        }
      } catch {
        // Keep products already on screen.
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    };

    loadRest();
    return () => {
      cancelled = true;
    };
  }, [applyCopy, initialData?.pagination?.totalPages]);

  const applyFilters = useCallback((list) => {
    return list.filter((product) => {
      if (activeFilters.categories.length > 0) {
        const productCategories = [
          product.category,
          ...(Array.isArray(product.categories) ? product.categories : []),
        ].filter(Boolean);
        const hasMatchingCategory = productCategories.some((cat) =>
          activeFilters.categories.includes(cat),
        );
        if (!hasMatchingCategory) return false;
      }

      const price = Number(product.price || 0);
      if (price < activeFilters.priceRange.min || price > activeFilters.priceRange.max) {
        return false;
      }

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

  const sortProducts = useCallback((list) => {
    const sorted = [...list];
    switch (activeFilters.sortBy) {
      case 'price-low-high':
        return sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      case 'price-high-low':
        return sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      case 'rating':
        return sorted.sort((a, b) => Number(b.averageRating || 0) - Number(a.averageRating || 0));
      case 'discount':
        return sorted.sort((a, b) => {
          const discountA = a.AED > a.price ? ((a.AED - a.price) / a.AED) * 100 : 0;
          const discountB = b.AED > b.price ? ((b.AED - b.price) / b.AED) * 100 : 0;
          return discountB - discountA;
        });
      case 'newest':
        return sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      case 'popularity':
      default:
        return sorted;
    }
  }, [activeFilters.sortBy]);

  const filteredProducts = useMemo(
    () => sortProducts(applyFilters(products)),
    [products, applyFilters, sortProducts],
  );

  useEffect(() => {
    setVisibleCount(OFFERS_PAGE_SIZE);
  }, [activeFilters]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;
  const rangeFrom = visibleProducts.length ? 1 : 0;
  const rangeTo = visibleProducts.length;

  const loadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(filteredProducts.length, current + OFFERS_PAGE_SIZE));
  }, [filteredProducts.length]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadMore();
      },
      { root: null, rootMargin: '480px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore, visibleProducts.length]);

  const handleFilterChange = useCallback((filters) => {
    setActiveFilters(filters);
  }, []);

  const filterSidebar = (
    <ProductFilterSidebar
      products={products}
      onFilterChange={handleFilterChange}
      initialFilters={activeFilters}
    />
  );

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-1 flex-col bg-gray-50">
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 shrink-0 sm:mb-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900"
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <div>
            {eyebrow ? (
              <span className="text-xs font-bold uppercase tracking-wider text-red-600">
                <bdi dir={getContentDirection(eyebrow)}>{eyebrow}</bdi>
              </span>
            ) : null}
            <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
              <bdi dir={getContentDirection(title)}>{title}</bdi>
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm text-gray-600 sm:text-base">
                <bdi dir={getContentDirection(subtitle)}>{subtitle}</bdi>
              </p>
            ) : null}
          </div>
        </div>

        {products.length > 0 ? (
          <>
            <div className="mb-3 lg:hidden">
              <button
                type="button"
                onClick={() => setShowMobileFilters(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm"
              >
                <SlidersHorizontal size={16} /> {t('category.filtersAndSort')}
              </button>
            </div>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[288px_1fr]">
              <aside className={`${showMobileFilters ? 'block' : 'hidden'} lg:sticky lg:top-24 lg:block`}>
                <div className="mb-2 flex justify-end lg:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters(false)}
                    className="text-sm font-semibold text-gray-600"
                    aria-label={t('category.closeFilters')}
                  >
                    {t('category.closeFilters')}
                  </button>
                </div>
                {filterSidebar}
              </aside>

              <div className="min-w-0">
                {filteredProducts.length > 0 ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-gray-600">
                        {t('shop.showingRange', {
                          from: rangeFrom,
                          to: rangeTo,
                          total: filteredProducts.length,
                          label: filteredProducts.length === 1 ? t('common.product') : t('common.products'),
                        })}
                      </p>
                      <span className="text-sm font-semibold text-red-600">Massive Savings</span>
                    </div>

                    <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {visibleProducts.map((product, index) => (
                        <ProductCard
                          key={productKey(product, index)}
                          product={product}
                          priorityImages={index < 6}
                        />
                      ))}
                    </div>

                    {hasMore || loadingCatalog ? (
                      <div ref={sentinelRef} className="mt-8 flex justify-center py-4">
                        <p className="text-sm text-gray-500">{t('category.loadingMore')}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
                    <p className="mb-2 text-lg text-gray-500">{t('category.noMatch')}</p>
                    <button
                      type="button"
                      onClick={() => setActiveFilters(DEFAULT_FILTERS)}
                      className="rounded-lg bg-red-500 px-6 py-2 text-white transition hover:bg-red-600"
                    >
                      {t('category.clearFilters')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
            <p className="mb-2 text-lg text-gray-500">No offers available</p>
            <p className="mb-6 text-sm text-gray-400">Check back later for amazing deals</p>
            <button
              type="button"
              onClick={() => router.push('/shop')}
              className="rounded-lg bg-red-500 px-6 py-2 text-white transition hover:bg-red-600"
            >
              Browse All Products
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
