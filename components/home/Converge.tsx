"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import BrandMark from "@/components/BrandMark";

// "Everything comes together": eight tools a creator would otherwise juggle
// arrive as small pieces of real-looking software, then move into the places
// they take in one SOCIA workspace, and the workspace runs one week's loop:
// a finding becomes an idea, a plan, an edit, a check and a scheduled post.
// Scroll drives it (a tall section with a sticky stage, never scroll-jacked).
// Phones and reduced motion get the same story without movement. Every
// screen is an example; the stage says so.

gsap.registerPlugin(ScrollTrigger);

/** left, top, width, height as % of the workspace window. */
type Rect = [number, number, number, number];

type Tool = {
  key: string;
  name: string;
  /** Where it sits on its own, before the workspace exists. */
  apart: Rect;
  /** Where it lives inside the workspace. */
  slot: Rect;
  full: ReactNode;
  compact: ReactNode;
};

const PHOTOS = ["/landing/cafe/espresso.jpg", "/landing/cafe/pour-over.jpg", "/landing/cafe/pastry.jpg", "/landing/cafe/iced-latte.jpg", "/landing/cafe/roast.jpg", "/landing/cafe/regulars.jpg"];

const Photo = ({ src, className }: { src: string; className?: string }) => (
  <span className={`cv-photo ${className ?? ""}`}>
    <Image src={src} alt="" fill sizes="120px" />
  </span>
);

const Bars = ({ n, seed }: { n: number; seed: number }) => (
  <span className="cv-wave" aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <i key={i} style={{ height: `${22 + Math.round(70 * Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed / 2)))}%` }} />
    ))}
  </span>
);

const Head = ({ name, tag }: { name: string; tag?: string }) => (
  <span className="cv-head">
    <b>{name}</b>
    {tag && <em>{tag}</em>}
  </span>
);

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

