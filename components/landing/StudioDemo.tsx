"use client";

import { useEffect, useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";
import { gsap, ScrollTrigger, EASE, still } from "./motion";
import type { ClipId } from "@/lib/landingAssets";

// Chapter 5: Content Studio, from clips to content. A filmstrip of the clips
// from one shoot; the person chooses which make the cut, and the cut, the
// edit guide and the caption follow. A model of what the real Studio does
// with uploaded clips (you render the cut in your browser); every figure is
// example data and the frame says so.
//
// Each frame shows a still from public/landing/clips/<id>.jpg when one is
// there (checked on the server, lib/landingAssets.ts). Without it, the frame
// is the clip's name, length and timecode strip: a film frame, never a
// stand-in picture.

type Clip = { id: ClipId; name: string; seconds: number; use: string; line: string };

const CLIPS: Clip[] = [
  { id: "pour", name: "Pouring", seconds: 14, use: "0:00 to 0:04, the stream", line: "Four new plates, one first bite." },
  { id: "plate", name: "Plating", seconds: 22, use: "0:06 to 0:11, hands only", line: "The autumn menu, start to finish." },
  { id: "dish", name: "The dish", seconds: 8, use: "0:00 to 0:03, hold", line: "Open from Thursday." },
  { id: "bite", name: "First bite", seconds: 9, use: "0:02 to 0:05, the reaction", line: "One first bite." },
  { id: "wide", name: "Counter, wide", seconds: 41, use: "0:30 to 0:34, the room", line: "Four new plates." },
];

const DEFAULT = new Set(["pour", "plate", "bite"]);

export default function StudioDemo({ stills = {} }: { stills?: Partial<Record<ClipId, string>> }) {
  const root = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Set<string>>(DEFAULT);
  const inCut = CLIPS.filter((c) => picked.has(c.id));
  const total = inCut.reduce((s, c) => s + Math.min(c.seconds, 5), 0);
  const caption = inCut.length ? `${inCut.map((c) => c.line).join(" ")} In store from Thursday.` : "Pick at least one clip.";

  useEffect(() => {
    const el = root.current;
    if (!el || still()) return;
    const frames = el.querySelectorAll(".lp-film li");
    const tween = gsap.fromTo(frames, { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.9, ease: EASE, stagger: 0.08, paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 75%", once: true, onEnter: () => tween.play() });
    return () => { st.kill(); tween.kill(); };
  }, []);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  return (
    <div ref={root} className="lp-screen is-dark" data-theme="dark">
      <div className="lp-screen-top">
        <BrandMark size={18} />
        <b>Content Studio</b>
        <span>Seasonal menu shoot, 5 clips</span>
        <em className="lp-example">Example data</em>
      </div>
      <div className="lp-screen-body lp-studio">
        <ol className="lp-film" aria-label="The clips from the shoot: choose which make the cut">
          {CLIPS.map((c) => {
            const on = picked.has(c.id);
            const order = on ? inCut.findIndex((x) => x.id === c.id) + 1 : 0;
            return (
              <li key={c.id}>
                <button type="button" className="lp-frame" aria-pressed={on} onClick={() => toggle(c.id)}>
                  <span className="lp-frame-pic">
                    {stills[c.id] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={stills[c.id]} alt="" loading="lazy" />
                    )}
                    <span className="lp-frame-ticks" aria-hidden="true" />
                    {on && <span className="lp-frame-order">{String(order).padStart(2, "0")}</span>}
                  </span>
                  <span className="lp-frame-meta">
                    <span>{c.name}</span>
                    <span>0:{String(c.seconds).padStart(2, "0")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="lp-studio-out">
          <div className="lp-studio-meta">
            <span>Suggested cut</span>
            <span aria-live="polite">{inCut.length} of {CLIPS.length} clips, {total} seconds</span>
          </div>
          <div className="lp-cut" aria-hidden="true">
            {CLIPS.map((c) => (
              <span key={c.id} className={picked.has(c.id) ? undefined : "is-off"} style={{ flexGrow: picked.has(c.id) ? Math.min(c.seconds, 5) : 0.6 }}>
                {picked.has(c.id) ? c.name : ""}
              </span>
            ))}
          </div>

          <div className="lp-studio-two">
            <div>
              <div className="lp-studio-meta"><span>Edit guide</span><span>What to use from each clip</span></div>
              <ol className="lp-guide" aria-live="polite">
                {inCut.map((c) => <li key={c.id}><b>{c.name}</b><span>{c.use}</span></li>)}
                {!inCut.length && <li><span>Pick a clip to see the guide.</span></li>}
              </ol>
            </div>
            <div>
              <div className="lp-studio-meta"><span>Caption draft</span><span>From what the clips show and say</span></div>
              <p className="lp-draft" aria-live="polite">{caption}</p>
              <p className="lp-studio-note">You render the cut in your browser, from your own clips.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
