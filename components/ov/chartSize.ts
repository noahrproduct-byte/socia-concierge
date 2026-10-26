"use client";

// Charts draw in real pixels: each SVG sets its viewBox to the width its
// container actually has, so axis text keeps its 12px and nothing is ever
// stretched (no preserveAspectRatio="none"). Until the first measurement, and
// on the server, the fallback width is used.

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useChartWidth(ref: RefObject<HTMLElement | null>, fallback = 720): number {
  const [width, setWidth] = useState(fallback);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (w: number) => {
      // A hidden tab measures 0; keep the last real width instead of collapsing.
      if (w > 0) setWidth(Math.round(w));
    };
    read(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) read(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Roving focus across a chart's buckets: one tab stop, arrow keys move it. */
export function moveBucketFocus(root: HTMLElement | null, from: number, key: string, count: number): number | null {
  let to: number | null = null;
  if (key === "ArrowRight" || key === "ArrowDown") to = Math.min(count - 1, from + 1);
  else if (key === "ArrowLeft" || key === "ArrowUp") to = Math.max(0, from - 1);
  else if (key === "Home") to = 0;
  else if (key === "End") to = count - 1;
  if (to == null) return null;
  root?.querySelector<SVGGElement>(`[data-bucket="${to}"]`)?.focus();
  return to;
}
