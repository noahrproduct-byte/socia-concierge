import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import { BLOCKS, CHECK, CHUNKS, FPS, SCENE_BLOCK, T } from "./story";

const jak = loadFont("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${jak.fontFamily}, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

const BG = "#090a1a";
const PINK = "#ff4fd8";
const AMBER = "#ffc247";
const CYAN = "#3fd8f0";
const VIOLET = "#9b6bff";
const GREEN = "#3cf08a";

/* ───────────── time helpers ───────────── */

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = ease(t, at, 0.35);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 12 + (1 - pout) * 10}px)`, transform: `scale(${0.95 + 0.05 * pin})` }}>{children}</div>
  );
};

/* ───────────── ground: night sky, colour haze, perspective floor ───────────── */

const STARS = Array.from({ length: 70 }, (_, i) => ({ x: (i * 397) % 1080, y: (i * 613) % 1100, r: 1 + (i % 3) * 0.6 }));
const Ground: React.FC = () => {
  const t = useT();
  const d = (a: number, s: number) => Math.sin(t * s + a) * 40;
  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -150 + d(0, 0.2), top: 300, width: 700, height: 700, borderRadius: "50%", background: "rgba(120,60,200,0.35)", filter: "blur(150px)" }} />
      <div style={{ position: "absolute", right: -150 + d(1, 0.25), top: 500, width: 650, height: 650, borderRadius: "50%", background: "rgba(20,160,180,0.3)", filter: "blur(150px)" }} />
      <div style={{ position: "absolute", left: 100 + d(2, 0.2), top: 1350, width: 800, height: 500, borderRadius: "50%", background: "rgba(200,40,140,0.28)", filter: "blur(150px)" }} />
      {STARS.map((s, i) => <div key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, borderRadius: s.r, background: "#fff", opacity: 0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + i)) }} />)}
      <svg style={{ position: "absolute", left: 0, top: 1150 }} width={1080} height={770}>
        {Array.from({ length: 13 }).map((_, i) => {
          const x = -1200 + i * 290;
          return <line key={`v${i}`} x1={540} y1={-200} x2={x} y2={770} stroke="rgba(90,170,255,0.18)" strokeWidth={2} />;
        })}
        {Array.from({ length: 8 }).map((_, i) => {
          const y = Math.pow(((i + ((t * 0.25) % 1)) / 8), 2) * 770;
          return <line key={`h${i}`} x1={0} y1={y} x2={1080} y2={y} stroke="rgba(90,170,255,0.16)" strokeWidth={2} />;
        })}
      </svg>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(9,10,26,0) 55%, rgba(9,10,26,0.6) 100%)" }} />
    </AbsoluteFill>
  );
};

/* ───────────── the glass slab (true CSS 3D) ───────────── */

const Slab: React.FC<{ n: number; label: string; c: string; w?: number; h?: number; d?: number; dim?: number; check?: number }> = ({ n, label, c, w = 760, h = 96, d = 120, dim = 1, check = 0 }) => {
  const face = (extra: React.CSSProperties): React.CSSProperties => ({ position: "absolute", border: `2px solid ${c}`, boxShadow: `0 0 24px ${c}66, inset 0 0 30px ${c}40`, ...extra });
  return (
    <div style={{ position: "relative", width: w, height: h, transformStyle: "preserve-3d", opacity: dim }}>
      {/* top */}
      <div style={face({ left: 0, top: 0, width: w, height: d, transformOrigin: "top", transform: `rotateX(90deg) translateZ(0px)`, background: `linear-gradient(90deg, ${c}55, ${c}22)`, borderRadius: 14 })} />
      {/* right end */}
      <div style={face({ left: w, top: 0, width: d, height: h, transformOrigin: "left", transform: "rotateY(90deg)", background: `${c}33`, borderRadius: 14 })} />
      {/* front */}
      <div style={face({ left: 0, top: 0, width: w, height: h, transform: `translateZ(${d}px)`, background: `linear-gradient(90deg, ${c}66, ${c}2a 70%, ${c}44)`, borderRadius: 14, display: "flex", alignItems: "center", padding: "0 26px", gap: 18, backdropFilter: "blur(4px)" })}>
        <span style={{ fontFamily: MONO, fontSize: h * 0.2, color: "rgba(255,255,255,0.7)" }}>{String(n).padStart(2, "0")}</span>
        <span style={{ fontFamily: SANS, fontSize: h * 0.4, fontWeight: 800, color: "#fff", textShadow: `0 0 12px ${c}` }}>{label}</span>
        <span style={{ marginLeft: "auto", width: h * 0.16, height: h * 0.16, borderRadius: "50%", background: c, boxShadow: `0 0 14px ${c}` }} />
        {check > 0 ? <span style={{ marginLeft: 12, transform: `scale(${check})`, width: h * 0.42, height: h * 0.42, borderRadius: "50%", background: GREEN, color: "#062", fontWeight: 800, fontSize: h * 0.28, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS }}>✓</span> : null}
      </div>
    </div>
  );
};

/** The stack: slabs drop in on their times; `lit` dims the others. */
const Stack: React.FC<{ x: number; y: number; scale?: number; gap?: number; showFrom?: number; lit?: number[]; checkFrom?: number; rot?: number }> = ({ x, y, scale = 1, gap = 122, showFrom, lit, checkFrom, rot = 1 }) => {
  const t = useT();
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `scale(${scale})`, transformOrigin: "top left", perspective: 1600 }}>
      <div style={{ transformStyle: "preserve-3d", transform: `rotateX(${-18 * rot}deg) rotateY(${-16 * rot}deg) rotateZ(${2 * rot}deg)` }}>
        {BLOCKS.map((b, i) => {
          const at = showFrom == null ? b.at : showFrom + i * 0.05;
          const p = popE(t, at, 0.4);
          if (p <= 0) return null;
          const dim = lit ? (lit.includes(i) ? 1 : 0.32) : 1;
          const ck = checkFrom != null ? popE(t, checkFrom + i * 0.09, 0.3) : 0;
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: i * gap, opacity: Math.min(1, p), transform: `translateY(${(1 - p) * -80}px)`, transformStyle: "preserve-3d" }}>
              <Slab n={i + 1} label={b.k} c={b.c} dim={dim} check={ck} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ───────────── chrome: intro header, progress bar, scene titles, caption ───────────── */

const IntroHeader: React.FC = () => {
  const t = useT();
  if (t > T.perfect + 0.3) return null;
  const n = BLOCKS.reduce((v, b, i) => (t >= b.at ? i + 1 : v), 1);
  const out = 1 - ease(t, T.perfect - 0.1, 0.3);
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 150, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: out }}>
      <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: "rgba(255,255,255,0.8)" }}>SHORT-FORM · STRUCTURE</span>
      <span style={{ fontFamily: SANS, fontSize: 60, fontWeight: 800, color: "#fff", textShadow: `0 0 20px ${CYAN}` }}>{String(n).padStart(2, "0")}<span style={{ color: CYAN }}>/08</span></span>
    </div>
  );
};

const Progress: React.FC = () => {
  const t = useT();
  if (t < T.hook - 0.2 || t > T.eight) return null;
  const cur = SCENE_BLOCK.reduce((v, [at, i]) => (t >= at ? i : v), 0);
  const vis = Math.min(ease(t, T.hook - 0.2, 0.3), 1 - ease(t, T.eight - 0.25, 0.25));
  return (
    <div style={{ position: "absolute", left: 140, right: 140, top: 150, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: "5px 10px", display: "flex", gap: 10, opacity: vis }}>
      {BLOCKS.map((b, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 4, background: i <= cur ? b.c : "rgba(255,255,255,0.12)", boxShadow: i === cur ? `0 0 12px ${b.c}` : "none", opacity: i < cur ? 0.6 : 1 }} />
      ))}
    </div>
  );
};

const Title: React.FC<{ text: React.ReactNode; c: string; c2?: string; at: number; until: number; size?: number }> = ({ text, c, c2, at, until, size = 160 }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const p = ease(t, at, 0.4);
  const out = 1 - ease(t, until - 0.22, 0.22);
  return (
    // gradient-clipped text can't carry its own filter, so the glow and blur sit on a wrapper
    <div style={{ position: "absolute", left: 0, right: 0, top: 230, opacity: Math.min(p, out), filter: `blur(${(1 - p) * 14}px) drop-shadow(0 0 30px ${c}aa)`, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: size, letterSpacing: -4, lineHeight: 1.15, background: `linear-gradient(180deg, #fff 10%, ${c} 55%, ${c2 ?? c})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{text}</div>
    </div>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  const idx = CHUNKS.reduce((v, ch, i) => (t >= ch.at - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ch = CHUNKS[idx];
  const next = CHUNKS[idx + 1];
  const p = ease(t, ch.at, 0.22);
  const out = next ? ease(t, next.at - 0.1, 0.08) : 0;
  const words = ch.text.split(" ");
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1340, display: "flex", justifyContent: "center" }}>
      <div style={{ opacity: Math.min(p, 1 - out), transform: `translateY(${(1 - p) * 10}px) scale(${0.96 + 0.04 * p})`, filter: `blur(${(1 - p) * 4}px)`, background: "rgba(14,14,34,0.82)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 26, padding: "12px 30px 16px", fontFamily: SANS, fontWeight: 800, fontSize: 52, color: "#fff", letterSpacing: -0.6, boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
        {words.map((w, i) => (
          <span key={i} style={{ position: "relative", marginRight: i < words.length - 1 ? "0.25em" : 0 }}>
            {w}
            {ch.em === i ? <span style={{ position: "absolute", left: 0, right: 0, bottom: -6, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${ch.c}, ${CYAN})`, transform: `scaleX(${ease(t, ch.at + 0.05, 0.25)})`, transformOrigin: "left" }} /> : null}
          </span>
        ))}
      </div>
    </div>
  );
};

const Chip: React.FC<{ at: number; c: string; text: string; x?: number; y: number }> = ({ at, c, text, x, y }) => {
  const t = useT();
  const p = popE(t, at, 0.35);
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", top: y, left: x ?? 0, right: x == null ? 0 : undefined, display: "flex", justifyContent: "center" }}>
      <div style={{ transform: `scale(${p})`, display: "flex", alignItems: "center", gap: 12, background: "rgba(18,16,40,0.9)", border: `2px solid ${c}88`, borderRadius: 30, padding: "10px 24px", fontFamily: SANS, fontWeight: 700, fontSize: 30, color: "#fff", boxShadow: `0 0 20px ${c}44` }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: c, boxShadow: `0 0 10px ${c}` }} />{text}
      </div>
    </div>
  );
};

/* ───────────── scenes ───────────── */

const IntroScene: React.FC = () => (
  <Beat at={0} until={T.perfect}>
    <Stack x={120} y={300} />
  </Beat>
);

const PerfectScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.perfect} until={T.hook}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 160, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 104, lineHeight: 1.05, letterSpacing: -3, color: "#fff", textShadow: `0 0 30px ${CYAN}88` }}>
        <span style={{ color: CYAN }}>The perfect</span><br /><span style={{ opacity: ease(t, 5.77, 0.3) }}>structure</span>
      </div>
      <Chip at={6.24} c={PINK} text="for short-form content" y={430} />
      <Stack x={300} y={590} scale={0.62} gap={122} showFrom={T.perfect} />
    </Beat>
  );
};

const FEED = [0, 1, 2, 3, 4];
const HookScene: React.FC = () => {
  const t = useT();
  const scroll = (t - T.hook) * 160;
  const slam = popE(t, T.breaks, 0.4);
  return (
    <>
      <Title text="Hook" c={PINK} at={T.hook} until={T.lead} />
      <Beat at={T.hook} until={T.lead}>
        <div style={{ position: "absolute", left: 300, top: 480, perspective: 1400 }}>
          <div style={{ transform: "rotateY(-18deg) rotateX(8deg)", transformStyle: "preserve-3d" }}>
            {FEED.map((i) => (
              <div key={i} style={{ position: "absolute", left: 0, top: ((i * 230 - scroll) % 1150 + 1150) % 1150 - 100, width: 560, height: 190, borderRadius: 22, background: "rgba(150,160,220,0.14)", border: "2px solid rgba(180,190,255,0.3)", padding: 26 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}><div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(255,255,255,0.25)" }} /><div style={{ width: 220, height: 14, borderRadius: 7, background: "rgba(255,255,255,0.25)" }} /></div>
                <div style={{ marginTop: 26, width: 420, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.16)" }} />
                <div style={{ marginTop: 14, width: 300, height: 12, borderRadius: 6, background: "rgba(255,255,255,0.12)" }} />
              </div>
            ))}
          </div>
        </div>
        {slam > 0 ? (
          <div style={{ position: "absolute", left: 30, top: 720, transform: `rotate(-8deg) scale(${0.6 + 0.4 * slam})`, opacity: Math.min(1, slam * 1.5), width: 560, height: 170, borderRadius: 24, background: `linear-gradient(90deg, ${PINK}, #ff7ae6)`, boxShadow: `0 0 60px ${PINK}aa`, display: "flex", alignItems: "center", padding: "0 40px", fontFamily: SANS, fontWeight: 800, fontSize: 76, color: "#fff" }}>Wait, what?</div>
        ) : null}
        <Chip at={T.breaks + 0.25} c={PINK} text="breaks the pattern" x={150} y={1010} />
      </Beat>
    </>
  );
};

const LeadScene: React.FC = () => {
  const t = useT();
  const secs = interpolate(t, [T.clockFrom, T.tenMark, T.notOff + 0.3], [0, 10, 15], clamp);
  const anchored = t >= T.anchored;
  const curve = (u: number) => `M 40 70 C 120 ${70 + 150 * Math.min(1, u)}, 260 ${210}, ${40 + 620 * u} ${215 - 5 * u}`;
  return (
    <>
      <Title text="Lead" c={AMBER} at={T.lead} until={T.body} />
      <Beat at={T.lead} until={T.body}>
        <div style={{ position: "absolute", left: 120, right: 120, top: 520, height: 520, borderRadius: 30, background: "linear-gradient(160deg, rgba(40,60,140,0.75), rgba(20,30,80,0.85))", border: `3px solid ${anchored ? AMBER : "rgba(255,255,255,0.18)"}`, boxShadow: anchored ? `0 0 60px ${AMBER}77` : "0 20px 60px rgba(0,0,0,0.4)", padding: 34, fontFamily: SANS, color: "#fff", transform: "perspective(1400px) rotateY(-8deg) rotateX(4deg)" }}>
          <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: 3, color: "rgba(255,255,255,0.7)" }}>VIEWER RETENTION</div>
          <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>{secs.toFixed(1)}<span style={{ fontSize: 60, color: AMBER }}>s</span></div>
          {anchored ? <div style={{ position: "absolute", right: 34, top: 80, transform: `scale(${popE(t, T.anchored)})`, background: AMBER, color: "#2a1b00", borderRadius: 12, padding: "8px 16px", fontSize: 26, fontWeight: 800 }}>🔒 anchored</div> : null}
          <svg style={{ position: "absolute", left: 30, top: 230 }} width={760} height={260}>
            <line x1={440} y1={10} x2={440} y2={240} stroke={AMBER} strokeWidth={3} strokeDasharray="8 8" opacity={0.8} />
            <path d={curve(Math.min(1, secs / 15))} stroke="#fff" strokeWidth={6} fill="none" style={{ filter: "drop-shadow(0 0 8px #fff)" }} />
            <circle cx={40 + 620 * Math.min(1, secs / 15)} cy={215 - 5 * Math.min(1, secs / 15)} r={13} fill="#fff" />
            <text x={30} y={258} fill="rgba(255,255,255,0.6)" fontFamily={MONO} fontSize={22}>0s</text>
            <text x={420} y={258} fill={AMBER} fontFamily={MONO} fontSize={22}>10s</text>
          </svg>
        </div>
        <Chip at={T.tenMark - 0.2} c={AMBER} text="pulls them to 10s" x={140} y={1100} />
        <Chip at={T.notOff} c={GREEN} text="not scrolling off" x={560} y={1170} />
      </Beat>
    </>
  );
};

const BodyScene: React.FC = () => {
  const t = useT();
  const spin = (t - T.body) * 40;
  return (
    <>
      <Title text="Body 1" c={CYAN} at={T.body} until={T.loop} />
      <Beat at={T.body} until={T.loop}>
        {[0, 1, 2].map((k) => (
          <div key={k} style={{ position: "absolute", left: 540 - (180 + k * 110), top: 1010 - (40 + k * 25), width: 2 * (180 + k * 110), height: 2 * (40 + k * 25), borderRadius: "50%", border: `3px solid ${CYAN}${["cc", "88", "44"][k]}`, boxShadow: `0 0 20px ${CYAN}55` }} />
        ))}
        <div style={{ position: "absolute", left: 540 - 150, top: 560, width: 300, height: 300, perspective: 1200 }}>
          <div style={{ position: "relative", width: 300, height: 300, transformStyle: "preserve-3d", transform: `rotateX(-20deg) rotateY(${spin}deg) translateY(${Math.sin(t * 2) * 12}px)` }}>
            {[0, 90, 180, 270].map((r) => (
              <div key={r} style={{ position: "absolute", inset: 0, transform: `rotateY(${r}deg) translateZ(150px)`, background: `linear-gradient(160deg, ${CYAN}55, ${CYAN}22)`, border: `3px solid ${CYAN}`, borderRadius: 30, boxShadow: `inset 0 0 40px ${CYAN}66`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: 64, color: "#fff", textShadow: `0 0 16px ${CYAN}`, transformOrigin: "center", backfaceVisibility: "hidden" }}>VALUE</div>
            ))}
            <div style={{ position: "absolute", inset: 0, transform: "rotateX(90deg) translateZ(150px)", background: `${CYAN}33`, border: `3px solid ${CYAN}`, borderRadius: 30 }} />
          </div>
        </div>
        <Chip at={T.value} c={CYAN} text="your first piece of value" y={1130} />
      </Beat>
    </>
  );
};

const LoopScene: React.FC = () => {
  const t = useT();
  const open = interpolate(t, [T.loop, T.stay], [0.15, 0.78], clamp);
  const closeP = ease(t, T.stay, T.closeIt - T.stay + 0.4, Easing.inOut(Easing.cubic));
  const frac = open + (1 - open) * closeP;
  const r = 170, cx = 540, cy = 720;
  const a1 = -Math.PI / 2 + frac * Math.PI * 2;
  const arc = frac >= 0.999 ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}` : `M ${cx} ${cy - r} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  const quote = "“But that's not the craziest part...”";
  const curiosity = interpolate(t, [T.oneLine, T.quoteTo, T.stay, T.closeIt + 0.4], [0.1, 0.9, 0.9, 1], clamp);
  return (
    <>
      <Title text="Open loop" c={VIOLET} c2={PINK} at={T.loop} until={T.repeat} />
      <Beat at={T.loop} until={T.repeat}>
        <svg style={{ position: "absolute", inset: 0 }} width={1080} height={1920}>
          <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={PINK} /><stop offset="1" stopColor={VIOLET} /></linearGradient></defs>
          <circle cx={cx} cy={cy} r={r} fill="rgba(10,10,30,0.6)" stroke="rgba(255,255,255,0.08)" strokeWidth={14} />
          <path d={arc} stroke="url(#lg)" strokeWidth={14} fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 14px ${VIOLET})` }} />
          <circle cx={cx + r * Math.cos(a1)} cy={cy + r * Math.sin(a1)} r={16} fill="#fff" style={{ filter: "drop-shadow(0 0 10px #fff)" }} />
          <text x={cx} y={cy + 70} textAnchor="middle" fontFamily={SANS} fontWeight={800} fontSize={210} fill="#fff" style={{ filter: `drop-shadow(0 0 20px ${VIOLET})` }}>{closeP >= 0.98 ? "!" : "?"}</text>
        </svg>
        <div style={{ position: "absolute", left: 110, right: 110, top: 960, height: 230, borderRadius: 26, background: "linear-gradient(110deg, rgba(160,40,160,0.55), rgba(40,40,110,0.6))", border: `2px solid ${VIOLET}88`, padding: "22px 30px", fontFamily: SANS, color: "#fff", opacity: ease(t, T.oneLine, 0.3) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: MONO, fontSize: 20, letterSpacing: 3, color: "rgba(255,255,255,0.7)" }}>
            <span>ONE LINE</span>
            <span style={{ display: "flex", alignItems: "center", gap: 12, color: "#c9b4ff" }}>CURIOSITY<span style={{ width: 160, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.15)", position: "relative" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${curiosity * 100}%`, borderRadius: 5, background: `linear-gradient(90deg, ${PINK}, ${VIOLET})` }} /></span></span>
          </div>
          <div style={{ marginTop: 34, fontSize: 44, fontWeight: 800 }}>{typed(t, quote, T.quoteFrom, T.quoteTo)}</div>
        </div>
      </Beat>
    </>
  );
};

