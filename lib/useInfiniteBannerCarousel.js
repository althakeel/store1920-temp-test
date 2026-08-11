'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const BANNER_SLIDE_TRANSITION_MS = 900;
export const BANNER_SLIDE_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
const DRAG_THRESHOLD = 36;
const CLICK_SUPPRESS_MS = 180;

function getActiveDotIndex(trackIndex, slideCount) {
  if (slideCount <= 1) return 0;
  if (trackIndex <= 0) return slideCount - 1;
  if (trackIndex >= slideCount + 1) return 0;
  return trackIndex - 1;
}

export function useInfiniteBannerCarousel({
  slides = [],
  enabled = true,
  interval = 4000,
  pauseOnHover = true,
} = {}) {
  const slideCount = slides.length;
  const slidesSignature = useMemo(
    () => slides.map((slide, index) => `${slide?.id || index}:${slide?.image || slide?.mobileImage || ''}`).join('|'),
    [slides],
  );

  const loopSlides = useMemo(() => {
    if (slideCount <= 1) return slides;
    return [slides[slideCount - 1], ...slides, slides[0]];
  }, [slideCount, slides]);

  const loopCount = loopSlides.length;
  const isLooping = slideCount > 1;
  const slideWidthPercent = loopCount > 0 ? 100 / loopCount : 100;

  const [trackIndex, setTrackIndex] = useState(slideCount > 1 ? 1 : 0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [paused, setPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const trackRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, moved: false, dx: 0 });
  const suppressClickRef = useRef(false);
  const trackIndexRef = useRef(trackIndex);
  const slideWidthPercentRef = useRef(slideWidthPercent);

  trackIndexRef.current = trackIndex;
  slideWidthPercentRef.current = slideWidthPercent;

  const jumpWithoutTransition = useCallback((nextIndex) => {
    setTransitionEnabled(false);
    setTrackIndex(nextIndex);
  }, []);

  useEffect(() => {
    setTrackIndex(slideCount > 1 ? 1 : 0);
    setTransitionEnabled(false);
    setPaused(false);
    setIsDragging(false);
    setDragOffsetPx(0);
  }, [slidesSignature, slideCount]);

  useEffect(() => {
    if (transitionEnabled) return undefined;

    const frameId = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionEnabled(true));
    });

    return () => cancelAnimationFrame(frameId);
  }, [transitionEnabled, trackIndex]);

  useEffect(() => {
    if (!enabled || paused || slideCount <= 1) return undefined;

    const timer = setInterval(() => {
      setTransitionEnabled(true);
      setTrackIndex((current) => current + 1);
    }, Math.max(1500, Number(interval) || 4000));

    return () => clearInterval(timer);
  }, [enabled, interval, paused, slideCount]);

  const safeTrackIndex = isLooping
    ? Math.min(Math.max(trackIndex, 0), loopCount - 1)
    : 0;

  const handleTrackTransitionEnd = useCallback((event) => {
    if (!isLooping) return;
    if (event.target !== trackRef.current) return;
    if (event.propertyName !== 'transform') return;

    if (safeTrackIndex === loopCount - 1) {
      jumpWithoutTransition(1);
      return;
    }

    if (safeTrackIndex === 0) {
      jumpWithoutTransition(slideCount);
    }
  }, [isLooping, jumpWithoutTransition, loopCount, safeTrackIndex, slideCount]);

  const goToSlide = useCallback((dotIndex) => {
    if (slideCount <= 1) return;
    setTransitionEnabled(true);
    setTrackIndex(dotIndex + 1);
  }, [slideCount]);

  const goNext = useCallback(() => {
    if (slideCount <= 1) return;
    setTransitionEnabled(true);
    setTrackIndex((current) => current + 1);
  }, [slideCount]);

  const goPrev = useCallback(() => {
    if (slideCount <= 1) return;
    setTransitionEnabled(true);
    setTrackIndex((current) => current - 1);
  }, [slideCount]);

  const pause = useCallback(() => {
    if (pauseOnHover) setPaused(true);
  }, [pauseOnHover]);

  const resume = useCallback(() => {
    if (pauseOnHover) setPaused(false);
  }, [pauseOnHover]);

  const applyLiveDragTransform = useCallback((dx) => {
    const track = trackRef.current;
    if (!track) return;
    const base = -(trackIndexRef.current * slideWidthPercentRef.current);
    track.style.transition = 'none';
    track.style.transform = `translate3d(calc(${base}% + ${dx}px), 0, 0)`;
  }, []);

  const finishDrag = useCallback((clientX) => {
    const dx = Number.isFinite(clientX)
      ? clientX - dragRef.current.startX
      : dragRef.current.dx;
    const viewportWidth = trackRef.current?.parentElement?.clientWidth || 0;
    const threshold = Math.max(DRAG_THRESHOLD, viewportWidth * 0.12);

    if (dragRef.current.moved && Math.abs(dx) >= threshold) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, CLICK_SUPPRESS_MS);
      if (dx < 0) goNext();
      else goPrev();
    } else {
      setTransitionEnabled(true);
    }

    dragRef.current.active = false;
    dragRef.current.moved = false;
    dragRef.current.dx = 0;
    setDragOffsetPx(0);
    setIsDragging(false);
    resume();
  }, [goNext, goPrev, resume]);

  const viewportHandlers = useMemo(() => ({
    onPointerDown: (event) => {
      if (event.button !== 0 || slideCount <= 1) return;
      if (event.target.closest?.('[data-banner-ignore-drag]')) return;

      dragRef.current = { active: true, startX: event.clientX, moved: false, dx: 0 };
      setIsDragging(true);
      setTransitionEnabled(false);
      pause();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      if (!dragRef.current.active) return;
      const dx = event.clientX - dragRef.current.startX;
      dragRef.current.dx = dx;
      if (Math.abs(dx) > 6) {
        dragRef.current.moved = true;
        event.preventDefault();
      }
      applyLiveDragTransform(dx);
      setDragOffsetPx(dx);
    },
    onPointerUp: (event) => {
      if (!dragRef.current.active) return;
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer may already be released.
      }
      finishDrag(event.clientX);
    },
    onPointerCancel: (event) => {
      if (!dragRef.current.active) return;
      finishDrag(event.clientX);
    },
    onMouseEnter: pause,
    onMouseLeave: () => {
      if (!dragRef.current.active) resume();
    },
    onFocus: pause,
    onBlur: resume,
  }), [applyLiveDragTransform, finishDrag, pause, resume, slideCount]);

  const shouldSuppressClick = useCallback(() => suppressClickRef.current, []);

  const trackStyle = {
    width: `${loopCount * 100}%`,
    transform: dragOffsetPx
      ? `translate3d(calc(-${safeTrackIndex * slideWidthPercent}% + ${dragOffsetPx}px), 0, 0)`
      : `translate3d(-${safeTrackIndex * slideWidthPercent}%, 0, 0)`,
    transition: isLooping && transitionEnabled && !isDragging
      ? `transform ${BANNER_SLIDE_TRANSITION_MS}ms ${BANNER_SLIDE_EASING}`
      : 'none',
    touchAction: 'pan-y',
    cursor: isDragging ? 'grabbing' : slideCount > 1 ? 'grab' : undefined,
  };

  return {
    loopSlides,
    slideCount,
    isLooping,
    slideWidthPercent,
    trackRef,
    trackStyle,
    activeDotIndex: getActiveDotIndex(safeTrackIndex, slideCount),
    handleTrackTransitionEnd,
    goToSlide,
    viewportHandlers,
    shouldSuppressClick,
    cursorClass: isDragging ? 'cursor-grabbing' : slideCount > 1 ? 'cursor-grab' : '',
  };
}
