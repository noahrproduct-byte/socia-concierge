"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { INTRO_FLAG } from "./introFlag";

// Chapter 1. The opening sequence, after the method in the reference
// (library/references/nothin.md): the name arrives, opens in the middle to
// reveal the work, then settles. SOCIA's work is its product, so the window
// between SOC and IA shows the live Analytics screen.
//
// Timeline (ms): 0 black; 300 the letters arrive, 110 apart; 1300 the two
// halves part and the screen fades in behind; 2300 the tagline and actions
// rise; 2700 the chrome appears. About 3 seconds, then the page.
//
// Rules kept (docs/design/anti-slop-standard.md, section 5): plays once per
// browser session; any scroll, key or tap finishes it; reduced motion skips
// it; without JavaScript the page already shows the finished state (the
// start state is set before paint, only when the sequence will run).

const LEFT = ["S", "O", "C"];
const RIGHT = ["I", "A"];

export default function Opening({ screen }: { screen: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const el = root.current;
    if (!el || html.getAttribute("data-lp-intro") !== "play") {
      html.removeAttribute("data-lp-intro");
      setOpen(true);
      return;
    }
    html.setAttribute("data-lp-intro", "running");
    try { sessionStorage.setItem(INTRO_FLAG, "1"); } catch { /* private mode: it may play again */ }

    const letters = el.querySelectorAll<HTMLElement>(".lp-l");
    const halves = el.querySelectorAll<HTMLElement>(".lp-half");
    const foot = el.querySelector<HTMLElement>(".lp-open-foot");
    const win = el.querySelector<HTMLElement>(".lp-window");
    const anims: Animation[] = [];
    const run = (node: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      if (node) anims.push(node.animate(frames, { fill: "forwards", easing: "cubic-bezier(0.23, 1, 0.32, 1)", ...opts }));
    };

    letters.forEach((l, i) => run(l, [{ opacity: 0, transform: "translateY(0.08em)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 300 + 110 * i }));
    // the halves part to the edges and dim as the screen comes through
    const gap = el.clientWidth * 0.34;
    run(halves[0], [{ transform: "none", opacity: 1 }, { transform: `translateX(-${gap}px)`, opacity: 0 }], { duration: 800, delay: 1400 });
    run(halves[1], [{ transform: "none", opacity: 1 }, { transform: `translateX(${gap}px)`, opacity: 0 }], { duration: 800, delay: 1400 });
    run(win, [{ opacity: 0, transform: "translate(-50%, -50%) scale(0.96)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }], { duration: 700, delay: 1600 });
    run(foot, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 500, delay: 2300 });

    const SKIP = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const finish = () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      anims.forEach((a) => { a.finish(); });
      html.removeAttribute("data-lp-intro");
      setOpen(true);
      // the finished state is the CSS's own; the animations' fills can go
      window.setTimeout(() => anims.forEach((a) => a.cancel()), 50);
    };
    for (const e of SKIP) window.addEventListener(e, finish, { passive: true });
    const timer = window.setTimeout(finish, 2700);
    return () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <section ref={root} className={open ? "lp-open is-open" : "lp-open"} id="chapter-1" aria-label="SOCIA">
      <div className="lp-open-stage">
        <div className="lp-window" aria-hidden="true" inert>{screen}</div>
        <p className="lp-wordmark" aria-hidden="true">
          <span className="lp-half">{LEFT.map((l) => <span key={l} className="lp-l">{l}</span>)}</span>
          <span className="lp-half">{RIGHT.map((l) => <span key={l} className="lp-l">{l}</span>)}</span>
        </p>
        <span className="lp-sr">SOCIA</span>
      </div>
      <div className="lp-open-foot">
        <p className="lp-tagline">
          <span>Social media moves fast.</span>
          <span className="is-gold">Know what to do next.</span>
        </p>
        <div className="lp-open-actions">
          <Link href="/signup" className="lp-btn is-filled">Get started free</Link>
          <Link href="/login" className="lp-btn">Log in</Link>
        </div>
      </div>
    </section>
  );
}
