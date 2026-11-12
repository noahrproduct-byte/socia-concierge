"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MARK_SIZE, S_LOWER, S_UPPER, STAR, alongOutline, type Pt } from "./logoShape";
import "./intro.css";

// The first-run film, about eight seconds. Black, then "Introducing SOCIA".
// Ten strands, one per part of SOCIA, come in from the edges with their
// names; they wind in towards the centre, out of step at first, then turning
// together; then each lays itself along a piece of the mark's outline and
// the real mark fills the shape they drew. "Everything. One platform." holds,
// and the film fades into the page that was already under it.
//
// Canvas 2D: ten polylines of 64 points, three thin lines each (the strand
// reads as a narrow ribbon turning in space), no shaders, no particles.
// Time is accumulated frame by frame, so a hidden tab resumes where it was.
// Reduced motion gets the finished mark and the words, faded, no movement.
// "Skip intro" is there from the first frame, and Escape does the same.

export const INTRO_PARTS = [
  "Video editor",
  "AI Clipper",
  "Voiceover",
  "Audio and music",
  "Reel rater",
  "Content generation",
  "Analytics",
  "Competitor intelligence",
  "Content planning",
  "Publishing",
];

const N = 64;
const END = 7.4; // the film's last frame, in seconds; the fade out follows
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

/** Which piece of the mark each strand draws: four on each ribbon of the S, two on the star. */
const TARGETS: { poly: Pt[]; from: number; to: number }[] = [
  ...[0, 1, 2, 3].map((j) => ({ poly: soften(S_LOWER), from: j / 4, to: (j + 1) / 4 + 0.012 })),
  ...[0, 1, 2, 3].map((j) => ({ poly: soften(S_UPPER), from: j / 4, to: (j + 1) / 4 + 0.012 })),
  ...[0, 1].map((j) => ({ poly: STAR, from: j / 2, to: (j + 1) / 2 + 0.012 })),
];

/** Each strand's tint, from the mark's cobalt to near white: a family, not a rainbow. */
const TINT = ["#5b8cff", "#8fb0ff", "#3f74ff", "#c9d8ff", "#6f9bff", "#e6ecff", "#4d82ff", "#a9c2ff", "#7aa3ff", "#dbe5ff"];

type Geo = {
  w: number;
  h: number;
  cx: number;
  cy: number;
  size: number;
  far: number;
  mid: number;
  targets: Pt[][];
};

function layout(w: number, h: number): Geo {
  const size = Math.min(w * 0.56, h * 0.4, 320);
  const cx = w / 2;
  const cy = h * 0.42;
  const toScreen = ([x, y]: Pt): Pt => [cx + ((x - MARK_SIZE / 2) / MARK_SIZE) * size * 1.55, cy + ((y - MARK_SIZE / 2) / MARK_SIZE) * size * 1.55];
  return {
    w,
    h,
    cx,
    cy,
    size,
    far: Math.hypot(w, h) * 0.62,
    mid: Math.min(w, h) * 0.38,
    targets: TARGETS.map((t) => alongOutline(t.poly, t.from, t.to, N).map(toScreen)),
  };
}

/** Where the points of strand i are at time t, tail first. */
function strand(g: Geo, i: number, t: number): Pt[] {
  const dir = i % 2 ? -1 : 1;
  const theta = -Math.PI / 2 + (i * Math.PI * 2) / INTRO_PARTS.length + 0.25;
  const grow = span(t, 1.9 + i * 0.09, 3.3 + i * 0.07);
  const drift = Math.max(0, t - 3.3) * 0.12 * dir;
  const w1 = span(t, 3.35 + i * 0.06, 4.55 + i * 0.03);
  const out: Pt[] = [];
  let prevTurn = 0;
  for (let k = 0; k < N; k++) {
    const v = k / (N - 1);

    // 1. Arriving: the strand grows in from beyond the edge along a slow curve.
    const s = grow * v;
    const ra = lerp(g.far, g.mid, s);
    const aa = theta + dir * 0.75 * s + drift;
    const ex = g.cx + ra * Math.cos(aa);
    const ey = g.cy + ra * Math.sin(aa);

    // 2. Converging: spirals round the centre. Neighbours wind opposite ways, so
    // they cross and weave; one shared rotation brings them into step.
    const rb = lerp(g.size * 1.1, g.size * 0.16, v);
    const ab = theta + dir * v * 2.6 + (t - 3.4) * 1.05;
    const bx = g.cx + rb * Math.cos(ab);
    const by = g.cy + rb * 0.82 * Math.sin(ab);

    // 3. Forming: each strand lays itself along its piece of the outline, head
    // first, turning round the centre (radius and angle) rather than cutting
    // across it. The turn is kept continuous along the strand, so neighbouring
    // points never go opposite ways round.
    const w2 = span(t, 4.85 + i * 0.02 + (1 - v) * 0.3, 5.75 + i * 0.02 + (1 - v) * 0.3);
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

    // Out of step at first: each strand breathes on its own, and it settles as they converge.
    const wob = (1 - w1 * 0.75) * (1 - w2) * 7 * Math.sin(v * 9 + t * 2.4 + i * 1.7);
    out.push([g.cx + r * Math.cos(a) + wob * Math.cos(aa + Math.PI / 2), g.cy + r * Math.sin(a) + wob * Math.sin(aa + Math.PI / 2)]);
  }
  return out;
}

