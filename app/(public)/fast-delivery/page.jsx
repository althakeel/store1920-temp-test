'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import PageTitle from '@/components/PageTitle';
import Loading from '@/components/Loading';
import ProductCard from '@/components/ProductCard';
import FastDeliveryPageHeader from '@/components/FastDeliveryPageHeader';
import { DEFAULT_FAST_DELIVERY_PAGE, normalizeFastDeliveryPage } from '@/lib/fastDeliveryPageSettings';
import { FAST_DELIVERY_COPY } from '@/lib/fastDeliveryCopy';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { Truck } from 'lucide-react';

function shuffleProducts(list = []) {
  const items = [...list];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export default function FastDeliveryPage() {
  const { isArabic } = useStorefrontI18n();
  const copy = isArabic ? FAST_DELIVERY_COPY.ar : FAST_DELIVERY_COPY.en;
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageSettings, setPageSettings] = useState(DEFAULT_FAST_DELIVERY_PAGE);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const shuffledProducts = useMemo(
    () => shuffleProducts(products),
    [products, shuffleSeed],
  );

  useEffect(() => {
    fetchFastDeliveryData();
  }, []);

  const fetchFastDeliveryData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [fastRes, settingsRes] = await Promise.all([
        axios.get('/api/products', {
          params: { fastDelivery: true, all: true, slim: true, inStockOnly: true },
        }),
        axios.get('/api/store/appearance/sections/public', {
          headers: { 'Cache-Control': 'no-cache' },
          params: { t: Date.now() },
        }).catch(() => ({ data: {} })),
      ]);

      setProducts(fastRes.data?.products || []);
      setShuffleSeed((value) => value + 1);
      setPageSettings(normalizeFastDeliveryPage({
        ...DEFAULT_FAST_DELIVERY_PAGE,
        ...(settingsRes.data?.fastDeliveryPage || {}),
      }));
    } catch (fetchError) {
      console.error('Error fetching fast delivery products:', fetchError);
      setError('Failed to load fast delivery products');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      <PageTitle title={copy.title} />
      <div
        className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef7f5_42%,#ffffff_100%)] -mt-12"
        dir={isArabic ? 'rtl' : 'ltr'}
      >
        <FastDeliveryPageHeader settings={pageSettings} />

        <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-12">
          <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
              {copy.intro}
            </p>

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{copy.qualifyTitle}</h2>
                <ul className="mt-3 list-disc space-y-2 ps-5 text-sm leading-relaxed text-slate-700">
                  {copy.qualify.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{copy.chargesTitle}</h2>
                {copy.charges.map((item) => (
                  <p key={item} className="mt-3 text-sm leading-relaxed text-slate-700">
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-lg font-semibold text-slate-900">{copy.coverageTitle}</h2>
              <p className="mt-3 text-sm text-slate-700">{copy.coverageLead}</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-4">
                {copy.emirates.map((emirate) => (
                  <li key={emirate}>{emirate}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                {copy.coverageNote}
              </p>
            </div>
          </section>

          <h2 className="mb-4 text-xl font-semibold text-slate-900">{copy.productsTitle}</h2>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mb-4 text-lg text-red-500">{error}</div>
              <button
                type="button"
                onClick={fetchFastDeliveryData}
                className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Try Again
              </button>
            </div>
          ) : shuffledProducts.length === 0 ? (
            <div
              className="rounded-2xl px-6 py-16 text-center"
              style={{ backgroundColor: pageSettings.emptyStateBgColor }}
            >
              <Truck size={72} className="mx-auto mb-6 text-slate-300" />
              <h3 className="mb-3 text-2xl font-bold text-slate-800">
                {pageSettings.emptyStateTitle}
              </h3>
              <p className="mb-6 text-slate-600">{pageSettings.emptyStateMessage}</p>
              <Link
                href="/shop"
                className="inline-block rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-teal-800"
              >
                Browse All Products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 lg:grid-cols-5">
              {shuffledProducts.map((product, index) => (
                <ProductCard
                  key={product._id || product.id || product.slug}
                  product={product}
                  priorityImages={index < 5}
                  itemListId="fast_delivery"
                  itemListName="Fast Delivery"
                  itemListIndex={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