const RepeatScene: React.FC = () => {
  const t = useT();
  const lit = t >= T.last ? [6] : t >= T.x2 ? [2, 3, 4, 5] : t >= T.x1 ? [2, 3] : [2, 3, 4, 5];
  const Brace: React.FC<{ at: number; y: number; h: number; label: string }> = ({ at, y, h, label }) => {
    const p = popE(t, at, 0.35);
    if (p <= 0) return null;
    return (
      <div style={{ position: "absolute", left: 840, top: y, height: h, display: "flex", alignItems: "center", gap: 14, transform: `scale(${p})`, transformOrigin: "left center" }}>
        <div style={{ width: 14, height: h, borderRadius: 7, border: `3px solid ${CYAN}`, borderLeft: "none", boxShadow: `0 0 14px ${CYAN}` }} />
        <div style={{ background: "rgba(18,16,40,0.9)", border: `2px solid ${CYAN}88`, borderRadius: 24, padding: "8px 18px", fontFamily: SANS, fontWeight: 800, fontSize: 30, color: "#fff" }}>{label}</div>
      </div>
    );
  };
  return (
    <>
      <Title text={<>Repeat <span style={{ color: VIOLET }}>×2</span></>} c={VIOLET} at={T.repeat} until={T.cta} size={140} />
      <Beat at={T.repeat} until={T.cta}>
        <Stack x={150} y={500} scale={0.78} gap={104} showFrom={T.repeat} lit={lit} rot={0.6} />
        <Brace at={T.x1} y={655} h={150} label="×1" />
        <Brace at={T.x2} y={820} h={150} label="×2" />
        <Brace at={T.last} y={985} h={70} label="last body" />
      </Beat>
    </>
  );
};

