'use client';

import { Children, cloneElement, useEffect, useRef, useState } from 'react';

/** Measure the box, then pass pixel width/height. Never use Recharts ResponsiveContainer (it can report -1 and crash). */
export default function SafeResponsiveContainer({ children }) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let frame = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 16 || h < 16) return;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const child = Children.only(children);

  return (
    <div ref={ref} className="relative h-full w-full min-h-[140px] min-w-0">
      {size ? cloneElement(child, { width: size.w, height: size.h }) : null}
    </div>
  );
}
