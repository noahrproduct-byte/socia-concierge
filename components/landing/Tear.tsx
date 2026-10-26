"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap, still } from "./motion";
import EngineFrame from "./EngineFrame";

// Chapter 2: the SOCIA reveal. Pinned, scrubbed by the scroll, in order:
//
//   1. the name dims into the background
//   2. three elements come in from three sides: what you posted, what
//      happened, what to do next
//   3. they settle into a row, and a gold line draws from the signal to the
//      recommendation: data, understanding, action
//   4. the three resolve into the complete SOCIA screen
//   5. the screen leaves and the chapter's statement rises
//
// Nothing plays on its own: the page moves exactly as far as the wheel does.
// Phones and reduced motion get the finished composition, unpinned.

export default function Tear({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || still()) return;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    const mark = q(".lp-rv-mark");
    const post = q(".lp-rv-post");
    const signal = q(".lp-rv-signal");
    const move = q(".lp-rv-move");
    const line = el.querySelector<SVGPathElement>(".lp-rv-line path");
    const labels = el.querySelectorAll<HTMLElement>(".lp-rv-cap");
    const screen = q(".lp-rv-screen");
    const after = q(".lp-tear-after");
    if (!mark || !post || !signal || !move || !line || !screen || !after) return;

    const len = line.getTotalLength();
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top top", end: "+=" + Math.round(window.innerHeight * 2.6), pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
      defaults: { ease: "none" },
    });
    tl.fromTo(mark, { opacity: 1 }, { opacity: 0.18, duration: 0.14 }, 0)
      // 2. three elements, three directions
      .fromTo(post, { x: () => -window.innerWidth * 0.5, y: 40, rotate: -6, opacity: 0 }, { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.22 }, 0.08)
      .fromTo(signal, { y: () => window.innerHeight * 0.6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22 }, 0.14)
      .fromTo(move, { x: () => window.innerWidth * 0.5, y: 40, rotate: 6, opacity: 0 }, { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.22 }, 0.2)
      .fromTo(labels, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.1, stagger: 0.03 }, 0.36)
      // 3. the line: from the signal to the next move
      .to(line, { strokeDashoffset: 0, duration: 0.16 }, 0.42)
      // 4. the three resolve into the complete screen
      .to([post, signal, move, labels], { opacity: 0, scale: 0.96, duration: 0.1 }, 0.62)
      .to(line, { opacity: 0, duration: 0.06 }, 0.62)
      .fromTo(screen, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.14 }, 0.66)
      // 5. the screen leaves, the statement rises
      .to(screen, { opacity: 0, y: -40, duration: 0.1 }, 0.86)
      .to(mark, { opacity: 0, duration: 0.08 }, 0.86)
      .fromTo(after, { opacity: 0, y: 48 }, { opacity: 1, y: 0, duration: 0.12 }, 0.88);

    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
  }, []);

  return (
    <section ref={root} className="lp-tear" id="chapter-2" aria-labelledby="h-problem">
      <div className="lp-tear-stage">
        <svg className="lp-tear-svg lp-rv-mark" aria-hidden="true">
          <text className="lp-tear-text" x="50%" y="50%" textAnchor="middle" dominantBaseline="central">SOCIA</text>
        </svg>

        <div className="lp-rv" data-theme="light" aria-label="Example: a post, its performance, and SOCIA's recommendation">

          <figure className="lp-rv-card lp-rv-post">
            <div className="lp-rv-reel" aria-hidden="true">
              <span className="lp-rv-reel-time">0:24</span>
              <span className="lp-rv-reel-type">Reel</span>
            </div>
            <figcaption>
              <b>3 content mistakes quietly killing your reach</b>
              <span>Posted Thursday, 6:40pm</span>
            </figcaption>
          </figure>

          <figure className="lp-rv-card lp-rv-signal">
            <figcaption><b>Views, first 48 hours</b><span>Against your last 14 posts</span></figcaption>
            <svg className="lp-rv-spark" viewBox="0 0 200 60" aria-hidden="true">
              <path d="M0 50 L20 44 L40 46 L60 38 L80 40 L100 30 L120 24 L140 18 L160 12 L180 8 L200 6" fill="none" stroke="var(--ink)" strokeWidth="2" />
              <path d="M0 52 L200 42" fill="none" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 3" />
            </svg>
            <ul className="lp-rv-sig">
              <li><span>Views</span><b>2.4x your average</b></li>
              <li><span>Saves</span><b>3.1x</b></li>
              <li><span>Watched to the end</span><b>64%</b></li>
            </ul>
          </figure>

          <figure className="lp-rv-card lp-rv-move">
            <figcaption><b className="is-gold">The next move</b></figcaption>
            <p>Publish another educational Reel this week.</p>
            <ul className="lp-rv-sig">
              <li><span>Why</span><b>Practical advice is what your audience saves</b></li>
              <li><span>When</span><b>Thursday, 6:40pm</b></li>
            </ul>
          </figure>

          <p className="lp-rv-cap is-1">What you posted</p>
          <p className="lp-rv-cap is-2">What happened</p>
          <p className="lp-rv-cap is-3">What to do next</p>
          <svg className="lp-rv-line" viewBox="0 0 1000 10" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 0 5 L 1000 5" fill="none" stroke="var(--ed-gold)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <div className="lp-rv-screen"><EngineFrame /></div>
      </div>
      <div className="lp-tear-after">{children}</div>
    </section>
  );
}
