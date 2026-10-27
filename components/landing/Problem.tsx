"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronRight, Heart, MessageCircle, MoreHorizontal, Pause, Play, Send } from "lucide-react";
import { gsap, ScrollTrigger, EASE, reduced } from "./motion";

// 02, the problem: four things that go wrong without a plan, as a selector
// on the left and, on the right, one example of each, told with the same
// fictional cafe as the reveal (The Roastery). Click, tap, hover or arrow
// through the four; the example crossfades and its figures animate in.
// Every figure is example data and the panel says so.

type Key = "strategy" | "content" | "opportunity" | "behind";

const PROBLEMS: { key: Key; n: string; name: string; line: string }[] = [
  { key: "strategy", n: "01", name: "No clear strategy", line: "Posting without a plan creates inconsistent results." },
  { key: "content", n: "02", name: "Wrong content", line: "Guessing what works wastes time and reach." },
  { key: "opportunity", n: "03", name: "Missed opportunities", line: "Winning topics are often visible before creators notice them." },
  { key: "behind", n: "04", name: "Falling behind", line: "Competitors learn faster while you're still interpreting yesterday's data." },
];

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
// four weeks as they happened, and the same four weeks with a plan
const AS_IT_WAS = ["1000000", "0000001", "0010000", "0000110"];
const WITH_PLAN = ["0101010", "0101010", "0101010", "0101010"];

// eight weeks of a niche's interest in educational Reels, indexed to week one
const TREND = [100, 104, 112, 118, 131, 141, 156, 168];
const CHART_W = 320, CHART_H = 120;
const px = (i: number) => 12 + (i * (CHART_W - 24)) / (TREND.length - 1);
const py = (v: number) => CHART_H - 12 - ((v - 90) / (180 - 90)) * (CHART_H - 24);

const RIVALS = [
  { who: "Bakery across town", posts: 14, momentum: 31 },
  { who: "Café near campus", posts: 11, momentum: 24 },
  { who: "You", posts: 6, momentum: 3 },
];

