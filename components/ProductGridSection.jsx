import React, { useState } from "react";
import Image from "@/components/SafeNextImage";

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2 flex flex-col h-full animate-pulse">
      <div className="w-full aspect-square flex items-center justify-center mb-2 bg-gray-100 rounded" />
      <div className="h-4 bg-gray-200 rounded mb-1 w-3/4 mx-auto" />
      <div className="h-3 bg-gray-100 rounded w-1/2 mx-auto" />
    </div>
  );
}

import { STORE1920_LOGO_PATH } from '@/lib/brandLogo';

const PLACEHOLDER_IMG = STORE1920_LOGO_PATH;

// products: [{ image, name, label, labelType }]
export default function ProductGridSection({ title, products = [], viewAllPath = "#" }) {

  const [imgLoaded, setImgLoaded] = useState(Array(products.length).fill(false));
  const [imgError, setImgError] = useState(Array(products.length).fill(false));

  // Reset image state arrays when products change length
  React.useEffect(() => {
    setImgLoaded(Array(products.length).fill(false));
    setImgError(Array(products.length).fill(false));
  }, [products.length]);

  // Ensure skeleton replaced within 1s if image not loaded
  React.useEffect(() => {
    const timers = [];
    products.forEach((_, idx) => {
      if (!imgLoaded[idx] && !imgError[idx]) {
        timers[idx] = setTimeout(() => {
          setImgError(errs => {
            const copy = [...errs];
            copy[idx] = true;
            return copy;
          });
        }, 1000);
      }
    });
    return () => timers.forEach(t => t && clearTimeout(t));
  }, [products, imgLoaded, imgError]);

  const handleImgLoad = idx => {
    setImgLoaded(arr => {
      const copy = [...arr];
      copy[idx] = true;
      return copy;
    });
  };
  const handleImgError = idx => {
    setImgError(arr => {
      const copy = [...arr];
      copy[idx] = true;
      return copy;
    });
  };

  return (
    <section className="bg-[#f7f7f9] rounded-xl p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <a href={viewAllPath} className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:underline">
          View All <span className="text-base">&rarr;</span>
        </a>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {products.length === 0 && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        {products.map((product, idx) => {
          let imgSrc = '';
          if (Array.isArray(product.images) && typeof product.images[0] === 'string' && product.images[0]) {
            imgSrc = product.images[0];
          } else if (typeof product.image === 'string' && product.image.length > 0) {
            imgSrc = product.image;
          }
          const showPlaceholder = imgError[idx] || !imgSrc;
          return (
            <div key={idx} className="bg-white rounded-lg border border-gray-200 p-2 flex flex-col h-full">
              <div className="w-full aspect-square flex items-center justify-center mb-2 bg-gray-50 rounded">
                {!imgLoaded[idx] && !showPlaceholder && <div className="w-16 h-16 bg-gray-200 rounded animate-pulse" />}
                {showPlaceholder ? (
                  <img
                    src={PLACEHOLDER_IMG}
                    alt="No image"
                    width={150}
                    height={150}
                    className="object-contain rounded opacity-80"
                    style={{ maxWidth: 150, maxHeight: 150, width: '100%', height: '100%', transition: 'opacity 0.3s' }}
                  />
                ) : (
                  <>
                    <Image
                      src={imgSrc}
                      alt={product.name || 'Product image'}
                      width={150}
                      height={150}
                      className={`object-contain rounded transition-opacity duration-300 ${imgLoaded[idx] ? 'opacity-100' : 'opacity-0'}`}
                      priority={idx < 2}
                      onLoadingComplete={() => handleImgLoad(idx)}
                      onError={() => handleImgError(idx)}
                    />
                    {imgError[idx] && (
                      <img
                        src={PLACEHOLDER_IMG}
                        alt="No image"
                        width={150}
                        height={150}
                        className="object-contain rounded opacity-80"
                        style={{ maxWidth: 150, maxHeight: 150, width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                      />
                    )}
                  </>
                )}
              </div>
              <div className="text-xs font-medium text-gray-800 truncate mb-1">{product.name}</div>
              {product.label && (
                <div className={`text-xs font-semibold rounded px-1.5 py-0.5 mt-auto ${
                  product.labelType === "offer"
                    ? "text-green-600 bg-green-50"
                    : product.labelType === "special"
                    ? "text-blue-600 bg-blue-50"
                    : product.labelType === "explore"
                    ? "text-orange-600 bg-orange-50"
                    : "text-gray-600 bg-gray-100"
                }`}>
                  {product.label}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
