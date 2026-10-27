"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BarChart3, Clock, Heart, MessageCircle, MoreHorizontal, Pause, Play, Send, Target, Volume2, VolumeX } from "lucide-react";
import { gsap, reduced, still } from "./motion";

// The reveal, straight after the name: what a cafe posted (a Reel), what
// happened (the numbers, set on the dark ground), what to do next (the
// recommendation, on a gold rule, with the page's one real action).
// Scrubbed by the section's arrival into view: the Reel enters, the numbers
// reveal, the chart draws, the recommendation lands last. No pin, no second
// wordmark. Phones get the three in reading order, in flow.
//
// The creator is fictional (The Roastery, a cafe) and carries no SOCIA mark:
// SOCIA is the analytics, not the author. Every figure is example data and
// says so. The Reel's controls are real: play/pause and the progress bar
// drive the video; the sound toggle appears only when the file has sound.

const CHART = "M0 92 L22 84 L44 88 L66 72 L88 76 L110 60 L132 52 L154 44 L176 30 L198 24 L220 12";
const BASE = "M0 96 L220 72";

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** The cafe's own mark: a monogram, drawn here, belonging to no real business. */
function CafeMark() {
  return (
    <svg className="lp-rv-avatar" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#8a5a3c" />
      <circle cx="20" cy="20" r="15" fill="none" stroke="#f2e6d6" strokeWidth="1" opacity="0.6" />
      <text x="20" y="25.5" textAnchor="middle" fill="#f2e6d6" fontFamily="Georgia, serif" fontSize="17" fontWeight="700">R</text>
    </svg>
  );
}

type AudioState = "unknown" | "none" | "muted" | "on";

export default function Tear({ reel, poster, createHref }: { reel: string | null; poster: string | null; createHref: string }) {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(0);
  const [audio, setAudio] = useState<AudioState>("unknown");
  const [broken, setBroken] = useState(false);

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
    if (!tag || !frame || !line || !panel) return;

    const len = line.getTotalLength();
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: el, start: "top bottom", end: "top top", scrub: 0.5, invalidateOnRefresh: true },
      defaults: { ease: "none" },
    });
    tl.fromTo(frame, { x: -48, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35 }, 0.05)
      .fromTo(nums, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04 }, 0.28)
      .to(line, { strokeDashoffset: 0, duration: 0.3 }, 0.42)
      .fromTo(end, { opacity: 0, scale: 0.4, transformOrigin: "center" }, { opacity: 1, scale: 1, duration: 0.08 }, 0.7)
      .fromTo(tip, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.1 }, 0.74)
      .fromTo(panel, { x: 48, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35 }, 0.55)
      // the tagline arrives last, once the opening's own has left under the nav
      .fromTo(tag, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.14 }, 0.86);

    return () => { tl.scrollTrigger?.kill(); tl.kill(); };
  }, []);

  // the Reel plays while on screen, muted; never under reduced motion or data saving
  useEffect(() => {
    const v = video.current;
    if (!v || !reel) return;
    const onTime = () => { if (v.duration) setProgress(v.currentTime / v.duration); };
    const onMeta = () => setLength(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setBroken(true);
    // does the file carry sound at all? Firefox says so up front; Chrome once bytes have decoded
    const checkAudio = () => {
      const x = v as HTMLVideoElement & { mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number; audioTracks?: { length: number } };
      if (x.mozHasAudio === false || x.audioTracks?.length === 0) { setAudio("none"); return; }
      if (x.mozHasAudio || (x.audioTracks && x.audioTracks.length > 0) || (x.webkitAudioDecodedByteCount ?? 0) > 0) setAudio(v.muted ? "muted" : "on");
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("timeupdate", checkAudio);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("loadedmetadata", checkAudio);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("error", onError);
    if (v.readyState >= 1) { onMeta(); checkAudio(); }
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    let io: IntersectionObserver | null = null;
    if (!reduced() && !saveData) {
      io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }, { threshold: 0.4 });
      io.observe(v);
    }
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("timeupdate", checkAudio);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("loadedmetadata", checkAudio);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("error", onError);
      io?.disconnect();
    };
  }, [reel]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {}); else v.pause();
  };
  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setAudio(v.muted ? "muted" : "on");
  };

  const showVideo = !!reel && !broken;

  return (
    <section ref={root} className="lp-rv" id="chapter-2" aria-label="Example: what a cafe posted, what happened, and what to do next">
      <p className="lp-tagline lp-rv-tagline">
        <span>Social media moves fast.</span>
        <span className="is-gold">Know what to do next.</span>
      </p>

      <div className="lp-rv-grid">
        {/* 01 what you posted */}
        <p className="lp-rv-cap is-1"><span>01</span>What you posted</p>
        <div className="lp-rv-frame">
          {showVideo ? (
            <video ref={video} className="lp-rv-video" src={reel} poster={poster ?? undefined} muted loop playsInline preload="metadata" />
          ) : poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lp-rv-video" src={poster} alt="" />
          ) : (
            <div className="lp-rv-video is-empty" aria-hidden="true" />
          )}
          <div className="lp-rv-top">
            <CafeMark />
            <span className="lp-rv-who"><b>theroastery</b><small>Original audio</small></span>
            <MoreHorizontal size={16} aria-hidden="true" />
          </div>
          <ul className="lp-rv-rail" aria-label="Example engagement">
            <li><Heart size={18} aria-hidden="true" /><span>12.4K</span></li>
            <li><MessageCircle size={18} aria-hidden="true" /><span>320</span></li>
            <li><Send size={18} aria-hidden="true" /><span>1.1K</span></li>
          </ul>
          <div className="lp-rv-bottom">
            <p>3 content mistakes quietly killing your reach.</p>
            <div className="lp-rv-controls">
              <button type="button" className="lp-rv-ctl" onClick={toggle} aria-label={playing ? "Pause the Reel" : "Play the Reel"} disabled={!showVideo}>
                {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </button>
              <span className="lp-rv-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              <span className="lp-rv-time">{length ? fmt(length) : "0:00"}</span>
              {(audio === "muted" || audio === "on") && (
                <button type="button" className="lp-rv-ctl" onClick={toggleSound} aria-label={audio === "muted" ? "Unmute the Reel" : "Mute the Reel"} aria-pressed={audio === "on"}>
                  {audio === "muted" ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              )}
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
              <path d={`${CHART} L220 100 L0 100 Z`} fill="var(--ed-gold)" fillOpacity="0.06" />
              <path d={BASE} fill="none" stroke="var(--ed-ink-2)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <path className="is-line" d={CHART} fill="none" stroke="var(--ed-gold)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <circle className="is-end" cx="220" cy="12" r="3.5" fill="var(--ed-gold)" />
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
          <p className="lp-rv-why">Your audience is responding strongly to practical, educational content.</p>
          <dl className="lp-rv-facts">
            <div><Target size={16} aria-hidden="true" /><dt>Why</dt><dd>Practical advice is what your audience saves.</dd></div>
            <div><Clock size={16} aria-hidden="true" /><dt>When</dt><dd>Thursday, 6:40pm</dd></div>
            <div><BarChart3 size={16} aria-hidden="true" /><dt>Opportunity</dt><dd>Low competitor saturation</dd></div>
          </dl>
          <Link href={createHref} className="lp-rv-cta">Create this post <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
  );
}
