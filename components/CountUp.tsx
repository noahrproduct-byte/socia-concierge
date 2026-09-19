"use client";

import { useEffect, useState } from "react";

// Animates a stat value ("24.8K", "12,480", "6.7%") counting up on mount, so
// freshly synced numbers feel like they're streaming in live. Non-numeric
// values render as-is. Honors reduced motion.
//
// The server (and the first client render) shows the final value, so the
// HTML never reads "0 Posts analyzed"; the count-up starts after mount.
export default function CountUp({ value, duration = 900 }: { value: string; duration?: number }) {
  const m = /^([0-9][0-9.,]*)(.*)$/.exec(value);
  const target = m ? parseFloat(m[1].replace(/,/g, "")) : NaN;
  const suffix = m ? m[2] : "";
  const decimals = m && m[1].includes(".") ? m[1].split(".")[1].length : 0;
  const grouped = m ? m[1].includes(",") : false;

  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!m || Number.isNaN(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = performance.now();
    let raf = 0;
    const fmt = (n: number) =>
      (grouped
        ? Math.round(n).toLocaleString("en-US")
        : n.toFixed(decimals)) + suffix;
    setShown(fmt(0));

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(fmt(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{shown}</>;
}
