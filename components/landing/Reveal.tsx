"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Shows its children once, when they enter the viewport: a short rise and
// fade, the one scroll motion on the page. Reduced motion renders them in
// place (landing.css). No library: IntersectionObserver and a class.

export default function Reveal({ children, as: Tag = "div", className }: { children: ReactNode; as?: "div" | "section" | "li"; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { el.classList.add("is-in"); io.disconnect(); }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = Tag as any;
  return <T ref={ref} className={className ? `lp-reveal ${className}` : "lp-reveal"}>{children}</T>;
}
