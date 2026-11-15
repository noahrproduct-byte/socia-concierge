// Draws a storyboard (lib/animated/board.ts) in the account's own look: the
// chapter label and counter on top, captions that appear word by word, the
// stage with its points, characters, shapes, tags, markers and stamps, a meter
// under it, and the ending card. The engine owns the frame; the writer only
// says what is on the stage and when.
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { FLOOR_Y, STAGE_H, TAG_H, atSeconds, boardTimeline, cardHeight, counterEnd, stampEnd, stampWidth, tagWidth, type At, type BoardFigure, type BoardPoint, type BoardTimeline, type FigureKey, type Storyboard, type Tone } from "@/lib/animated/board";
import type { AnimatedLook } from "@/lib/animated/look";
import { inkOn } from "@/lib/animated/spec";
import { MONO, fontFor } from "./parts";

// The frame, top to bottom: chapter label, captions, the stage, the meter. It sits between the
// parts of a Reel that the app covers (the top bar, and the name and caption over the bottom
// fifth); the stage's ground runs on to the bottom edge so nothing is left as an empty band.
const FRAME_H = 1920;
const LABEL_TOP = 190;
const CAPTION_TOP = 262;
const STAGE_TOP = 660;
const BAD = "#E8504A";
const PROP_COLORS = ["#E8504A", "#F2C230", "#5BBE5F", "#3E8EDC", "#9B6BD8", "#F08A3C", "#E46AA6", "#E9E6DD"];

type P = { x: number; y: number };
const p = (x: number, y: number): P => ({ x, y });
const clamp01 = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fade = (t: number, at: number, d = 0.22) => interpolate(t - at, [0, d], [0, 1], { ...clamp01, easing: Easing.out(Easing.cubic) });

const toneColor = (look: AnimatedLook, tone: Tone) => (tone === "fg" ? look.fg : tone === "dim" ? look.dim : tone === "key" ? look.key : tone === "accent" ? look.accent : BAD);

// ---------------------------------------------------------------- characters ----

/** Two segments from `root` toward `target`; a target that is too far leaves the limb straight and short of it. */
function twoBone(root: P, target: P, l1: number, l2: number, bend: 1 | -1): { joint: P; end: P } {
  const dx = target.x - root.x, dy = target.y - root.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const ux = dx / d, uy = dy / d;
  if (d >= l1 + l2 - 0.5) return { joint: p(root.x + ux * l1, root.y + uy * l1), end: p(root.x + ux * (l1 + l2 - 0.5), root.y + uy * (l1 + l2 - 0.5)) };
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))) * bend;
  return { joint: p(root.x + (ux * Math.cos(a) - uy * Math.sin(a)) * l1, root.y + (ux * Math.sin(a) + uy * Math.cos(a)) * l1), end: target };
}

type Pose = { hip: P; lean: number; lH: P; rH: P; lF: P; rF: P; o: number };
const mixP = (a: P, b: P, k: number) => p(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);

function skeleton(pose: Pose, s: number) {
  const TORSO = 175 * s, UA = 128 * s, FA = 122 * s, TH = 140 * s, SH = 135 * s, SW = 30 * s, HW = 20 * s;
  const r = (pose.lean * Math.PI) / 180;
  const neck = p(pose.hip.x + Math.sin(r) * TORSO, pose.hip.y - Math.cos(r) * TORSO);
  const ax = p(Math.cos(r), Math.sin(r));
  const lS = p(neck.x - ax.x * SW, neck.y - ax.y * SW), rS = p(neck.x + ax.x * SW, neck.y + ax.y * SW);
  const lHp = p(pose.hip.x - ax.x * HW, pose.hip.y - ax.y * HW), rHp = p(pose.hip.x + ax.x * HW, pose.hip.y + ax.y * HW);
  return {
    r, neck, lS, rS, lHp, rHp,
    la: twoBone(lS, pose.lH, UA, FA, -1), ra: twoBone(rS, pose.rH, UA, FA, 1),
    ll: twoBone(lHp, pose.lF, TH, SH, 1), rl: twoBone(rHp, pose.rF, TH, SH, -1),
  };
}

