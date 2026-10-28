"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  Clapperboard,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Users,
} from "lucide-react";
import { WEEK } from "./exampleWeek";

// The hero's background, from Noah's reference (2026-10-27): SOCIA's own
// screens on the example café account, joined edge to edge with no gap into
// one closed ring that turns at a constant speed and never stops. Screens come
// round from the back on the right, pass the front, and circle away to the
// back on the left, always in the same order (the sequence runs round
// the ring three times). Each screen faces outward and hides its back face, so only the
// front half of the ring is ever seen.
//
// Why continuous motion, against section 5 of docs/design/anti-slop-standard.md
// (motion should answer an action): Noah asked for the product to turn
// continuously behind the statement. One Web Animations API animation turns
// the whole ring (a transform on the compositor, no per-frame script); it never
// animates numbers, pauses only when the hero is off screen or the tab is
// hidden, and does not run under prefers-reduced-motion.
//
// Everything here is decoration for sighted visitors: aria-hidden, no
// focusable elements, pointer-events off. Every number is the example café's,
// labelled on each screen, and the same screens appear, readable and
// interactive, further down the page.

/** Views per day on the example account, 28 Sep to 27 Oct; Sunday's latte Reel lands on the 25th. */
const VIEWS = [
  1140, 980, 1210, 1065, 1320, 1490, 1180, 1030, 1260, 1105, 1385, 1220, 1560, 1290, 1075, 1340, 1190, 1450,
  1235, 1610, 1380, 1160, 1295, 1420, 1270, 1500, 1330, 2840, 2460, 1720,
];
const total = VIEWS.reduce((a, b) => a + b, 0);
const CW = 600;
const CH = 150;
const px = (i: number) => (i / (VIEWS.length - 1)) * CW;
const py = (v: number) => CH - ((v - 700) / 2300) * CH;
const LINE = VIEWS.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
const AREA = `0,${CH} ${LINE} ${CW},${CH}`;

/** One screen of the product, in the ring's own (world) pixels. */
function Screen({ title, children, chip }: { title: string; children: ReactNode; chip?: string }) {
  return (
    <section className="hx">
      <header className="hx-head">
        <b>{title}</b>
        {chip ? (
          <span className="hx-chip">
            {chip} <ChevronDown />
          </span>
        ) : null}
        <span className="hx-badge">Example</span>
      </header>
      {children}
    </section>
  );
}

function Nav() {
  const items = [
    { icon: LayoutDashboard, label: "Dashboard", on: true },
    { icon: BarChart3, label: "Analytics" },
    { icon: Users, label: "Competitors" },
    { icon: ClipboardList, label: "Content Plan" },
    { icon: Calendar, label: "Calendar" },
    { icon: Clapperboard, label: "Content Studio" },
    { icon: MessageSquare, label: "Comments" },
  ];
  return (
    <section className="hx hx-nav">
      <span className="hx-brand">
        <Image src="/brand/socia-mark.png" alt="" width={44} height={44} loading="eager" /> SOCIA
      </span>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <span key={it.label} className={it.on ? "is-on" : undefined}>
            <Icon /> {it.label}
          </span>
        );
      })}
    </section>
  );
}

function Performance() {
  return (
    <Screen title="Content performance" chip="Last 30 days">
      <div className="hx-kpis">
        <div>
          <b>{(total / 1000).toFixed(1)}K</b>
          <span>Views</span>
          <em>22% more than the 30 days before</em>
        </div>
        <div>
          <b>4.1%</b>
          <span>Engagement rate</span>
          <em>Interactions per view</em>
        </div>
        <div>
          <b>3,412</b>
          <span>Followers</span>
          <em>86 more than 30 days ago</em>
        </div>
      </div>
      <svg className="hx-chart" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="hx-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b82f6" stopOpacity="0.32" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={AREA} fill="url(#hx-fill)" />
        <polyline points={LINE} className="hx-line" />
      </svg>
      <span className="hx-axis">
        <span>Views per day, Instagram</span>
        <span>Sep 28 to Oct 27</span>
      </span>
    </Screen>
  );
}

function Audience() {
  const weeks = [18, 22, 19, 27, 31, 46];
  return (
    <Screen title="Audience" chip="Instagram">
      <div className="hx-aud">
        <div className="hx-donut">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="48" className="hx-ring-bg" />
            <circle cx="60" cy="60" r="48" className="hx-ring" strokeDasharray={`${(0.62 * 301.6).toFixed(1)} 301.6`} />
          </svg>
          <div>
            <b>62%</b>
            <span>of accounts reached don&apos;t follow you yet</span>
          </div>
        </div>
        <div className="hx-weeks">
          <div>
            {weeks.map((v, i) => (
              <i key={i} style={{ height: `${(v / 46) * 100}%` }} />
            ))}
          </div>
          <span>New followers a week</span>
        </div>
      </div>
      <span className="hx-label">What lands with them</span>
      <div className="hx-chips">
        <span>Brewing at home</span>
        <span>Behind the counter</span>
        <span>Regulars</span>
        <span>New on the menu</span>
      </div>
    </Screen>
  );
}

