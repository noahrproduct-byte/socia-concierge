"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Instrument_Serif } from "next/font/google";
import { Volume2 } from "lucide-react";
import { MARK_SIZE, S_LOWER, S_UPPER, STAR, alongOutline, type Pt } from "./logoShape";
import "./intro.css";

// The first-run film, about nine seconds. Black, then "Introducing" in an
// italic serif over a large SOCIA whose letters rise into place. Eleven
// strands, one per part of SOCIA, come in from the edges one after another,
// each ending at its name, and hold long enough to read them all. Then they
// wind in towards the centre, out of step at first, then turning together;
// each lays itself along a piece of the mark's outline and the real mark
// fills the shape they drew. "Everything. One platform." holds, and the film
// fades into the page that was already under it.
//
// Canvas 2D: eleven polylines of 64 points, three thin lines each (the
// strand reads as a narrow ribbon turning in space), no shaders, no
// particles. Time is accumulated frame by frame, so a hidden tab resumes
// where it was. Reduced motion gets the finished mark and the words, faded,
// no movement and no sound. "Skip intro" is there from the first frame, and
// Escape too.
//
// Sound (public/intro/intro-sound.mp3, made by scripts/intro-sound.py, timed
// to T below) starts with the film when the browser allows it, which it
// does once the person has clicked on the site. When it doesn't, the film
// plays muted and "Sound on" picks the sound up at the film's current time.
// There is no mute (Noah, 2026-11-12); "Skip intro" ends the film and its sound.

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-intro-serif" });

/** In the order they arrive: understanding first, then making, then publishing. */
export const INTRO_PARTS = [
  "Analytics",
  "Competitor intelligence",
  "Competitor-based strategy",
  "Content planning",
  "Content generation",
  "Video editor",
  "AI Clipper",
  "Voiceover",
  "Audio and music",
  "Reel rater",
  "Publishing",
];

const N = 64;
/** The film's beats, in seconds. */
const T = {
  arrive: 2.2, // the first strand starts in
  stagger: 0.11, // between strands
  grow: 0.95, // each strand's way in
  namesOut: 4.95, // the names start to fade, every strand having been read
  braid: 5.0, // the strands start winding in
  form: 6.3, // they start laying onto the outline
  fill: 7.0, // the mark fills in
  words: 7.45, // "Everything. One platform."
  end: 8.9, // the last frame; the fade into the page follows
};
const LEAVE_MS = 600;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Rounds a traced outline's corners slightly (one pass of corner cutting), so a strand bends onto it rather than kinks. */
function soften(poly: Pt[]): Pt[] {
  return poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return [
      [p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25] as Pt,
      [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75] as Pt,
    ];
  });
}

/** Which piece of the mark each strand draws: five on the lower ribbon of the S, four on the upper, two on the star. */
const TARGETS: { poly: Pt[]; from: number; to: number }[] = [
  ...[0, 1, 2, 3, 4].map((j) => ({ poly: soften(S_LOWER), from: j / 5, to: (j + 1) / 5 + 0.012 })),
  ...[0, 1, 2, 3].map((j) => ({ poly: soften(S_UPPER), from: j / 4, to: (j + 1) / 4 + 0.012 })),
  ...[0, 1].map((j) => ({ poly: STAR, from: j / 2, to: (j + 1) / 2 + 0.012 })),
];

/** Each strand's tint, from the mark's cobalt to near white: a family, not a rainbow. */
const TINT = ["#5b8cff", "#8fb0ff", "#3f74ff", "#c9d8ff", "#6f9bff", "#e6ecff", "#4d82ff", "#a9c2ff", "#7aa3ff", "#dbe5ff", "#94b4ff"];

/** Where a strand comes from, bends through and ends (at its name), and how the name sits. */
type Lane = { from: Pt; via: Pt; to: Pt; label: Pt; align: CanvasTextAlign };

type Geo = {
  w: number;
  h: number;
  cx: number;
  cy: number;
  size: number;
  font: number;
  lanes: Lane[];
  targets: Pt[][];
};

/**
 * Wide screens put the names on an oval round the centre, each strand coming
 * in from the edge beyond it and the name on the inner side of its end, so no
 * strand crosses a name. Tall screens (phones) list the names down the
 * middle, the strands coming in from the left and right edges to meet them.
 */