/** A key's pose in stage pixels: named points for hands and feet, a relaxed position for the ones left free. */
function keyPose(k: FigureKey, pts: Map<string, BoardPoint>, s: number): Pose {
  const hip = p(k.x, k.y);
  const r = (k.lean * Math.PI) / 180;
  const neck = p(hip.x + Math.sin(r) * 175 * s, hip.y - Math.cos(r) * 175 * s);
  const at = (name: string, rest: P) => { const q = pts.get(name); return q ? p(q.x, q.y) : rest; };
  // Free hands hang by the sides; free feet stand on the floor when it is in reach, else hang under the hips.
  const legs = 268 * s;
  const footY = FLOOR_Y - hip.y <= legs ? FLOOR_Y : hip.y + legs * 0.97;
  return {
    hip, lean: k.lean, o: k.o,
    lH: at(k.lh, p(neck.x - 46 * s, neck.y + 236 * s)), rH: at(k.rh, p(neck.x + 46 * s, neck.y + 236 * s)),
    lF: at(k.lf, p(hip.x - 44 * s, footY)), rF: at(k.rf, p(hip.x + 44 * s, footY)),
  };
}

function figurePose(f: BoardFigure, tl: BoardTimeline, pts: Map<string, BoardPoint>, t: number): Pose {
  const keys = f.keys.map((k) => ({ t: atSeconds(tl, k.at), pose: keyPose(k, pts, f.scale) })).sort((a, b) => a.t - b.t);
  if (t <= keys[0].t) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      const k = Easing.inOut(Easing.cubic)((t - a.t) / Math.max(0.001, b.t - a.t));
      return { hip: mixP(a.pose.hip, b.pose.hip, k), lean: a.pose.lean + (b.pose.lean - a.pose.lean) * k, o: a.pose.o + (b.pose.o - a.pose.o) * k, lH: mixP(a.pose.lH, b.pose.lH, k), rH: mixP(a.pose.rH, b.pose.rH, k), lF: mixP(a.pose.lF, b.pose.lF, k), rF: mixP(a.pose.rF, b.pose.rF, k) };
    }
  }
  return keys[keys.length - 1].pose;
}

