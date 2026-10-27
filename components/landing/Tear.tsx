"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BarChart3, Clock, Heart, MessageCircle, MoreHorizontal, Pause, Play, Send, Target } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { gsap, reduced, still } from "./motion";

// The reveal, straight after the name: what you posted (a Reel), what
// happened (the numbers, set large on the dark ground), what to do next (the
// recommendation, in the one bordered panel on the page). Scrubbed by the
// section's own arrival into view: the Reel enters, the numbers reveal, the
// chart draws, the panel enters last and is where the eye ends. No pin, no
// second wordmark. Phones get the three in reading order, in flow.
//
// Everything here is example data and says so. The Reel's play control and
// progress are real (they drive the video); nothing else pretends.

const CHART = "M0 92 L22 84 L44 88 L66 72 L88 76 L110 60 L132 52 L154 44 L176 30 L198 24 L220 12";
const BASE = "M0 96 L220 72";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function Tear({ reel, poster }: { reel: string | null; poster: string | null }) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(0);

  // the scroll sequence
  useEffect(() => {
    const el = root.current;
    if (!el || still()) return;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    const tag = q(".lp-rv-tagline");
    const frame = q(".lp-rv-frame");
    const nums = el.querySelectorAll<HTMLElement>(".lp-rv-stats > *:not(.lp-rv-chart)");
    const line = el.querySelector<SVGPathElement>(".lp-rv-chart .is-line");
    const end = el.querySelectorAll<SVGElement>(".lp-rv-chart .is-end");
    const tip = q(".lp-rv-tip");
    const panel = q(".lp-rv-panel");
    const rule = q(".lp-rv-foot i");
    if (!tag || !frame || !line || !panel || !rule) return;

    const len = line.getTotalLength();
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top bottom", end: "top top", scrub: 0.5, invalidateOnRefresh: true },
      defaults: { ease: "none" },
    });
    // the tagline arrives last, once the opening's own has left under the nav
    tl.fromTo(tag, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.14 }, 0.86)
      .fromTo(frame, { x: () => -window.innerWidth * 0.3, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, 0.05)
      .fromTo(nums, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04 }, 0.3)
      .to(line, { strokeDashoffset: 0, duration: 0.3 }, 0.45)
      .fromTo(end, { opacity: 0, scale: 0.4, transformOrigin: "center" }, { opacity: 1, scale: 1, duration: 0.08 }, 0.74)
      .fromTo(tip, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.1 }, 0.78)
      .fromTo(panel, { x: () => window.innerWidth * 0.25, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35 }, 0.55)
      .fromTo(rule, { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.2 }, 0.8);

    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
  }, []);

  // the Reel plays while it is on screen, muted; never under reduced motion
  useEffect(() => {
    const v = video.current;
    if (!v || !reel) return;
    const onTime = () => { if (v.duration) setProgress(v.currentTime / v.duration); };
    const onMeta = () => setLength(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (v.readyState >= 1) onMeta();
    let io: IntersectionObserver | null = null;
    if (!reduced()) {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }, { threshold: 0.4 });
      io.observe(v);
    }
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      io?.disconnect();
    };
  }, [reel]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {}); else v.pause();
  };

  return (
    <section ref={root} className="lp-rv" id="chapter-2" aria-label="Example: a post, what happened, and what to do next">
      <p className="lp-tagline lp-rv-tagline">
        <span>Social media moves fast.</span>
        <span className="is-gold">Know what to do next.</span>
      </p>

      <div className="lp-rv-grid">
        {/* 01 what you posted */}
        <p className="lp-rv-cap is-1"><span>01</span>What you posted</p>
        <div className="lp-rv-frame">
          {reel ? (
            <video ref={video} className="lp-rv-video" src={reel} poster={poster ?? undefined} muted loop playsInline preload="metadata" />
          ) : (
            <div className="lp-rv-video is-empty" aria-hidden="true" />
          )}
          <div className="lp-rv-top">
            <span className="lp-rv-avatar"><BrandMark size={18} /></span>
            <span className="lp-rv-who"><b>theroastery</b><small>Original audio</small></span>
            <MoreHorizontal size={18} aria-hidden="true" />
          </div>
          <ul className="lp-rv-rail" aria-label="Example engagement">
            <li><Heart size={22} aria-hidden="true" /><span>12.4K</span></li>
            <li><MessageCircle size={22} aria-hidden="true" /><span>320</span></li>
            <li><Send size={22} aria-hidden="true" /><span>1.1K</span></li>
          </ul>
          <div className="lp-rv-bottom">
            <p>3 content mistakes quietly killing your reach.</p>
            <div className="lp-rv-controls">
              <button type="button" className="lp-rv-play" onClick={toggle} aria-label={playing ? "Pause the Reel" : "Play the Reel"} disabled={!reel}>
                {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              </button>
              <span className="lp-rv-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              <span className="lp-rv-time">{length ? fmt(length) : "0:00"}</span>
              <span className="lp-rv-tile"><BrandMark size={18} /></span>
            </div>
          </div>
        </div>

        {/* 02 what happened */}
        <p className="lp-rv-cap is-2"><span>02</span>What happened</p>
        <div className="lp-rv-stats">
          <p className="lp-rv-sub">Views, first 48 hours</p>
          <p className="lp-rv-big">2.4<span>&times;</span></p>
          <p className="lp-rv-lead">your average views</p>
          <div className="lp-rv-chart">
            <svg viewBox="0 0 220 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={`${CHART} L220 100 L0 100 Z`} fill="var(--ed-gold)" fillOpacity="0.08" />
              <path d={BASE} fill="none" stroke="var(--ed-ink-2)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <path className="is-line" d={CHART} fill="none" stroke="var(--ed-gold)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <circle className="is-end" cx="220" cy="12" r="4" fill="var(--ed-gold)" />
            </svg>
            <span className="lp-rv-tip"><b>2.4&times;</b>vs. average</span>
          </div>
          <ul className="lp-rv-row">
            <li><b>3.1&times;</b><span>Saves</span></li>
            <li><b>64%</b><span>Watched to end</span></li>
            <li><b>+278%</b><span>Shares</span></li>
          </ul>
          <p className="lp-rv-note">Compared to your last 14 posts. Example data.</p>
        </div>

        {/* 03 what to do next */}
        <p className="lp-rv-cap is-3"><span>03</span>What to do next</p>
        <div className="lp-rv-panel">
          <p className="lp-rv-eyebrow">The next move</p>
          <h3>Publish another educational Reel this week.</h3>
          <p className="lp-rv-why">Your audience is responding strongly to practical, educational content. Posting between 6:20 and 7:00pm gives you the highest chance of reach.</p>
          <dl className="lp-rv-facts">
            <div><Target size={18} aria-hidden="true" /><dt>Why</dt><dd>Practical advice is what your audience saves.</dd></div>
            <div><Clock size={18} aria-hidden="true" /><dt>When</dt><dd>Thursday, 6:40pm</dd></div>
            <div><BarChart3 size={18} aria-hidden="true" /><dt>Opportunity</dt><dd>Low competitor saturation</dd></div>
          </dl>
          <Link href="/create" className="lp-rv-cta">Create this post <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </div>

      <p className="lp-rv-foot" aria-hidden="true"><i /></p>
    </section>
  );
}