export default function SociaIntro({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<"title" | "film" | "words" | "leaving">("title");
  const [reduced, setReduced] = useState(false);
  const leaving = useRef(false);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase("leaving");
    window.setTimeout(onDone, LEAVE_MS);
  }, [onDone]);

  // The page under the film doesn't scroll while it plays; Escape skips.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    skipRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [leave]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(still);

    const mark = new Image();
    mark.src = "/brand/socia-mark.png";
    const font = getComputedStyle(el).fontFamily || "system-ui, sans-serif";

    let g = layout(1, 1);
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      g = layout(w, h);
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

      const form = span(t, 4.85, 6.05);
      const fill = span(t, 5.55, 6.25);
      const labels = clamp(1 - (t - 3.9) / 0.45);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const placed: [number, number, number][] = [];
      for (let i = 0; i < INTRO_PARTS.length; i++) {
        if (t < 1.9 + i * 0.09) continue;
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

        // The strand's name, beside its head while it arrives.
        const grow = span(t, 1.9 + i * 0.09, 3.3 + i * 0.07);
        const named = Math.min(clamp((grow - 0.55) / 0.3), labels);
        if (named > 0) {
          const [hx, hy] = pts[N - 1];
          const [bx, by] = pts[N - 6];
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
          ctx.globalAlpha = named;
          ctx.fill();
          const right = hx >= g.cx;
          const away = Math.atan2(hy - by, hx - bx);
          ctx.font = `500 13px ${font}`;
          ctx.textAlign = right ? "left" : "right";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(255,255,255,0.78)";
          // Kept on screen on a phone: the name slides in from the edge rather than off it.
          const tw = ctx.measureText(INTRO_PARTS[i]).width;
          const lx = right ? Math.min(hx + 12, g.w - 12 - tw) : Math.max(hx - 12, 12 + tw);
          let ly = hy + Math.sin(away) * 4 + (lx !== hx + (right ? 12 : -12) ? 14 : 0);
          // Names never sit on top of each other: a clash moves the later one a line away from the centre.
          const left = right ? lx : lx - tw;
          const step = ly < g.cy ? -17 : 17;
          for (let tries = 0; tries < 6 && placed.some(([px, py, pw]) => Math.abs(py - ly) < 16 && left < px + pw + 8 && px < left + tw + 8); tries++) ly += step;
          placed.push([left, ly, tw]);
          ctx.fillText(INTRO_PARTS[i], lx, ly);
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
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      frame(t);
      const next = t < 2.05 ? "title" : t < (still ? 0.6 : 6.0) ? "film" : "words";
      const nextPhase = still ? (t < 0.6 ? "film" : "words") : next;
      if (nextPhase !== shown && !leaving.current) {
        shown = nextPhase;
        setPhase(nextPhase);
      }
      if (t >= (still ? 3.2 : END)) {
        leave();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [leave]);

  return (
    <div className={`intro is-${phase}${reduced ? " is-still" : ""}`} role="dialog" aria-modal="true" aria-label="Introducing SOCIA">
      <canvas ref={canvas} className="intro-canvas" aria-hidden />
      <p className="intro-title">Introducing SOCIA</p>
      <div className="intro-words">
        <h2>Everything. One platform.</h2>
        <p>Create, analyze, edit, and grow. All with SOCIA.</p>
      </div>
      <p className="intro-sr">Video editor, AI Clipper, voiceover, audio and music, reel rater, content generation, analytics, competitor intelligence, content planning and publishing, in one platform.</p>
      <button ref={skipRef} type="button" className="intro-skip" onClick={leave}>
        Skip intro
      </button>
    </div>
  );
}
