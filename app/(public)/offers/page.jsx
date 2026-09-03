'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { OFFERS_PAGE_SIZE } from '@/lib/offersPageSettings';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';

function OffersGridSkeleton() {
  return (
    <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: OFFERS_PAGE_SIZE }).map((_, index) => (
        <div
          key={index}
          className="aspect-[3/4] animate-pulse rounded-lg border border-gray-200 bg-white"
        />
      ))}
    </div>
  );
}

export default function OffersPage() {
  const router = useRouter();
  const { t } = useStorefrontI18n();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [eyebrow, setEyebrow] = useState('Hot Deals');
  const [title, setTitle] = useState('Special Offers');
  const [subtitle, setSubtitle] = useState('Products with over 60% discount');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: OFFERS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const skipScrollRef = useRef(true);

  const loadOffers = useCallback(async (targetPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(OFFERS_PAGE_SIZE),
      });
      const response = await fetch(`/api/public/offers?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = response.ok ? await response.json() : null;
      setProducts(Array.isArray(data?.products) ? data.products : []);
      setPagination(data?.pagination || {
        page: targetPage,
        limit: OFFERS_PAGE_SIZE,
        total: 0,
        totalPages: 1,
      });
      if (typeof data?.eyebrow === 'string' && data.eyebrow.trim()) setEyebrow(data.eyebrow.trim());
      if (typeof data?.title === 'string' && data.title.trim()) setTitle(data.title.trim());
      if (typeof data?.subtitle === 'string' && data.subtitle.trim()) setSubtitle(data.subtitle.trim());
    } catch {
      setProducts([]);
      setPagination({
        page: targetPage,
        limit: OFFERS_PAGE_SIZE,
        total: 0,
        totalPages: 1,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOffers(page);
  }, [loadOffers, page]);

  useEffect(() => {
    if (loading) return;
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, loading]);

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

  return (
    <div className="min-h-screen bg-gray-50 pb-[5.25rem] lg:pb-8">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900"
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-red-600">
              {eyebrow}
            </span>
            <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-gray-600 sm:text-base">
              {subtitle}
            </p>
          </div>
        </div>

        {loading ? (
          <>
            <div className="mb-4 h-5 w-48 animate-pulse rounded bg-gray-200" />
            <OffersGridSkeleton />
          </>
        ) : products.length > 0 ? (
          <>
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

            {pagination.totalPages > 1 ? (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('shop.next')}
                </button>
              </div>
            ) : null}
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
