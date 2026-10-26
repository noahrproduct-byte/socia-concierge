"use client";

import { useEffect, useRef, type ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import { gsap, SplitText, still } from "./motion";

// Chapter 3: the problem, felt rather than listed. Nine things a person
// managing an account actually looks at, scattered across the page the way
// they are scattered across apps. The statement lands: more data, less
// direction. Then, as the page scrolls, the nine move into one SOCIA frame.
//
// The grid is the finished state (CSS); the scatter is an offset from it,
// so the layout never has two sources of truth. Phones and reduced motion
// show the frame as it ends, with the four problems under it.

type Item = { source: string; dx: number; dy: number; r: number; body: ReactNode };

const ITEMS: Item[] = [
  { source: "Analytics", dx: -21, dy: -14, r: -9, body: (
    <>
      <b>Views per day</b>
      <svg viewBox="0 0 120 32" className="lp-ch-spark" aria-hidden="true"><path d="M0 26 L15 20 L30 24 L45 12 L60 18 L75 8 L90 14 L105 6 L120 10" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </>
  ) },
  { source: "Reels", dx: 16, dy: -17, r: 7, body: <div className="lp-ch-reel"><span>0:24</span><span>Reel</span></div> },
  { source: "Calendar", dx: 23, dy: -5, r: -4, body: (
    <ul className="lp-ch-week" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <li key={i} className={i === 1 || i === 3 ? "is-on" : undefined}>{d}</li>)}</ul>
  ) },
  { source: "Competitors", dx: -24, dy: 3, r: 5, body: <><b>Bakery across town</b><span>+31% momentum this month</span></> },
  { source: "Insights", dx: -3, dy: -20, r: -12, body: <><b>2,270 interactions</b><span>-4% vs the prior 30 days</span></> },
  { source: "Inbox", dx: 20, dy: 11, r: 9, body: <><b>3 new comments</b><span>1 unanswered since Tuesday</span></> },
  { source: "Notes", dx: -16, dy: 15, r: -6, body: <><b>Idea</b><span>The autumn menu, start to finish</span></> },
  { source: "Captions", dx: 4, dy: 18, r: 4, body: <><b>Hashtags</b><span>#latte #cafe #morning #smallbusiness</span></> },
  { source: "Insights", dx: 24, dy: -1, r: -8, body: <><b>312 saves</b><span>Last 7 days, mostly Reels</span></> },
];

const PROBLEMS = [
  ["No clear strategy", "Posting activity, four weeks: 2, 0, 3, 1."],
  ["Wrong content", "4 of 6 posts under your median."],
  ["Missed opportunities", "Educational Reels: +68% niche momentum, unused."],
  ["Falling behind", "2 outlier competitor posts this week."],
];

export default function Chaos() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || still()) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(".lp-ch-item"));
    const frame = el.querySelector<HTMLElement>(".lp-ch-frame");
    const top = el.querySelector<HTMLElement>(".lp-ch-top");
    const h = el.querySelector<HTMLElement>(".lp-ch-statement");
    const problems = el.querySelector<HTMLElement>(".lp-ch-problems");
    if (!frame || !top || !h || !problems) return;

    const split = SplitText.create(h, { type: "words", wordsClass: "lp-w", mask: "words" });
    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top top", end: "+=" + Math.round(window.innerHeight * 2.2), pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
      defaults: { ease: "none" },
    });
    // 1. the nine, scattered: each from its own offset
    items.forEach((it, i) => {
      const { dx, dy, r } = ITEMS[i];
      tl.fromTo(it, { x: () => dx * window.innerWidth / 100, y: () => dy * window.innerHeight / 100, rotate: r, opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.02 + i * 0.02);
    });
    // 2. the statement
    tl.fromTo(split.words, { yPercent: 110 }, { yPercent: 0, duration: 0.12, stagger: 0.02 }, 0.22);
    // 3. into the frame
    tl.to(items, { x: 0, y: 0, rotate: 0, duration: 0.36, ease: "power2.inOut", stagger: 0.012 }, 0.46)
      .fromTo(top, { opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.78)
      .fromTo(frame, { boxShadow: "inset 0 0 0 0 var(--ed-rule-paper)" }, { boxShadow: "inset 0 0 0 1px var(--ed-rule-paper)", duration: 0.08 }, 0.78)
      .fromTo(problems, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.1 }, 0.86);

    return () => { tl.scrollTrigger?.kill(); tl.kill(); split.revert(); };
  }, []);

  return (
    <section ref={root} className="lp-chaos" id="chapter-3" aria-labelledby="h-problem-2">
      <div className="lp-chaos-stage">
        <h2 id="h-problem-2" className="lp-statement lp-ch-statement">More data. <em>Less direction.</em></h2>

        <div className="lp-ch-frame" data-theme="light" aria-label="Example: nine signals from six apps, in one place">
          <div className="lp-ch-top lp-screen-top">
            <BrandMark size={18} />
            <b>SOCIA</b>
            <span>Everything you look at, in one place</span>
            <em className="lp-example">Example data</em>
          </div>
          <ul className="lp-ch-grid">
            {ITEMS.map((it, i) => (
              <li key={i} className="lp-ch-item">
                <span className="lp-ch-source">{it.source}</span>
                {it.body}
              </li>
            ))}
          </ul>
        </div>

        <ul className="lp-ch-problems" aria-label="What goes wrong without a plan">
          {PROBLEMS.map(([name, fig]) => <li key={name}><b>{name}</b><span>{fig}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
