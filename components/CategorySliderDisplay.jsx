'use client';

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useStorefrontMarket } from '@/lib/useStorefrontMarket';
import { getProductPath } from '@/lib/productUrl';
import { useStorefrontI18n } from '@/lib/useStorefrontI18n';
import { getContentDirection } from '@/lib/storefrontLanguage';
import { getLocalizedCategorySliderSubtitle, getLocalizedCategorySliderTitle } from '@/lib/categorySliderCopy';
import CurrencySymbol from '@/components/CurrencySymbol';

export default function CategorySliderDisplay({ slider }) {
  const scrollRef = useRef(null);
  const products = useSelector(state => state.product.list);
  const [sliderProducts, setSliderProducts] = useState([]);
  const { market, convertPrice } = useStorefrontMarket();
  const { language } = useStorefrontI18n();
  const title = getLocalizedCategorySliderTitle(slider, language);
  const subtitle = getLocalizedCategorySliderSubtitle(slider, language);

  useEffect(() => {
    const normalizeId = (value) => {
      if (!value) return null;
      if (typeof value === 'string' || typeof value === 'number') return String(value);
      if (typeof value === 'object') {
        if (value.$oid) return String(value.$oid);
        const str = value.toString?.();
        return str && str !== '[object Object]' ? String(str) : null;
      }
      return null;
    };

    // Keep slider order and handle mixed ID shapes
    const productMap = new Map(
      products.map(p => [normalizeId(p.id || p._id || p.productId), p])
    );

    const featured = (slider.productIds || [])
      .map(pid => productMap.get(normalizeId(pid)))
      .filter(Boolean);

    setSliderProducts(featured);
  }, [products, slider]);

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

  if (sliderProducts.length === 0) return null;

  return (
    <section className="qf-slider">
      <div className="qf-slider__header">
        <div className="qf-slider__title-wrap">
          <span className="qf-slider__eyebrow">Featured picks</span>
          <h2 className="qf-slider__title">
            <bdi dir={getContentDirection(title)}>{title}</bdi>
          </h2>
          {subtitle && subtitle.trim() && (
            <p className="qf-slider__subtitle">
              <bdi dir={getContentDirection(subtitle)}>{subtitle}</bdi>
            </p>
          )}
        </div>
        <Link href="/shop" className="qf-slider__cta">
          View All
          <ChevronRight size={18} />
        </Link>
      </div>

      {/* Scrollable Products Container */}
      <div className="qf-slider__body">
        {/* Left Arrow - Hidden on mobile */}
        <button
          onClick={scrollLeft}
          className="qf-slider__arrow qf-slider__arrow--left"
          aria-label="Scroll left"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Products Scroll Container */}
        <div
          ref={scrollRef}
          className="qf-slider__track"
          style={{ scrollBehavior: 'smooth' }}
        >
          {sliderProducts.map(product => (
            <Link
              key={product.id}
              href={getProductPath(product)}
              className="qf-card"
            >
              {/* Product Image */}
              <div className="qf-card__media">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="qf-card__img"
                    sizes="(max-width: 768px) 160px, 192px"
                  />
                ) : (
                  <div className="qf-card__empty">
                    No image
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="qf-card__info">
                <h3 className="qf-card__title">
                  {product.name}
                </h3>

                {product.brand && (
                  <p className="qf-card__brand">{product.brand}</p>
                )}

                {/* Price */}
                <div className="qf-card__price-row">
                  <span className="qf-card__price inline-flex items-baseline gap-1">
                    <CurrencySymbol currency={market.currency} />
                    {convertPrice(Number(product.basePrice || product.price || 0)).toLocaleString()}
                  </span>
                  {product.originalPrice && (
                    <span className="qf-card__strike inline-flex items-baseline gap-1">
                      <CurrencySymbol currency={market.currency} />
                      {convertPrice(Number(product.originalPrice || 0)).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Rating */}
                {product.rating && (
                  <div className="qf-card__rating">
                    <span className="qf-card__rating-pill">
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
          className="qf-slider__arrow qf-slider__arrow--right"
          aria-label="Scroll right"
        >
          <ChevronRight size={24} />
        </button>
      </div>
      <style jsx>{`
        .qf-slider {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 24px 16px;
          background: linear-gradient(135deg, #fff6ef 0%, #f1fbff 100%);
          border-radius: 20px;
          position: relative;
          overflow: hidden;
          font-family: 'Fraunces', 'Playfair Display', Georgia, serif;
        }

        .qf-slider::before {
          content: '';
          position: absolute;
          inset: -40% auto auto -20%;
          width: 280px;
          height: 280px;
          background: radial-gradient(circle, rgba(255, 171, 120, 0.35), transparent 70%);
          filter: blur(2px);
          pointer-events: none;
        }

        .qf-slider__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          position: relative;
          z-index: 1;
          margin-bottom: 18px;
        }

        .qf-slider__eyebrow {
          display: inline-flex;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #c2410c;
          font-weight: 700;
        }

        .qf-slider__title {
          font-size: 28px;
          line-height: 1.1;
          font-weight: 700;
          color: #1f2937;
          margin: 6px 0 0;
        }

        .qf-slider__subtitle {
          font-size: 14px;
          line-height: 1.4;
          color: #6b7280;
          margin: 6px 0 0;
          font-weight: 400;
        }

        .qf-slider__cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: #111827;
          color: #fff;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .qf-slider__cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(17, 24, 39, 0.18);
        }

        .qf-slider__body {
          position: relative;
        }

        .qf-slider__track {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(180px, 1fr);
          gap: 14px;
          overflow-x: auto;
          padding: 4px 8px 8px;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
        }

        .qf-slider__track::-webkit-scrollbar {
          display: none;
        }

        .qf-slider__arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2;
          display: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
          border: 1px solid rgba(15, 23, 42, 0.08);
        }

        .qf-slider__arrow--left {
          left: -6px;
        }

        .qf-slider__arrow--right {
          right: -6px;
        }

        .qf-card {
          scroll-snap-align: start;
          background: #fff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }

        .qf-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 30px rgba(15, 23, 42, 0.16);
        }

        .qf-card__media {
          position: relative;
          width: 100%;
          padding-top: 85%;
          background: #f1f5f9;
        }

        .qf-card__img {
          object-fit: cover;
          transition: transform 0.3s ease;
        }

        .qf-card:hover .qf-card__img {
          transform: scale(1.05);
        }

        .qf-card__empty {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
        }

        .qf-card__info {
          padding: 12px 14px 14px;
          font-family: 'Manrope', 'DM Sans', system-ui, sans-serif;
        }

        .qf-card__title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 6px;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .qf-card__brand {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 10px;
        }

        .qf-card__price-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .qf-card__price {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }

        .qf-card__strike {
          font-size: 12px;
          color: #94a3b8;
          text-decoration: line-through;
        }

        .qf-card__rating {
          display: flex;
        }

        .qf-card__rating-pill {
          font-size: 11px;
          font-weight: 700;
          background: #dcfce7;
          color: #166534;
          padding: 2px 8px;
          border-radius: 999px;
        }

        @media (min-width: 768px) {
          .qf-slider__arrow {
            display: inline-flex;
          }

          .qf-slider__track {
            grid-auto-columns: minmax(220px, 1fr);
          }
        }

        @media (max-width: 640px) {
          .qf-slider {
            border-radius: 14px;
          }

          .qf-slider__title {
            font-size: 22px;
          }

          .qf-slider__subtitle {
            font-size: 13px;
          }

          .qf-slider__cta {
            padding: 6px 10px;
            font-size: 12px;
          }

          .qf-slider__track {
            grid-auto-columns: minmax(160px, 1fr);
          }
        }
      `}</style>
    </section>
  );
}
