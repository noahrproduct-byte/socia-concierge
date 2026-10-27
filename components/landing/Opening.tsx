"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { INTRO_FLAG } from "./introFlag";
import { gsap, EASE } from "./motion";
import { introSound, SOUND_PREF } from "./sound";

// Chapter 1. The opening, after the reference (library/references/nothin.md):
// the page is the name. The letters of SOCIA rise out of the floor one after
// another, each a block that clips open into its glyph, and the name holds
// across the width of the viewport. The tagline and the two actions rise
// under it. The product arrives in the next chapter, through the letters.
//
// Timeline (s): 0 black; 0.3 the letters rise in, 0.09s apart; 1.2 the
// footage shows through the letters, when there is footage and it has
// buffered; 1.3 the tagline and actions rise; 1.9 done without footage, 4.2
// with it; then the chrome.
//
// Sound, when the visitor has turned it on: a soft rush and tone as each
// letter rises, a low landing when the last one settles, a quiet chord as
// the tagline arrives (sound.ts, synthesised, no file). The browser decides
// whether audio may start on load; if it may not, the opening stays silent
// and turning sound on replays it, this time with the gesture it needs.
//
// Rules kept (docs/design/anti-slop-standard.md, section 5): plays once per
// browser session; any scroll, key or tap finishes it; reduced motion skips
// it; without JavaScript the page already shows the finished state (the
// start state is set before paint, only when the sequence will run).

const LETTERS = ["S", "O", "C", "I", "A"];
const readPref = () => { try { return localStorage.getItem(SOUND_PREF) === "1"; } catch { return false; } };

export default function Opening({ footage }: { footage: string | null }) {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [run, setRun] = useState(0);
  const synth = useRef<ReturnType<typeof introSound>>(null);

  useEffect(() => { setSound(readPref()); }, []);

  useEffect(() => {
    const html = document.documentElement;
    const el = root.current;
    if (!el) return;
    if (run === 0) {
      if (html.getAttribute("data-lp-intro") !== "play") { html.removeAttribute("data-lp-intro"); setOpen(true); return; }
    } else {
      // a replay, asked for by the sound control: the start state comes back
      html.setAttribute("data-lp-intro", "play");
      setOpen(false);
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { html.removeAttribute("data-lp-intro"); setOpen(true); return; }
    html.setAttribute("data-lp-intro", "running");
    try { sessionStorage.setItem(INTRO_FLAG, "1"); } catch { /* private mode: it may play again */ }

    const letters = el.querySelectorAll<HTMLElement>(".lp-l");
    const foot = el.querySelector<HTMLElement>(".lp-open-foot");
    const film = el.querySelector<HTMLElement>(".lp-open-film");
    const video = el.querySelector<HTMLVideoElement>(".lp-open-film video");

    // sound, only if it is on and the browser lets the context run now
    let audio: ReturnType<typeof introSound> = null;
    let audioOn = false;
    if (readPref()) {
      audio = introSound();
      synth.current = audio;
      void audio?.ready().then((ok) => { audioOn = ok; });
    }

    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(letters, { y: "0.45em", opacity: 0, clipPath: "inset(0 0 100% 0)" }, { y: 0, opacity: 1, clipPath: "inset(0 0 0% 0)", duration: 0.9, stagger: 0.09 }, 0.3)
      .fromTo(foot, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6 }, 1.3);
    // the cues sit on the same timeline as the movement they belong to
    LETTERS.forEach((_, i) => tl.add(() => { if (audioOn) audio?.letter(i); }, 0.3 + i * 0.09));
    tl.add(() => { if (audioOn) audio?.land(); }, 0.3 + 4 * 0.09 + 0.45);
    tl.add(() => { if (audioOn) audio?.resolve(); }, 1.3);

    // the footage, decided at 1.2s: if the file is there and has buffered by
    // then, it shows through the letters for two seconds and the name goes
    // solid again; if not, the sequence ends as if there were no footage.
    // The sequence ends when it has played, not on a stopwatch: a tab that
    // opens in the background gets no animation frames until it is seen, and
    // the opening should wait for it. A long wall-clock cap is the safety net.
    let done = false;
    let filmTl: gsap.core.Timeline | null = null;
    let onReady: (() => void) | null = null;
    if (film && video) {
      const go = () => {
        if (done || filmTl) return;
        video.currentTime = 0;
        void video.play().catch(() => {});
        filmTl = gsap.timeline({ defaults: { ease: EASE } })
          .fromTo(film, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0)
          .to(film, { opacity: 0, duration: 0.8, onComplete: () => { video.pause(); finish(); } }, 2.2);
      };
      tl.add(() => {
        if (done) return;
        if (video.readyState >= 3) { go(); return; }
        onReady = () => { onReady = null; go(); };
        video.addEventListener("canplaythrough", onReady, { once: true });
      }, 1.2);
    }
    tl.add(() => { if (!filmTl) finish(); }, 1.9);

    const SKIP = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, skip);
      tl.progress(1, true).kill();
      filmTl?.kill();
      if (onReady) video?.removeEventListener("canplaythrough", onReady);
      gsap.set([letters, foot, film], { clearProps: "all" });
      video?.pause();
      html.removeAttribute("data-lp-intro");
      audio?.close();
      synth.current = null;
      setOpen(true);
    };
    // any input ends it, except the sound control, which must stay usable mid-sequence
    const skip = (e: Event) => { if ((e.target as Element | null)?.closest?.(".lp-open-sound")) return; finish(); };
    for (const e of SKIP) window.addEventListener(e, skip, { passive: true });
    const timer = window.setTimeout(finish, 8000);
    return () => {
      window.clearTimeout(timer);
      for (const e of SKIP) window.removeEventListener(e, skip);
      tl.kill();
      filmTl?.kill();
      audio?.close();
    };
  }, [run]);

  const toggleSound = useCallback(() => {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem(SOUND_PREF, next ? "1" : "0"); } catch { /* fine */ }
    if (next) {
      // the click is the gesture the browser wants: play it again, with sound
      setRun((r) => r + 1);
    } else {
      synth.current?.mute();
    }
  }, [sound]);

  return (
    <section ref={root} className={open ? "lp-open is-open" : "lp-open"} id="chapter-1" aria-label="SOCIA">
      <div className="lp-open-stage">
        <p className="lp-wordmark" aria-hidden="true">
          {LETTERS.map((l) => <span key={l} className="lp-l">{l}</span>)}
        </p>
        {footage && (
          <div className="lp-open-film" aria-hidden="true">
            <svg className="lp-mask-svg" width="100%" height="100%">
              <defs>
                <mask id="lp-open-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                  <rect width="100%" height="100%" fill="black" />
                  <text className="lp-mask-text" x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="white">SOCIA</text>
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
          <button type="button" className="lp-open-sound" onClick={toggleSound} aria-pressed={sound} title={sound ? "Turn the opening's sound off" : "Replay the opening with sound"}>
            {sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            <span>{sound ? "Sound on" : "Sound off"}</span>
          </button>
          <Link href="/signup" className="lp-btn is-filled">Get started free</Link>
          <Link href="/login" className="lp-btn">Log in</Link>
        </div>
      </div>
    </section>
  );
}