function layout(w: number, h: number, measure: (text: string, px: number) => number): Geo {
  const size = Math.min(w * 0.56, h * 0.4, 320);
  const cx = w / 2;
  const cy = h * 0.42;
  const toScreen = ([x, y]: Pt): Pt => [cx + ((x - MARK_SIZE / 2) / MARK_SIZE) * size * 1.55, cy + ((y - MARK_SIZE / 2) / MARK_SIZE) * size * 1.55];
  const n = INTRO_PARTS.length;
  const wide = w >= h * 0.95;
  const font = wide ? Math.round(Math.min(18, Math.max(15, w / 80))) : 15;
  const lanes: Lane[] = INTRO_PARTS.map((name, i) => {
    if (wide) {
      const theta = -Math.PI / 2 + (i * Math.PI * 2) / n + Math.PI / (2 * n);
      const rx = Math.min(w * 0.33, 470);
      const ry = Math.min(h * 0.31, 290);
      const c = Math.cos(theta);
      const sn = Math.sin(theta);
      const to: Pt = [cx + rx * c, cy + ry * sn];
      const far = Math.hypot(w, h) * 0.6;
      const from: Pt = [cx + far * Math.cos(theta + 0.2), cy + far * Math.sin(theta + 0.2)];
      const via: Pt = [cx + (rx + far) * 0.5 * Math.cos(theta - 0.12), cy + (ry + far) * 0.5 * Math.sin(theta - 0.12)];
      const side = c >= 0 ? 1 : -1;
      return { from, via, to, label: [to[0] - side * (font + 6), to[1]], align: side > 0 ? "right" : "left" };
    }
    const top = h * 0.17;
    const y = top + (i * (h * 0.66)) / (n - 1);
    const half = measure(name, font) / 2 + 22;
    const left = i % 2 === 0;
    const to: Pt = [left ? cx - half : cx + half, y];
    const from: Pt = [left ? -30 : w + 30, y + (left ? 1 : -1) * h * 0.18];
    const via: Pt = [left ? to[0] * 0.45 : w - (w - to[0]) * 0.45, y - (left ? 1 : -1) * 40];
    return { from, via, to, label: [cx, y], align: "center" };
  });
  if (wide) {
    // Names near the top and bottom of the oval can meet: move the one further
    // from the centre line further out until every name has its own room.
    const box = lanes.map((l, i) => {
      const tw = measure(INTRO_PARTS[i], font) + 24;
      const x0 = l.align === "right" ? l.label[0] - tw : l.label[0];
      return { x0, x1: x0 + tw };
    });
    const room = font + 24;
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          const A = lanes[a];
          const B = lanes[b];
          if (box[a].x1 + 10 < box[b].x0 || box[b].x1 + 10 < box[a].x0) continue;
          const gap = Math.abs(A.to[1] - B.to[1]);
          if (gap >= room) continue;
          const outer = Math.abs(A.to[1] - cy) > Math.abs(B.to[1] - cy) ? A : B;
          const inner = outer === A ? B : A;
          const away = Math.sign(outer.to[1] - inner.to[1]) || (outer.to[1] < cy ? -1 : 1);
          const y = Math.min(h - room, Math.max(room, inner.to[1] + away * room));
          outer.to = [outer.to[0], y];
          outer.label = [outer.label[0], y];
          moved = true;
        }
      if (!moved) break;
    }
  }
  return { w, h, cx, cy, size, font, lanes, targets: TARGETS.map((t) => alongOutline(t.poly, t.from, t.to, N).map(toScreen)) };
}

const arrival = (i: number) => T.arrive + i * T.stagger;

