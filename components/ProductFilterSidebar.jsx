'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { decodeHtmlEntities } from '@/lib/displayText';
import { getLocalizedCategoryName } from '@/lib/categoryLocalization';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

export default function ProductFilterSidebar({
  products = [],
  onFilterChange = () => {},
  initialFilters = {},
  subcategoryLinks = [],
  showCategoryFilter = true,
  className = '',
}) {
  const { t, language } = useStorefrontI18n();
  const isArabic = language === 'ar';

  const [mounted, setMounted] = useState(false);
  const [filters, setFilters] = useState({
    categories: [],
    priceRange: { min: 0, max: 100000 },
    rating: 0,
    inStock: false,
    ...initialFilters,
  });

  const [expandedSections, setExpandedSections] = useState({
    category: true,
    price: true,
    rating: true,
    availability: true,
  });

  const [sortBy, setSortBy] = useState(initialFilters.sortBy || 'popularity');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  const [categorySearch, setCategorySearch] = useState('');

  const [availableFilters, setAvailableFilters] = useState({
    categories: [],
    maxPrice: 10000,
  });
  const [categoryVisibleCount, setCategoryVisibleCount] = useState(6);

  const localizeCategoryLabel = (name) => decodeHtmlEntities(
    getLocalizedCategoryName({ name }, language),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!sortOpen) return undefined;

    const handlePointerDown = (event) => {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setSortOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSortOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sortOpen]);

  useEffect(() => {
    if (products && products.length > 0) {
      const categories = new Set();
      let maxPrice = 0;

      products.forEach((product) => {
        const isValidCategory = (cat) => cat
          && cat.length < 50
          && !/^[a-f0-9]{24}$/i.test(cat)
          && !/^[0-9a-f]{12,}$/i.test(cat);

        if (product.category && isValidCategory(product.category)) {
          categories.add(product.category);
        }
        if (product.categories && Array.isArray(product.categories)) {
          product.categories.forEach((cat) => {
            if (isValidCategory(cat)) {
              categories.add(cat);
            }
          });
        }
        const priceValue = Number(product.price) || Number(product.AED) || 0;
        if (priceValue > maxPrice) maxPrice = priceValue;
      });

      const nextMax = Math.max(100000, Math.ceil(Number(maxPrice) || 0));

      setAvailableFilters({
        categories: Array.from(categories).sort(),
        maxPrice: Math.max(1, Math.ceil(Number(maxPrice) || 0)) || 100000,
      });

      // Keep a wide default max so auto-sync never blanks the product grid.
      setFilters((prev) => {
        const currentMax = Number(prev.priceRange?.max);
        const safeCurrent = Number.isFinite(currentMax) && currentMax >= 10 ? currentMax : nextMax;
        return {
          ...prev,
          priceRange: {
            ...prev.priceRange,
            max: Math.max(safeCurrent, nextMax),
          },
        };
      });
    }
  }, [products]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const minRaw = filters.priceRange?.min;
      const maxRaw = filters.priceRange?.max;
      const min = minRaw === '' || minRaw == null ? 0 : Number(minRaw) || 0;
      const max = maxRaw === '' || maxRaw == null
        ? (availableFilters.maxPrice || 100000)
        : Number(maxRaw) || 0;

      onFilterChange({
        ...filters,
        priceRange: {
          min: Math.min(min, max),
          max: Math.max(min, max || availableFilters.maxPrice || 100000),
        },
        sortBy,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, sortBy, onFilterChange, availableFilters.maxPrice]);

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleCheckbox = (filterType, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: prev[filterType].includes(value)
        ? prev[filterType].filter((v) => v !== value)
        : [...prev[filterType], value],
    }));
  };

  const handlePriceChange = (type, value) => {
    // Allow clearing the field while typing so a leading "0" can be removed.
    // Empty input is treated as null in state and coerced when applying filters.
    const nextValue = value === '' ? '' : Math.max(0, Number.parseInt(value, 10) || 0);
    setFilters((prev) => ({
      ...prev,
      priceRange: {
        ...prev.priceRange,
        [type]: nextValue,
      },
    }));
  };

  const handlePriceBlur = (type) => {
    setFilters((prev) => {
      const current = prev.priceRange?.[type];
      if (current !== '' && current != null) return prev;

      const fallback = type === 'min' ? 0 : (availableFilters.maxPrice || 100000);
      return {
        ...prev,
        priceRange: {
          ...prev.priceRange,
          [type]: fallback,
        },
      };
    });
  };

  const handleRatingChange = (rating) => {
    setFilters((prev) => ({
      ...prev,
      rating: prev.rating === rating ? 0 : rating,
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      categories: [],
      priceRange: { min: 0, max: availableFilters.maxPrice },
      rating: 0,
      inStock: false,
    });
    setSortBy('popularity');
  };

  const hasActiveFilters = () => filters.categories.length > 0
    || filters.rating > 0
    || filters.inStock
    || sortBy !== 'popularity';

  const filteredCategories = availableFilters.categories.filter((cat) =>
    cat.toLowerCase().includes(categorySearch.toLowerCase())
    || localizeCategoryLabel(cat).toLowerCase().includes(categorySearch.toLowerCase()),
  );

  const visibleCategories = filteredCategories.slice(0, categoryVisibleCount);
  const canShowMore = filteredCategories.length > categoryVisibleCount;

  useEffect(() => {
    setCategoryVisibleCount(6);
  }, [categorySearch]);

  const sortOptions = [
    { value: 'popularity', label: t('category.sort.popularity') },
    { value: 'price-low-high', label: t('category.sort.priceLowHigh') },
    { value: 'price-high-low', label: t('category.sort.priceHighLow') },
    { value: 'newest', label: t('category.sort.newest') },
    { value: 'rating', label: t('category.sort.rating') },
    { value: 'discount', label: t('category.sort.discount') },
  ];

  const activeSortLabel = sortOptions.find((option) => option.value === sortBy)?.label
    || sortOptions[0].label;

  return (
    <div
      dir={isArabic ? 'rtl' : 'ltr'}
      className={`sticky top-20 flex h-fit w-full max-h-[calc(100vh-100px)] flex-col overflow-visible rounded-lg border border-gray-200 bg-white lg:w-72 ${className}`.trim()}
    >
      <div className="shrink-0 border-b border-gray-100 p-4 pb-3">
        {subcategoryLinks.length > 0 ? (
          <div className="mb-4 border-b border-gray-200 pb-4">
            <h3 className={`mb-3 text-lg font-bold text-gray-900 ${isArabic ? 'text-right' : ''}`}>
              {t('category.filterByType')}
            </h3>
            <nav className="space-y-1">
              {subcategoryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-orange-50 hover:text-orange-700 ${isArabic ? 'text-right' : ''}`}
                >
                  {decodeHtmlEntities(link.name)}
                </Link>
              ))}
            </nav>
          </div>
        ) : null}

        <div className="relative z-30" ref={sortRef}>
          <label className={`mb-2.5 block text-sm font-semibold text-gray-800 ${isArabic ? 'text-right' : ''}`}>
            {t('category.sortBy')}
          </label>
          <button
            type="button"
            onClick={() => setSortOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-sm font-medium shadow-sm transition ${
              sortOpen
                ? 'border-orange-400 text-gray-900 ring-2 ring-orange-100'
                : 'border-gray-200 text-gray-800 hover:border-orange-300 hover:bg-orange-50/40'
            } ${isArabic ? 'flex-row-reverse text-right' : 'text-left'}`}
          >
            <span className="min-w-0 truncate">{activeSortLabel}</span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-gray-500 transition-transform duration-200 ${sortOpen ? 'rotate-180 text-orange-600' : ''}`}
            />
          </button>

          <div
            className={`absolute inset-x-0 top-[calc(100%+6px)] origin-top overflow-hidden rounded-xl border border-orange-100 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition-[opacity,transform,visibility] duration-200 ease-out ${
              sortOpen
                ? 'visible translate-y-0 scale-100 opacity-100'
                : 'pointer-events-none invisible -translate-y-1 scale-[0.98] opacity-0'
            }`}
            role="listbox"
            aria-label={t('category.sortBy')}
          >
            <ul className="max-h-64 overflow-y-auto py-1.5">
              {sortOptions.map((option) => {
                const active = sortBy === option.value;
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setSortBy(option.value);
                        setSortOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-sm transition ${
                        active
                          ? 'bg-orange-50 font-semibold text-orange-700'
                          : 'text-gray-700 hover:bg-slate-50 hover:text-gray-900'
                      } ${isArabic ? 'flex-row-reverse text-right' : 'text-left'}`}
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                      {active ? <Check size={15} className="shrink-0 text-orange-600" strokeWidth={2.5} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
      <div className={`flex items-center justify-between mb-4 pb-3 border-b border-gray-200 ${isArabic ? 'flex-row-reverse' : ''}`}>
        <h3 className="text-lg font-bold text-gray-900">{t('category.filters')}</h3>
        {hasActiveFilters() ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-orange-600 hover:text-orange-700 font-semibold"
          >
            {t('category.clearAll')}
          </button>
        ) : null}
      </div>

      <div className={`text-sm text-gray-600 mb-4 ${isArabic ? 'text-right' : ''}`} suppressHydrationWarning>
        {mounted
          ? t('category.productsCount', { count: products?.length || 0 })
          : t('category.filters')}
      </div>

      <div className="space-y-4">
        {showCategoryFilter && availableFilters.categories.length > 0 ? (
          <div className="border-b border-gray-200 pb-4">
            <button
              type="button"
              onClick={() => toggleSection('category')}
              className={`flex items-center justify-between w-full font-semibold text-gray-900 mb-3 ${isArabic ? 'flex-row-reverse text-right' : 'text-left'}`}
            >
              {t('category.category')}
              {expandedSections.category ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {expandedSections.category ? (
              <div>
                <div className="relative mb-3">
                  <Search className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${isArabic ? 'right-3' : 'left-3'}`} size={16} />
                  <input
                    type="text"
                    placeholder={t('category.searchCategories')}
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    className={`w-full py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${isArabic ? 'pr-9 pl-8 text-right' : 'pl-9 pr-8'}`}
                  />
                  {categorySearch ? (
                    <button
                      type="button"
                      onClick={() => setCategorySearch('')}
                      className={`absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 ${isArabic ? 'left-3' : 'right-3'}`}
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {visibleCategories.map((category) => (
                    <label
                      key={category}
                      className={`flex items-center cursor-pointer hover:bg-orange-50 p-1.5 rounded ${isArabic ? 'flex-row-reverse gap-2' : 'space-x-2'}`}
                    >
                      <input
                        type="checkbox"
                        checked={filters.categories.includes(category)}
                        onChange={() => handleCheckbox('categories', category)}
                        className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                      />
                      <span className={`text-sm text-gray-700 ${isArabic ? 'text-right' : ''}`}>
                        {localizeCategoryLabel(category)}
                      </span>
                    </label>
                  ))}
                </div>

                {filteredCategories.length > 0 ? (
                  <div className={`mt-2 ${isArabic ? 'text-right' : ''}`}>
                    {canShowMore ? (
                      <button
                        type="button"
                        onClick={() => setCategoryVisibleCount((prev) => prev + 10)}
                        className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                      >
                        {t('category.showMore', { count: filteredCategories.length - visibleCategories.length })}
                      </button>
                    ) : (
                      filteredCategories.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setCategoryVisibleCount(6)}
                          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                        >
                          {t('category.showLess')}
                        </button>
                      )
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="border-b border-gray-200 pb-4">
          <button
            type="button"
            onClick={() => toggleSection('price')}
            className={`flex items-center justify-between w-full font-semibold text-gray-900 mb-3 ${isArabic ? 'flex-row-reverse text-right' : 'text-left'}`}
          >
            {t('category.priceRange')}
            {expandedSections.price ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.price ? (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder={t('category.min')}
                  value={filters.priceRange.min === '' || filters.priceRange.min == null ? '' : filters.priceRange.min}
                  onChange={(e) => handlePriceChange('min', e.target.value)}
                  onBlur={() => handlePriceBlur('min')}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${isArabic ? 'text-right' : ''}`}
                />
                <span className="text-gray-500 text-sm">{t('category.to')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder={t('category.max')}
                  value={filters.priceRange.max === '' || filters.priceRange.max == null ? '' : filters.priceRange.max}
                  onChange={(e) => handlePriceChange('max', e.target.value)}
                  onBlur={() => handlePriceBlur('max')}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${isArabic ? 'text-right' : ''}`}
                />
              </div>
              <div className="px-1">
                <input
                  type="range"
                  min="0"
                  max={availableFilters.maxPrice}
                  value={filters.priceRange.max}
                  onChange={(e) => handlePriceChange('max', e.target.value)}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                />
                <div className={`flex justify-between text-xs text-gray-500 mt-1 ${isArabic ? 'flex-row-reverse' : ''}`}>
                  <span>AED 0</span>
                  <span>AED {availableFilters.maxPrice}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-b border-gray-200 pb-4">
          <button
            type="button"
            onClick={() => toggleSection('rating')}
            className={`flex items-center justify-between w-full font-semibold text-gray-900 mb-3 ${isArabic ? 'flex-row-reverse text-right' : 'text-left'}`}
          >
            {t('category.customerRating')}
            {expandedSections.rating ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.rating ? (
            <div className="space-y-2">
              {[4, 3, 2, 1].map((rating) => (
                <label
                  key={rating}
                  className={`flex items-center cursor-pointer hover:bg-orange-50 p-1.5 rounded ${isArabic ? 'flex-row-reverse gap-2' : 'space-x-2'}`}
                >
                  <input
                    type="radio"
                    name="rating"
                    checked={filters.rating === rating}
                    onChange={() => handleRatingChange(rating)}
                    className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                  />
                  <span className={`text-sm text-gray-700 flex items-center ${isArabic ? 'flex-row-reverse' : ''}`}>
                    {t('category.ratingAndAbove', { rating })}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pb-2">
          <button
            type="button"
            onClick={() => toggleSection('availability')}
            className={`flex items-center justify-between w-full font-semibold text-gray-900 mb-3 ${isArabic ? 'flex-row-reverse text-right' : 'text-left'}`}
          >
            {t('category.availability')}
            {expandedSections.availability ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {expandedSections.availability ? (
            <label className={`flex items-center cursor-pointer hover:bg-orange-50 p-1.5 rounded ${isArabic ? 'flex-row-reverse gap-2' : 'space-x-2'}`}>
              <input
                type="checkbox"
                checked={filters.inStock}
                onChange={(e) => setFilters((prev) => ({ ...prev, inStock: e.target.checked }))}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <span className={`text-sm text-gray-700 ${isArabic ? 'text-right' : ''}`}>
                {t('category.inStockOnly')}
              </span>
            </label>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}
