"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { WEEK } from "./exampleWeek";

// The hero's background: SOCIA's own screens on the example café account
// (Analytics, the Audience tab, Competitors, Content Plan, Content Studio and
// Ask SOCIA) standing on a ring around the headline, seen from slightly above,
// like a ring around a planet. The ring turns at a constant speed: screens at
// the front pass low and large, screens at the back pass high, small and dim
// behind the words. Every screen keeps facing the viewer as it travels, so it
// stays a readable product screen, never an edge-on sliver.
//
// Why continuous motion, against section 5 of docs/design/anti-slop-standard.md
// (motion should answer an action): Noah asked for a slowly turning ring of
// the product behind the statement (2026-10-27). Each screen runs one Web
// Animations API animation (transform and opacity, on the compositor, no
// per-frame script); it never animates numbers, pauses when the hero is off
// screen or the tab is hidden, and does not run under prefers-reduced-motion,
// where the ring stands still.
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

function Analytics({ style }: { style: CSSProperties }) {
  return (
    <section className="hs-panel" style={style}>
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

    
  );
}

function Audience({ style }: { style: CSSProperties }) {
  return (
    <section className="hs-panel" style={style}>
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

    
  );
}

function Competitors({ style }: { style: CSSProperties }) {
  return (
    <section className="hs-panel" style={style}>
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

    
  );
}

function Plan({ style }: { style: CSSProperties }) {
  return (
    <section className="hs-panel" style={style}>
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

    
  );
}

function Studio({ style }: { style: CSSProperties }) {
  return (
    <section className="hs-panel" style={style}>
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

    
  );
}

function Ask({ style }: { style: CSSProperties }) {
  return (
    <section className="hs-panel is-ask" style={style}>
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
  );
}

/** One full turn of the ring, in ms. */
const TURN = 64000;
const RING = [Analytics, Audience, Competitors, Plan, Studio, Ask];
/** Ring radius, the camera's look-down angle and the screens' size: desktop, and a tighter ring for phones. */
type Ring = { r: number; tilt: number; scale: number };
const WIDE: Ring = { r: 960, tilt: 20, scale: 0.56 };
const NARROW: Ring = { r: 420, tilt: 8, scale: 0.42 };

/** Where a screen sits at angle a (0 = front centre): on the ring, facing the viewer. */
const at = (a: number, g: Ring = WIDE) =>
  `rotateX(${-g.tilt}deg) rotateY(${a}deg) translateZ(${g.r}px) rotateY(${-a}deg) rotateX(${g.tilt}deg) scale(${g.scale})`;
/** Front screens full strength, the back of the ring dimmer. */
const fade = (a: number) => 0.32 + 0.68 * ((Math.cos((a * Math.PI) / 180) + 1) / 2);

export default function HeroStage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cards = Array.from(el.querySelectorAll<HTMLElement>(".hs-orbit"));
    const g = matchMedia("(max-width: 760px)").matches ? NARROW : WIDE;
    cards.forEach((card, i) => (card.style.transform = at((360 / cards.length) * i, g)));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // one animation per screen, all the same length and started together, so
    // the ring turns as one; 24 steps per turn keep the fade smooth
    const turns = cards.map((card, i) => {
      const start = (360 / cards.length) * i;
      const frames = Array.from({ length: 25 }, (_, k) => {
        const a = start + k * 15;
        return { transform: at(a, g), opacity: fade(a) };
      });
      return card.animate(frames, { duration: TURN, iterations: Infinity, easing: "linear" });
    });

    // run only while the hero is on screen and the tab is visible
    let onScreen = true;
    const sync = () => turns.forEach((t) => (onScreen && !document.hidden ? t.play() : t.pause()));
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      turns.forEach((t) => t.cancel());
    };
  }, []);

  return (
    <div ref={root} className="hs" aria-hidden>
      <div className="hs-rig">
        {RING.map((Panel, i) => {
          const a = (360 / RING.length) * i;
          return (
            <div key={i} className="hs-orbit" style={{ transform: at(a), opacity: fade(a) }}>
              <Panel style={{ left: 0, top: 0 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
