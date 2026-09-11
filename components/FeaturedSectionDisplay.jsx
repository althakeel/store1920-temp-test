'use client';

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
import { getProductPath } from '@/lib/productUrl';
import CurrencySymbol from '@/components/CurrencySymbol';

export default function FeaturedSectionDisplay({ section }) {
  const scrollRef = useRef(null);
  const products = useSelector(state => state.product.list);
  const [sectionProducts, setSectionProducts] = useState([]);
  const { market, convertPrice } = useStorefrontMarket();

  useEffect(() => {
    // Get products for this section - normalize product IDs for matching
    const featured = products.filter(p => {
      const productId = p.id || p._id || p.productId;
      return section.productIds.includes(productId);
    });
    setSectionProducts(featured);
  }, [products, section]);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  if (sectionProducts.length === 0) return null;

  return (
    <div className="w-full max-w-[1280px] mx-auto py-6 px-4">
      {/* Section Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl md:text-3xl font-bold">{section.title}</h2>
        <Link
          href="/shop"
          className="flex items-center gap-1 text-blue-500 hover:text-blue-700 font-medium"
        >
          View All
          <ChevronRight size={20} />
        </Link>
      </div>

      {/* Scrollable Products Container */}
      <div className="relative">
        {/* Left Arrow - Hidden on mobile */}
        <button
          onClick={scrollLeft}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 bg-white shadow-lg rounded-full p-2 hover:bg-gray-100 transition"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Products Scroll Container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
          style={{ scrollBehavior: 'smooth' }}
        >
          {sectionProducts.map(product => (
            <Link
              key={product.id}
              href={getProductPath(product)}
              className="flex-shrink-0 w-40 md:w-48 bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden group"
            >
              {/* Product Image */}
              <div className="relative w-full h-40 md:h-48 bg-gray-200 overflow-hidden">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 768px) 160px, 192px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    No image
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="p-3">
                <h3 className="font-semibold text-sm line-clamp-2 mb-2 group-hover:text-blue-600">
                  {product.name}
                </h3>

                {product.brand && (
                  <p className="text-xs text-gray-500 mb-2">{product.brand}</p>
                )}

                {/* Price */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-baseline gap-1 text-lg font-bold text-gray-900">
                    <CurrencySymbol currency={market.currency} />
                    {convertPrice(Number(product.basePrice || product.price || 0)).toLocaleString()}
                  </span>
                  {product.originalPrice && (
                    <span className="inline-flex items-baseline gap-1 text-sm text-gray-500 line-through">
                      <CurrencySymbol currency={market.currency} />
                      {convertPrice(Number(product.originalPrice || 0)).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Rating */}
                {product.rating && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                      ★ {product.rating}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        {/* Right Arrow - Hidden on mobile */}
        <button
          onClick={scrollRight}
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 bg-white shadow-lg rounded-full p-2 hover:bg-gray-100 transition"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
