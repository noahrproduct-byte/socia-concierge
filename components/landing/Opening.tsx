"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { INTRO_FLAG } from "./introFlag";
import { gsap, EASE } from "./motion";

// Chapter 1. The opening, after the reference (library/references/nothin.md):
// the page is the name. The letters of SOCIA rise out of the floor one after
// another, each a block that clips open into its glyph, and the name holds
// across the width of the viewport. The tagline and the two actions rise
// under it. The product arrives in the next chapter, through the letters.
//
// Timeline (s): 0 black; 0.3 the letters rise in, 0.09s apart; 1.3 the
// tagline and actions rise; 1.9 done, the chrome.
//
// Rules kept (docs/design/anti-slop-standard.md, section 5): plays once per
// browser session; any scroll, key or tap finishes it; reduced motion skips
// it; without JavaScript the page already shows the finished state (the
// start state is set before paint, only when the sequence will run).

const LETTERS = ["S", "O", "C", "I", "A"];

export default function Opening({ footage }: { footage: string | null }) {
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
    const foot = el.querySelector<HTMLElement>(".lp-open-foot");
    const film = el.querySelector<HTMLElement>(".lp-open-film");
    const video = el.querySelector<HTMLVideoElement>(".lp-open-film video");

    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(letters, { y: "0.45em", opacity: 0, clipPath: "inset(0 0 100% 0)" }, { y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)", duration: 0.9, stagger: 0.09 }, 0.3)
      .fromTo(foot, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 1.3);

    // the footage, only when it is there and ready: it shows through the
    // letters for two seconds, then the name goes solid again
    if (film && video && video.readyState >= 3) {
      tl.add(() => { video.currentTime = 0; void video.play().catch(() => {}); }, 1.2)
        .fromTo(film, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 1.2)
        .to(film, { opacity: 0, duration: 0.8, onComplete: () => video.pause() }, 3.4);
    }

    const SKIP = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const finish = () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      tl.progress(1).kill();
      // the finished state is the CSS's own; the timeline's inline styles can go
      gsap.set([letters, foot, film], { clearProps: "all" });
      video?.pause();
      html.removeAttribute("data-lp-intro");
      setOpen(true);
    };
    for (const e of SKIP) window.addEventListener(e, finish, { passive: true });
    const timer = window.setTimeout(finish, film && video && video.readyState >= 3 ? 4400 : 1900);
    return () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      tl.kill();
    };
  }, []);

  return (
    <section ref={root} className={open ? "lp-open is-open" : "lp-open"} id="chapter-1" aria-label="SOCIA">
      <div className="lp-open-stage">
        <p className="lp-wordmark" aria-hidden="true">
          {LETTERS.map((l) => <span key={l} className="lp-l">{l}</span>)}
        </p>
        {footage && (
          // footage through the letters, with the same SVG text mask as the
          // reveal, so the letters match exactly
          <div className="lp-open-film" aria-hidden="true">
            <svg className="lp-tear-svg" width="100%" height="100%">
              <defs>
                <mask id="lp-open-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="black" />
                  <text className="lp-tear-text" x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="white">SOCIA</text>
                </mask>
              </defs>
            </svg>
            <video muted playsInline preload="auto" src={footage} />
          </div>
        )}
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
