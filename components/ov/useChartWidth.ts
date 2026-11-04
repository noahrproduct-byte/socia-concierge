"use client";

// The width a chart is actually drawn at, so its SVG canvas matches the screen:
// with a fixed 1000-unit canvas squeezed onto a phone, 11px axis labels came
// out about 3px tall. Starts at `fallback` (the server render) and follows the
// container from then on.
import { useEffect, useRef, useState } from "react";

export function useChartWidth<T extends HTMLElement>(fallback = 1000, min = 280) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(Math.max(min, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, width] as const;
}
