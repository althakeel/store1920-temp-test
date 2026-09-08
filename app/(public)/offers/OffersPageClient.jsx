'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { OFFERS_PAGE_SIZE } from '@/lib/offersPageSettings';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

export default function OffersPageClient({ initialData = null }) {
  const router = useRouter();
  const { t } = useStorefrontI18n();
  const [products, setProducts] = useState(() => (
    Array.isArray(initialData?.products) ? initialData.products : []
  ));
  const [page, setPage] = useState(() => Number(initialData?.pagination?.page) || 1);
  const [eyebrow, setEyebrow] = useState(() => String(initialData?.eyebrow || ''));
  const [title, setTitle] = useState(() => String(initialData?.title || 'Special Offers'));
  const [subtitle, setSubtitle] = useState(() => String(initialData?.subtitle || ''));
  const [pagination, setPagination] = useState(() => initialData?.pagination || {
    page: 1,
    limit: OFFERS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const skipScrollRef = useRef(true);
  const skipInitialFetchRef = useRef(Boolean(initialData));

  const applyPayload = useCallback((data, targetPage) => {
    if (!data) return;
    setProducts(Array.isArray(data.products) ? data.products : []);
    setPagination(data.pagination || {
      page: targetPage,
      limit: OFFERS_PAGE_SIZE,
      total: 0,
      totalPages: 1,
    });
    if (typeof data.eyebrow === 'string') setEyebrow(data.eyebrow.trim());
    if (typeof data.title === 'string' && data.title.trim()) setTitle(data.title.trim());
    if (typeof data.subtitle === 'string') setSubtitle(data.subtitle.trim());
  }, []);

  const loadOffers = useCallback(async (targetPage) => {
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
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
      applyPayload(await response.json(), targetPage);
    } catch {
      // Keep the products already on screen.
    }
  }, [applyPayload]);

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
    loadOffers(page);
  }, [loadOffers, page]);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  const goToPage = (nextPage) => {
    const safePage = Math.min(Math.max(1, nextPage), pagination.totalPages);
    setPage(safePage);
  };

  const rangeFrom = pagination.total
    ? (pagination.page - 1) * pagination.limit + 1
    : 0;
  const rangeTo = pagination.total
    ? Math.min(pagination.page * pagination.limit, pagination.total)
    : 0;

  const paginationBar = pagination.totalPages > 1 ? (
    <div className="mt-auto flex flex-wrap items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 pt-6">
      <button
        type="button"
        onClick={() => goToPage(pagination.page - 1)}
        disabled={pagination.page <= 1}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('shop.previous')}
      </button>
      <span className="px-3 text-sm text-gray-600">
        {t('shop.pageOf', { page: pagination.page, total: pagination.totalPages })}
      </span>
      <button
        type="button"
        onClick={() => goToPage(pagination.page + 1)}
        disabled={pagination.page >= pagination.totalPages}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('shop.next')}
      </button>
    </div>
  ) : null;

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
                {eyebrow}
              </span>
            ) : null}
            <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm text-gray-600 sm:text-base">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {products.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {t('shop.showingRange', {
                  from: rangeFrom,
                  to: rangeTo,
                  total: pagination.total,
                  label: pagination.total === 1 ? t('common.product') : t('common.products'),
                })}
              </p>
              <span className="text-sm font-semibold text-red-600">Massive Savings</span>
            </div>

            <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {products.map((product, index) => (
                <ProductCard
                  key={product._id || product.id || product.slug}
                  product={product}
                  priorityImages={pagination.page === 1 && index < 6}
                />
              ))}
            </div>

            {paginationBar}
          </div>
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
