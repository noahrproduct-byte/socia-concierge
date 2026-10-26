"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, EASE, still } from "./motion";

// Chapter 4: how SOCIA thinks, shown once, in order, as the chapter comes
// into view: a real post, the performance behind it, the pattern SOCIA
// finds in it, and the next move. One example, three columns, no dashboard.
// Illustrative, and labelled.

const SIGNALS = [
  { k: "Views", v: "12.4K", vs: "2.4x your average", pct: 100 },
  { k: "Saves", v: "418", vs: "3.1x", pct: 86 },
  { k: "Watched to the end", v: "64%", vs: "your average is 41%", pct: 64 },
  { k: "Profile visits", v: "212", vs: "1.8x", pct: 52 },
];

export default function Engine() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (still()) { el.classList.add("is-in"); return; }
    const post = el.querySelector(".lp-en-post");
    const bars = el.querySelectorAll(".lp-en-bar span");
    const rows = el.querySelectorAll(".lp-en-row");
    const pattern = el.querySelector(".lp-en-pattern");
    const rule = el.querySelector(".lp-en-pattern-rule");
    const move = el.querySelector(".lp-en-move");
    const caps = el.querySelectorAll(".lp-en-cap");
    const tl = gsap.timeline({ paused: true, defaults: { ease: EASE } });
    tl.fromTo(caps[0], { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0)
      .fromTo(post, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, 0)
      .fromTo(caps[1], { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.5)
      .fromTo(rows, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.5)
      .fromTo(bars, { scaleX: 0 }, { scaleX: 1, duration: 0.8, stagger: 0.1, transformOrigin: "left center" }, 0.6)
      .fromTo(pattern, { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1.3)
      .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.7, transformOrigin: "left center" }, 1.4)
      .fromTo(caps[2], { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.9)
      .fromTo(move, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8 }, 1.9);
    const st = ScrollTrigger.create({ trigger: el, start: "top 70%", once: true, onEnter: () => { el.classList.add("is-in"); tl.play(); } });
    return () => { st.kill(); tl.kill(); };
  }, []);

  return (
    <div ref={root} className="lp-en" aria-label="Example: one post, its performance, the pattern, and the next move">
      <div className="lp-en-col">
        <p className="lp-en-cap">The post</p>
        <figure className="lp-en-post" data-theme="light">
          <div className="lp-rv-reel" aria-hidden="true">
            <span className="lp-rv-reel-time">0:24</span>
            <span className="lp-rv-reel-type">Reel</span>
          </div>
          <figcaption>
            <b>3 content mistakes quietly killing your reach</b>
            <span>Thursday, 6:40pm. Educational. Talking to camera, captions on.</span>
          </figcaption>
        </figure>
      </div>

      <div className="lp-en-col">
        <p className="lp-en-cap">The signal</p>
        <ul className="lp-en-signals">
          {SIGNALS.map((s) => (
            <li key={s.k} className="lp-en-row">
              <span className="lp-en-k">{s.k}</span>
              <b>{s.v}</b>
              <span className="lp-en-vs">{s.vs}</span>
              <span className="lp-en-bar" aria-hidden="true"><span style={{ width: `${s.pct}%` }} /></span>
            </li>
          ))}
        </ul>
        <div className="lp-en-pattern">
          <span className="lp-en-pattern-rule" aria-hidden="true" />
          <p><b>The insight.</b> Educational posts are 5 of your top 6 this quarter. Your audience is responding to practical advice, not announcements.</p>
        </div>
      </div>

      <div className="lp-en-col">
        <p className="lp-en-cap is-gold">The next move</p>
        <div className="lp-en-move">
          <p className="lp-en-move-line">Create another educational Reel this week.</p>
          <ul className="lp-rv-sig">
            <li><span>Angle</span><b>Your most-asked customer question</b></li>
            <li><span>When</span><b>Thursday, 6:40pm, your strongest window</b></li>
            <li><span>Confidence</span><b>Based on 14 posts, a small sample</b></li>
          </ul>
          <p className="lp-en-foot">SOCIA checks it again next week, against what this one did.</p>
        </div>
      </div>
    </div>
  );
}