/** The cafe's own mark, drawn here, belonging to no real business. */
function CafeMark() {
  return (
    <svg className="lp-pb-avatar" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#8a5a3c" />
      <circle cx="20" cy="20" r="15" fill="none" stroke="#f2e6d6" strokeWidth="1" opacity="0.6" />
      <text x="20" y="25.5" textAnchor="middle" fill="#f2e6d6" fontFamily="Georgia, serif" fontSize="17" fontWeight="700">R</text>
    </svg>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** A post preview: a still, or a muted Reel with a real play/pause and progress. */
function Post({ src, poster, video, caption, likes, comments, shares, kind, active }: { src: string | null; poster?: string | null; video?: boolean; caption: string; likes: string; comments: string; shares: string; kind: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(0);
  useEffect(() => {
    const v = ref.current;
    if (!v || !video) return;
    const onTime = () => { if (v.duration) setProgress(v.currentTime / v.duration); };
    const onMeta = () => setLength(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (v.readyState >= 1) onMeta();
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [video]);
  // plays while its panel is the active one and on screen; never under reduced motion
  useEffect(() => {
    const v = ref.current;
    if (!v || !video) return;
    if (!active || reduced()) { v.pause(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }, { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, [active, video]);
  const toggle = () => { const v = ref.current; if (!v) return; if (v.paused) void v.play().catch(() => {}); else v.pause(); };

  return (
    <figure className="lp-pb-post">
      <div className="lp-pb-post-frame">
        {video && src ? (
          <video ref={ref} src={src} poster={poster ?? undefined} muted loop playsInline preload="metadata" />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" loading="lazy" />
        ) : (
          <div className="is-empty" aria-hidden="true" />
        )}
        <div className="lp-pb-post-top"><CafeMark /><span><b>theroastery</b><small>Original audio</small></span><MoreHorizontal size={14} aria-hidden="true" /></div>
        <ul className="lp-pb-post-rail" aria-label="Example engagement">
          <li><Heart size={16} aria-hidden="true" /><span>{likes}</span></li>
          <li><MessageCircle size={16} aria-hidden="true" /><span>{comments}</span></li>
          <li><Send size={16} aria-hidden="true" /><span>{shares}</span></li>
        </ul>
        <div className="lp-pb-post-bottom">
          <p>{caption}</p>
          {video && (
            <div className="lp-pb-post-controls">
              <button type="button" className="lp-pb-ctl" onClick={toggle} aria-label={playing ? "Pause the Reel" : "Play the Reel"} disabled={!src}>
                {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>
              <span className="lp-pb-bar" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              <span className="lp-pb-time">{length ? fmt(length) : "0:00"}</span>
            </div>
          )}
        </div>
      </div>
      <figcaption><b>{kind}</b><span>{likes} likes</span></figcaption>
    </figure>
  );
}

export default function Problem({ reel, poster, quiet }: { reel: string | null; poster: string | null; quiet: string | null }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Key>("strategy");
  const [point, setPoint] = useState<number | null>(null);
  const id = useId();
  const hoverTimer = useRef<number | null>(null);

  // the section arrives once: left column, then the stage
  useEffect(() => {
    const el = root.current;
    if (!el || reduced()) return;
    const parts = el.querySelectorAll<HTMLElement>(".lp-pb-left > *, .lp-pb-stage");
    const tween = gsap.fromTo(parts, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8, ease: EASE, stagger: 0.06, paused: true });
    const st = ScrollTrigger.create({ trigger: el, start: "top 75%", once: true, onEnter: () => tween.play() });
    return () => { st.kill(); tween.kill(); };
  }, []);

  // a panel takes: it fades in and its figures animate
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const panel = s.querySelector<HTMLElement>(`[data-panel="${active}"]`);
    if (!panel) return;
    setPoint(null);
    if (reduced()) return;
    const tl = gsap.timeline({ defaults: { ease: EASE } });
    tl.fromTo(panel, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, 0);
    if (active === "strategy") tl.fromTo(panel.querySelectorAll(".lp-pb-cal i.is-on"), { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, stagger: 0.03, transformOrigin: "center" }, 0.1);
    if (active === "opportunity") {
      const line = panel.querySelector<SVGPathElement>(".is-line");
      if (line) { const len = line.getTotalLength(); tl.fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.9 }, 0.1); }
      tl.fromTo(panel.querySelectorAll(".lp-pb-pt"), { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.08 }, 0.3);
    }
    if (active === "behind") tl.fromTo(panel.querySelectorAll(".lp-pb-bars i"), { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.7, stagger: 0.06 }, 0.1);
    if (active === "content") tl.fromTo(panel.querySelectorAll(".lp-pb-post"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.1 }, 0.1);
    return () => { tl.kill(); };
  }, [active]);

  const select = (k: Key) => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); setActive(k); };
  const preview = (k: Key) => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setActive(k), 140);
  };
  const cancelPreview = () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = PROBLEMS.findIndex((p) => p.key === active);
    let n = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") n = (i + 1) % PROBLEMS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") n = (i - 1 + PROBLEMS.length) % PROBLEMS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = PROBLEMS.length - 1;
    else return;
    e.preventDefault();
    setActive(PROBLEMS[n].key);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[n])?.focus();
  };

  const activeIndex = PROBLEMS.findIndex((p) => p.key === active);
  const insight: Record<Key, string> = {
    strategy: "Six posts in four weeks, one gap of eleven days. A plan uses the same effort on a rhythm your audience can expect.",
    content: "Educational, behind-the-scenes content gets 2.4 times the views of general updates in this account.",
    opportunity: "Interest in educational Reels rose 68% in this niche over eight weeks. This account posted none.",
    behind: "Both competitors moved to educational Reels three weeks ago. With the signal in front of you, you would have seen it on day one.",
  };

  return (
    <section ref={root} className="lp-root lp-pb" id="problem" aria-labelledby={`${id}-h`}>
      <div className="lp-pb-grid">
        <div className="lp-pb-left">
          <p className="lp-pb-label"><span>02</span>The problem</p>
          <h2 id={`${id}-h`} className="lp-statement lp-pb-h2">Posting shouldn&apos;t be guesswork.</h2>
          <p className="lp-prose">Creators produce more content than ever, but most still make decisions using instinct, outdated analytics, and whatever happened to work last week.</p>
          <p className="lp-pb-strong">SOCIA turns those signals into clear decisions.</p>

          <div className="lp-pb-list" role="tablist" aria-label="The four problems" aria-orientation="vertical" onKeyDown={onKey}>
            {PROBLEMS.map((p) => {
              const on = p.key === active;
              return (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${p.key}`}
                  aria-selected={on}
                  aria-controls={`${id}-panel-${p.key}`}
                  tabIndex={on ? 0 : -1}
                  className={on ? "lp-pb-item is-on" : "lp-pb-item"}
                  onClick={() => select(p.key)}
                  onPointerEnter={() => preview(p.key)}
                  onPointerLeave={cancelPreview}
                  onFocus={() => select(p.key)}
                >
                  <span className="lp-pb-n">{p.n}</span>
                  <span className="lp-pb-text"><b>{p.name}</b><span>{p.line}</span></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

        <div ref={stage} className="lp-pb-stage">
          {PROBLEMS.map((p) => {
            const on = p.key === active;
            return (
              <div key={p.key} id={`${id}-panel-${p.key}`} role="tabpanel" aria-labelledby={`${id}-tab-${p.key}`} data-panel={p.key} className={on ? "lp-pb-panel is-on" : "lp-pb-panel"} hidden={!on}>
                <p className="lp-pb-label is-gold"><span>{p.n}</span>{p.name}</p>

                {p.key === "strategy" && (
                  <>
                    <h3 className="lp-pb-h3">Same effort. No rhythm.</h3>
                    <div className="lp-pb-cals">
                      {[["As it happened", AS_IT_WAS, "6 posts, one gap of 11 days"], ["With a plan", WITH_PLAN, "12 posts, never more than 2 days apart"]].map(([title, weeks, foot]) => (
                        <div key={title as string} className={title === "With a plan" ? "lp-pb-cal is-plan" : "lp-pb-cal"}>
                          <p className="lp-pb-cal-title">{title as string}</p>
                          <div className="lp-pb-cal-days" aria-hidden="true">{DAYS.map((d, k) => <span key={k}>{d}</span>)}</div>
                          <div className="lp-pb-cal-grid" aria-label={`${title}: ${foot}`}>
                            {(weeks as string[]).map((w, r) => w.split("").map((c, k) => <i key={`${r}${k}`} className={c === "1" ? "is-on" : undefined} />))}
                          </div>
                          <p className="lp-pb-cal-foot">{foot as string}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {p.key === "content" && (
                  <>
                    <h3 className="lp-pb-h3">Not all content performs the same.</h3>
                    <div className="lp-pb-posts">
                      <Post src={quiet} caption="A quiet morning at the café #coffeelife #behindthescenes" likes="243" comments="12" shares="4" kind="General update" active={on} />
                      <Post src={reel} poster={poster} video caption="How to make a better latte at home #latteart #coffeetips" likes="12.4K" comments="320" shares="1.1K" kind="Educational" active={on} />
                    </div>
                  </>
                )}

                {p.key === "opportunity" && (
                  <>
                    <h3 className="lp-pb-h3">A rising topic, never posted on.</h3>
                    <div className="lp-pb-chart">
                      <p className="lp-pb-chart-title"><b>Educational Reels in this niche</b><span>Interest, indexed to week 1. Hover or tab through the weeks.</span></p>
                      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="lp-pb-svg" role="img" aria-label="Interest in educational Reels rises from 100 to 168 over eight weeks; this account posted none">
                        <line x1="12" y1={py(100)} x2={CHART_W - 12} y2={py(100)} stroke="var(--ed-rule)" strokeDasharray="3 3" />
                        <path className="is-line" d={TREND.map((v, i) => `${i ? "L" : "M"}${px(i)} ${py(v)}`).join(" ")} fill="none" stroke="var(--ed-gold)" strokeWidth="1.5" strokeLinejoin="round" />
                        {TREND.map((v, i) => (
                          <circle key={i} className={point === i ? "lp-pb-pt is-on" : "lp-pb-pt"} cx={px(i)} cy={py(v)} r={point === i ? 5 : 3.5} fill={point === i ? "var(--ed-gold)" : "var(--ed-black)"} stroke="var(--ed-gold)" strokeWidth="1.5" tabIndex={0} role="button" aria-label={`Week ${i + 1}: ${v} (${v - 100 >= 0 ? "+" : ""}${v - 100}%), you posted 0`} onMouseEnter={() => setPoint(i)} onMouseLeave={() => setPoint(null)} onFocus={() => setPoint(i)} onBlur={() => setPoint(null)} onClick={() => setPoint(i)} />
                        ))}
                      </svg>
                      <div className="lp-pb-weeks" aria-hidden="true">{TREND.map((_, i) => <span key={i}>{i + 1}</span>)}</div>
                      <p className="lp-pb-tip" aria-live="polite">{point === null ? "+68% over eight weeks. Your posts on it: 0." : `Week ${point + 1}: +${TREND[point] - 100}% interest. Your posts on it: 0.`}</p>
                    </div>
                  </>
                )}

                {p.key === "behind" && (
                  <>
                    <h3 className="lp-pb-h3">They moved first.</h3>
                    <div className="lp-pb-bars">
                      <div className="lp-pb-bars-head"><span /><span>Posts this month</span><span>Momentum</span></div>
                      {RIVALS.map((r) => (
                        <div key={r.who} className={r.who === "You" ? "lp-pb-row is-you" : "lp-pb-row"}>
                          <span className="lp-pb-who">{r.who}</span>
                          <span className="lp-pb-track"><i style={{ width: `${(r.posts / 14) * 100}%` }} /><b>{r.posts}</b></span>
                          <span className="lp-pb-track"><i style={{ width: `${(r.momentum / 31) * 100}%` }} /><b>+{r.momentum}%</b></span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <p className="lp-pb-insight"><span>{insight[p.key]}</span><em className="lp-example">Example data</em></p>
              </div>
            );
          })}
          <p className="lp-pb-count" aria-hidden="true">{String(activeIndex + 1).padStart(2, "0")} / 04</p>
        </div>
      </div>
    </section>
  );
}
