"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ButtonLink } from "@/components/system";
import { INTRO_FLAG } from "./introFlag";

// The first three seconds of sociaos.com, after the Boc.Studio method Noah
// chose: the letters of SOCIA arrive one at a time on cobalt, the wordmark
// settles to band size with two lines of real information beside it, then
// the cobalt field closes into a band across the middle and SOCIA's own
// screens play behind it while the band runs as a slow ticker.
//
// Rules it keeps (docs/design/anti-slop-standard.md, section 5):
// - plays once per browser session, never on every load;
// - any scroll, key or tap finishes it at once;
// - prefers-reduced-motion: no sequence, no ticker, no reel cycling;
// - without JavaScript the page already shows the finished band (the
//   sequence's start state is applied before paint by the inline script in
//   Landing.tsx, and only when the sequence is going to run).
// The ticker and the reel loop on purpose (owner's brief); they pause when
// the first screen is out of view or the tab is hidden.

const LETTERS = ["S", "O", "C", "I", "A"];
const COPIES = 7;
const CENTER = 3;
const SCENE_MS = 3600;
const TICKER_PX_PER_S = 36;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_MOVE = "cubic-bezier(0.77, 0, 0.175, 1)";


function BandCopy({ center }: { center: boolean }) {
  return (
    <div className={center ? "lp-copy is-center" : "lp-copy"} aria-hidden={center ? undefined : true}>
      <p className="lp-band-info">
        <b>Know what to do next.</b>
        <span>For creators and brand teams</span>
      </p>
      <span className="lp-band-mark">SOCIA</span>
      <p className="lp-band-info">
        <b>Instagram, Facebook, YouTube, TikTok</b>
        <span>Analytics, plans and publishing</span>
      </p>
    </div>
  );
}

export default function Intro({ scenes }: { scenes: ReactNode[] }) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [scene, setScene] = useState(0);
  const [visible, setVisible] = useState(true);

  // The sequence.
  useEffect(() => {
    const html = document.documentElement;
    const el = root.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || html.getAttribute("data-lp-intro") !== "play") {
      html.removeAttribute("data-lp-intro");
      setLive(!reduce);
      return;
    }
    html.setAttribute("data-lp-intro", "running");
    try { sessionStorage.setItem(INTRO_FLAG, "1"); } catch { /* private mode: it may play again */ }

    const q = <T extends Element>(s: string) => el.querySelector<T>(s);
    const big = q<HTMLElement>(".lp-bigmark");
    const target = q<HTMLElement>(".lp-copy.is-center .lp-band-mark");
    const field = q<HTMLElement>(".lp-field");
    const nav = q<HTMLElement>(".lp-stage-nav");
    const infos = el.querySelectorAll<HTMLElement>(".lp-copy.is-center .lp-band-info");
    const letters = el.querySelectorAll<HTMLElement>(".lp-l");
    if (!big || !target || !field || !nav) return;

    const anims: Animation[] = [];
    const run = (node: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      anims.push(node.animate(frames, { fill: "forwards", easing: EASE_OUT, ...opts }));
    };

    letters.forEach((l, i) => run(l, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 120 * i }));

    const b = big.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const scale = t.width / b.width;
    const dx = t.left + t.width / 2 - (b.left + b.width / 2);
    const dy = t.top + t.height / 2 - (b.top + b.height / 2);
    run(big, [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], { duration: 650, delay: 1100, easing: EASE_MOVE });
    infos.forEach((n) => run(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1500 }));

    const half = parseFloat(getComputedStyle(el).getPropertyValue("--lp-band-h")) / 2 || 48;
    const closed = `inset(calc(50% - ${half}px) 0px calc(50% - ${half}px) 0px)`;
    run(field, [{ clipPath: "inset(0px 0px 0px 0px)" }, { clipPath: closed }], { duration: 750, delay: 1950, easing: EASE_MOVE });
    run(nav, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 2500 });

    const finish = () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      anims.forEach((a) => a.cancel());
      html.removeAttribute("data-lp-intro");
      setLive(!reduce);
    };
    const SKIP = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const e of SKIP) window.addEventListener(e, finish, { passive: true });
    const timer = window.setTimeout(finish, 2800);
    return () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, finish);
      anims.forEach((a) => a.cancel());
    };
  }, []);

  // Pause the ticker and the reel when nobody can see them.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && document.visibilityState === "visible"));
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // The ticker: one copy's width every few seconds, seamless because the copies are identical.
  useEffect(() => {
    const t = track.current;
    if (!t || !live) return;
    const group = t.firstElementChild?.getBoundingClientRect().width ?? 0;
    if (!group) return;
    const start = -(CENTER + 0.5) * group;
    const a = t.animate(
      [{ transform: `translateX(${start}px)` }, { transform: `translateX(${start - group}px)` }],
      { duration: (group / TICKER_PX_PER_S) * 1000, iterations: Infinity, easing: "linear" },
    );
    if (!visible) a.pause();
    return () => a.cancel();
  }, [live, visible]);

  // The reel: SOCIA's screens, one after another.
  useEffect(() => {
    if (!live || !visible || scenes.length < 2) return;
    const id = window.setInterval(() => setScene((s) => (s + 1) % scenes.length), SCENE_MS);
    return () => window.clearInterval(id);
  }, [live, visible, scenes.length]);

  return (
    <section ref={root} className={live ? "lp-intro is-live" : "lp-intro"} aria-label="SOCIA">
      <div className="lp-reel" aria-hidden="true" inert>
        {scenes.map((s, i) => (
          <div key={i} className={i === scene ? "lp-reel-scene is-on" : "lp-reel-scene"}>{s}</div>
        ))}
      </div>

      <div className="lp-field">
        <div className="lp-band">
          <div ref={track} className="lp-track">
            {Array.from({ length: COPIES }, (_, i) => <BandCopy key={i} center={i === CENTER} />)}
          </div>
        </div>
        <p className="lp-bigmark" aria-hidden="true">
          {LETTERS.map((l, i) => <span key={i} className="lp-l">{l}</span>)}
        </p>
      </div>

      <nav className="lp-stage-nav" aria-label="Main">
        <Link href="/pricing" className="lp-stage-link">Pricing</Link>
        <Link href="/login" className="lp-stage-link">Log in</Link>
        <ButtonLink href="/signup" variant="primary" size="sm">Start free</ButtonLink>
      </nav>
    </section>
  );
}