const AVATARS = [
  { i: "A", c: "#ff8fa3" }, { i: "J", c: "#ffc247" }, { i: "M", c: "#7cd4ff" }, { i: "S", c: "#b39dff" }, { i: "K", c: "#7cf0b0" },
  { i: "L", c: "#ff9f6b" }, { i: "R", c: "#ffd27e" }, { i: "D", c: "#9fb8ff" }, { i: "N", c: "#ff7ae6" },
];
const CtaScene: React.FC = () => {
  const t = useT();
  const rings = [{ y: 640, rx: 330, ry: 70, c: CYAN }, { y: 820, rx: 220, ry: 50, c: VIOLET }, { y: 980, rx: 120, ry: 30, c: GREEN }];
  return (
    <>
      <Title text="CTA" c={GREEN} c2={CYAN} at={T.cta} until={T.eight} />
      <Beat at={T.cta} until={T.eight}>
        {rings.map((r, i) => (
          <div key={i} style={{ position: "absolute", left: 540 - r.rx, top: r.y - r.ry, width: r.rx * 2, height: r.ry * 2, borderRadius: "50%", border: `4px solid ${r.c}`, boxShadow: `0 0 26px ${r.c}88, inset 0 0 26px ${r.c}44`, opacity: ease(t, T.cta + 0.2 + i * 0.15, 0.3) }} />
        ))}
        {AVATARS.map((a, i) => {
          // each viewer drifts down the funnel; the warmest reach the bottom ring
          const phase = ((t - T.cta) * 0.22 + i / AVATARS.length) % 1;
          const y = 600 + phase * 440;
          const spread = interpolate(phase, [0, 1], [300, 40]);
          const x = 540 + Math.sin(i * 2.1 + t * 0.8) * spread;
          const warm = phase > 0.6;
          return (
            <div key={i} style={{ position: "absolute", left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 30, background: a.c, border: `3px solid ${warm ? AMBER : "rgba(255,255,255,0.6)"}`, boxShadow: warm ? `0 0 20px ${AMBER}` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: 26, color: "#1a1030", opacity: ease(t, T.cta + 0.3 + i * 0.05, 0.3) * (phase > 0.95 ? 0 : 1) }}>{a.i}</div>
          );
        })}
        <Chip at={T.warmest} c={AMBER} text="warmest viewers" x={110} y={500} />
        {t >= T.nextStep - 0.1 ? (
          <div style={{ position: "absolute", left: 230, right: 230, top: 1090, transform: `scale(${popE(t, T.nextStep - 0.1)})`, borderRadius: 26, background: "rgba(20,40,40,0.85)", border: `3px solid ${GREEN}`, boxShadow: `0 0 30px ${GREEN}88`, padding: "14px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: SANS, color: "#fff" }}>
            <div><div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>OF YOUR FUNNEL</div><div style={{ fontSize: 44, fontWeight: 800 }}>Next step</div></div>
            <div style={{ fontSize: 50 }}>→</div>
          </div>
        ) : null}
      </Beat>
    </>
  );
};

const EightScene: React.FC = () => {
  const t = useT();
  const saved = t >= T.save + 0.35;
  const cx = interpolate(t, [T.eight + 0.4, T.save + 0.3], [980, 640], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cy = interpolate(t, [T.eight + 0.4, T.save + 0.3], [1250, 1180], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const press = t > T.save + 0.25 && t < T.save + 0.42 ? 0.92 : 1;
  return (
    <>
      <Title text={<><span style={{ color: CYAN }}>8</span> blocks</>} c={CYAN} at={T.eight} until={T.socia} size={150} />
      <Beat at={T.eight} until={T.socia}>
        <Stack x={260} y={470} scale={0.66} gap={112} showFrom={T.eight} rot={0.8} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 1110, display: "flex", justifyContent: "center", opacity: ease(t, T.eight + 0.5, 0.3) }}>
          <div style={{ transform: `scale(${press})`, display: "flex", alignItems: "center", gap: 16, borderRadius: 28, padding: "18px 44px", background: saved ? "rgba(30,60,60,0.9)" : "rgba(30,30,60,0.8)", border: `3px solid ${saved ? GREEN : "rgba(255,255,255,0.25)"}`, boxShadow: saved ? `0 0 30px ${GREEN}88` : "none", fontFamily: SANS, fontWeight: 800, fontSize: 44, color: "#fff" }}>
            <span>{saved ? "🔖" : "🔖"}</span>{saved ? "Saved" : "Save this"}
          </div>
        </div>
        <svg style={{ position: "absolute", left: cx, top: cy }} width={46} height={54} viewBox="0 0 17 20"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="#fff" stroke="#111" strokeWidth={1.2} /></svg>
      </Beat>
    </>
  );
};

const SociaMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#fff", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: size * 0.52, boxShadow: `0 0 ${size * 0.5}px ${VIOLET}aa` }}>S</div>
);

const SociaScene: React.FC = () => {
  const t = useT();
  const following = t >= T.follow + 0.2;
  const word = typed(t, "SOCIA", T.comment + 0.05, T.comment + 0.4);
  const posted = t >= T.comment + 0.5;
  return (
    <>
      <Beat at={T.socia} until={999}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 220, display: "flex", justifyContent: "center", alignItems: "center", gap: 30 }}>
          <div style={{ transform: `scale(${popE(t, T.socia + 0.05, 0.45)})` }}><SociaMark size={150} /></div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 130, letterSpacing: -4, color: "#fff", textShadow: `0 0 40px ${VIOLET}` }}>SOCIA</div>
        </div>
        <div style={{ position: "absolute", left: 120, right: 120, top: 470, borderRadius: 28, background: "rgba(24,20,56,0.85)", border: `2px solid ${VIOLET}66`, boxShadow: `0 0 40px ${VIOLET}33`, padding: "22px 30px", fontFamily: SANS, color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 28, fontWeight: 800 }}>video check</span>
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, letterSpacing: 2, color: "#8a5a00", background: "#fde9b8", borderRadius: 8, padding: "3px 10px" }}>EXAMPLE</span>
          </div>
          {CHECK.map(([name, score], i) => {
            const at = T.check + i * 0.18;
            const g = ease(t, at, 0.35);
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18 }}>
                <span style={{ width: 130, fontSize: 26, fontWeight: 700 }}>{name}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 7, background: "rgba(255,255,255,0.1)" }}><div style={{ width: `${score * g}%`, height: 14, borderRadius: 7, background: `linear-gradient(90deg, ${BLOCKS[[0, 3, 2, 7][i]].c}, ${CYAN})` }} /></div>
                <span style={{ width: 50, fontSize: 26, fontWeight: 800, textAlign: "right" }}>{Math.round(score * g)}</span>
                <span style={{ width: 36, height: 36, borderRadius: 18, background: GREEN, color: "#062", fontWeight: 800, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${popE(t, at + 0.3)})` }}>✓</span>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 120, right: 120, top: 860, display: "flex", gap: 22 }}>
          <div style={{ flex: 1, borderRadius: 26, padding: "20px 0", textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 42, color: following ? "#fff" : "#111", background: following ? "rgba(40,30,80,0.9)" : "#fff", border: `3px solid ${following ? VIOLET : "#fff"}`, transform: `scale(${popE(t, T.follow - 0.15)})`, boxShadow: following ? `0 0 26px ${VIOLET}88` : "none" }}>{following ? "✓ Following" : "+ Follow"}</div>
        </div>
        <div style={{ position: "absolute", left: 120, right: 120, top: 1000, borderRadius: 26, background: "rgba(255,255,255,0.96)", padding: "18px 24px", fontFamily: SANS, color: "#111", opacity: ease(t, T.comment - 0.2, 0.3) }}>
          {posted ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, marginBottom: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 23, background: "#d8dde4" }} /><b>you</b> SOCIA
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, borderTop: posted ? "1px solid #e5e5e5" : "none", paddingTop: posted ? 14 : 0 }}>
            <span style={{ color: posted || !word ? "#999" : "#111" }}>{posted || !word ? "Add a comment..." : word}</span>
            <span style={{ color: "#2f7cf6", fontWeight: 800 }}>Post</span>
          </div>
        </div>
        <Chip at={T.send} c={GREEN} text="link on its way 📩" y={1200} />
      </Beat>
    </>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  ...BLOCKS.map((b) => ({ src: sfxClick, at: b.at, volume: 0.5 })),
  ...[T.perfect, T.hook, T.lead, T.body, T.loop, T.repeat, T.cta, T.eight, T.socia].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.3 })),
  { src: sfxPop, at: T.breaks, volume: 0.6 },
  { src: sfxPop, at: T.anchored, volume: 0.5 },
  { src: sfxPop, at: T.value, volume: 0.45 },
  { src: sfxPop, at: T.closeIt + 0.4, volume: 0.5 },
  { src: sfxClick, at: T.x1, volume: 0.5 },
  { src: sfxClick, at: T.x2, volume: 0.5 },
  { src: sfxPop, at: T.nextStep, volume: 0.5 },
  { src: sfxClick, at: T.save + 0.3, volume: 0.6 },
  ...CHECK.map((_, i) => ({ src: sfxClick, at: T.check + i * 0.18 + 0.3, volume: 0.4 })),
  { src: sfxClick, at: T.follow + 0.2, volume: 0.6 },
  { src: sfxPop, at: T.comment + 0.5, volume: 0.55 },
  { src: sfxPop, at: T.send, volume: 0.5 },
];

const Soundtrack: React.FC = () => (
  <>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
  </>
);

export const EightBlocks: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Soundtrack />
    <Ground />
    <IntroScene />
    <PerfectScene />
    <HookScene />
    <LeadScene />
    <BodyScene />
    <LoopScene />
    <RepeatScene />
    <CtaScene />
    <EightScene />
    <SociaScene />
    <IntroHeader />
    <Progress />
    <Caption />
  </AbsoluteFill>
);