function Competitors() {
  const rows: [string, string, number][] = [
    ["You", "N", 142],
    ["Harbor Street Coffee", "H", 201],
    ["Kiln Café", "K", 117],
    ["Eastside Bean Co.", "E", 228],
  ];
  return (
    <Screen title="Competitors" chip="Last 30 days">
      <div className="hx-comp">
        {rows.map(([name, initial, v]) => (
          <div key={name} className={name === "You" ? "is-you" : undefined}>
            <i>{initial}</i>
            <span>{name}</span>
            <span className="hx-track">
              <em style={{ width: `${(v / 228) * 100}%` }} />
            </span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <span className="hx-label">Median interactions per post</span>
    </Screen>
  );
}

function Studio() {
  const clips = ["/landing/reel.jpg", "/landing/frames/f28.jpg", "/landing/frames/f52.jpg", "/landing/frames/f64.jpg"];
  return (
    <Screen title="Content Studio" chip="Build from clips">
      <div className="hx-strip">
        {clips.map((src, i) => (
          <span key={src}>
            <Image src={src} alt="" width={180} height={320} sizes="180px" loading="eager" />
            {i !== 1 ? <b>Used</b> : null}
          </span>
        ))}
      </div>
      <span className="hx-label">First cut, 8 seconds, from one clip</span>
    </Screen>
  );
}

const THUMB: Record<string, string> = {
  Mon: "/landing/quiet.jpg",
  Tue: "/landing/frames/f16.jpg",
  Wed: "/landing/frames/f52.jpg",
  Fri: "/landing/reel.jpg",
  Sun: "/landing/frames/f64.jpg",
};

function Plan() {
  return (
    <Screen title="This week's plan" chip="Content Plan">
      <div className="hx-week">
        {WEEK.map((w) => (
          <div key={w.day} className={w.day === "Fri" ? "is-pick" : undefined}>
            <Image src={THUMB[w.day]} alt="" width={120} height={120} sizes="120px" loading="eager" />
            <span>
              {w.day} | {w.when}
            </span>
            <b>{w.title}</b>
            <em className={w.done ? "is-on" : undefined}>{w.status}</em>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function Ask() {
  return (
    <Screen title="Ask SOCIA">
      <p className="hx-q">What should I post this week?</p>
      <div className="hx-a">
        <i>S</i>
        <p>
          A follow-up Reel on Friday at 6:30 PM. Sunday&apos;s latte Reel has 2.4× your median views at the same age,
          and 5 to 7 PM is your best window.
        </p>
      </div>
      <span className="hx-label">From 64 Instagram posts and 3 competitors</span>
    </Screen>
  );
}

/** The screens in order round the ring, with their widths in world pixels; the order runs three times so the ring is wide enough to fill the hero. */
const SEQ: { El: () => ReactNode; w: number }[] = [
  { El: Nav, w: 300 },
  { El: Performance, w: 680 },
  { El: Audience, w: 580 },
  { El: Competitors, w: 580 },
  { El: Studio, w: 500 },
  { El: Plan, w: 660 },
  { El: Ask, w: 520 },
];
const RING = [...SEQ, ...SEQ, ...SEQ];
const H = 440;
/** Milliseconds for one full turn; constant speed, never stopping. */
const TURN = 84000;

/** The ring's radius: the one at which every screen, edge to edge with no gap, closes the circle exactly. */
const R = (() => {
  const sweep = (r: number) => RING.reduce((a, s) => a + 2 * Math.asin(Math.min(1, s.w / (2 * r))), 0);
  let lo = Math.max(...RING.map((s) => s.w)) / 2;
  let hi = 20000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sweep(mid) > 2 * Math.PI) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
})();
/** Each screen's angle round the ring and its distance from the centre (the faces of a closed polygon). */
const FACES = (() => {
  let acc = 0;
  return RING.map((s) => {
    const half = Math.asin(s.w / (2 * R));
    const a = acc + half;
    acc += 2 * half;
    return { a: (a * 180) / Math.PI, d: R * Math.cos(half) };
  });
})();
/** Start with Audience at the front, as in the reference. */
const FRONT = -FACES[2].a;
const ring = (deg: number) => `translateZ(${(-FACES[2].d).toFixed(1)}px) rotateY(${deg.toFixed(2)}deg)`;

export default function HeroStage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const drum = el?.querySelector<HTMLElement>(".hs-drum");
    if (!el || !drum || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // one constant, endless turn of the whole ring: the front moves right to
    // left, screens arrive from the back on the right and leave round the left
    const turn = drum.animate([{ transform: ring(FRONT) }, { transform: ring(FRONT - 360) }], {
      duration: TURN,
      iterations: Infinity,
      easing: "linear",
    });

    // run only while the hero is on screen and the tab is visible
    let onScreen = true;
    const sync = () => (onScreen && !document.hidden ? turn.play() : turn.pause());
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      turn.cancel();
    };
  }, []);

  return (
    <div ref={root} className="hs" aria-hidden>
      <div className="hs-rig">
        <div className="hs-drum" style={{ transform: ring(FRONT) }}>
          {RING.map(({ El, w }, i) => {
            const style: CSSProperties = {
              width: w,
              height: H,
              marginLeft: -w / 2,
              marginTop: -H,
              transform: `rotateY(${FACES[i].a.toFixed(3)}deg) translateZ(${FACES[i].d.toFixed(1)}px)`,
            };
            return (
              <div key={i} className="hx-slot" style={style}>
                <El />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
