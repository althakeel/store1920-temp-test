'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Filter, Loader2, X } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import ProductFilterSidebar from '@/components/ProductFilterSidebar';
import { decodeHtmlEntities } from '@/lib/displayText';
import { PRODUCT_CARD_GRID_CLASS_5 } from '@/lib/storefrontCarousel';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

const CATEGORY_PRODUCTS_PAGE_SIZE = 100;
function applyProductFilters(products, activeFilters) {
  return products.filter((product) => {
    if (activeFilters.categories.length > 0) {
      const productCategories = [
        product.category,
        ...(Array.isArray(product.categories) ? product.categories : []),
      ].filter(Boolean);

      const hasMatchingCategory = productCategories.some((cat) =>
        activeFilters.categories.includes(cat)
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
}

function sortProducts(products, sortBy) {
  const sorted = [...products];

  switch (sortBy) {
    case 'price-low-high':
      return sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    case 'price-high-low':
      return sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    case 'rating':
      return sorted.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    case 'discount':
      return sorted.sort((a, b) => {
        const discountA = a.AED > a.price ? ((a.AED - a.price) / a.AED) * 100 : 0;
        const discountB = b.AED > b.price ? ((b.AED - b.price) / b.AED) * 100 : 0;
        return discountB - discountA;
      });
    case 'popularity':
      return sorted.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
    case 'newest':
    default:
      return sorted.sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
  }
}

export default function CategoryProductsPanel({
  categoryId = '',
  products = [],
  subcategoryLinks = [],
  showSubcategoryLinks = false,
  totalCount = 0,
}) {
  const { t, language } = useStorefrontI18n();
  const isArabic = language === 'ar';
  const [pageProducts, setPageProducts] = useState(products);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(Number(totalCount) || products.length);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadError, setLoadError] = useState('');
  const gridTopRef = useRef(null);
  const [activeFilters, setActiveFilters] = useState({
    categories: [],
    priceRange: { min: 0, max: 100000 },
    rating: 0,
    inStock: false,
    sortBy: 'newest',
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    setPageProducts(products);
    setPage(1);
    setTotal(Number(totalCount) || products.length);
    setLoadError('');
  }, [categoryId, products, totalCount]);

  const totalPages = Math.max(1, Math.ceil((total || pageProducts.length) / CATEGORY_PRODUCTS_PAGE_SIZE));

  const goToPage = useCallback(async (nextPage, { force = false } = {}) => {
    const safePage = Math.max(1, Math.min(nextPage, totalPages));
    if (!categoryId || loadingPage) return;
    if (!force && safePage === page) return;

    if (safePage === 1 && products.length) {
      setPageProducts(products);
      setPage(1);
      gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setLoadingPage(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({
        categoryId,
        page: String(safePage),
        limit: String(CATEGORY_PRODUCTS_PAGE_SIZE),
      });
      const res = await fetch(`/api/public/category-products?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load products');
      }
      setPageProducts(Array.isArray(data.products) ? data.products : []);
      setPage(Number(data.page) || safePage);
      if (Number.isFinite(Number(data.total))) {
        setTotal(Number(data.total));
      }
      gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      setLoadError(error?.message || 'Failed to load products');
    } finally {
      setLoadingPage(false);
    }
  }, [categoryId, loadingPage, page, products, totalPages]);

  const handleFilterChange = useCallback((filters) => {
    setActiveFilters(filters);
  }, []);

  const filteredAndSortedProducts = useMemo(() => {
    const filtered = applyProductFilters(pageProducts, activeFilters);
    return sortProducts(filtered, activeFilters.sortBy);
  }, [pageProducts, activeFilters]);

  const hasActiveFilters =
    activeFilters.categories.length > 0 ||
    activeFilters.rating > 0 ||
    activeFilters.inStock ||
    activeFilters.sortBy !== 'newest' ||
    activeFilters.priceRange.min > 0 ||
    activeFilters.priceRange.max < 100000;

  const clearFilters = () => {
    setActiveFilters({
      categories: [],
      priceRange: { min: 0, max: 100000 },
      rating: 0,
      inStock: false,
      sortBy: 'newest',
    });
  };

  const showingFrom = total > 0 ? ((page - 1) * CATEGORY_PRODUCTS_PAGE_SIZE) + 1 : 0;
  const showingTo = total > 0 ? Math.min(page * CATEGORY_PRODUCTS_PAGE_SIZE, total) : 0;

  const sidebarProps = {
    products: pageProducts,
    onFilterChange: handleFilterChange,
    initialFilters: activeFilters,
    subcategoryLinks: showSubcategoryLinks ? subcategoryLinks : [],
    showCategoryFilter: !showSubcategoryLinks,
  };

  const productsGrid =
    filteredAndSortedProducts.length > 0 ? (
      <div className={PRODUCT_CARD_GRID_CLASS_5}>
        {filteredAndSortedProducts.map((product) => (
          <ProductCard key={String(product._id || product.slug)} product={product} />
        ))}
      </div>
    ) : (
      <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
        <p className="text-lg text-gray-500">{t('category.noMatch')}</p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 rounded-lg bg-orange-500 px-6 py-2 text-white transition hover:bg-orange-600"
          >
            {t('category.clearFilters')}
          </button>
        ) : null}
      </div>
    );

  return (
    <>
      {showSubcategoryLinks && subcategoryLinks.length > 0 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {subcategoryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-orange-300 hover:text-orange-700"
            >
              {decodeHtmlEntities(link.name)}
            </Link>
          ))}
        </div>
      ) : null}

      <div className={`mb-4 flex items-center justify-between lg:hidden ${isArabic ? 'flex-row-reverse' : ''}`}>
        <p className="text-sm text-gray-600">
          {t('category.ofProducts', {
            shown: `${showingFrom.toLocaleString(isArabic ? 'ar-AE' : 'en')}-${showingTo.toLocaleString(isArabic ? 'ar-AE' : 'en')}`,
            total: (total || pageProducts.length).toLocaleString(isArabic ? 'ar-AE' : 'en'),
          })}
        </p>
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className={`flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${isArabic ? 'flex-row-reverse' : ''}`}
        >
          <Filter size={16} />
          {t('category.filtersAndSort')}
        </button>
      </div>

      <div className="flex gap-6">
        <div className="hidden flex-shrink-0 lg:block">
          <ProductFilterSidebar {...sidebarProps} />
        </div>

        <div className="min-w-0 flex-1">
          <div ref={gridTopRef} />
          {loadingPage ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              {t('category.loadingMore')}
            </div>
          ) : (
            productsGrid
          )}
          {loadError ? (
            <div className="mt-4 text-center">
              <p className="text-sm text-red-600">{loadError}</p>
              <button
                type="button"
                onClick={() => void goToPage(page, { force: true })}
                className="mt-2 text-sm font-medium text-orange-600 hover:text-orange-700"
              >
                {t('category.loadingMore')}
              </button>
            </div>
          ) : null}
          {totalPages > 1 ? (
            <div className={`mt-8 flex flex-wrap items-center justify-center gap-2 ${isArabic ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                onClick={() => void goToPage(page - 1)}
                disabled={page <= 1 || loadingPage}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('shop.previous')}
              </button>
              <span className="px-3 text-sm text-gray-600">
                {t('shop.pageOf', { page, total: totalPages })}
              </span>
              <button
                type="button"
                onClick={() => void goToPage(page + 1)}
                disabled={page >= totalPages || loadingPage}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('shop.next')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {mobileFiltersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className={`absolute top-0 flex h-full w-[min(100%,340px)] flex-col bg-white shadow-xl ${isArabic ? 'left-0' : 'right-0'}`}>
            <div className={`flex items-center justify-between border-b border-gray-200 px-4 py-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
              <h2 className="text-lg font-semibold text-gray-900">{t('category.filtersAndSort')}</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label={t('category.closeFilters')}
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ProductFilterSidebar
                {...sidebarProps}
                className="!static !max-h-none !w-full !border-0 !p-0 !shadow-none"
              />
            </div>
            <div className="border-t border-gray-200 p-4">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full rounded-lg bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600"
              >
                {t('category.showProducts', { count: filteredAndSortedProducts.length })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
