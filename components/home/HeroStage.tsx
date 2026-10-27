"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import {
  BarChart3,
  Calendar,
  Clapperboard,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  PenSquare,
  Users,
} from "lucide-react";
import { WEEK } from "./exampleWeek";

// The hero's background: one connected SOCIA workspace on the example café
// account, laid out as a 3 x 2 grid of the product's own screens and seen
// through a slow, tilted camera. The camera snakes along the top row
// (Analytics, Audience, Competitors), drops to the bottom row (Content Plan,
// Content Studio, Ask SOCIA) and comes back up to where it started, so the
// last move ends exactly on the first frame and the loop has no reset.
//
// Why a looping camera, against section 5 of docs/design/anti-slop-standard.md
// (motion should answer an action): Noah asked for this first screen to be a
// slow product film behind the statement (2026-10-27). It shows the real
// screens in the order the product works, never animates numbers, pauses when
// the hero is off screen or the tab is hidden, and does not run at all under
// prefers-reduced-motion, where the camera holds on the Analytics view.
//
// Everything here is decoration for sighted visitors: aria-hidden, no focusable
// elements, pointer-events off. The same screens appear, readable and
// interactive, further down the page.

/** Views per day on the example account, 28 Sep to 27 Oct. Sunday's latte Reel lands on the 25th. */
const VIEWS = [
  1140, 980, 1210, 1065, 1320, 1490, 1180, 1030, 1260, 1105, 1385, 1220, 1560, 1290, 1075, 1340, 1190, 1450,
  1235, 1610, 1380, 1160, 1295, 1420, 1270, 1500, 1330, 2840, 2460, 1720,
];
const DAY0 = new Date(Date.UTC(2026, 8, 28));
const dayLabel = (i: number) => {
  const d = new Date(DAY0.getTime() + i * 86400000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};
const total = VIEWS.reduce((a, b) => a + b, 0);
const sorted = [...VIEWS].sort((a, b) => a - b);
const median = Math.round((sorted[14] + sorted[15]) / 2);
const fmt = (n: number) => n.toLocaleString("en-US");

const CW = 600;
const CH = 200;
const lo = 800;
const hi = 3000;
const px = (i: number) => (i / (VIEWS.length - 1)) * CW;
const py = (v: number) => CH - ((v - lo) / (hi - lo)) * CH;
const LINE = VIEWS.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
const PEAK = VIEWS.indexOf(Math.max(...VIEWS));

const SIDE: { group: string; items: { icon: typeof BarChart3; label: string; on?: boolean }[] }[] = [
  {
    group: "Understand",
    items: [
      { icon: LayoutDashboard, label: "Dashboard" },
      { icon: BarChart3, label: "Analytics", on: true },
      { icon: Users, label: "Competitors" },
      { icon: Newspaper, label: "Weekly roundup" },
    ],
  },
  {
    group: "Make",
    items: [
      { icon: ClipboardList, label: "Content Plan" },
      { icon: PenSquare, label: "Create post" },
      { icon: Calendar, label: "Calendar" },
      { icon: Clapperboard, label: "Content Studio" },
      { icon: MessageSquare, label: "Comments" },
    ],
  },
];

/** Camera stops, in plane pixels: the centre of each screen, in the order the camera visits them. */
const COL = [804, 1868, 2932];
const ROW = [456, 1160];
const STOPS = [
  { x: COL[0], y: ROW[0], rx: 38, rz: -9, z: 0 }, // Analytics
  { x: COL[1], y: ROW[0], rx: 34, rz: -6, z: -40 }, // Audience
  { x: COL[2], y: ROW[0], rx: 36, rz: -3, z: -20 }, // Competitors
  { x: COL[2], y: ROW[1], rx: 40, rz: -5, z: -60 }, // Content Plan
  { x: COL[1], y: ROW[1], rx: 36, rz: -8, z: -30 }, // Content Studio
  { x: COL[0], y: ROW[1], rx: 34, rz: -10, z: -50 }, // Ask SOCIA
];

export default function HeroStage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const rig = el.querySelector<HTMLElement>(".hs-rig");
    const plane = el.querySelector<HTMLElement>(".hs-plane");
    const panels = Array.from(el.querySelectorAll<HTMLElement>(".hs-panel"));
    if (!rig || !plane || panels.length !== STOPS.length) return;

    // phones: a smaller workspace, flatter tilt, less travel; tablets in between
    const phone = matchMedia("(max-width: 760px)").matches;
    const tablet = !phone && matchMedia("(max-width: 1100px)").matches;
    const tilt = phone ? 0.6 : 1;
    const scale = phone ? 0.58 : tablet ? 0.8 : 1;
    const place = (i: number) => ({
      rig: { rotationX: STOPS[i].rx * tilt, rotationZ: STOPS[i].rz * tilt, z: STOPS[i].z, scale },
      plane: { x: -STOPS[i].x, y: -STOPS[i].y },
    });

    gsap.set(rig, place(0).rig);
    gsap.set(plane, place(0).plane);
    gsap.set(panels, { opacity: 0.4 });
    gsap.set(panels[0], { opacity: 1 });

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.still = "true";
      return;
    }

    const line = el.querySelector<SVGPolylineElement>(".hs-line");
    const tip = el.querySelector<HTMLElement>(".hs-tip");
    const bars = el.querySelectorAll<HTMLElement>(".hs-aud-bars i");
    const comp = el.querySelectorAll<HTMLElement>(".hs-comp-bar i");
    const glow = el.querySelector<HTMLElement>(".hs-plan-pick");
    const answer = el.querySelector<HTMLElement>(".hs-answer");
    const used = el.querySelectorAll<HTMLElement>(".hs-strip b");

    const len = line?.getTotalLength() ?? 0;
    // every detail starts in its "not yet seen" state; the loop's last frame matches this
    if (line) gsap.set(line, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 });
    gsap.set(tip, { opacity: 0, y: 6 });
    gsap.set([...bars, ...comp], { scaleX: 0, opacity: 1 });
    gsap.set([glow, answer, ...used], { opacity: 0 });
    gsap.set(answer, { y: 8 });

    // six stops, each a 2 s hold then a 2.6 s move to the next: 27.6 s, and the
    // sixth move ends on the first stop, so the wrap to time 0 changes nothing
    const MOVE = 2.6;
    const HOLD = 2.0;
    const STEP = MOVE + HOLD;
    const arrive = (k: number) => k * STEP; // stop 0 is "arrived" at the start
    const leave = (k: number) => k * STEP + HOLD;
    const tl = gsap.timeline({ repeat: -1, defaults: { ease: "power2.inOut" }, paused: true });

    STOPS.forEach((_, n) => {
      const next = (n + 1) % STOPS.length;
      const to = place(next);
      tl.to(rig, { ...to.rig, duration: MOVE }, leave(n));
      tl.to(plane, { ...to.plane, duration: MOVE }, leave(n));
      tl.to(panels[n], { opacity: 0.4, duration: MOVE * 0.8 }, leave(n));
      tl.to(panels[next], { opacity: 1, duration: MOVE * 0.8 }, leave(n) + MOVE * 0.2);
    });

    // what each screen does as the camera reaches it
    tl.to(line, { strokeDashoffset: 0, duration: 1.8, ease: "power1.inOut" }, 0.2);
    tl.to(tip, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.6);
    tl.to(bars, { scaleX: 1, duration: 0.9, stagger: 0.08, ease: "power2.out" }, arrive(1) - 0.6);
    tl.to(comp, { scaleX: 1, duration: 0.9, stagger: 0.06, ease: "power2.out" }, arrive(2) - 0.6);
    tl.to(glow, { opacity: 1, duration: 0.8, ease: "power1.out" }, arrive(3) - 0.4);
    tl.to(used, { opacity: 1, duration: 0.4, stagger: 0.15, ease: "power1.out" }, arrive(4) - 0.4);
    tl.to(answer, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, arrive(5) - 0.4);

    // and how it quietly returns to "not yet seen" once the camera has moved on
    const fade = (targets: gsap.TweenTarget, at: number, after?: gsap.TweenVars) => {
      tl.to(targets, { opacity: 0, duration: 0.8, ease: "power1.out" }, at);
      if (after) tl.set(targets, after, at + 0.8);
    };
    fade([line, tip], leave(2) + 0.4, { strokeDashoffset: len, opacity: 0 });
    tl.set(line, { opacity: 1 }, leave(2) + 1.3);
    fade(bars, leave(3), { scaleX: 0, opacity: 1 });
    fade(comp, leave(4), { scaleX: 0, opacity: 1 });
    fade(glow, leave(4));
    fade(used, leave(5));
    fade(answer, leave(5) + 0.2, { y: 8 });

    // run only while the hero is on screen and the tab is visible
    let onScreen = true;
    const sync = () => (onScreen && !document.hidden ? tl.play() : tl.pause());
    sync();
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      tl.kill();
    };
  }, []);


  return (
    <div ref={root} className="hs" aria-hidden>
      <div className="hs-rig">
        <div className="hs-plane">
          {/* the app shell around the six screens */}
          <div className="hs-top">
            <span className="hs-ws">
              <i>N</i> Northside Roasters
            </span>
            <span className="hs-top-note">Example account, a fictional café</span>
            <span className="hs-badge">Example data</span>
            <span className="hs-ask-btn">Ask SOCIA</span>
          </div>
          <nav className="hs-side">
            {SIDE.map((g) => (
              <div key={g.group}>
                <small>{g.group}</small>
                {g.items.map((s) => {
                  const Icon = s.icon;
                  return (
                    <span key={s.label} className={s.on ? "is-on" : undefined}>
                      <Icon /> {s.label}
                    </span>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* 1. Analytics, Overview */}
          <section className="hs-panel" style={{ left: COL[0] - 500, top: ROW[0] - 320 }}>
            <header className="hs-head">
              <b>Analytics</b>
              <span className="hs-tabs">
                <span className="is-on">Overview</span>
                <span>Content performance</span>
                <span>Audience</span>
                <span>Posting times</span>
                <span>Growth</span>
              </span>
              <span className="hs-chip">Instagram | Last 30 days</span>
            </header>
            <div className="hs-kpis">
              <div>
                <span>Total views</span>
                <b>{fmt(total)}</b>
                <em>Previous 30 days: 33,960</em>
              </div>
              <div>
                <span>Engagement rate</span>
                <b>4.1%</b>
                <em>Interactions per view, Instagram</em>
              </div>
              <div>
                <span>Followers</span>
                <b>3,412</b>
                <em>86 more than 30 days ago</em>
              </div>
              <div>
                <span>Reach</span>
                <b>18,960</b>
                <em>Previous 30 days: 16,240</em>
              </div>
            </div>
            <div className="hs-chart">
              <div className="hs-chart-head">
                <span>Performance over time: views per day</span>
                <span className="hs-legend">
                  <i className="is-blue" /> Views <i className="is-gold" /> 30-day median, {fmt(median)}
                </span>
              </div>
              <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none">
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1="0" x2={CW} y1={CH * f} y2={CH * f} className="hs-grid" />
                ))}
                <line x1="0" x2={CW} y1={py(median)} y2={py(median)} className="hs-median" />
                <polyline points={LINE} className="hs-line" />
              </svg>
              <span className="hs-tip" style={{ left: `${(px(PEAK) / CW) * 100}%`, top: `${(py(VIEWS[PEAK]) / CH) * 100}%` }}>
                <i /> {dayLabel(PEAK)} | {fmt(VIEWS[PEAK])} views
              </span>
              <div className="hs-axis">
                {[0, 7, 14, 21, 29].map((i) => (
                  <span key={i}>{dayLabel(i)}</span>
                ))}
              </div>
            </div>
            <div className="hs-top-posts">
              <span className="hs-label">Top content, against your median post at the same age</span>
              {[
                ["How to make a better latte at home", "Reel", "2.4×", "/landing/reel.jpg"],
                ["Our new seasonal oat latte", "Reel", "1.7×", "/landing/frames/f40.jpg"],
                ["Behind the counter: the 6 AM open", "Reel", "1.3×", "/landing/quiet.jpg"],
              ].map(([t, f, m, src]) => (
                <div key={t} className="hs-post">
                  <Image src={src} alt="" width={24} height={42} sizes="24px" loading="eager" />
                  <span>{t}</span>
                  <em>{f}</em>
                  <b>{m}</b>
                </div>
              ))}
            </div>
          </section>

          {/* 2. Analytics, Audience tab */}
          <section className="hs-panel" style={{ left: COL[1] - 500, top: ROW[0] - 320 }}>
            <header className="hs-head">
              <b>Audience</b>
              <span className="hs-chip">Instagram | Current followers</span>
            </header>
            <div className="hs-aud">
              <div className="hs-card">
                <span className="hs-label">Audience demographics</span>
                <span className="hs-tabs is-small">
                  <span className="is-on">Age</span>
                  <span>Gender</span>
                  <span>Location</span>
                </span>
                <div className="hs-aud-bars">
                  {[
                    ["18 to 24", 22],
                    ["25 to 34", 41],
                    ["35 to 44", 21],
                    ["45 to 54", 10],
                    ["55 and over", 6],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <span>{k}</span>
                      <span className="hs-track">
                        <i style={{ width: `${((v as number) / 41) * 100}%` }} />
                      </span>
                      <b>{v}%</b>
                    </div>
                  ))}
                </div>
                <p>Share of current followers, as Instagram reports it</p>
              </div>
              <div className="hs-card">
                <span className="hs-label">Top cities</span>
                <ol className="hs-cities">
                  <li>
                    Portland, OR <b>46%</b>
                  </li>
                  <li>
                    Vancouver, WA <b>9%</b>
                  </li>
                  <li>
                    Seattle, WA <b>5%</b>
                  </li>
                  <li>
                    Beaverton, OR <b>4%</b>
                  </li>
                </ol>
                <span className="hs-label">New followers per day</span>
                <div className="hs-newf">
                  {[3, 2, 4, 1, 3, 5, 2, 3, 2, 4, 3, 6, 9, 7].map((v, i) => (
                    <i key={i} style={{ height: `${v * 5}px` }} />
                  ))}
                </div>
              </div>
              <div className="hs-card is-wide">
                <span className="hs-label">Formats compared, last 90 days</span>
                <div className="hs-ftable">
                  <span>Format</span>
                  <span>Posts</span>
                  <span>Median views</span>
                  <span>Median saves</span>
                  <b>Reels</b>
                  <span>38</span>
                  <span>2,120</span>
                  <span>24</span>
                  <b>Carousels</b>
                  <span>17</span>
                  <span>1,310</span>
                  <span>31</span>
                  <b>Photos</b>
                  <span>9</span>
                  <span>840</span>
                  <span>8</span>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Competitors */}
          <section className="hs-panel" style={{ left: COL[2] - 500, top: ROW[0] - 320 }}>
            <header className="hs-head">
              <b>Competitors</b>
              <span className="hs-chip">Instagram | Last 30 days</span>
            </header>
            <div className="hs-table">
              <div className="hs-tr is-head">
                <span>Account</span>
                <span>Posts a week</span>
                <span>Median interactions per post</span>
                <span>Top format</span>
              </div>
              {[
                ["You, Northside Roasters", "3.2", 0.62, "142", "Reels"],
                ["Harbor Street Coffee", "4.5", 0.88, "201", "Carousels"],
                ["Kiln Café", "2.8", 0.51, "117", "Reels"],
                ["Eastside Bean Co.", "5.1", 1, "228", "Carousels"],
              ].map(([n, w, f, l, fm]) => (
                <div key={n as string} className="hs-tr">
                  <span>{n}</span>
                  <span>{w}</span>
                  <span className="hs-comp-bar">
                    <span className="hs-track">
                      <i style={{ width: `${(f as number) * 100}%` }} />
                    </span>
                    <b>{l}</b>
                  </span>
                  <span>{fm}</span>
                </div>
              ))}
            </div>
            <div className="hs-opp">
              <span className="hs-label">What&apos;s working for them</span>
              <p>
                <b>Story carousels.</b> Two of the three post one every week, with 1.4× their own median interactions.
                You have posted none in 90 days.
              </p>
            </div>
            <div className="hs-when">
              <span className="hs-label">When they post, by hour</span>
              <div className="hs-when-row">
                {[0, 1, 4, 6, 3, 1, 1, 2, 2, 1, 2, 3, 2, 1].map((v, i) => (
                  <i key={i} style={{ opacity: 0.18 + v * 0.13 }} />
                ))}
              </div>
              <div className="hs-hours-axis">
                <span>6 AM</span>
                <span>12 PM</span>
                <span>7 PM</span>
              </div>
              <p>Most of their posts go out 7 to 9 AM. Yours go out after 5 PM, when your posts do best.</p>
            </div>
            <p className="hs-foot">Public posts only: likes and comments as Instagram shows them on each account.</p>
          </section>

          {/* 4. Content Plan */}
          <section className="hs-panel" style={{ left: COL[2] - 500, top: ROW[1] - 320 }}>
            <header className="hs-head">
              <b>This week&apos;s plan</b>
              <span className="hs-chip">Content Plan | Built from your last 90 days</span>
            </header>
            <div className="hs-week">
              {WEEK.map((w) => (
                <div key={w.day} className="hs-day">
                  <span className="hs-day-name">
                    {w.day} | {w.when}
                  </span>
                  <b>{w.title}</b>
                  <em>{w.why}</em>
                  <span className={`hs-status${w.done ? " is-on" : ""}`}>{w.status}</span>
                  {w.day === "Fri" ? <span className="hs-plan-pick" /> : null}
                </div>
              ))}
            </div>
            <div className="hs-built">
              <span className="hs-label">Built from</span>
              <span>64 Instagram posts</span>
              <span>3 competitors</span>
              <span>Best window 5 to 7 PM</span>
              <span>Sunday&apos;s 2.4× Reel</span>
            </div>
          </section>

          {/* 5. Content Studio, Make this video */}
          <section className="hs-panel" style={{ left: COL[1] - 500, top: ROW[1] - 320 }}>
            <header className="hs-head">
              <b>Content Studio</b>
              <span className="hs-tabs">
                <span className="is-on">Cut</span>
                <span>Text &amp; captions</span>
                <span>Look &amp; sound</span>
                <span>Music</span>
              </span>
              <span className="hs-chip">Build from clips</span>
            </header>
            <div className="hs-studio">
              <div className="hs-preview">
                <Image src="/landing/reel.jpg" alt="" width={216} height={384} sizes="216px" loading="eager" />
                <span>First cut, 8 seconds</span>
              </div>
              <div className="hs-studio-side">
                <span className="hs-label">Moments found in one clip</span>
                <div className="hs-strip">
                  {["04", "16", "28", "40", "52", "64"].map((f, i) => (
                    <span key={f}>
                      <Image src={`/landing/frames/f${f}.jpg`} alt="" width={64} height={114} sizes="64px" loading="eager" />
                      {i === 0 || i === 3 || i === 5 ? <b>Used</b> : null}
                    </span>
                  ))}
                </div>
                <span className="hs-label">Captions</span>
                <ol className="hs-cut">
                  <li>
                    <span>0:00</span> A better latte at home
                  </li>
                  <li>
                    <span>0:03</span> Pour from higher first
                  </li>
                  <li>
                    <span>0:06</span> Then drop low to draw
                  </li>
                </ol>
                <p className="hs-foot">Plan these posts: Friday, 6:30 PM, as a draft. Every cut and caption stays editable.</p>
              </div>
            </div>
          </section>

          {/* 6. Ask SOCIA, the drawer */}
          <section className="hs-panel is-ask" style={{ left: COL[0] - 500, top: ROW[1] - 320 }}>
            <header className="hs-head">
              <b>Ask SOCIA</b>
              <span className="hs-chip">Analytics</span>
              <span className="hs-chip">Last 90 days</span>
            </header>
            <div className="hs-ask">
              <p className="hs-q">What should I post this week?</p>
              <div className="hs-answer">
                <i className="hs-avatar">S</i>
                <div>
                  <span className="hs-block">Observed</span>
                  <p>
                    Sunday&apos;s latte Reel has 2.4× your median views at the same age. Your posts between 5 and 7 PM
                    get 1.6× your median, across 31 posts.
                  </p>
                  <span className="hs-block">Recommendation</span>
                  <p>
                    Post a follow-up Reel on Friday at 6:30 PM, and add one story carousel on Wednesday, a format two of
                    your three competitors post weekly.
                  </p>
                  <div className="hs-proposal">
                    <span className="hs-block">Suggested update | Fri</span>
                    <div>
                      <span>Current</span>
                      <s>Photo: new pastry case</s>
                    </div>
                    <div>
                      <span>New</span>
                      <b>Reel: pour from higher first, part 2</b>
                    </div>
                  </div>
                  <span className="hs-sources">SOCIA cites only your own data. Review before publishing.</span>
                </div>
              </div>
              <div className="hs-input">Ask SOCIA…</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
