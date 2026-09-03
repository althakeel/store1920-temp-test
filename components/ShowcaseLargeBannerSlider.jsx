'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Truck } from 'lucide-react';
import { useInfiniteBannerCarousel } from '@/lib/useInfiniteBannerCarousel';
import { withImageKitDelivery } from '@/lib/imageKitDelivery';

function getDisplayImageUrl(value, width = 1400) {
  return withImageKitDelivery(value, { width, quality: 72 });
}

function buildSlidesSignature(slides = []) {
  return slides.map((slide) => `${slide.id || ''}:${slide.image || ''}`).join('|');
}

export default function ShowcaseLargeBannerSlider({
  slides = [],
  interval = 4000,
  enabled = true,
  gridRow,
  bannerVariant,
  fallback = null,
  showTruckIcon = false,
}) {
  const bannerRowClassName = [
    'group relative overflow-hidden rounded-xl border-0 bg-transparent shadow-none shop-showcase-banner-row',
    bannerVariant === 'main' ? 'shop-showcase-banner-row--main' : '',
    bannerVariant === 'secondary' ? 'shop-showcase-banner-row--secondary' : '',
  ].filter(Boolean).join(' ');

  const desktopWidth = bannerVariant === 'secondary' ? 1100 : 1400;

  const activeSlides = useMemo(
    () => slides
      .map((slide) => {
        const original = String(slide.image || '').trim();
        if (!original) return null;
        return {
          ...slide,
          image: getDisplayImageUrl(original, desktopWidth),
          imageSrcSet: [
            `${getDisplayImageUrl(original, 800)} 800w`,
            `${getDisplayImageUrl(original, desktopWidth)} ${desktopWidth}w`,
          ].join(', '),
        };
      })
      .filter(Boolean),
    [slides, desktopWidth],
  );

  const slidesSignature = useMemo(
    () => buildSlidesSignature(activeSlides),
    [activeSlides],
  );

  const [failedImages, setFailedImages] = useState(() => new Set());

  const visibleSlides = useMemo(
    () => activeSlides.filter((slide) => !failedImages.has(slide.image)),
    [activeSlides, failedImages],
  );

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
    slides: visibleSlides,
    enabled: enabled && visibleSlides.length > 1,
    interval,
    pauseOnHover: true,
  });

  useEffect(() => {
    setFailedImages(new Set());
  }, [slidesSignature]);

  const handleImageError = useCallback((imageUrl) => {
    if (!imageUrl) return;
    setFailedImages((current) => {
      if (current.has(imageUrl)) return current;
      const next = new Set(current);
      next.add(imageUrl);
      return next;
    });
  }, []);

  if (!visibleSlides.length) {
    if (!fallback) return null;

    return (
      <Link
        href={fallback.href || '/shop'}
        className={bannerRowClassName}
        style={{ gridRow }}
      >
        <div className={`absolute inset-0 bg-gradient-to-r ${fallback.accent}`} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/26 via-black/6 to-transparent" />
        <div className="absolute inset-0 flex items-center px-5 py-4 sm:px-8">
          <div className="max-w-[360px] rounded-xl bg-black/10 px-3 py-2 backdrop-blur-[1.5px]">
            {fallback.showTitle && String(fallback.title || '').trim() ? (
              <p className="text-[26px] font-black leading-[1.05] tracking-tight text-white sm:text-[34px]">
                {fallback.title}
              </p>
            ) : null}
            {fallback.showSubtitle && String(fallback.subtitle || '').trim() ? (
              <p className="mt-2 text-[14px] font-medium text-white/90 sm:text-[16px]">
                {fallback.subtitle}
              </p>
            ) : null}
            {fallback.showCta && String(fallback.ctaText || '').trim() ? (
              <div
                className="mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold shadow-sm transition duration-200"
                style={{ backgroundColor: fallback.ctaBgColor, color: fallback.ctaTextColor }}
              >
                {showTruckIcon ? <Truck size={16} /> : <Search size={16} />}
                <span>{fallback.ctaText}</span>
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  const currentSlide = visibleSlides[activeDotIndex] || visibleSlides[0];
  const href = currentSlide?.link || fallback?.href || '/shop';

  const handleLinkClick = (event) => {
    if (shouldSuppressClick()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <Link
      href={href}
      className={`${bannerRowClassName} ${cursorClass} select-none`.trim()}
      style={{ gridRow }}
      dir="ltr"
      onClick={handleLinkClick}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="absolute inset-0 overflow-hidden touch-pan-y" dir="ltr" {...viewportHandlers}>
        <div
          ref={trackRef}
          className="flex h-full min-h-full will-change-transform select-none"
          dir="ltr"
          onTransitionEnd={handleTrackTransitionEnd}
          style={trackStyle}
        >
          {loopSlides.map((slide, slideIndex) => (
            <div
              key={`${slide.id || slide.image}-${slideIndex}`}
              className="relative h-full min-h-full shrink-0 grow-0 overflow-hidden"
              style={{ width: `${slideWidthPercent}%` }}
            >
              <img
                src={slide.image}
                srcSet={slide.imageSrcSet}
                sizes="(max-width: 640px) 100vw, (max-width: 1400px) 70vw, 980px"
                alt={slide.alt || fallback?.title || 'Showcase banner'}
                loading={slideIndex <= 1 ? 'eager' : 'lazy'}
                fetchPriority={slideIndex === 0 ? 'high' : 'auto'}
                decoding="async"
                draggable={false}
                onError={() => handleImageError(slide.image)}
                className="pointer-events-none absolute inset-0 block h-full w-full scale-[1.01] object-cover object-center"
              />
            </div>
          ))}
        </div>
      </div>

      {enabled && slideCount > 1 ? (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2" data-banner-ignore-drag>
          {visibleSlides.map((slide, dotIndex) => (
            <button
              key={`dot-${slide.id || dotIndex}`}
              type="button"
              aria-label={`Show banner ${dotIndex + 1}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                goToSlide(dotIndex);
              }}
              className={`h-2.5 rounded-full transition-all duration-300 ease-out ${
                activeDotIndex === dotIndex
                  ? 'w-7 bg-white shadow-sm'
                  : 'w-2.5 bg-white/45 hover:bg-white/75'
              }`}
            />
          ))}
        </div>
      ) : null}
    </Link>
  );
}
