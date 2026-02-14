import { useState, useEffect, RefObject } from 'react';

interface WidgetSize {
  width: number;
  height: number;
}

export function useWidgetSize(ref: RefObject<HTMLElement | null>): WidgetSize {
  const [size, setSize] = useState<WidgetSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let rafId: number | null = null;

    const observer = new ResizeObserver((entries) => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;
          setSize((prev) => {
            const w = Math.round(width);
            const h = Math.round(height);
            if (prev.width === w && prev.height === h) return prev;
            return { width: w, height: h };
          });
        }
      });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [ref]);

  return size;
}