const TOOLS: Tool[] = [
  {
    key: "clipper",
    name: "AI Clipper",
    apart: [-7, -2, 26, 46],
    slot: [26, 60, 47, 11],
    full: (
      <>
        <Head name="AI Clipper" tag="42 min talk" />
        <span className="cv-strip">
          {PHOTOS.map((p, i) => <Photo key={p} src={p} className={i === 1 || i === 2 ? "is-picked" : ""} />)}
        </span>
        <span className="cv-rows">
          <span><i className="cv-dot is-clip" /> 3:12 to 3:41 <small>a claim, then the number</small></span>
          <span><i className="cv-dot is-clip" /> 18:05 to 18:30 <small>question and answer</small></span>
          <span><i className="cv-dot is-clip" /> 31:50 to 32:22 <small>a story with a payoff</small></span>
        </span>
      </>
    ),
    compact: (
      <span className="cv-track">
        <small>Clips</small>
        <span className="cv-strip is-thin">{PHOTOS.slice(0, 5).map((p, i) => <Photo key={p} src={p} className={i === 1 ? "is-picked" : ""} />)}</span>
      </span>
    ),
  },
  {
    key: "editor",
    name: "Video editor",
    apart: [22, -2, 26, 46],
    slot: [26, 10, 47, 47],
    full: (
      <>
        <Head name="Video editor" tag="0:14 / 0:28" />
        <Photo src={PHOTOS[0]} className="cv-viewer" />
        <span className="cv-lanes">
          <span><i style={{ left: "2%", width: "38%" }} className="is-video" /><i style={{ left: "42%", width: "30%" }} className="is-video" /></span>
          <span><i style={{ left: "8%", width: "60%" }} className="is-text" /></span>
          <span><i style={{ left: "0%", width: "96%" }} className="is-audio" /></span>
        </span>
      </>
    ),
    compact: (
      <span className="cv-view">
        <Photo src={PHOTOS[0]} className="cv-viewer is-big" />
        <span className="cv-play"><span className="cv-playhead" /></span>
      </span>
    ),
  },
  {
    key: "voice",
    name: "Voiceover",
    apart: [51, -2, 26, 46],
    slot: [26, 73, 47, 11],
    full: (
      <>
        <Head name="Voiceover" tag="Warm, 0.9x" />
        <Bars n={34} seed={1} />
        <span className="cv-rows">
          <span>&ldquo;Most cafés pour too fast.&rdquo;</span>
          <span><small>Narrator</small> <b className="cv-chip">Declan</b> <small>Pace</small> <b className="cv-chip">0.9x</b></span>
          <span><small>Timed to the cut, 0:00 to 0:28</small></span>
        </span>
      </>
    ),
    compact: (
      <span className="cv-track is-voice">
        <small>Voice</small>
        <Bars n={44} seed={1} />
      </span>
    ),
  },
  {
    key: "audio",
    name: "AI audio",
    apart: [80, -2, 26, 46],
    slot: [26, 86, 47, 11],
    full: (
      <>
        <Head name="AI audio" tag="Mix" />
        <span className="cv-faders">
          {[["Voice", 78], ["Music", 34], ["Room", 18]].map(([l, v]) => (
            <span key={l}>
              <span className="cv-fader"><i style={{ bottom: `${v}%` }} /></span>
              <small>{l}</small>
            </span>
          ))}
        </span>
        <span className="cv-rows"><span><small>Music ducks under speech</small></span></span>
      </>
    ),
    compact: (
      <span className="cv-track is-music">
        <small>Music</small>
        <Bars n={44} seed={4} />
      </span>
    ),
  },
  {
    key: "rater",
    name: "Content rater",
    apart: [-7, 52, 26, 46],
    slot: [75, 10, 23, 43],
    full: (
      <>
        <Head name="Content rater" tag="Before you post" />
        <span className="cv-rate">
          <Photo src={PHOTOS[3]} className="cv-thumb" />
          <span className="cv-rows">
            <span><i className="cv-tick" /> Hook lands at 0:01</span>
            <span><i className="cv-tick" /> Captions readable</span>
            <span><i className="cv-fix" /> End on the payoff</span>
          </span>
        </span>
      </>
    ),
    compact: (
      <span className="cv-rows is-panel">
        <Head name="Before you post" />
        <Photo src={PHOTOS[0]} className="cv-fill" />
        <span><i className="cv-tick" /> Hook at 0:01</span>
        <span><i className="cv-tick" /> Captions readable</span>
        <span className="cv-step-show" data-step="rate"><i className="cv-tick" /> Ends on the payoff</span>
      </span>
    ),
  },
  {
    key: "ideas",
    name: "Content generation",
    apart: [22, 52, 26, 46],
    slot: [75, 56, 23, 40],
    full: (
      <>
        <Head name="Content generation" tag="Storyboard" />
        <span className="cv-board">
          {[["Hook", PHOTOS[1]], ["Proof", PHOTOS[2]], ["Ask", PHOTOS[5]]].map(([l, p]) => (
            <span key={l}><Photo src={p} /><small>{l}</small></span>
          ))}
        </span>
        <span className="cv-rows"><span>Three ways people order wrong</span></span>
      </>
    ),
    compact: (
      <span className="cv-rows is-panel">
        <Head name="Ideas" />
        <span className="cv-card"><Photo src={PHOTOS[2]} /> Three ways people order wrong</span>
        <span className="cv-card"><Photo src={PHOTOS[4]} /> What a light roast tastes like</span>
        <span className="cv-card cv-step-show" data-step="idea"><Photo src={PHOTOS[1]} /> <span><b className="cv-chip is-new">New</b> Pour from higher, at 6 PM</span></span>
      </span>
    ),
  },
  {
    key: "analytics",
    name: "Analytics",
    apart: [51, 52, 26, 46],
    slot: [2, 10, 22, 40],
    full: (
      <>
        <Head name="Analytics" tag="Last 30 days" />
        <span className="cv-chart">
          {[38, 52, 44, 61, 48, 70, 57, 82, 64, 90].map((h, i) => <i key={i} style={{ height: `${h}%` }} className={i === 9 ? "is-top" : ""} />)}
        </span>
        <span className="cv-rows"><span><small>Reels after 6 PM beat your usual post</small></span></span>
      </>
    ),
    compact: (
      <span className="cv-rows is-panel">
        <Head name="Analytics" tag="30 days" />
        <span className="cv-chart">
          {[38, 52, 44, 61, 48, 70, 57, 82].map((h, i) => <i key={i} style={{ height: `${h}%` }} className={i === 7 ? "is-top" : ""} />)}
        </span>
        <span><small>Views by day</small></span>
        <span className="cv-step-show" data-step="find"><i className="cv-dot is-find" /> Evening Reels do best</span>
      </span>
    ),
  },
  {
    key: "planner",
    name: "Content planner",
    apart: [80, 52, 26, 46],
    slot: [2, 53, 22, 43],
    full: (
      <>
        <Head name="Content planner" tag="This week" />
        <span className="cv-week">
          {DAYS.map((d, i) => (
            <span key={i} className={i === 0 || i === 2 || i === 4 ? "is-on" : ""}>
              <small>{d}</small>
              <i />
            </span>
          ))}
        </span>
        <span className="cv-rows"><span>Fri 6:30 PM <small>Reel</small></span></span>
      </>
    ),
    compact: (
      <span className="cv-rows is-panel">
        <Head name="Plan" tag="This week" />
        <span className="cv-line">
          {DAYS.map((d, i) => <i key={i} className={i === 0 || i === 2 ? "is-on" : ""}>{d}</i>)}
        </span>
        <span className="cv-slot">Mon 12 PM <small>Carousel</small></span>
        <span className="cv-slot">Wed 6 PM <small>Reel</small></span>
        <span className="cv-slot cv-step-show" data-step="plan">Fri 6:30 PM <small>Reel, new</small></span>
      </span>
    ),
  },
];

