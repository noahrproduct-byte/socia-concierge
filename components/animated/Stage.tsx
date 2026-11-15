// Stages and characters an account's own videos are built on (lib/animated/look.ts).
// The first kit, after Beta Twin's Reels: a navy indoor bouldering wall with
// scattered colourful oval holds, angled side panels and a mat strip, and a
// white stick-figure climber with round joints who moves between poses. Drawn
// as flat 2D vector shapes, like the account's own; nothing is copied from it.
import { Easing, interpolate } from "remotion";
import type { AnimatedLook } from "@/lib/animated/look";

/** Hold colours of an indoor gym: the wall's own variety, not the brand palette. */
const HOLD_COLORS = ["#E8504A", "#F2C230", "#5BBE5F", "#3E8EDC", "#9B6BD8", "#F08A3C", "#E46AA6", "#F4F1EA"];

/** A fixed scatter of holds: the same wall in every frame of every video. */
function holds(width: number, height: number) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 64 }, () => ({
    x: 40 + rnd() * (width - 80),
    y: 30 + rnd() * (height - 120),
    rx: 9 + rnd() * 13,
    ry: 6 + rnd() * 8,
    rot: rnd() * 180,
    c: HOLD_COLORS[Math.floor(rnd() * HOLD_COLORS.length)],
  }));
}

export function ClimbWall({ look, top, height, children }: { look: AnimatedLook; top: number; height: number; children?: React.ReactNode }) {
  const width = 1080;
  const hs = holds(width, height);
  return (
    <svg width={width} height={height} style={{ position: "absolute", left: 0, top }} viewBox={`0 0 ${width} ${height}`}>
      <rect x={0} y={0} width={width} height={height} fill={look.surface} />
      {/* Angled panels at the sides, as an indoor wall's volumes. */}
      <polygon points={`0,0 150,0 90,${height * 0.55} 0,${height * 0.62}`} fill="#FFFFFF" opacity={0.06} />
      <polygon points={`${width},0 ${width - 170},0 ${width - 110},${height * 0.5} ${width},${height * 0.58}`} fill="#FFFFFF" opacity={0.06} />
      <polygon points={`0,${height * 0.62} 90,${height * 0.55} 120,${height - 60} 0,${height - 60}`} fill="#000000" opacity={0.12} />
      {hs.map((h, i) => (
        <ellipse key={i} cx={h.x} cy={h.y} rx={h.rx} ry={h.ry} fill={h.c} opacity={0.9} transform={`rotate(${h.rot} ${h.x} ${h.y})`} />
      ))}
      {/* The mat along the bottom. */}
      <rect x={0} y={height - 60} width={width} height={60} fill="#2E4A8F" opacity={0.85} />
      <rect x={0} y={height - 60} width={width} height={6} fill="#000000" opacity={0.25} />
      {children}
    </svg>
  );
}

/** Joint angles, in degrees from straight down: upper and lower arm, upper and lower leg, left and right. */
type Pose = { la: [number, number]; ra: [number, number]; ll: [number, number]; rl: [number, number]; lean: number };

export const POSES: Record<"stand" | "reachL" | "reachR" | "hang" | "send" | "fall", Pose> = {
  stand: { la: [20, 10], ra: [-20, -10], ll: [8, 0], rl: [-8, 0], lean: 0 },
  reachL: { la: [165, 175], ra: [-60, -20], ll: [30, -20], rl: [-15, 10], lean: -4 },
  reachR: { la: [60, 20], ra: [-165, -175], ll: [15, -10], rl: [-30, 20], lean: 4 },
  hang: { la: [160, 170], ra: [-160, -170], ll: [35, -30], rl: [-35, 30], lean: 0 },
  send: { la: [140, 150], ra: [-140, -150], ll: [10, 0], rl: [-10, 0], lean: 0 },
  fall: { la: [120, 70], ra: [-70, -120], ll: [60, 10], rl: [-30, -40], lean: 28 },
};

const mix = (a: Pose, b: Pose, t: number): Pose => {
  const m = (x: number, y: number) => x + (y - x) * t;
  const mm = (x: [number, number], y: [number, number]): [number, number] => [m(x[0], y[0]), m(x[1], y[1])];
  return { la: mm(a.la, b.la), ra: mm(a.ra, b.ra), ll: mm(a.ll, b.ll), rl: mm(a.rl, b.rl), lean: m(a.lean, b.lean) };
};

