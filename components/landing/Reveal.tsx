"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, ScrollTrigger, SplitText, EASE, reduced } from "./motion";

// The page's scroll reveals, once, as things enter the viewport.
//   - a statement: its words rise in a few frames apart (SplitText)
//   - anything else: a short rise and fade
// Reduced motion renders everything in place (landing.css).

export default function Reveal({ children, as: Tag = "div", className, words }: { children: ReactNode; as?: "div" | "section" | "li"; className?: string; words?: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) { el.classList.add("is-in"); return; }

    let split: SplitText | null = null;
    const targets: Element[] = [];
    if (words) {
      const h = el.querySelector("h1, h2, h3, .lp-statement") ?? el;
      split = SplitText.create(h, { type: "words", wordsClass: "lp-w", mask: "words" });
      targets.push(...split.words);
    }
    // fromTo, not from: a from tween would read the element's current state as
    // its end, and the stylesheet keeps a reveal at opacity 0 until it is in.
    const tween = words
      ? gsap.fromTo(targets, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: EASE, stagger: 0.05, paused: true })
      : gsap.fromTo(el, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: EASE, paused: true });

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () => { el.classList.add("is-in"); tween.play(); },
    });
    return () => { st.kill(); tween.kill(); split?.revert(); };
  }, [words]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = Tag as any;
  return <T ref={ref} className={className ? `lp-reveal ${className}` : "lp-reveal"}>{children}</T>;
}