/** The week's loop, in order, and where each step happens in the workspace. */
const STEPS: { key: string; label: string; at: Rect }[] = [
  { key: "find", label: "Analytics finds it", at: [2, 10, 22, 40] },
  { key: "idea", label: "It becomes an idea", at: [75, 56, 23, 40] },
  { key: "plan", label: "The idea is planned", at: [2, 53, 22, 43] },
  { key: "edit", label: "The video is edited", at: [26, 10, 47, 86] },
  { key: "rate", label: "It is checked", at: [75, 10, 23, 43] },
  { key: "post", label: "It is scheduled", at: [79, 1.4, 19, 5.6] },
];

const pct = (r: Rect) => ({ left: `${r[0]}%`, top: `${r[1]}%`, width: `${r[2]}%`, height: `${r[3]}%` });

export default function Converge() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", () => {
      el.dataset.motion = "on";
      const q = gsap.utils.selector(el);
      const mods = q(".cv-stage .cv-mod");
      // The opening state: each tool on its own, full size, no workspace around them.
      mods.forEach((m, i) => gsap.set(m, pct(TOOLS[i].apart)));
      gsap.set(q(".cv-stage .cv-full"), { opacity: 1 });
      gsap.set(q(".cv-stage .cv-compact"), { opacity: 0 });
      gsap.set(q(".cv-chrome, .cv-publish, .cv-h-b, .cv-steps, .cv-ring, .cv-stage .cv-step-show, .cv-scheduled"), { opacity: 0 });
      gsap.set(q(".cv-h-a"), { opacity: 1 });

      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: { trigger: q(".cv-run")[0], start: "top top", end: "bottom bottom", scrub: 0.6 },
      });
      tl.to({}, { duration: 1 })
        .to(q(".cv-h-a"), { opacity: 0, y: -12, duration: 0.6 }, 1);
      // Into place: each tool moves to where it lives in the workspace and takes its compact form.
      mods.forEach((m, i) => {
        tl.to(m, { ...pct(TOOLS[i].slot), duration: 2.4 }, 1.4 + i * 0.12);
        tl.to(m.querySelector(".cv-full"), { opacity: 0, duration: 0.9 }, 2.2 + i * 0.12);
        tl.to(m.querySelector(".cv-compact"), { opacity: 1, duration: 0.9 }, 2.8 + i * 0.12);
      });
      tl.to(q(".cv-chrome, .cv-publish"), { opacity: 1, duration: 0.8 }, 4.4)
        .fromTo(q(".cv-h-b"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8 }, 5)
        .to(q(".cv-steps"), { opacity: 1, duration: 0.5 }, 6.2)
        .to(q(".cv-ring"), { opacity: 1, duration: 0.3 }, 6.4);
      // The loop: one step at a time, the ring moves to where it happens and that step's result shows.
      STEPS.forEach((s, i) => {
        const at = 6.6 + i * 0.6;
        tl.to(q(".cv-ring"), { ...pct(s.at), duration: 0.4 }, at);
        tl.to(q(`.cv-steps li[data-step="${s.key}"]`), { opacity: 1, duration: 0.2 }, at);
        if (s.key === "post") tl.to(q(".cv-scheduled"), { opacity: 1, duration: 0.25 }, at + 0.2).to(q(".cv-publish"), { opacity: 0, duration: 0.25 }, at + 0.2);
        else if (s.key === "edit") tl.fromTo(q(".cv-playhead"), { left: "8%" }, { left: "70%", duration: 0.6, ease: "none" }, at);
        else tl.to(q(`.cv-stage .cv-step-show[data-step="${s.key}"]`), { opacity: 1, duration: 0.25 }, at + 0.2);
      });
      tl.to({}, { duration: 0.6 });
      return () => { delete el.dataset.motion; };
    });
    return () => mm.revert();
  }, []);

  const workspace = (
    <div className="cv-window" role="img" aria-label="Example: eight SOCIA tools in one workspace">
      <div className="cv-chrome" aria-hidden>
        <span className="cv-top">
          <span className="cv-brand"><BrandMark size={16} /> SOCIA</span>
          <span className="cv-tabs"><i>Analytics</i><i>Plan</i><i className="is-on">Create</i><i>Inbox</i></span>
        </span>
        <span className="cv-cols" />
      </div>
      <span className="cv-publish" aria-hidden>Schedule</span>
      <span className="cv-scheduled" aria-hidden>Scheduled, Fri 6:30 PM</span>
      {TOOLS.map((t) => (
        <div key={t.key} className={`cv-mod is-${t.key}`} style={pct(t.slot)} aria-hidden>
          <div className="cv-full">{t.full}</div>
          <div className="cv-compact">{t.compact}</div>
        </div>
      ))}
      <span className="cv-ring" aria-hidden />
      <span className="cv-example">Example</span>
    </div>
  );

  return (
    <section ref={root} className="cv" aria-labelledby="cv-h">
      {/* Desktop with motion: the scroll-driven stage. */}
      <div className="cv-run">
        <div className="cv-sticky">
          <div className="cv-heads">
            <h2 id="cv-h" className="cv-h cv-h-a">Eight tools. Eight different workflows.</h2>
            <div className="cv-h-b">
              <p className="cv-mark"><BrandMark size={22} /> SOCIA</p>
              <p className="cv-h">One platform. Every creative advantage.</p>
              <p className="cv-sub">Understand your audience, find your next idea, then create, edit and publish, all in one place.</p>
            </div>
          </div>
          <div className="cv-stage">{workspace}</div>
          <ol className="cv-steps" aria-label="One week in SOCIA">
            {STEPS.map((s) => <li key={s.key} data-step={s.key}>{s.label}</li>)}
          </ol>
        </div>
      </div>

      {/* Phones and reduced motion: the same story, standing still. */}
      <div className="cv-still hm-wrap">
        <p className="cv-h">Eight tools. Eight different workflows.</p>
        <div className="cv-grid" aria-hidden>
          {TOOLS.map((t) => <div key={t.key} className={`cv-mod is-${t.key} is-still`}><div className="cv-full">{t.full}</div></div>)}
        </div>
        <p className="cv-still-note">Examples</p>
        <p className="cv-mark"><BrandMark size={22} /> SOCIA</p>
        <p className="cv-h">One platform. Every creative advantage.</p>
        <p className="cv-sub">Understand your audience, find your next idea, then create, edit and publish, all in one place.</p>
        <div className="cv-still-window">{workspace}</div>
        <ol className="cv-steps is-still" aria-label="One week in SOCIA">
          {STEPS.map((s) => <li key={s.key}>{s.label}</li>)}
        </ol>
      </div>
    </section>
  );
}