/** Where the points of strand i are at time t, tail first. */
function strand(g: Geo, i: number, t: number): Pt[] {
  const dir = i % 2 ? -1 : 1;
  const theta = -Math.PI / 2 + (i * Math.PI * 2) / INTRO_PARTS.length;
  const grow = span(t, arrival(i), arrival(i) + T.grow);
  const w1 = span(t, T.braid + i * 0.04, T.braid + 1.1 + i * 0.02);
  const { from, via, to } = g.lanes[i];
  const out: Pt[] = [];
  let prevTurn = 0;
  for (let k = 0; k < N; k++) {
    const v = k / (N - 1);

    // 1. Arriving: the strand grows in from beyond the edge along a curve to its name.
    const s = grow * v;
    const ex = (1 - s) * (1 - s) * from[0] + 2 * (1 - s) * s * via[0] + s * s * to[0];
    const ey = (1 - s) * (1 - s) * from[1] + 2 * (1 - s) * s * via[1] + s * s * to[1];

    // 2. Converging: spirals round the centre. Neighbours wind opposite ways, so
    // they cross and weave; one shared rotation brings them into step.
    const rb = lerp(g.size * 1.1, g.size * 0.16, v);
    const ab = theta + dir * v * 2.6 + (t - T.braid) * 1.05;
    const bx = g.cx + rb * Math.cos(ab);
    const by = g.cy + rb * 0.82 * Math.sin(ab);

    // 3. Forming: each strand lays itself along its piece of the outline, head
    // first, turning round the centre (radius and angle) rather than cutting
    // across it. The turn is kept continuous along the strand, so neighbouring
    // points never go opposite ways round.
    const w2 = span(t, T.form + i * 0.02 + (1 - v) * 0.3, T.form + 0.9 + i * 0.02 + (1 - v) * 0.3);
    const mx = lerp(ex, bx, w1) - g.cx;
    const my = lerp(ey, by, w1) - g.cy;
    const [tx, ty] = g.targets[i][k];
    const a0 = Math.atan2(my, mx);
    let turn = Math.atan2(ty - g.cy, tx - g.cx) - a0;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    if (k) turn -= Math.round((turn - prevTurn) / (Math.PI * 2)) * Math.PI * 2;
    prevTurn = turn;
    const r = lerp(Math.hypot(mx, my), Math.hypot(tx - g.cx, ty - g.cy), w2);
    const a = a0 + turn * w2;

    // Out of step at first: each strand breathes on its own (less towards its
    // name, so the name stays put), and it settles as they converge.
    const wob = (1 - w1 * 0.75) * (1 - w2) * 6 * (1 - v * 0.8) * Math.sin(v * 9 + t * 2.4 + i * 1.7);
    out.push([g.cx + r * Math.cos(a) + wob * Math.cos(theta + Math.PI / 2), g.cy + r * Math.sin(a) + wob * Math.sin(theta + Math.PI / 2)]);
  }
  return out;
}

