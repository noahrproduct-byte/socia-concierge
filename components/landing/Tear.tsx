"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, reduced } from "./motion";

// The signature move from the reference recording: as you scroll past the
// opening, a diagonal tear crosses the page and the name fills with moving
// work. SOCIA's work is its screens, so the wordmark becomes a window the
// screens pass through, one after another, while the tear opens.
//
// Scrubbed by scroll: the section is pinned for one viewport height, and
// scrolling drives (1) the tear's clip-path across the page, (2) the screens
// sliding up through the letters, (3) the next chapter's statement rising
// in. Nothing plays on its own, so there is no scroll-jacking: the page
// moves exactly as far as the wheel does. Reduced motion shows the final
// frame with no pin.

export default function Tear({ screens, children }: { screens: ReactNode[]; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    const tearEl = el.querySelector<HTMLElement>(".lp-tear-field");
    const reel = el.querySelector<HTMLElement>(".lp-tear-reel");
    const after = el.querySelector<HTMLElement>(".lp-tear-after");
    if (!tearEl || !reel || !after) return;

    // the reel runs from the first screen centred in the letters to the last
    // screen centred, measured on each refresh so a resize keeps it true
    const scenes = Array.from(reel.children) as HTMLElement[];
    const first = scenes[0];
    const last = scenes[scenes.length - 1];
    const centre = (s: HTMLElement) => (tearEl.clientHeight - s.offsetHeight) / 2 - s.offsetTop;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top top", end: "+=" + Math.round(window.innerHeight * 2.2), pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
      defaults: { ease: "none" },
    });
    // 1. the tear: a thin diagonal band crosses the name, then widens until
    //    the whole field is open and the letters are full of the product
    tl.fromTo(tearEl, { clipPath: "polygon(0% 52%, 100% 40%, 100% 44%, 0% 56%)" }, { clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", duration: 0.55 }, 0)
      // 2. the screens pass through the letters, one after another
      .fromTo(reel, { y: () => centre(first) }, { y: () => centre(last), duration: 0.85 }, 0.1)
      // 3. the name itself dissolves and the next chapter's statement rises
      .to(".lp-tear-stage", { opacity: 0, duration: 0.2 }, 0.78)
      .fromTo(after, { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 0.25 }, 0.78);

    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
  }, [screens.length]);

  return (
    <section ref={root} className="lp-tear" id="chapter-2" aria-labelledby="h-problem">
      <div className="lp-tear-stage" aria-hidden="true">
        <svg className="lp-tear-svg lp-tear-mark" aria-hidden="true">
          <text className="lp-tear-text" x="50%" y="50%" textAnchor="middle" dominantBaseline="central">SOCIA</text>
        </svg>
        <div className="lp-tear-field">
          <svg className="lp-tear-svg" width="100%" height="100%" aria-hidden="true">
            <defs>
              <mask id="lp-tear-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                <rect width="100%" height="100%" fill="black" />
                <text className="lp-tear-text" x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="white">SOCIA</text>
              </mask>
            </defs>
          </svg>
          <div className="lp-tear-reel">
            {screens.map((s, i) => <div key={i} className="lp-tear-scene">{s}</div>)}
          </div>
        </div>
      </div>
      <div className="lp-tear-after">{children}</div>
    </section>
  );
}
