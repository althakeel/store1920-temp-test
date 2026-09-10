'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { TruckIcon, ZapIcon } from 'lucide-react';
import {
  getActiveFastDeliveryBannerSlides,
  getFastDeliveryHeaderText,
  normalizeFastDeliveryPage,
} from '@/lib/fastDeliveryPageSettings';

export default function FastDeliveryPageHeader({ settings }) {
  const pageSettings = useMemo(() => normalizeFastDeliveryPage(settings || {}), [settings]);
  const slides = useMemo(() => getActiveFastDeliveryBannerSlides(pageSettings), [pageSettings]);
  const headerText = useMemo(() => getFastDeliveryHeaderText(pageSettings), [pageSettings]);
  const bannerAlt = headerText.title || 'Fast delivery banner';
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    setCurrentSlide(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, pageSettings.headerBannerSliderInterval);

    return () => clearInterval(interval);
  }, [slides.length, pageSettings.headerBannerSliderInterval]);

  const overlayContent = headerText.showOverlay ? (
    <div className="relative z-10 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-center gap-3 mb-4">
        <TruckIcon size={40} className="animate-bounce" />
        <ZapIcon size={32} className="text-yellow-300" />
      </div>
      {headerText.showTitle ? (
        <p className="text-3xl md:text-5xl font-bold text-center mb-4">
          {headerText.title}
        </p>
      ) : null}
      {headerText.showSubtitle ? (
        <p className="text-center text-white/90 text-lg max-w-2xl mx-auto">
          {headerText.subtitle}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className="relative overflow-hidden text-white py-12 px-4 min-h-[220px] md:min-h-[280px] flex items-center"
      style={{ backgroundColor: pageSettings.headerBgColor }}
    >
      {slides.length > 0 ? (
        <>
          {slides.map((slide, index) => {
            const imageNode = (
              <Image
                src={slide.image}
                alt={slide.alt || bannerAlt}
                fill
                priority={index === 0}
                className={`object-cover transition-opacity duration-1000 ${
                  currentSlide === index ? 'opacity-100' : 'opacity-0'
                }`}
                sizes="100vw"
              />
            );

            return (
              <div
                key={`${slide.image}-${index}`}
                className={`absolute inset-0 transition-opacity duration-1000 ${
                  currentSlide === index ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {slide.link ? (
                  <Link href={slide.link} className="absolute inset-0 block">
                    {imageNode}
                  </Link>
                ) : (
                  imageNode
                )}
                <div className="absolute inset-0 bg-black/35" />
              </div>
            );
          })}

          {slides.length > 1 ? (
            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
              {slides.map((slide, index) => (
                <button
                  key={`dot-${slide.image}-${index}`}
                  type="button"
                  aria-label={`Show banner ${index + 1}`}
                  onClick={() => setCurrentSlide(index)}
                  className={`h-2.5 w-2.5 rounded-full transition ${
                    currentSlide === index ? 'bg-white' : 'bg-white/45 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : pageSettings.headerBgImage ? (
        <>
          <Image
            src={pageSettings.headerBgImage}
            alt={bannerAlt}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/35" />
        </>
      ) : null}

      {overlayContent}
    </div>
  );
}