function Figure({ pose, scale, color }: { pose: Pose; scale: number; color: string }) {
  const s = scale, W = 24 * s, HEAD = 36 * s;
  const k = skeleton(pose, s);
  const head = p(k.neck.x + Math.sin(k.r) * HEAD * 1.55, k.neck.y - Math.cos(k.r) * HEAD * 1.55);
  const limb = (a: P, b: P, c: P, key: string) => <polyline key={key} points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`} fill="none" stroke={color} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" />;
  const dot = (q: P, key: string) => <circle key={key} cx={q.x} cy={q.y} r={W * 0.42} fill="#9AA1AB" />;
  return (
    <g opacity={pose.o}>
      {limb(k.lHp, k.ll.joint, k.ll.end, "ll")}
      {limb(k.rHp, k.rl.joint, k.rl.end, "rl")}
      <line x1={pose.hip.x} y1={pose.hip.y} x2={k.neck.x} y2={k.neck.y} stroke={color} strokeWidth={W * 1.35} strokeLinecap="round" />
      <rect x={pose.hip.x - W * 1.1} y={pose.hip.y - W * 0.55} width={W * 2.2} height={W * 0.9} rx={W * 0.35} fill="#9AA1AB" transform={`rotate(${pose.lean} ${pose.hip.x} ${pose.hip.y})`} />
      {limb(k.lS, k.la.joint, k.la.end, "la")}
      {limb(k.rS, k.ra.joint, k.ra.end, "ra")}
      {[dot(k.la.joint, "a"), dot(k.ra.joint, "b"), dot(k.ll.joint, "c"), dot(k.rl.joint, "d")]}
      <circle cx={head.x} cy={head.y} r={HEAD} fill={color} />
    </g>
  );
}

// ---------------------------------------------------------------- the stage ----

function scatter(n: number) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => ({ x: 40 + rnd() * 1000, y: 26 + rnd() * (FLOOR_Y - 70), rx: 10 + rnd() * 12, ry: 7 + rnd() * 7, rot: rnd() * 180, c: PROP_COLORS[Math.floor(rnd() * PROP_COLORS.length)] }));
}

function Stage({ board, tl, look, t }: { board: Storyboard; tl: BoardTimeline; look: AnimatedLook; t: number }) {
  const pts = new Map(board.points.map((q) => [q.name, q]));
  const sec = (a: At) => atSeconds(tl, a);
  const on = (from: At, to: At) => t >= sec(from) && (to.ph < 0 || t < sec(to)) && t < tl.card;
  const sweepOn = board.sweep.from.ph >= 0 && board.sweep.to.ph >= 0;
  const sweepY = sweepOn ? interpolate(t, [sec(board.sweep.from), Math.max(sec(board.sweep.from) + 0.2, sec(board.sweep.to))], [0, FLOOR_Y], clamp01) : -1;
  const sweeping = sweepOn && t >= sec(board.sweep.from) && t <= sec(board.sweep.to) + 0.15;
  const lit = (q: BoardPoint) => sweepOn && t >= sec(board.sweep.from) && sweepY >= q.y;
  const dots = scatter(board.set.scatter).filter((d) => !board.points.some((q) => Math.hypot(q.x - d.x, q.y - d.y) < 46));
  const poses = new Map(board.figures.map((f) => [f.id, figurePose(f, tl, pts, t)]));
  return (
    <svg width={1080} height={FRAME_H - STAGE_TOP} viewBox={`0 0 1080 ${FRAME_H - STAGE_TOP}`} style={{ position: "absolute", left: 0, top: STAGE_TOP }}>
      <defs>
        <linearGradient id="bsL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} /><stop offset="1" stopColor="#FFFFFF" stopOpacity={0} /></linearGradient>
        <linearGradient id="bsR" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} /><stop offset="1" stopColor="#FFFFFF" stopOpacity={0} /></linearGradient>
        <linearGradient id="bsG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={look.bg} stopOpacity={0} /><stop offset="1" stopColor={look.bg} stopOpacity={0.9} /></linearGradient>
      </defs>
      <rect x={0} y={0} width={1080} height={FRAME_H - STAGE_TOP} fill={look.surface} />
      {board.set.panels && (
        <>
          <polygon points="0,0 170,0 110,420 0,470" fill="#FFFFFF" opacity={0.06} />
          <polygon points="1080,0 900,0 965,380 1080,430" fill="#FFFFFF" opacity={0.06} />
        </>
      )}
      {board.set.spots && (
        <>
          <polygon points="0,0 300,0 120,560" fill="url(#bsL)" />
          <polygon points="1080,0 780,0 960,560" fill="url(#bsR)" />
        </>
      )}
      {dots.map((d, i) => <ellipse key={i} cx={d.x} cy={d.y} rx={d.rx} ry={d.ry} fill={d.c} opacity={0.82} transform={`rotate(${d.rot} ${d.x} ${d.y})`} />)}

      {board.shapes.map((s, i) => {
        const keys = s.keys.map((k) => ({ ...k, t: sec(k.at) })).sort((a, b) => a.t - b.t);
        const at = (f: (k: (typeof keys)[number]) => number) => (keys.length === 1 ? f(keys[0]) : interpolate(t, keys.map((k) => k.t), keys.map(f), { ...clamp01, easing: Easing.inOut(Easing.cubic) }));
        const x = at((k) => k.x), y = at((k) => k.y), w = at((k) => k.w), h = at((k) => k.h), rot = at((k) => k.rot), o = t >= tl.card ? 0 : at((k) => k.o);
        const fill = toneColor(look, s.tone);
        const turn = `rotate(${rot} ${x} ${y})`;
        if (s.shape === "ellipse") return <ellipse key={i} cx={x} cy={y} rx={w / 2} ry={h / 2} fill={fill} opacity={o} transform={turn} />;
        if (s.shape === "triangle") return <polygon key={i} points={`${x - w / 2},${y} ${x + w / 2},${y} ${x},${y - h}`} fill={fill} opacity={o} transform={turn} strokeLinejoin="round" />;
        return <rect key={i} x={x - w / 2} y={y - h} width={w} height={h} rx={Math.min(14, w / 4, h / 4)} fill={fill} opacity={o} transform={turn} />;
      })}

      {board.points.filter((q) => q.draw !== "none").map((q, i) => {
        const r = q.draw === "hold" ? 24 : 12;
        const fill = q.tone === "dim" && look.stage === "climb_wall" ? "#8C6BD8" : toneColor(look, q.tone);
        return (
          <g key={i}>
            <ellipse cx={q.x} cy={q.y} rx={r} ry={r * 0.66} fill={fill} />
            {lit(q) && <ellipse cx={q.x} cy={q.y} rx={r + 10} ry={r * 0.66 + 10} fill="none" stroke={look.accent} strokeWidth={4} />}
          </g>
        );
      })}

      {board.set.floor && (
        <>
          <rect x={0} y={FLOOR_Y} width={1080} height={FRAME_H - STAGE_TOP - FLOOR_Y} fill={look.stage === "climb_wall" ? "#2E4A8F" : look.fg} opacity={look.stage === "climb_wall" ? 1 : 0.14} />
          <rect x={0} y={FLOOR_Y} width={1080} height={6} fill="#000" opacity={0.3} />
        </>
      )}
      {/* Below the stage the ground runs on and darkens: the app sets the account's name and caption in white over this part. */}
      <rect x={0} y={STAGE_H} width={1080} height={FRAME_H - STAGE_TOP - STAGE_H} fill="url(#bsG)" />
      {sweeping && (
        <>
          <rect x={0} y={sweepY - 60} width={1080} height={60} fill={look.accent} opacity={0.1} />
          <rect x={0} y={sweepY - 3} width={1080} height={6} fill={look.accent} />
        </>
      )}

      {board.figures.map((f) => <Figure key={f.id} pose={poses.get(f.id)!} scale={f.scale} color={toneColor(look, f.tone)} />)}

      {board.links.filter((l) => on(l.from, l.to)).map((l, i) => {
        const pose = poses.get(l.figure), q = pts.get(l.point);
        const fig = board.figures.find((f) => f.id === l.figure);
        if (!pose || !q || !fig) return null;
        const k = skeleton(pose, fig.scale);
        const hand = l.hand === "rh" ? k.ra.end : k.la.end;
        // The link is for a near miss: nothing to show once the hand is on the point, or while it is nowhere near it.
        const gap = Math.hypot(hand.x - q.x, hand.y - q.y);
        if (gap < 14 || gap > 170) return null;
        const col = toneColor(look, l.tone);
        const w = tagWidth(l.label);
        const lx = Math.max(10, Math.min(1070 - w, q.x - 20));
        return (
          <g key={i}>
            <line x1={hand.x} y1={hand.y} x2={q.x} y2={q.y} stroke={col} strokeWidth={5} strokeDasharray="10 10" />
            {l.label && (
              <>
                <rect x={lx} y={Math.max(6, q.y - 112)} width={w} height={TAG_H} rx={12} fill={look.bg} stroke={col} strokeWidth={3} />
                <text x={lx + 22} y={Math.max(6, q.y - 112) + 46} fontFamily={MONO} fontWeight={700} fontSize={36} fill={col}>{l.label.toUpperCase()}</text>
              </>
            )}
          </g>
        );
      })}

      {board.markers.map((m, i) => {
        const q = pts.get(m.point);
        const at = sec(m.at);
        if (!q || t < at || t >= tl.card) return null;
        const sc = interpolate(t - at, [0, 0.1, 0.22], [0.6, 1.15, 1], clamp01);
        // Beside the point, on the side with more room.
        const x = q.x + (q.x < 540 ? -50 : 50), y = q.y - 30;
        return (
          <g key={i} transform={`translate(${Math.max(44, Math.min(1036, x))} ${Math.max(44, y)}) scale(${sc})`} opacity={fade(t, at)}>
            <circle r={32} fill={look.accent} />
            <text y={12} textAnchor="middle" fontFamily={fontFor(look.font)} fontWeight={700} fontSize={36} fill={inkOn(look.accent)}>{m.label}</text>
          </g>
        );
      })}

      {board.tags.filter((g) => on(g.from, g.to)).map((g, i) => {
        const col = toneColor(look, g.tone);
        const w = tagWidth(g.text);
        const x = Math.max(16, Math.min(1064 - w, g.x - w / 2));
        return (
          <g key={i} opacity={fade(t, sec(g.from))}>
            <rect x={x} y={g.y - TAG_H / 2} width={w} height={TAG_H} rx={12} fill={look.bg} stroke={col} strokeWidth={3} />
            <text x={x + 22} y={g.y + 13} fontFamily={MONO} fontWeight={700} fontSize={36} fill={col}>{g.text.toUpperCase()}</text>
          </g>
        );
      })}

      {board.cards.filter((c) => on(c.from, c.to)).map((c, i) => {
        const o = fade(t, sec(c.from), 0.3);
        const h = cardHeight(c.lines.length);
        const x = Math.max(20, Math.min(1060 - c.w, c.x - c.w / 2)), y = Math.max(20, Math.min(FLOOR_Y - h - 10, c.y - h / 2));
        const since = t - sec(c.from);
        return (
          <g key={i} opacity={o} transform={`translate(0 ${(1 - o) * 20})`}>
            <rect x={x} y={y} width={c.w} height={h} rx={34} fill={look.bg} stroke={look.dim} strokeWidth={2} />
            <text x={x + 40} y={y + 78} fontFamily={fontFor(look.font)} fontWeight={700} fontSize={54} fill={look.fg}>{look.upper ? c.title.toUpperCase() : c.title}</text>
            {c.lines.map((ln, k) => {
              // Lines join one after another, like a list filling in.
              const lo = interpolate(since - 0.35 - k * 0.3, [0, 0.25], [0, 1], clamp01);
              return (
                <g key={k} opacity={lo}>
                  <circle cx={x + 54} cy={y + 146 + k * 70} r={12} fill={look.key} />
                  <text x={x + 86} y={y + 160 + k * 70} fontFamily={fontFor(look.font)} fontWeight={500} fontSize={42} fill={look.fg}>{ln}</text>
                </g>
              );
            })}
          </g>
        );
      })}

      {board.stamps.map((s, i) => {
        const at = sec(s.at);
        if (t < at || t >= stampEnd(board, tl, i)) return null;
        const col = toneColor(look, s.tone);
        const w = stampWidth(s.text, look.font === "condensed");
        const sc = interpolate(t - at, [0, 0.1, 0.2, 0.3], [1, 0.85, 1.1, 1], clamp01);
        return (
          <g key={i} transform={`translate(${Math.max(w / 2 + 10, Math.min(1070 - w / 2, s.x))} ${Math.max(60, s.y)}) rotate(-6) scale(${sc})`}>
            <rect x={-w / 2} y={-48} width={w} height={92} rx={12} fill={look.bg} stroke={col} strokeWidth={7} />
            <text y={22} textAnchor="middle" fontFamily={fontFor(look.font)} fontWeight={700} fontSize={62} fill={col} letterSpacing={3}>{s.text.toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- frame ----

function Icon({ kind, color }: { kind: "chat" | "follow" | "send"; color: string }) {
  const ink = inkOn(color);
  return (
    <svg width={96} height={96} viewBox="0 0 96 96" style={{ flex: "none" }}>
      <circle cx={48} cy={48} r={48} fill={color} />
      {kind === "chat" && <path d="M28 32h40a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H46l-12 10v-10h-6a6 6 0 0 1-6-6V38a6 6 0 0 1 6-6z" fill={ink} />}
      {kind === "follow" && (
        <g fill={ink}>
          <circle cx={42} cy={38} r={10} />
          <path d="M24 70c0-11 8-18 18-18s18 7 18 18z" />
          <rect x={62} y={40} width={16} height={5} rx={2} />
          <rect x={67.5} y={34.5} width={5} height={16} rx={2} />
        </g>
      )}
      {kind === "send" && <path d="M24 48 L72 26 L60 72 L48 54 Z" fill={ink} />}
    </svg>
  );
}

export function BoardScene({ board, look, signoff, voice }: { board: Storyboard; look: AnimatedLook; signoff: string | null; voice?: { url: string; words: number[] } | null }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const tl = boardTimeline(board, voice?.words);
  const sec = (a: At) => atSeconds(tl, a);
  const font = fontFor(look.font);
  const up = (s: string) => (look.upper ? s.toUpperCase() : s);
  const inCard = t >= tl.card;

  const chapter = [...board.chapters].sort((a, b) => a.ph - b.ph).reverse().find((c) => t >= (tl.phrases[c.ph]?.start ?? 0)) ?? board.chapters[0];
  const phrase = tl.phrases.find((x) => t >= x.start && t < x.end);

  const counter = board.counter;
  const steps = counter ? counter.steps.map((s) => ({ t: sec(s.at), v: s.value })).sort((a, b) => a.t - b.t) : [];
  const step = [...steps].reverse().find((s) => t >= s.t);
  const counterGood = counter && counter.goodAt.ph >= 0 && t >= sec(counter.goodAt);
  const counterTo = counterEnd(board, tl);
  const counterOn = !!counter && !!step && t < counterTo;
  const counterO = counterOn ? interpolate(counterTo - t, [0, 0.3], [0, 1], clamp01) : 0;
  // The captions keep one width for a whole phrase: narrower whenever the counter shows during it.
  const besideCounter = !!counter && !!phrase && steps.length > 0 && steps[0].t < phrase.end && counterTo > phrase.start;
  // The chapter label and its example chip share one line: the type steps down for a long label rather than running off the frame.
  const labelChars = 3 + (chapter?.label.length ?? 0), chipChars = board.example.length;
  const labelRoom = 940 - (counterOn ? 210 : 0) - 2 * labelChars - (chipChars ? 44 + 2 * chipChars : 0);
  const labelSize = Math.max(20, Math.min(32, Math.floor(labelRoom / (0.6 * labelChars + 0.6 * 0.8 * chipChars))));

  const meter = board.meter;
  const mKeys = meter ? meter.keys.map((k) => ({ t: sec(k.at), v: k.value })).sort((a, b) => a.t - b.t) : [];
  const mVal = mKeys.length > 1 ? interpolate(t, mKeys.map((k) => k.t), mKeys.map((k) => k.v), clamp01) : mKeys[0]?.v ?? 0;
  const meterGood = meter && meter.goodAt.ph >= 0 && t >= sec(meter.goodAt);
  const mCol = meterGood ? look.accent : mVal > 70 ? BAD : look.key;

  const flash = board.flash.ph >= 0 ? interpolate(t - sec(board.flash), [0, 0.06, 0.3], [0, 0.22, 0], clamp01) : 0;
  const cardO = interpolate(t - tl.card, [0, 0.35], [0, 1], clamp01);
  const row = (i: number) => interpolate(t - tl.card - 0.45 - i * 0.45, [0, 0.3], [0, 1], { ...clamp01, easing: Easing.out(Easing.cubic) });

  // Sound: a pop on each count, a whoosh at the turn and the card, a thud with each stamp.
  const cues: { at: number; name: string; v: number }[] = [
    ...steps.map((s) => ({ at: s.t, name: "pop", v: 0.25 })),
    ...(board.flash.ph >= 0 ? [{ at: sec(board.flash), name: "whoosh", v: 0.45 }] : []),
    ...board.stamps.map((s) => ({ at: sec(s.at), name: "stamp", v: 0.7 })),
    { at: tl.card, name: "whoosh", v: 0.35 },
    ...board.end.rows.map((_, i) => ({ at: tl.card + 0.45 + i * 0.45, name: "pop", v: 0.3 })),
  ];

  return (
    <AbsoluteFill style={{ background: look.bg, color: look.fg }}>
      {voice?.url && <Audio src={voice.url} />}
      {cues.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * fps))} layout="none"><Audio src={`/animated/sfx/${c.name}.mp3`} volume={c.v} /></Sequence>
      ))}

      <Stage board={board} tl={tl} look={look} t={t} />

      {!inCard && chapter && (
        <div style={{ position: "absolute", left: 70, top: LABEL_TOP, display: "flex", alignItems: "center", gap: 18, fontFamily: MONO, fontSize: labelSize, fontWeight: 500, letterSpacing: 2, whiteSpace: "nowrap", textTransform: "uppercase", color: look.dim }}>
          <span>{"// "}{chapter.label}</span>
          {board.example && <span style={{ border: `2px solid ${look.dim}`, borderRadius: 6, padding: "2px 10px", fontSize: Math.round(labelSize * 0.8) }}>{board.example}</span>}
        </div>
      )}

      {!inCard && counter && step && counterOn && (
        <div style={{ position: "absolute", right: 70, top: LABEL_TOP - 22, textAlign: "right", opacity: counterO }}>
          <div style={{ fontFamily: MONO, fontSize: 28, letterSpacing: 2, color: look.dim, textTransform: "uppercase" }}>{counter.label}</div>
          <div style={{ fontFamily: font, fontWeight: 700, fontSize: 92, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: counterGood ? look.accent : look.fg, transform: `scale(${interpolate(t - step.t, [0, 0.08, 0.2], [1.25, 0.95, 1], clamp01)})`, transformOrigin: "right center" }}>{step.v.toLocaleString("en-US")}</div>
        </div>
      )}

      {!inCard && phrase && (
        <div style={{ position: "absolute", left: 70, right: besideCounter ? 230 : 70, top: CAPTION_TOP, fontFamily: font, fontWeight: 700, fontSize: look.font === "condensed" ? 106 : 84, lineHeight: 1.04, letterSpacing: look.font === "condensed" ? 0.5 : -1 }}>
          {phrase.words.map((w, i) => {
            const k = fade(t, w.t);
            return <span key={i} style={{ display: "inline-block", marginRight: "0.22em", color: w.em ? look.key : look.fg, opacity: k, transform: `translateY(${(1 - k) * 22}px)` }}>{up(w.w)}</span>;
          })}
        </div>
      )}

      {!inCard && meter && (
        <div style={{ position: "absolute", left: 50, right: 50, top: STAGE_TOP + STAGE_H + 26, height: 54, borderRadius: 27, background: look.surface, boxShadow: `inset 0 0 0 2px ${look.dim}`, overflow: "hidden" }}>
          <div style={{ width: `${mVal}%`, height: "100%", background: mCol, borderRadius: 27, opacity: 0.92 }} />
          <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, display: "flex", alignItems: "center", padding: "0 16px", borderRadius: 19, background: look.bg, fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: 2, color: look.fg, textTransform: "uppercase" }}>{meter.label}</div>
          <div style={{ position: "absolute", right: 22, top: 0, bottom: 0, display: "flex", alignItems: "center", fontFamily: MONO, fontSize: 24, fontWeight: 700, color: look.fg }}>{Math.round(mVal)}%</div>
        </div>
      )}

      <AbsoluteFill style={{ background: look.accent, opacity: flash, pointerEvents: "none" }} />

      {inCard && (
        <AbsoluteFill style={{ background: look.bg, opacity: cardO, fontFamily: font, padding: "500px 90px 0", display: "flex", flexDirection: "column", gap: 30 }}>
          {board.end.eyebrow && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: MONO, fontSize: 26, letterSpacing: 3, color: look.dim, textTransform: "uppercase" }}>
              <span style={{ width: 16, height: 16, background: look.key, display: "inline-block" }} /> {board.end.eyebrow}
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: look.font === "condensed" ? 150 : 104, lineHeight: 1.02, marginBottom: 26 }}>
            <div style={{ color: look.fg }}>{up(board.end.title[0])}</div>
            <div style={{ color: look.key }}>{up(board.end.title[1])}</div>
          </div>
          {board.end.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, opacity: row(i), transform: `translateY(${(1 - row(i)) * 24}px)` }}>
              <Icon kind={r.icon} color={look.accent} />
              <div style={{ fontWeight: 700, fontSize: look.font === "condensed" ? 50 : 40, lineHeight: 1.08 }}>
                <div style={{ color: look.fg }}>{up(r.a)}</div>
                {r.b && <div style={{ color: look.key }}>{up(r.b)}</div>}
              </div>
            </div>
          ))}
          {signoff && <div style={{ marginTop: 10, textAlign: "center", fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: 2, color: look.dim, opacity: row(board.end.rows.length) }}>{signoff}</div>}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
