"use client";

// The content area, which eases in when the person moves to another section:
// a fade, a 10px slide from the side they are heading towards in the menu
// order, and a barely-there scale. It runs on the route change itself, so
// nothing waits for it. The headbar sits outside this element and never
// moves. Hash and query changes on the same page do not replay it, the first
// load does not play it, and reduced motion skips it entirely. It is a Web
// Animation rather than CSS keyframes, so it leaves no styles behind.

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { navIndex } from "@/lib/nav";

const DURATION = 420;
// The same curve as --ease-out in app/styles/tokens.css.
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const previous = useRef(pathname);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    const el = ref.current;
    if (!el || from === pathname) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Further along the menu comes in from the right, back along it from the left.
    const a = navIndex(from);
    const b = navIndex(pathname);
    const dx = a >= 0 && b >= 0 && b < a ? -10 : 10;
    const run = el.animate(
      [
        { opacity: 0, transform: `translateX(${dx}px) scale(0.995)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: DURATION, easing: EASE },
    );
    return () => run.cancel();
  }, [pathname]);

  return (
    <main ref={ref} className="s-content">
      {children}
    </main>
  );
}
