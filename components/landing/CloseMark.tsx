"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, EASE, reduced } from "./motion";

// The close: the name rises out of the bottom of the page one letter at a
// time as the section comes into view. Once. Reduced motion shows it in place.

export default function CloseMark() {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const letters = el.querySelectorAll(".lp-close-l");
    const tween = gsap.from(letters, { yPercent: 100, duration: 1.1, ease: EASE, stagger: 0.07, paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 95%", once: true, onEnter: () => tween.play() });
    return () => { st.kill(); tween.kill(); };
  }, []);

  return (
    <p ref={ref} className="lp-close-mark" aria-hidden="true">
      {["S", "O", "C", "I", "A"].map((l, i) => <span key={i} className="lp-close-l">{l}</span>)}
    </p>
  );
}
