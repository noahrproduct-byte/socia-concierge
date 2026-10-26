"use client";

import { useEffect, useRef } from "react";
import { gsap, still } from "./motion";

// The reveal: straight from the name to the product. As the opening scrolls
// away and this section rises into view, three elements come in from three
// sides and settle in a row: what you posted, what happened, what to do
// next. A gold line draws from the signal to the recommendation. Then the
// page simply continues into the original landing page.
//
// Scrubbed by the section's own arrival (no pin, no hold, no second scene),
// so there is never an empty stretch to scroll through. Phones and reduced
// motion get the finished row in flow.

export default function Tear() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || still()) return;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    const post = q(".lp-rv-post");
    const signal = q(".lp-rv-signal");
    const move = q(".lp-rv-move");
    const line = el.querySelector<SVGPathElement>(".lp-rv-line path");
    const labels = el.querySelectorAll<HTMLElement>(".lp-rv-cap, .lp-rv-note");
    if (!post || !signal || !move || !line) return;

    const len = line.getTotalLength();
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });

    const tl = gsap.timeline({
      // from the moment the section's top enters at the bottom of the
      // viewport to the moment it sits at the top: one viewport of scroll
      scrollTrigger: { trigger: el, start: "top bottom", end: "top top", scrub: 0.5, invalidateOnRefresh: true },
      defaults: { ease: "none" },
    });
    tl.fromTo(post, { x: () => -window.innerWidth * 0.4, y: 60, rotate: -6, opacity: 0 }, { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.5 }, 0.05)
      .fromTo(signal, { y: () => window.innerHeight * 0.5, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 0.15)
      .fromTo(move, { x: () => window.innerWidth * 0.4, y: 60, rotate: 6, opacity: 0 }, { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.5 }, 0.25)
      .fromTo(labels, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.04 }, 0.6)
      .to(line, { strokeDashoffset: 0, duration: 0.25 }, 0.72);

    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
  }, []);

  return (
    <section ref={root} className="lp-tear" id="chapter-2" aria-label="Example: a post, its performance, and SOCIA's recommendation">
      <div className="lp-rv" data-theme="light">
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
        <p className="lp-rv-note">Example data, not a real account.</p>
      </div>
    </section>
  );
}
