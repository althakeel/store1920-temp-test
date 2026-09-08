'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import PageTitle from '@/components/PageTitle';
import Loading from '@/components/Loading';
import ProductCard from '@/components/ProductCard';
import FastDeliveryPageHeader from '@/components/FastDeliveryPageHeader';
import { DEFAULT_FAST_DELIVERY_PAGE, normalizeFastDeliveryPage } from '@/lib/fastDeliveryPageSettings';
import { Truck } from 'lucide-react';

function shuffleProducts(list = []) {
  const items = [...list];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function mergeUniqueProducts(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((product) => {
    const id = String(product?._id || product?.id || product?.sku || product?.slug || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(product);
  });
  return merged;
}

export default function FastDeliveryPage() {
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

      const [fastRes, topRes, settingsRes] = await Promise.all([
        axios.get('/api/products', {
          params: { fastDelivery: true, all: true, slim: true, inStockOnly: true },
        }),
        axios.get('/api/products', {
          params: { bestSeller: true, all: true, slim: true, inStockOnly: true },
        }).catch(() => ({ data: { products: [] } })),
        axios.get('/api/store/appearance/sections/public', {
          headers: { 'Cache-Control': 'no-cache' },
          params: { t: Date.now() },
        }).catch(() => ({ data: {} })),
      ]);

      const merged = mergeUniqueProducts(
        fastRes.data?.products || [],
        topRes.data?.products || [],
      );
      setProducts(merged);
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
      <PageTitle title={pageSettings.headerTitle || 'Fast Delivery & Top Sellers'} />
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef7f5_42%,#ffffff_100%)] -mt-12">
        <FastDeliveryPageHeader settings={pageSettings} />

        <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-12">
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
              <h2 className="mb-3 text-2xl font-bold text-slate-800">
                {pageSettings.emptyStateTitle}
              </h2>
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
