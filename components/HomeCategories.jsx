'use client';

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HOME_SECTION_CLASS } from '@/lib/storefrontCarousel';
import { HomeCategoryRowSkeleton } from '@/components/home/HomeSectionSkeletons';
import { cleanDisplayText } from '@/lib/displayText';
import { normalizeMediaUrl } from '@/lib/mediaUrls';
import { useHorizontalCarouselDrag } from '@/lib/useHorizontalCarouselDrag';
import { normalizeStorefrontCategoryHref, toPublicCategoryPath } from '@/lib/categorySlug';

export default function HomeCategories() {
  const {
    scrollRef,
    handlePointerDown,
    handleCardClick,
    scrollLeft,
    scrollRight,
    trackStyle,
  } = useHorizontalCarouselDrag({ enableSnap: true });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const CACHE_KEY = 'homeMenuCategoriesCache_v2'; // Changed cache key to bust old cache

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        // Clear old cache on mount
        const oldCache = localStorage.getItem('homeMenuCategoriesCache');
        if (oldCache) {
          localStorage.removeItem('homeMenuCategoriesCache');
        }
        
        // Check localStorage first for immediate display
        const cached = localStorage.getItem(CACHE_KEY);
        let cachedData = null;
        
        if (cached) {
          try {
            cachedData = JSON.parse(cached);
            if (Array.isArray(cachedData?.items) && cachedData.items.length > 0) {
              setCategories(cachedData.items);
              setError(null);
            }
          } catch (e) {
            console.error('Cache parse error:', e);
          }
        }
       
        
        const response = await fetch('/api/store/home-menu-categories', { cache: 'no-store' });

        if (response.ok) {
          const data = await response.json();
          
          if (data.items && Array.isArray(data.items) && data.items.length > 0) {
            setCategories(data.items);
            
            // Try to save to localStorage, but handle quota exceeded gracefully
            try {
              const cacheData = { 
                items: data.items, 
                count: data.count || data.items.length, 
                updatedAt: Date.now() 
              };
              localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            } catch (storageErr) {
              if (storageErr.name === 'QuotaExceededError') {
                // Try to clear cache and retry
                try {
                  localStorage.removeItem(CACHE_KEY);
                  const cacheData = { 
                    items: data.items, 
                    count: data.count || data.items.length, 
                    updatedAt: Date.now() 
                  };
                  localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
                } catch (retryErr) {
                  // Could not save to localStorage even after clearing
                  // Continue without caching - data is already set in state
                }
              }
            }
            
            setError(null);
          } else {
            // API returned empty, use cache if available
            if (!cachedData || !cachedData.items || cachedData.items.length === 0) {
              setError('No categories available');
            }
          }
        } else {
          console.error('API response not ok:', response.status);
          // API call failed, use cached data if available
          if (!cachedData || !cachedData.items || cachedData.items.length === 0) {
            setError(`Failed to load categories (${response.status})`);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('HomeCategories error:', err);
        
        // Try to use cached data as fallback
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const cachedData = JSON.parse(cached);
            if (Array.isArray(cachedData?.items) && cachedData.items.length > 0) {
              console.log('Using cached data due to error:', cachedData.items);
              setCategories(cachedData.items);
              setError(null);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error('Error parsing fallback cache:', e);
          }
        }
        
        setError(`Error: ${err.message}`);
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  const scrollLeftMobile = () => scrollLeft();
  const scrollRightMobile = () => scrollRight();

  // Determine the link for each category
  const getCategoryLink = (cat) => {
    const customUrl = normalizeStorefrontCategoryHref(cat.url);
    if (customUrl && customUrl !== '/shop') return customUrl;
    if (cat.slug) return toPublicCategoryPath(cat.slug);
    if (cat.categoryId) return toPublicCategoryPath(cat.categoryId);
    return '/shop';
  };

  const resolveCategoryImage = (url) => normalizeMediaUrl(url);

  const getCategoryGradient = (name) => {
    const colors = [
      'from-blue-400 to-blue-600',
      'from-purple-400 to-purple-600',
      'from-pink-400 to-pink-600',
      'from-red-400 to-red-600',
      'from-orange-400 to-orange-600',
      'from-yellow-400 to-yellow-600',
      'from-green-400 to-green-600',
      'from-teal-400 to-teal-600',
    ];
    const hash = name.charCodeAt(0) % colors.length;
    return colors[hash];
  };

  if (loading && categories.length === 0) {
    return <HomeCategoryRowSkeleton />;
  }

  // Show error if we have one and no categories
  if (error && categories.length === 0) {
    return (
      <div className={`${HOME_SECTION_CLASS} relative w-full max-w-[1400px] mx-auto px-4 sm:px-6`}>
        <div className="text-center py-8 text-gray-500 text-sm">
          {error}
        </div>
      </div>
    );
  }

  // Don't show anything if no categories (after loading and no error)
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className={`${HOME_SECTION_CLASS} relative w-full max-w-[1400px] mx-auto px-4 sm:px-6`}>
      {/* Left Arrow */}
      <button
        type="button"
        className="md:hidden absolute left-2 top-1/2 -translate-y-1/2 bg-white shadow-md rounded-full p-2 z-10 hover:bg-gray-100 transition"
        onClick={scrollLeftMobile}
        aria-label="Scroll categories left"
      >
        <ChevronLeft size={20} />
      </button>

      {/* Scrollable Row */}
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        className="flex gap-4 md:gap-6 overflow-x-auto md:overflow-visible scrollbar-hide overscroll-x-contain snap-x snap-proximity md:snap-none scroll-smooth px-12 md:px-4 md:justify-between"
        style={trackStyle}
      >
        {categories.map((cat, idx) => (
          <Link
            key={`${cat.name}-${idx}`}
            href={getCategoryLink(cat)}
            onClick={handleCardClick}
            draggable={false}
            className="flex flex-col items-center flex-shrink-0 w-24 md:flex-1 cursor-pointer hover:scale-105 transition-all duration-200 p-2 md:p-3 snap-start"
          >
            <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden bg-gray-100">
              {cat.image ? (
                <>
                  <Image 
                    src={resolveCategoryImage(cat.image)} 
                    alt={cat.name}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      // Hide broken image, show gradient fallback
                      e.target.style.display = 'none';
                      const fallback = e.target.nextElementSibling;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                    unoptimized={true}
                  />
                  {/* Gradient fallback shown on image error */}
                  <div style={{ display: 'none' }} className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getCategoryGradient(cat.name)} text-white text-2xl font-bold`}>
                    {cat.name.charAt(0).toUpperCase()}
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400 text-xs">
                  No image
                </div>
              )}
            </div>
            <span className="mt-2 text-[10px] sm:text-xs md:text-sm text-center font-medium line-clamp-2 leading-tight w-full">
              {cleanDisplayText(cat.name)}
            </span>
          </Link>
        ))}
      </div>

      {/* Right Arrow */}
      <button
        type="button"
        onClick={scrollRightMobile}
        className="md:hidden absolute right-2 top-1/2 -translate-y-1/2 bg-white shadow-md rounded-full p-2 z-10 hover:bg-gray-100 transition"
        aria-label="Scroll categories right"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