/** Where a limb ends: from (x, y), two segments at the given angles (0 = straight down, 180 = straight up). */
function limb(x: number, y: number, [a1, a2]: [number, number], len: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const ex = x + Math.sin(r(a1)) * len, ey = y + Math.cos(r(a1)) * len;
  const hx = ex + Math.sin(r(a2)) * len, hy = ey + Math.cos(r(a2)) * len;
  return { ex, ey, hx, hy };
}

/** The climber, `size` pixels tall, standing at (x, y) = the hips. `from` to `to` pose, eased by `t`. */
export function StickClimber({ x, y, from, to, t, size = 220, color = "#F4F2EE", joint = "#B8B8BC" }: { x: number; y: number; from: Pose; to: Pose; t: number; size?: number; color?: string; joint?: string }) {
  const p = mix(from, to, Easing.inOut(Easing.cubic)(Math.max(0, Math.min(1, t))));
  const torso = size * 0.32, seg = size * 0.19, legSeg = size * 0.22, head = size * 0.09, w = size * 0.05;
  const sx = x + Math.sin((p.lean * Math.PI) / 180) * torso, sy = y - Math.cos((p.lean * Math.PI) / 180) * torso;
  const la = limb(sx, sy, [p.la[0] + p.lean, p.la[1] + p.lean], seg);
  const ra = limb(sx, sy, [p.ra[0] + p.lean, p.ra[1] + p.lean], seg);
  const ll = limb(x, y, p.ll, legSeg);
  const rl = limb(x, y, p.rl, legSeg);
  const line = { stroke: color, strokeWidth: w, strokeLinecap: "round" as const, fill: "none" };
  const dot = (cx: number, cy: number, k: number) => <circle key={k} cx={cx} cy={cy} r={w * 0.75} fill={joint} />;
  return (
    <g>
      <line x1={x} y1={y} x2={sx} y2={sy} {...line} />
      <polyline points={`${sx},${sy} ${la.ex},${la.ey} ${la.hx},${la.hy}`} {...line} />
      <polyline points={`${sx},${sy} ${ra.ex},${ra.ey} ${ra.hx},${ra.hy}`} {...line} />
      <polyline points={`${x},${y} ${ll.ex},${ll.ey} ${ll.hx},${ll.hy}`} {...line} />
      <polyline points={`${x},${y} ${rl.ex},${rl.ey} ${rl.hx},${rl.hy}`} {...line} />
      <rect x={x - w * 1.2} y={y - w * 0.9} width={w * 2.4} height={w * 1.2} rx={w * 0.4} fill={joint} />
      {[dot(la.ex, la.ey, 1), dot(ra.ex, ra.ey, 2), dot(ll.ex, ll.ey, 3), dot(rl.ex, rl.ey, 4)]}
      <circle cx={sx + Math.sin((p.lean * Math.PI) / 180) * head * 1.6} cy={sy - head * 1.5} r={head} fill={color} />
    </g>
  );
}

/**
 * A climber going up the wall as `progress` goes from 0 to 1 (seconds `t` for
 * the move rhythm): alternating reaches while moving, hanging while held, arms
 * up at the top.
 */
export function ClimbingFigure({ progress, t, held, height, x = 540, size = 210 }: { progress: number; t: number; held: boolean; height: number; x?: number; size?: number }) {
  const floor = height - 60 - size * 0.42;
  const top = size * 0.75;
  const y = interpolate(Math.max(0, Math.min(1, progress)), [0, 1], [floor, top]);
  const sway = Math.sin(t * 2.2) * 26;
  const beat = (t * 1.6) % 2;
  const atTop = progress >= 0.995;
  const [from, to, k] = atTop && held
    ? [POSES.hang, POSES.send, Math.min(1, (t % 1.5) * 2)] as const
    : held
      ? [POSES.hang, POSES.hang, 1] as const
      : progress < 0.02
        ? [POSES.stand, POSES.stand, 1] as const
        : beat < 1 ? [POSES.reachL, POSES.reachR, beat] as const : [POSES.reachR, POSES.reachL, beat - 1] as const;
  return <StickClimber x={x + (held ? 0 : sway)} y={y} from={from} to={to} t={k} size={size} />;
}