/** `motion` plays the moving film even when the device asks for reduced motion: only when the person chose to watch it (/intro). */
export default function SociaIntro({ onDone, motion = false }: { onDone: () => void; motion?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<"title" | "film" | "words" | "leaving">("title");
  const [reduced, setReduced] = useState(false);
  const leaving = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const filmTime = useRef(0);
  const [sound, setSound] = useState<"none" | "off" | "on">("none");

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase("leaving");
    // The page shows again under the fade.
    delete document.documentElement.dataset.introPlaying;
    // The sound fades with the picture.
    const a = audio.current;
    if (a && !a.paused) {
      const from = a.volume;
      const started = performance.now();
      const step = () => {
        const f = Math.min(1, (performance.now() - started) / LEAVE_MS);
        a.volume = from * (1 - f);
        if (f < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    window.setTimeout(onDone, LEAVE_MS);
  }, [onDone]);

  const soundOn = () => {
    const a = audio.current;
    if (!a) return;
    // The button answers at once; the sound may take a moment to load, and
    // only a refusal from the browser turns it back.
    setSound("on");
    a.currentTime = filmTime.current;
    a.play().catch(() => setSound("off"));
  };

  // The page under the film doesn't scroll while it plays, and isn't drawn
  // (intro.css), so the film has the machine to itself; Escape skips.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    root.dataset.introPlaying = "";
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      delete root.dataset.introPlaying;
      window.removeEventListener("keydown", onKey);
    };
  }, [leave]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = !motion && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(still);
    if (!still) {
      const a = new Audio("/intro/intro-sound.mp3");
      a.preload = "auto";
      a.volume = 1;
      audio.current = a;
      setSound("off");
      a.play().then(
        () => setSound("on"),
        () => setSound("off"),
      );
    }

    const mark = new Image();
    mark.src = "/brand/socia-mark.png";
    const font = getComputedStyle(el).fontFamily || "system-ui, sans-serif";

    const measure = (text: string, px: number) => {
      ctx.font = `500 ${px}px ${font}`;
      return ctx.measureText(text).width;
    };
    let g = layout(1, 1, measure);
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      g = layout(w, h, measure);
    };
    size();
    window.addEventListener("resize", size);

    const drawMark = (alpha: number, grow: number) => {
      if (!mark.complete || !mark.naturalWidth || alpha <= 0) return;
      const s = g.size * 1.55 * grow;
      ctx.globalAlpha = alpha;
      ctx.drawImage(mark, g.cx - s / 2, g.cy - s / 2, s, s);
      ctx.globalAlpha = 1;
    };

    const frame = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, g.w, g.h);

      if (still) {
        drawMark(span(t, 0.2, 0.9), 1);
        return;
      }

      const form = span(t, T.form, T.form + 1.2);
      const fill = span(t, T.fill, T.fill + 0.7);
      const names = clamp(1 - (t - T.namesOut) / 0.4);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < INTRO_PARTS.length; i++) {
        if (t < arrival(i)) continue;
        const pts = strand(g, i, t);

        // A narrow ribbon: a bright centre line and two finer edges that turn around it.
        const width = (1 - form) * 3.4;
        const lineAlpha = 1 - fill * 0.9;
        for (const edge of [-1, 1, 0]) {
          ctx.beginPath();
          for (let k = 0; k < N; k++) {
            const [x, y] = pts[k];
            const [px, py] = pts[Math.max(0, k - 1)];
            const [nx, ny] = pts[Math.min(N - 1, k + 1)];
            const len = Math.hypot(nx - px, ny - py) || 1;
            const turn = Math.cos((k / (N - 1)) * 7 + t * 2.2 + i * 0.8);
            const off = edge * width * turn;
            const ox = x + (-(ny - py) / len) * off;
            const oy = y + ((nx - px) / len) * off;
            if (k) ctx.lineTo(ox, oy);
            else ctx.moveTo(ox, oy);
          }
          ctx.strokeStyle = form > 0.6 ? "#4f86ff" : TINT[i];
          ctx.globalAlpha = (edge ? 0.42 : 0.95) * lineAlpha;
          ctx.lineWidth = edge ? 0.8 : 1.3 + form * 0.5;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // The strand's name, in a quiet pill at its end, as soon as it arrives.
        const shown = Math.min(clamp((t - arrival(i) - T.grow * 0.7) / 0.3), names);
        if (shown > 0) {
          const [hx, hy] = pts[N - 1];
          const lane = g.lanes[i];
          const label = INTRO_PARTS[i];
          ctx.globalAlpha = shown;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `500 ${g.font}px ${font}`;
          const tw = ctx.measureText(label).width;
          const padX = 12;
          const hgt = g.font + 16;
          const rise = (1 - shown) * 6;
          const [lx, ly] = [lane.label[0], lane.label[1] + rise];
          const left = lane.align === "right" ? lx - tw - padX : lane.align === "left" ? lx - padX : lx - tw / 2 - padX;
          ctx.beginPath();
          ctx.roundRect(left, ly - hgt / 2, tw + padX * 2, hgt, hgt / 2);
          ctx.fillStyle = "rgba(255,255,255,0.07)";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.96)";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, left + padX, ly + 0.5);
          ctx.globalAlpha = 1;
        }
      }

      drawMark(fill, lerp(0.97, 1, fill));
    };

    let t = 0;
    let last = performance.now();
    let raf = 0;
    let shown: "title" | "film" | "words" = "title";
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // While the sound plays, it is the clock and the picture follows it: the
      // sound is never moved (moving it is an audible skip), and the picture
      // never runs ahead of it. Without sound, the frames keep the time.
      const a = audio.current;
      if (a && !a.paused && !a.seeking && a.readyState >= 3) t = Math.max(t, a.currentTime);
      else t += dt;
      filmTime.current = t;
      frame(t);
      const next = t < T.arrive ? "title" : t < T.words ? "film" : "words";
      const nextPhase = still ? (t < 0.6 ? "film" : "words") : next;
      if (nextPhase !== shown && !leaving.current) {
        shown = nextPhase;
        setPhase(nextPhase);
      }
      if (t >= (still ? 3.2 : T.end)) {
        leave();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      audio.current?.pause();
      audio.current = null;
    };
  }, [leave, motion]);

  return (
    <div className={`intro ${serif.variable} is-${phase}${reduced ? " is-still" : ""}${motion ? " is-chosen" : ""}`} role="dialog" aria-modal="true" aria-label="Introducing SOCIA">
      <canvas ref={canvas} className="intro-canvas" aria-hidden />
      <div className="intro-title">
        <span className="intro-kicker">Introducing</span>
        <span className="intro-name" aria-label="SOCIA">
          {"SOCIA".split("").map((c, i) => (
            <span key={i} aria-hidden style={{ "--i": i } as React.CSSProperties}>
              <span>{c}</span>
            </span>
          ))}
        </span>
        <span className="intro-rule" aria-hidden />
      </div>
      <div className="intro-words">
        <h2>Everything. One platform.</h2>
        <p>Create, analyze, edit, and grow. All with SOCIA.</p>
      </div>
      <p className="intro-sr">Analytics, competitor intelligence, competitor-based strategy, content planning, content generation, video editor, AI Clipper, voiceover, audio and music, reel rater and publishing, in one platform.</p>
      <div className="intro-controls">
        {sound === "off" && (
          <button type="button" className="intro-skip" onClick={soundOn}>
            <Volume2 aria-hidden />
            Sound on
          </button>
        )}
        <button ref={skipRef} type="button" className="intro-skip" onClick={leave}>
          Skip intro
        </button>
      </div>
    </div>
  );
}
