"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { INTRO_FLAG } from "./introFlag";
import { gsap, EASE } from "./motion";

// Chapter 1. The opening sequence, after the method in the reference
// (library/references/nothin.md, "What the recording shows"): the letters
// of the name assemble from blocks rising out of the floor, the name holds,
// then the two halves part and SOCIA's work comes through the gap. SOCIA's
// work is its product, so the window shows the live Analytics screen.
//
// Timeline (s): 0 black; 0.3 the letters rise in, 0.09s apart, each a solid
// block that clips open into the glyph; 1.5 the halves part and the screen
// comes through; 2.3 the tagline and actions rise; 2.8 done, the chrome.
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
    const win = el.querySelector<HTMLElement>(".lp-window");
    const foot = el.querySelector<HTMLElement>(".lp-open-foot");
    const gap = el.clientWidth * 0.34;

    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(letters, { y: "0.45em", opacity: 0, clipPath: "inset(0 0 100% 0)" }, { y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)", duration: 0.9, stagger: 0.09 }, 0.3)
      .to(halves[0], { x: -gap, opacity: 0, duration: 0.9 }, 1.5)
      .to(halves[1], { x: gap, opacity: 0, duration: 0.9 }, 1.5)
      .fromTo(win, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.8 }, 1.7)
      .fromTo(foot, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 2.3);

    const SKIP = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const finish = () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      tl.progress(1).kill();
      // the finished state is the CSS's own; the timeline's inline styles can go
      gsap.set([letters, halves, win, foot], { clearProps: "all" });
      html.removeAttribute("data-lp-intro");
      setOpen(true);
    };
    for (const e of SKIP) window.addEventListener(e, finish, { passive: true });
    const timer = window.setTimeout(finish, 2800);
    return () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      tl.kill();
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
