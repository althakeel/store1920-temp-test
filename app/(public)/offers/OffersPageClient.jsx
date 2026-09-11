'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import { OFFERS_PAGE_SIZE } from '@/lib/offersPageSettings';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { getContentDirection } from '@/lib/storefrontLanguage';

function productKey(product, index) {
  return String(product?._id || product?.id || product?.slug || index);
}

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
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const pageRef = useRef(Number(initialData?.pagination?.page) || 1);
  const totalPagesRef = useRef(Number(initialData?.pagination?.totalPages) || 1);
  const seenIdsRef = useRef(new Set(
    (Array.isArray(initialData?.products) ? initialData.products : [])
      .map((product) => String(product?._id || product?.id || ''))
      .filter(Boolean),
  ));

  pageRef.current = page;
  totalPagesRef.current = Number(pagination.totalPages) || 1;

  const applyCopy = useCallback((data) => {
    if (!data) return;
    if (typeof data.eyebrow === 'string') setEyebrow(data.eyebrow.trim());
    if (typeof data.title === 'string' && data.title.trim()) setTitle(data.title.trim());
    if (typeof data.subtitle === 'string') setSubtitle(data.subtitle.trim());
  }, []);

  const loadMore = useCallback(async () => {
    const nextPage = pageRef.current + 1;
    if (loadingMoreRef.current || nextPage > totalPagesRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
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
      const unique = incoming.filter((product) => {
        const id = String(product?._id || product?.id || '');
        if (!id || seenIdsRef.current.has(id)) return false;
        seenIdsRef.current.add(id);
        return true;
      });

      if (unique.length) {
        setProducts((prev) => [...prev, ...unique]);
      }
      if (data?.pagination) {
        setPagination(data.pagination);
        totalPagesRef.current = Number(data.pagination.totalPages) || 1;
      }
      setPage(nextPage);
      pageRef.current = nextPage;
      applyCopy(data);
    } catch {
      // Keep the products already on screen.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [applyCopy]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadMore();
      },
      { root: null, rootMargin: '480px 0px', threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, products.length]);

  const hasMore = page < (Number(pagination.totalPages) || 1);
  const rangeFrom = products.length ? 1 : 0;
  const rangeTo = products.length;

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
                  key={productKey(product, index)}
                  product={product}
                  priorityImages={index < 6}
                />
              ))}
            </div>

            {hasMore ? (
              <div ref={sentinelRef} className="mt-8 flex justify-center py-4">
                {loadingMore ? (
                  <p className="text-sm text-gray-500">{t('category.loadingMore')}</p>
                ) : (
                  <span className="sr-only">{t('exploreInterests.loadMore')}</span>
                )}
              </div>
            ) : null}
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
