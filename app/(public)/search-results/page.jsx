'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from '@/components/SafeNextImage';
import { ArrowLeft, PackageIcon } from 'lucide-react';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
import { pushGtmEvent } from '@/lib/pushGtmEcommerceEvent';
import { GTM_EVENTS, gtmDedupeKey } from '@/lib/gtmEvents';
import { PRODUCT_CARD_GRID_CLASS_1_2_3_6, PRODUCT_CARD_CELL_CLASS } from '@/lib/storefrontCarousel';
import { getProductPath } from '@/lib/productUrl';

function SearchResultsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { market, convertPrice, formatNumber } = useStorefrontMarket();
  const formatPrice = (amount) => `${market.currency} ${formatNumber(convertPrice(Number(amount) || 0), 'en', { maximumFractionDigits: 0 })}`;
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('image-search');
  const [source, setSource] = useState('');
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [similarProducts, setSimilarProducts] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState([]);

  const normalizeErrorMessage = (value, fallback = 'Failed to fetch results') => {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      const msg = value.error || value.message || value.detail || value.code;
      if (typeof msg === 'string') return msg;
      try {
        return JSON.stringify(value);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  // Initialize from search params
  useEffect(() => {
    const kw = searchParams.get('keyword') || '';
    const m = searchParams.get('method') || 'image-search';
    const src = searchParams.get('source') || '';
    setKeyword(kw);
    setMethod(m);
    setSource(src);
  }, [searchParams]);

  useEffect(() => {
    const fetchResults = async () => {
      if (source === 'image') {
        if (typeof window !== 'undefined') {
          const stored = sessionStorage.getItem('imageSearchResults');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setKeyword(parsed.keyword || '');
              setProducts(parsed.products || []);
              setRecommendedProducts(parsed.recommendedProducts || []);
              setError((parsed.products || []).length === 0 ? 'No similar products found.' : '');
            } catch (err) {
              console.error(err);
              setError('Image search results expired. Please search again.');
            }
          } else {
            if (!keyword) {
              setError('Image search results expired. Please search again.');
            }
          }
        }
        setLoading(false);
        return;
      }

      if (!keyword) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/search-products?keyword=${encodeURIComponent(keyword)}&limit=100&includeOutOfStock=true`);
        const data = await response.json();
        
        if (data.error) {
          setError(normalizeErrorMessage(data.error));
          setProducts([]);
        } else {
          setProducts(data.products || []);
          if (keyword.trim()) {
            pushGtmEvent(
              GTM_EVENTS.SEARCH,
              { search_term: keyword.trim() },
              gtmDedupeKey(GTM_EVENTS.SEARCH, keyword.trim().toLowerCase()),
            );
          }
          if ((data.products || []).length === 0) {
            setError('No products found. Try another search.');
          }
        }
      } catch (err) {
        console.error(err);
        setError(normalizeErrorMessage(err?.message || err));
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [keyword]);

  useEffect(() => {
    const fetchSimilar = async () => {
      if (!products || products.length === 0) {
        setSimilarProducts([]);
        return;
      }

      const baseProduct = products[0];
      if (!baseProduct?.category) {
        setSimilarProducts([]);
        return;
      }

      try {
        setSimilarLoading(true);
        const response = await fetch(`/api/search-products?category=${encodeURIComponent(baseProduct.category)}&excludeId=${encodeURIComponent(baseProduct._id)}&limit=8`);
        const data = await response.json();
        if (data.error) {
          setSimilarProducts([]);
          return;
        }
        setSimilarProducts(data.products || []);
      } catch (err) {
        console.error(err);
        setSimilarProducts([]);
      } finally {
        setSimilarLoading(false);
      }
    };

    fetchSimilar();
  }, [products]);

  const isLikelyHash = /^[a-f0-9]{12,}$/i.test(keyword || '');
  const displayKeyword = isLikelyHash || !keyword ? 'your image' : keyword;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 transition"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Search Results
          </h1>
          <p className="text-gray-600">
            {source === 'image' || method === 'image-search' ? 'Image Search Results for:' : 'Search Results for:'} <strong>{displayKeyword}</strong>
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-semibold">{error}</p>
            <p className="text-red-600 text-sm mt-2">Try using a more specific keyword or upload a clearer image.</p>
          </div>
        )}

        {/* No Results */}
        {!loading && !error && products.length === 0 && (
          <div className="text-center py-20">
            <PackageIcon size={64} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600 text-lg">No products found for "{displayKeyword}"</p>
          </div>
        )}

        {!loading && !error && products.length === 0 && recommendedProducts.length > 0 && (
          <div className="mt-6">
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <p className="text-gray-700 font-semibold">Recommended products</p>
            </div>
            <div className={PRODUCT_CARD_GRID_CLASS_1_2_3_6}>
              {recommendedProducts.map((product) => (
                <Link
                  key={product._id}
                  href={getProductPath(product)}
                  className={`${PRODUCT_CARD_CELL_CLASS} group h-full bg-white rounded-[2px] shadow-sm hover:shadow-lg transition overflow-hidden`}
                >
                  <div className="relative h-48 bg-gray-100 overflow-hidden">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-110 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PackageIcon size={48} className="text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition mb-2">
                      {product.name}
                    </h3>
                    {product.category && (
                      <p className="text-xs text-gray-500 mb-3">{product.category}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-medium text-blue-600">{formatPrice(product.price)}</span>
                        {product.AED > product.price && (
                          <span className="text-sm text-gray-400 line-through">{formatPrice(product.AED)}</span>
                        )}
                      </div>
                      {product.AED > product.price && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                          {Math.round(((product.AED - product.price) / product.AED) * 100)}% OFF
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results Grid */}
        {!loading && products.length > 0 && (
          <div>
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <p className="text-gray-700 font-semibold">
                Found <span className="text-blue-600">{products.length}</span> product{products.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className={PRODUCT_CARD_GRID_CLASS_1_2_3_6}>
              {products.map((product) => (
                <Link
                  key={product._id}
                  href={getProductPath(product)}
                  className={`${PRODUCT_CARD_CELL_CLASS} group h-full bg-white rounded-[2px] shadow-sm hover:shadow-lg transition overflow-hidden`}
                >
                  {/* Product Image */}
                  <div className="relative h-48 bg-gray-100 overflow-hidden">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-110 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PackageIcon size={48} className="text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition mb-2">
                      {product.name}
                    </h3>
                    
                    {product.category && (
                      <p className="text-xs text-gray-500 mb-3">{product.category}</p>
                    )}

                    {/* Pricing */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-medium text-blue-600">{formatPrice(product.price)}</span>
                        {product.AED > product.price && (
                          <span className="text-sm text-gray-400 line-through">{formatPrice(product.AED)}</span>
                        )}
                      </div>
                      {product.AED > product.price && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                          {Math.round(((product.AED - product.price) / product.AED) * 100)}% OFF
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {similarLoading && (
              <div className="mt-10 flex justify-center items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
              </div>
            )}

            {!similarLoading && similarProducts.length > 0 && (
              <div className="mt-10">
                <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                  <p className="text-gray-700 font-semibold">
                    Recommended similar products
                  </p>
                </div>
                <div className={PRODUCT_CARD_GRID_CLASS_1_2_3_6}>
                  {similarProducts.map((product) => (
                    <Link
                      key={product._id}
                      href={getProductPath(product)}
                      className={`${PRODUCT_CARD_CELL_CLASS} group h-full bg-white rounded-[2px] shadow-sm hover:shadow-lg transition overflow-hidden`}
                    >
                      <div className="relative h-48 bg-gray-100 overflow-hidden">
                        {product.image ? (
                          <Image
                            src={product.image}
                            alt={product.name}
                            fill
                            className="object-cover group-hover:scale-110 transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <PackageIcon size={48} className="text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition mb-2">
                          {product.name}
                        </h3>
                        {product.category && (
                          <p className="text-xs text-gray-500 mb-3">{product.category}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-medium text-blue-600">{formatPrice(product.price)}</span>
                            {product.AED > product.price && (
                              <span className="text-sm text-gray-400 line-through">{formatPrice(product.AED)}</span>
                            )}
                          </div>
                          {product.AED > product.price && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                              {Math.round(((product.AED - product.price) / product.AED) * 100)}% OFF
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchResults() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <SearchResultsInner />
    </Suspense>
  );
}
