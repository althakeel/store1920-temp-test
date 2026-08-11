'use client';
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useInfiniteBannerCarousel } from '@/lib/useInfiniteBannerCarousel';

const sliderFieldMap = {
  primary: {
    enabled: 'bannerSliderEnabled',
    items: 'bannerSliderItems',
    desktopInterval: 'bannerSliderDesktopInterval',
    mobileInterval: 'bannerSliderMobileInterval',
    desktopHeight: 'bannerSliderDesktopHeight',
    mobileHeight: 'bannerSliderMobileHeight'
  },
  secondary: {
    enabled: 'secondaryBannerSliderEnabled',
    items: 'secondaryBannerSliderItems',
    desktopInterval: 'secondaryBannerSliderDesktopInterval',
    mobileInterval: 'secondaryBannerSliderMobileInterval',
    desktopHeight: 'secondaryBannerSliderDesktopHeight',
    mobileHeight: 'secondaryBannerSliderMobileHeight'
  }
};

const DEFAULT_HEIGHTS = {
  primary: { desktop: 220, mobile: 120 },
  secondary: { desktop: 220, mobile: 120 },
};

const BannerSlider = ({ className = '', variant = 'primary', fullWidth = false, config: configProp = null }) => {
  const [fetchedConfig, setFetchedConfig] = useState(null);
  const [fetchComplete, setFetchComplete] = useState(false);
  const [slideInterval, setSlideInterval] = useState(4000);
  const router = useRouter();
  const fieldMap = sliderFieldMap[variant] || sliderFieldMap.primary;
  const showcaseConfig = configProp ?? fetchedConfig;
  const isLoaded = configProp ? true : fetchComplete;

  const banners = useMemo(() => {
    if (!isLoaded) {
      return [];
    }

    if (showcaseConfig?.[fieldMap.enabled] === false) {
      return [];
    }

    return Array.isArray(showcaseConfig?.[fieldMap.items])
      ? showcaseConfig[fieldMap.items].filter((item) =>
          String(item?.image || '').trim() || String(item?.mobileImage || '').trim()
        )
      : [];
  }, [fieldMap.enabled, fieldMap.items, isLoaded, showcaseConfig]);

  useEffect(() => {
    if (configProp) {
      return undefined;
    }

    let cancelled = false;

    const fetchShowcase = async () => {
      try {
        const response = await fetch('/api/public/shop-showcase', { cache: 'no-store' });
        if (!response.ok) {
          if (!cancelled) setFetchedConfig(null);
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setFetchedConfig(data?.config || null);
        }
      } catch {
        if (!cancelled) {
          setFetchedConfig(null);
        }
      } finally {
        if (!cancelled) {
          setFetchComplete(true);
        }
      }
    };

    fetchShowcase();

    return () => {
      cancelled = true;
    };
  }, [configProp]);

  useEffect(() => {
    const updateInterval = () => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
      const intervalMs = isMobile
        ? Math.max(1500, Number(showcaseConfig?.[fieldMap.mobileInterval]) || 3000)
        : Math.max(1500, Number(showcaseConfig?.[fieldMap.desktopInterval]) || 4000);
      setSlideInterval(intervalMs);
    };

    updateInterval();
    window.addEventListener('resize', updateInterval);
    return () => window.removeEventListener('resize', updateInterval);
  }, [fieldMap.desktopInterval, fieldMap.mobileInterval, showcaseConfig]);

  const {
    loopSlides,
    slideCount,
    slideWidthPercent,
    trackRef,
    trackStyle,
    activeDotIndex,
    handleTrackTransitionEnd,
    goToSlide,
    viewportHandlers,
    shouldSuppressClick,
    cursorClass,
  } = useInfiniteBannerCarousel({
    slides: banners,
    enabled: banners.length > 1,
    interval: slideInterval,
  });

  const handleClick = (link) => {
    if (shouldSuppressClick()) return;
    if (!link) return;

    if (/^https?:\/\//i.test(link)) {
      window.location.href = link;
      return;
    }

    router.push(link);
  };

  const defaultHeights = DEFAULT_HEIGHTS[variant] || DEFAULT_HEIGHTS.primary;
  const desktopHeight = Math.min(600, Math.max(80, Number(showcaseConfig?.[fieldMap.desktopHeight]) || defaultHeights.desktop));
  const mobileHeight = Math.min(600, Math.max(80, Number(showcaseConfig?.[fieldMap.mobileHeight]) || defaultHeights.mobile));
  const isFullWidth = fullWidth;

  const defaultSpacing = '';
  const useMobileFullWidth = variant === 'secondary' || isFullWidth;
  const wrapperClassName = `banner-slider relative w-full bg-transparent rounded-none m-0 p-0 ${defaultSpacing} ${
    isFullWidth
      ? 'max-w-none px-0'
      : useMobileFullWidth
        ? 'max-w-none px-0 sm:max-w-[1400px] sm:mx-auto sm:px-6'
        : 'max-w-[1400px] mx-auto px-4 sm:px-6'
  } ${className}`.trim();

  const viewportClassName = `banner-slider__viewport relative w-full overflow-hidden border-0 outline-none isolate touch-pan-y ${cursorClass}`.trim();

  const heightStyle = {
    ['--banner-slider-mobile-height']: `${mobileHeight}px`,
    ['--banner-slider-desktop-height']: `${desktopHeight}px`,
  };

  if (!isLoaded) {
    return (
      <div
        className={wrapperClassName}
        style={heightStyle}
        aria-hidden="true"
      >
        <div className={`${viewportClassName} animate-pulse bg-slate-100`}>
          <div className="banner-slider__slide w-full bg-slate-100" />
        </div>
        <style jsx>{`
          .banner-slider__slide {
            height: var(--banner-slider-mobile-height);
          }

          @media (min-width: 640px) {
            .banner-slider__slide {
              height: var(--banner-slider-desktop-height);
            }
          }
        `}</style>
      </div>
    );
  }

  if (!banners.length) {
    return null;
  }

  return (
    <div className={wrapperClassName} style={heightStyle} dir="ltr">
      <div className={viewportClassName} dir="ltr" {...viewportHandlers}>
        <div
          ref={trackRef}
          className="flex will-change-transform select-none"
          dir="ltr"
          onTransitionEnd={handleTrackTransitionEnd}
          style={trackStyle}
        >
          {loopSlides.map((banner, i) => (
            <div
              key={`${banner.id || banner.image || 'banner'}-${i}`}
              onClick={() => handleClick(banner.link)}
              className="banner-slider__slide relative shrink-0 grow-0 overflow-hidden"
              style={{ width: `${slideWidthPercent}%` }}
            >
              <Image
                src={banner.mobileImage || banner.image}
                alt={banner.alt || `Banner ${i + 1}`}
                fill
                sizes="100vw"
                draggable={false}
                className={`pointer-events-none object-center sm:hidden ${banner.mobileImage ? 'object-cover' : 'object-contain bg-slate-100'}`}
                priority={i <= 1}
              />
              <Image
                src={banner.image || banner.mobileImage}
                alt={banner.alt || `Banner ${i + 1}`}
                fill
                sizes="(max-width: 1400px) 100vw, 1400px"
                draggable={false}
                className={`pointer-events-none scale-[1.01] object-cover object-center ${banner.mobileImage ? 'hidden sm:block' : ''}`}
                priority={i <= 1}
              />
            </div>
          ))}
        </div>
      </div>

      {slideCount > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center gap-2" data-banner-ignore-drag>
          {banners.map((_, i) => (
            <button
              type="button"
              key={i}
              onClick={() => goToSlide(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={`pointer-events-auto h-2.5 rounded-full transition-all duration-300 ease-out ${
                i === activeDotIndex ? 'w-7 bg-white shadow-sm' : 'w-2.5 bg-white/50 hover:bg-white/75'
              }`}
            />
          ))}
        </div>
      ) : null}

      <style jsx>{`
        .banner-slider__slide {
          height: var(--banner-slider-mobile-height);
        }

        @media (min-width: 640px) {
          .banner-slider__slide {
            height: var(--banner-slider-desktop-height);
          }
        }
      `}</style>
    </div>
  );
};

export default BannerSlider;
