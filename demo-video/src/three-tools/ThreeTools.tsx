import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import { InstagramIcon } from "../method/ui";
import { BEST, DARK, FPS, IDEA, PHRASES, RAIL, RAIL_STEPS, RATER, SCANS, T, VOICES, WRITES, type Word } from "./story";

const jak = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${jak.fontFamily}, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// The reference's palette: lavender ground, violet accent, indigo night scenes.
const VIOLET = "#6c4bff";
const VIOLET2 = "#8f73ff";
const LAV = "#f1eefc";
const NIGHT = "#1a1436";
const INK = "#1c1a2e";
const INK2 = "#77738f";
const LINE = "#e6e2f3";
const GREEN = "#22a565";
const RED = "#e5484d";
const CORAL = "#d9714e";

/* ───────────── time helpers ───────────── */

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));
const darkAt = (t: number) => DARK.some(([a, b]) => t >= a && t < b);
/** 0 = lavender, 1 = night, crossfaded over 0.25 s at each boundary. */
const nightness = (t: number) => {
  let v = darkAt(t) ? 1 : 0;
  for (const [a, b] of DARK) {
    if (Math.abs(t - a) < 0.25 && a > 0) v = interpolate(t, [a - 0.25, a + 0.0], [0, 1], clamp);
    if (Math.abs(t - b) < 0.25) v = interpolate(t, [b - 0.25, b], [1, 0], clamp);
  }
  return v;
};

/** Fade + rise + blur in at `at`, out before `until`. */
const Beat: React.FC<{ at: number; until?: number; rise?: number; children: React.ReactNode }> = ({ at, until = 999, rise = 30, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = ease(t, at, 0.35);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 12 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * rise}px) scale(${0.96 + 0.04 * pin})` }}>
      {children}
    </div>
  );
};

/* ───────────── marks ───────────── */

const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = CORAL }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * (i % 2 ? 40 : 46)} y2={Math.sin(a) * (i % 2 ? 40 : 46)} stroke={color} strokeWidth={9} strokeLinecap="round" />;
    })}
  </svg>
);
const SociaMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: size * 0.5 }}>S</div>
);
const ElevenMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", gap: size * 0.12 }}>
    <div style={{ width: size * 0.1, height: size * 0.5, background: "#fff", borderRadius: 2 }} />
    <div style={{ width: size * 0.1, height: size * 0.5, background: "#fff", borderRadius: 2 }} />
  </div>
);
/** Tool three before its name is said: a glowing question mark. */
const MysteryMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: `linear-gradient(135deg, ${VIOLET2}, ${VIOLET})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: size * 0.62, boxShadow: `0 0 ${size * 0.4}px rgba(143,115,255,0.7)` }}>?</div>
);
const TikTokMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.55, fontWeight: 800, fontFamily: SANS, textShadow: "-2px -2px 0 #25f4ee, 2px 2px 0 #fe2c55" }}>♪</div>
);
const YouTubeMark: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#ff0033", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ width: 0, height: 0, borderTop: `${size * 0.15}px solid transparent`, borderBottom: `${size * 0.15}px solid transparent`, borderLeft: `${size * 0.24}px solid #fff`, marginLeft: size * 0.05 }} />
  </div>
);
const Tile: React.FC<{ size: number; children: React.ReactNode }> = ({ size, children }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.26, background: "#fff", boxShadow: "0 10px 30px rgba(80,60,180,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
);
const ExampleChip: React.FC = () => (
  <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, letterSpacing: 2, color: "#8a5a00", background: "#fde9b8", border: "1px solid #ecc76a", borderRadius: 8, padding: "3px 10px" }}>EXAMPLE</span>
);
const Check: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: GREEN, color: "#fff", fontSize: size * 0.6, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
);

/* ───────────── ground ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const n = nightness(t);
  const d = (a: number, s: number) => Math.sin(t * s + a) * 50;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: LAV }}>
        <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(108,75,255,0.09) 1.6px, transparent 2px)", backgroundSize: "34px 34px" }} />
        <div style={{ position: "absolute", left: 80 + d(0, 0.3), top: -100 + d(1, 0.2), width: 800, height: 600, borderRadius: "50%", background: "rgba(150,120,255,0.35)", filter: "blur(140px)" }} />
        <div style={{ position: "absolute", left: -200 + d(2, 0.25), top: 1300 + d(3, 0.2), width: 800, height: 600, borderRadius: "50%", background: "rgba(255,170,210,0.4)", filter: "blur(150px)" }} />
        <div style={{ position: "absolute", right: -200 + d(4, 0.22), top: 1450 + d(5, 0.3), width: 700, height: 500, borderRadius: "50%", background: "rgba(255,190,220,0.35)", filter: "blur(140px)" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: n, background: NIGHT }}>
        <div style={{ position: "absolute", left: 140 + d(0, 0.2), top: 60, width: 800, height: 700, borderRadius: "50%", background: "rgba(108,75,255,0.35)", filter: "blur(160px)" }} />
        <div style={{ position: "absolute", left: 200 + d(2, 0.2), top: 1350, width: 700, height: 500, borderRadius: "50%", background: "rgba(190,80,160,0.3)", filter: "blur(160px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ───────────── caption ───────────── */

const PHRASE_LEAD = 0.03;
const Caption: React.FC = () => {
  const t = useT();
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - PHRASE_LEAD ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  // a finished line rises and fades out just before the next one starts
  const out = next ? ease(t, next[0].t - 0.18, 0.15) : 0;
  const n = nightness(t);
  const base = n > 0.5 ? "rgba(255,255,255,0.62)" : INK2;
  const strong = n > 0.5 ? "#fff" : INK;
  return (
    <div style={{ position: "absolute", top: 230, left: 120, right: 120, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 50, lineHeight: 1.25, letterSpacing: -0.6, opacity: 1 - out, transform: `translateY(${-16 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? (n > 0.5 ? "#b9a6ff" : VIOLET) : i === ph.length - 1 ? strong : base }}>
            {w.w}
          </span>
        );
      })}
    </div>
  );
};

/* ───────────── rail (tool scenes) ───────────── */

const Rail: React.FC = () => {
  const t = useT();
  if (t < T.claude - 0.1 || t > T.reveal) return null;
  const vis = Math.min(ease(t, T.claude, 0.4), 1 - ease(t, T.reveal - 0.25, 0.25));
  const step = RAIL_STEPS.reduce((v, [at, i]) => (t >= at ? i : v), 0);
  const prev = RAIL_STEPS.reduce((v, [at, i]) => (t >= at + 0 ? i : v), 0);
  const moving = RAIL_STEPS.find(([at]) => t >= at && t < at + 0.4);
  const pos = moving ? interpolate(t, [moving[0], moving[0] + 0.4], [Math.max(0, moving[1] - 1), moving[1]], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : prev;
  const n = nightness(t);
  const x0 = 130, x1 = 830;
  const sx = (i: number) => x0 + ((x1 - x0) * i) / (RAIL.length - 1);
  const tool = t >= T.three ? 3 : t >= T.eleven ? 2 : 1;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 380, height: 80, opacity: vis, fontFamily: SANS }}>
      <div style={{ position: "absolute", left: x0, width: x1 - x0, top: 34, height: 3, background: n > 0.5 ? "rgba(255,255,255,0.18)" : "#d9d3f3" }} />
      <div style={{ position: "absolute", left: x0, width: sx(pos) - x0, top: 34, height: 3, background: VIOLET2, boxShadow: `0 0 12px ${VIOLET2}` }} />
      {RAIL.map((r, i) => (
        <React.Fragment key={r}>
          <div style={{ position: "absolute", left: sx(i) - 7, top: 29, width: 14, height: 14, borderRadius: 7, background: i <= step ? VIOLET2 : n > 0.5 ? NIGHT : LAV, border: `2px solid ${i <= step ? VIOLET2 : "#c9c1ee"}` }} />
          <div style={{ position: "absolute", left: sx(i) - 70, width: 140, top: i % 2 ? -2 : 52, textAlign: "center", fontSize: 17, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: i === step ? VIOLET2 : n > 0.5 ? "rgba(255,255,255,0.45)" : "#8f8aa8" }}>{r}</div>
        </React.Fragment>
      ))}
      <div style={{ position: "absolute", left: sx(pos) - 13, top: 22, width: 26, height: 26, borderRadius: 13, background: "#fff", border: `4px solid ${VIOLET}`, boxShadow: `0 0 16px ${VIOLET2}` }} />
      <div style={{ position: "absolute", right: 70, top: 4, textAlign: "center", color: n > 0.5 ? "#fff" : INK }}>
        <div style={{ fontSize: 38, fontWeight: 800 }}>{tool}/3</div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1.6, color: n > 0.5 ? "rgba(255,255,255,0.5)" : "#8f8aa8" }}>TOOLS</div>
      </div>
    </div>
  );
};

/* ───────────── shared card + number header ───────────── */

const Card: React.FC<{ top?: number; height?: number; left?: number; right?: number; dark?: boolean; style?: React.CSSProperties; children: React.ReactNode }> = ({ top = 760, height = 680, left = 110, right = 110, dark, style, children }) => (
  <div style={{ position: "absolute", left, right, top, height, borderRadius: 30, background: dark ? "rgba(40,32,80,0.85)" : "#fff", border: dark ? "1px solid rgba(255,255,255,0.1)" : "none", boxShadow: "0 30px 70px rgba(70,50,160,0.18)", overflow: "hidden", fontFamily: SANS, color: dark ? "#fff" : INK, ...style }}>{children}</div>
);

const NumberHead: React.FC<{ n: number; at: number; until: number; mark: React.ReactNode; tag?: string }> = ({ n, at, until, mark, tag }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const p = popE(t, at, 0.45);
  const m = popE(t, at + 0.3, 0.4);
  const out = 1 - ease(t, until - 0.22, 0.22);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 500, height: 220, display: "flex", alignItems: "center", justifyContent: "center", gap: 34, opacity: out, fontFamily: SANS }}>
      <div style={{ fontSize: 210, fontWeight: 800, lineHeight: 1, color: VIOLET, transform: `scale(${p})`, textShadow: `0 0 50px rgba(108,75,255,0.45)`, letterSpacing: -6 }}>{n}</div>
      <div style={{ transform: `scale(${m})`, position: "relative" }}>
        <Tile size={150}>{mark}</Tile>
        {tag ? <div style={{ position: "absolute", left: "50%", top: 162, transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 19, fontWeight: 700, color: "#fff", background: VIOLET, borderRadius: 20, padding: "5px 14px" }}>{tag}</div> : null}
      </div>
    </div>
  );
};

/* ───────────── 1 · hook (night) ───────────── */

const FLAP = "3  TOOLS";
const FlapBoard: React.FC = () => {
  const t = useT();
  return (
    <div style={{ position: "absolute", left: 150, right: 150, top: 470, height: 150, borderRadius: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", padding: "14px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.6)", fontFamily: SANS }}>
        <span>● FOR CREATORS</span><span style={{ color: "#7ee2a8" }}>NOW SHOWING</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center" }}>
        {FLAP.split("").map((ch, i) => {
          const settle = 0.3 + i * 0.12;
          const s = t >= settle ? ch : "ABCDEFGHIJKLMNOPQRSTUVWXYZ3"[Math.floor(t * 24 + i * 5) % 27];
          return <div key={i} style={{ width: 64, height: 76, borderRadius: 8, background: "#0e0b22", color: "#fff", fontFamily: MONO, fontSize: 48, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", borderTop: "1px solid rgba(255,255,255,0.12)", position: "relative" }}>{ch === " " ? "" : s}<div style={{ position: "absolute", left: 0, right: 0, top: 37, height: 2, background: "rgba(0,0,0,0.6)" }} /></div>;
        })}
      </div>
    </div>
  );
};

const NOTIFS = [
  { mark: <ClaudeMark size={46} />, name: "Claude", text: "Your script is ready" },
  { mark: <ElevenMark size={46} />, name: "ElevenLabs", text: "Voice-over done" },
  { mark: <MysteryMark size={46} />, name: "? ? ?", text: "most people don't know this one" },
];

const HookScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={0} until={T.last} rise={0}>
      <FlapBoard />
      <svg style={{ position: "absolute", inset: 0 }} width={1080} height={1920}>
        <path d="M -20 1500 C 120 1350, 40 1150, 180 1000 S 120 800, 260 700" stroke="rgba(143,115,255,0.8)" strokeWidth={5} fill="none" style={{ filter: "drop-shadow(0 0 10px #8f73ff)" }} />
        <path d="M 1100 1520 C 960 1380, 1040 1180, 900 1030 S 960 820, 820 720" stroke="rgba(143,115,255,0.8)" strokeWidth={5} fill="none" style={{ filter: "drop-shadow(0 0 10px #8f73ff)" }} />
        {[0, 1, 2, 3, 4].map((i) => {
          const u = (t * 0.18 + i / 5) % 1;
          return (
            <React.Fragment key={i}>
              <circle cx={180 - 120 * Math.cos(u * 6) + 60 * u} cy={1500 - 800 * u} r={9} fill={["#7ee2a8", "#ff9fd0", "#9fb8ff", "#ffd27e", "#c7b4ff"][i]} style={{ filter: "drop-shadow(0 0 8px #fff)" }} />
              <circle cx={900 + 120 * Math.cos(u * 6) - 60 * u} cy={1520 - 800 * u} r={9} fill={["#ffd27e", "#9fb8ff", "#7ee2a8", "#c7b4ff", "#ff9fd0"][i]} style={{ filter: "drop-shadow(0 0 8px #fff)" }} />
            </React.Fragment>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: 300, top: 680, width: 480, height: 820, borderRadius: 70, background: "#0b0920", border: "8px solid #2c2650", boxShadow: "0 30px 90px rgba(0,0,0,0.5)", overflow: "hidden", fontFamily: SANS }}>
        <div style={{ position: "absolute", left: "50%", top: 18, transform: "translateX(-50%)", width: 130, height: 36, borderRadius: 18, background: "#000" }} />
        <div style={{ textAlign: "center", marginTop: 90, color: "rgba(255,255,255,0.7)", fontSize: 22 }}>Thursday 30 October</div>
        <div style={{ textAlign: "center", color: "#fff", fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>9:41</div>
        <div style={{ position: "absolute", left: 22, right: 22, top: 330, display: "flex", flexDirection: "column", gap: 14 }}>
          {NOTIFS.map((n, i) => {
            const p = popE(t, T.notif[i], 0.4);
            if (p <= 0) return null;
            return (
              <div key={n.name} style={{ transform: `translateY(${(1 - p) * -40}px) scale(${0.9 + 0.1 * p})`, opacity: Math.min(1, p), background: "rgba(255,255,255,0.14)", borderRadius: 22, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 58, height: 58, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{n.mark}</div>
                <div style={{ color: "#fff" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{n.name}</div>
                  <div style={{ fontSize: 20, color: "rgba(255,255,255,0.75)" }}>{n.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Beat>
  );
};

/* ───────────── 2 · problem, 3 · three tools, 4 · the second one ───────────── */

const ProblemScene: React.FC = () => {
  const t = useT();
  const likes = t >= T.likes ? Math.min(4, 1 + Math.floor((t - T.likes) / 0.12)) : 0;
  const people = [{ i: "M", c: "#e5484d", n: "Mom" }, { i: "R", c: "#8f73ff", n: "Ravi" }, { i: "J", c: "#5aa9e6", n: "Jess" }, { i: "T", c: "#22a565", n: "Theo" }];
  return (
    <Beat at={T.problem} until={T.claude}>
      <Card top={520} height={420}>
        <div style={{ height: 70, background: "linear-gradient(90deg,#cfe0ff,#e9d8ff,#ffd9ea)" }} />
        <div style={{ display: "flex", gap: 18, alignItems: "center", padding: "20px 34px" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: VIOLET, color: "#fff", fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>Y</div>
          <div><div style={{ fontSize: 28, fontWeight: 700 }}>you</div><div style={{ fontSize: 20, color: INK2 }}>just now · new reel</div></div>
        </div>
        <div style={{ margin: "0 34px", padding: "20px 24px", borderRadius: 18, border: `1px solid ${LINE}`, fontSize: 24 }}>
          <div style={{ fontWeight: 700 }}>filmed it, edited it, posted it 🎬</div>
          <div style={{ display: "flex", gap: 20, marginTop: 14, color: INK2, fontSize: 20 }}>
            {["film", "edit", "post"].map((s, i) => <span key={s} style={{ opacity: ease(t, [5.8, 6.2, 6.6][i], 0.2) }}>✓ {s}</span>)}
          </div>
        </div>
      </Card>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, display: "flex", alignItems: "center", justifyContent: "center", gap: 30, fontFamily: SANS }}>
        <svg width={110} height={100} viewBox="0 0 24 22" style={{ transform: `scale(${likes ? 1 + 0.15 * (1 - ease(t, T.likes, 0.3)) : 1})` }}><path d="M12 21s-8-5.3-10.3-10C.2 7.8 2 4 5.6 3.4 8 3 10 4.3 12 6.6 14 4.3 16 3 18.4 3.4 22 4 23.8 7.8 22.3 11 20 15.7 12 21 12 21z" fill={likes ? VIOLET : "none"} stroke={likes ? VIOLET : "#c9c1ee"} strokeWidth={1.6} /></svg>
        <div style={{ fontSize: 150, fontWeight: 800, color: INK, width: 110, opacity: likes ? 1 : 0.15 }}>{likes || 0}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1210, display: "flex", justifyContent: "center", gap: 34, fontFamily: SANS }}>
        {people.map((p, i) => {
          const on = i < likes;
          return (
            <div key={p.n} style={{ textAlign: "center", opacity: on ? 1 : 0.25 }}>
              <div style={{ width: 92, height: 92, borderRadius: 46, background: on ? p.c : "transparent", border: on ? "none" : "3px dashed #c9c1ee", color: "#fff", fontSize: 36, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${i === 0 && t >= T.mom ? 1 + 0.15 * (1 - ease(t, T.mom, 0.35)) + 0.12 : 1})` }}>{on ? p.i : ""}</div>
              <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color: i === 0 && t >= T.mom ? RED : INK2 }}>{on ? p.n : ""}</div>
            </div>
          );
        })}
      </div>
    </Beat>
  );
};

const LastScene: React.FC = () => {
  const t = useT();
  const beam = ease(t, T.last + 0.3, 0.5);
  return (
    <Beat at={T.last} until={T.problem}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 470, textAlign: "center", fontFamily: SANS, fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: -2, opacity: ease(t, 4.81, 0.3) }}>most people don't know</div>
      <div style={{ position: "absolute", left: 640, width: 400, top: 640, height: 640, background: `linear-gradient(180deg, rgba(255,214,120,${0.5 * beam}), rgba(255,214,120,0))`, clipPath: "polygon(45% 0, 55% 0, 100% 100%, 0 100%)", filter: "blur(6px)" }} />
      <div style={{ position: "absolute", left: 805, top: 610, width: 70, height: 40, borderRadius: "35px 35px 6px 6px", background: "#ffd27e", boxShadow: "0 0 40px #ffd27e", opacity: beam }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 1180, display: "flex", justifyContent: "center", gap: 70, fontFamily: SANS }}>
        {[<ClaudeMark size={60} key="c" />, <ElevenMark size={60} key="e" />, <MysteryMark size={80} key="m" />].map((m, i) => (
          <div key={i} style={{ textAlign: "center", opacity: i === 2 ? 1 : 0.3, transform: `scale(${i === 2 ? 1 + 0.15 * popE(t, T.last + 0.4) : 0.85})`, filter: i === 2 ? "drop-shadow(0 0 30px rgba(255,214,120,0.7))" : "none" }}>
            <Tile size={130}>{m}</Tile>
            <div style={{ marginTop: 16, fontSize: 24, fontWeight: 800, color: i === 2 ? "#ffd27e" : "rgba(255,255,255,0.6)" }}>{i + 1}</div>
          </div>
        ))}
      </div>
    </Beat>
  );
};

/* ───────────── 5 · Claude ───────────── */

const ClaudeScene: React.FC = () => {
  const t = useT();
  return (
    <>
      <NumberHead n={1} at={T.claude} until={T.eleven} mark={<ClaudeMark size={90} />} />
      <Beat at={T.idea - 0.2} until={T.build}>
        <Card top={780} height={620}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 30px", borderBottom: `1px solid ${LINE}` }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 700 }}><ClaudeMark size={26} /> Claude</span><ExampleChip />
          </div>
          <div style={{ margin: "22px 30px 0 auto", width: "fit-content", maxWidth: 620, background: "#f2effb", borderRadius: 18, padding: "14px 22px", fontSize: 25, marginRight: 30 }}>idea: {typed(t, IDEA, T.idea, T.idea + 0.7)}</div>
          {WRITES.map((w, i) => {
            const at = T.writes[i];
            const p = ease(t, at, 0.25);
            return (
              <div key={w.k} style={{ margin: "18px 30px 0", opacity: p, transform: `translateY(${(1 - p) * 12}px)`, display: "flex", gap: 18, alignItems: "baseline" }}>
                <span style={{ width: 120, fontFamily: MONO, fontSize: 19, fontWeight: 600, color: VIOLET, textTransform: "uppercase", letterSpacing: 1 }}>{w.k}</span>
                <span style={{ flex: 1, fontSize: 25, fontWeight: 600, lineHeight: 1.3 }}>{typed(t, w.text, at, at + 0.5)}</span>
              </div>
            );
          })}
        </Card>
      </Beat>
      <Beat at={T.build} until={T.eleven}>
        <Card top={780} height={620} dark>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 30px", fontSize: 24, fontWeight: 700 }}><ClaudeMark size={26} /> building your video<span style={{ marginLeft: "auto" }}>{t >= T.animate + 0.6 ? <Check /> : null}</span></div>
          <div style={{ display: "flex", gap: 14, padding: "10px 30px" }}>
            {[0, 1, 2, 3].map((i) => {
              const p = popE(t, T.build + 0.3 + i * 0.18);
              const wob = t >= T.animate + i * 0.1 ? Math.sin((t - T.animate) * 5 + i) * 6 : 0;
              return (
                <div key={i} style={{ flex: 1, height: 300, borderRadius: 16, background: ["linear-gradient(170deg,#ffcf8a,#ff8a5c)", "linear-gradient(170deg,#9fb8ff,#6c4bff)", "linear-gradient(170deg,#7ee2a8,#2a9d8f)", "linear-gradient(170deg,#ff9fd0,#b04ad6)"][i], transform: `scale(${p}) translateY(${wob}px)`, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 12, right: 12, bottom: 16, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.85)", transform: `scaleX(${ease(t, T.animate + i * 0.12, 0.3)})`, transformOrigin: "left" }} />
                  <div style={{ position: "absolute", left: "30%", top: "28%", width: 50, height: 50, borderRadius: 25, background: "rgba(255,255,255,0.6)", transform: `translateX(${wob * 3}px)` }} />
                </div>
              );
            })}
          </div>
          <div style={{ position: "relative", margin: "24px 30px", height: 70, borderRadius: 12, background: "rgba(255,255,255,0.08)" }}>
            {[0.08, 0.24, 0.4, 0.55, 0.7, 0.86].map((x, k) => <div key={k} style={{ position: "absolute", left: `${x * 100}%`, top: 21, width: 26, height: 26, background: VIOLET2, borderRadius: 4, transform: `rotate(45deg) scale(${popE(t, T.animate + k * 0.08)})` }} />)}
            <div style={{ position: "absolute", top: 6, bottom: 6, width: 3, background: "#fff", left: `${interpolate(t, [T.build, T.eleven], [0, 100], clamp)}%` }} />
          </div>
          <div style={{ padding: "0 30px", fontSize: 21, color: "rgba(255,255,255,0.65)" }}>every scene animated · captions timed to the voice</div>
        </Card>
      </Beat>
    </>
  );
};

/* ───────────── 6 · ElevenLabs ───────────── */

const ElevenScene: React.FC = () => {
  const t = useT();
  const picked = t >= T.pick;
  const wave = ease(t, T.pick + 0.2, 1.0);
  return (
    <>
      <NumberHead n={2} at={T.eleven} until={T.three} mark={<ElevenMark size={90} />} />
      <Beat at={T.paste - 0.2} until={T.noMic}>
        <Card top={800} height={600}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 30px", fontSize: 24, fontWeight: 700, borderBottom: `1px solid ${LINE}` }}><ElevenMark size={30} /> ElevenLabs</div>
          <div style={{ margin: "20px 30px 0", padding: "16px 20px", borderRadius: 14, background: "#f7f5fe", fontSize: 23, lineHeight: 1.4, minHeight: 100 }}>{typed(t, "I tried every snack at the gas station so you don't have to...", T.paste, T.paste + 0.5)}</div>
          <div style={{ display: "flex", gap: 14, margin: "20px 30px 0" }}>
            {VOICES.map((v, i) => (
              <div key={v} style={{ flex: 1, height: 64, borderRadius: 14, border: `2px solid ${picked && i === 0 ? VIOLET : LINE}`, background: picked && i === 0 ? "#f2edff" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 700, color: picked && i === 0 ? VIOLET : INK2, opacity: ease(t, T.paste + 0.4 + i * 0.1, 0.25) }}>{v}</div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 150, margin: "20px 30px 0" }}>
            {Array.from({ length: 44 }).map((_, i) => {
              const h = 20 + 100 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6));
              return <div key={i} style={{ flex: 1, height: Math.max(6, h * (i / 44 < wave ? 1 : 0.05)), borderRadius: 4, background: i / 44 < wave ? VIOLET : LINE }} />;
            })}
          </div>
          <div style={{ margin: "6px 30px 0", display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 700, color: GREEN, opacity: ease(t, T.done, 0.3) }}><Check /> voice-over done</div>
        </Card>
      </Beat>
      <Beat at={T.noMic} until={T.three}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 860, display: "flex", justifyContent: "center", gap: 90, fontFamily: SANS }}>
          {[{ k: "mic", at: T.mic[0], icon: "🎙️" }, { k: "retakes", at: T.mic[1], icon: "🔁" }].map((x) => {
            const p = popE(t, x.at - 0.1);
            const s = ease(t, x.at + 0.15, 0.25);
            return (
              <div key={x.k} style={{ textAlign: "center", transform: `scale(${p})` }}>
                <div style={{ position: "relative", width: 220, height: 220, borderRadius: 50, background: "#fff", boxShadow: "0 20px 50px rgba(80,60,180,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 110 }}>
                  {x.icon}
                  <div style={{ position: "absolute", left: 20, right: 20, top: 104, height: 12, borderRadius: 6, background: RED, transform: `rotate(-35deg) scaleX(${s})` }} />
                </div>
                <div style={{ marginTop: 22, fontSize: 40, fontWeight: 800, color: INK }}>no {x.k}</div>
              </div>
            );
          })}
        </div>
      </Beat>
    </>
  );
};

/* ───────────── 7 · the mystery strategist, then the reveal ───────────── */

const StratHeader: React.FC<{ title: string; example?: boolean; dark?: boolean }> = ({ title, example, dark }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 30px", borderBottom: dark ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${LINE}` }}>
    <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 700 }}><MysteryMark size={30} /> {title}</span>
    {example ? <ExampleChip /> : null}
  </div>
);

const MysteryScene: React.FC = () => {
  const t = useT();
  const overall = Math.round(RATER.overall * ease(t, T.rate + 0.2, 0.8));
  return (
    <>
      <NumberHead n={3} at={T.three} until={T.analyze} mark={<MysteryMark size={90} />} />
      {/* night: "this one is different" + "fully AI social media strategist" */}
      <Beat at={T.different} until={T.analyze}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 800, height: 400, display: "flex", alignItems: "center", justifyContent: "center", opacity: 1 - ease(t, T.strategist + 0.1, 0.3) }}>
          {[0, 1, 2].map((k) => {
            const u = ((t - T.different) * 0.8 + k / 3) % 1;
            return <div key={k} style={{ position: "absolute", width: 160 + 300 * u, height: 160 + 300 * u, borderRadius: "50%", border: `3px solid rgba(185,166,255,${0.6 * (1 - u)})` }} />;
          })}
          <div style={{ transform: `scale(${popE(t, T.different + 0.1, 0.45)})` }}><MysteryMark size={170} /></div>
        </div>
        <div style={{ position: "absolute", left: 60, right: 60, top: 940, textAlign: "center", fontFamily: SANS, color: "#fff" }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#b9a6ff", letterSpacing: 6, textTransform: "uppercase", opacity: ease(t, 23.72, 0.3) }}>fully AI</div>
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, marginTop: 12, opacity: ease(t, 24.18, 0.35), transform: `translateY(${(1 - ease(t, 24.18, 0.35)) * 20}px)` }}>social media<br />strategist</div>
        </div>
      </Beat>
      <Beat at={T.analyze} until={T.tell}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", fontFamily: SANS, fontSize: 88, fontWeight: 800, color: INK, letterSpacing: -2 }}>
          analyzes <span style={{ color: VIOLET }}>everything</span>
        </div>
        <Card top={760} height={640}>
          <StratHeader title="your strategist · analyzing" />
          {SCANS.map((x, i) => {
            const at = T.scans[i];
            const on = t >= at;
            const scan = interpolate(t, [at - 0.5, at], [0, 1], clamp);
            return (
              <div key={x.k} style={{ position: "relative", display: "flex", alignItems: "center", gap: 20, margin: "18px 30px 0", height: 104, borderRadius: 18, border: `2px solid ${on ? "#cfc3ff" : LINE}`, padding: "0 22px", overflow: "hidden", opacity: 0.35 + 0.65 * ease(t, at - 0.5, 0.3) }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${scan * 100}%`, background: "linear-gradient(90deg, rgba(143,115,255,0.06), rgba(143,115,255,0.18))" }} />
                <div style={{ flex: 1, position: "relative" }}>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{x.k}</div>
                  <div style={{ fontSize: 20, color: INK2 }}>{x.sub}</div>
                </div>
                {on ? <Check /> : <div style={{ width: 26, height: 26, borderRadius: 13, border: `3px solid ${LINE}`, borderTopColor: VIOLET, transform: `rotate(${t * 500}deg)` }} />}
              </div>
            );
          })}
        </Card>
      </Beat>
      <Beat at={T.tell} until={T.rate}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", fontFamily: SANS, fontSize: 88, fontWeight: 800, color: INK, letterSpacing: -2 }}>
          exactly <span style={{ color: VIOLET }}>what to make</span>
        </div>
        <Card top={760} height={560}>
          <StratHeader title="your strategist · next video" example />
          <div style={{ margin: "26px 30px 0", padding: "22px 24px", borderRadius: 18, background: "#f2edff", border: `2px solid ${VIOLET2}`, transform: `scale(${0.92 + 0.08 * popE(t, T.tell + 0.3)})`, opacity: ease(t, T.tell + 0.3, 0.3) }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1.6, color: VIOLET }}>MAKE THIS NEXT</div>
            <div style={{ marginTop: 10, fontSize: 32, fontWeight: 800, lineHeight: 1.25 }}>{typed(t, "A taste-test ranking. Answer in the first second.", T.tell + 0.4, T.tell + 1.3)}</div>
          </div>
          {["why: rankings are trending in your niche", "your posts do best around 6 PM", "a competitor's ranking beat their usual"].map((line, i) => (
            <div key={i} style={{ margin: "18px 34px 0", fontSize: 23, color: INK2, display: "flex", gap: 12, opacity: ease(t, T.tell + 1.2 + i * 0.2, 0.3) }}><span style={{ color: VIOLET, fontWeight: 800 }}>→</span>{line}</div>
          ))}
        </Card>
      </Beat>
      {/* night: the rating */}
      <Beat at={T.rate} until={T.best}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 500, textAlign: "center", fontFamily: SANS, color: "#fff" }}>
          <div style={{ fontSize: 210, fontWeight: 800, lineHeight: 1, textShadow: "0 0 60px rgba(143,115,255,0.7)" }}>{overall}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 2 }}>/ 100 · RATED BEFORE YOU POST</div>
        </div>
        <Card top={860} height={500} dark>
          <StratHeader title="video score" example dark />
          <div style={{ height: 14 }} />
          {RATER.rows.map(([name, score], i) => {
            const g = ease(t, T.rate + 0.2 + i * 0.08, 0.45);
            return (
              <div key={name} style={{ margin: "0 30px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, fontWeight: 600 }}><span>{name}</span><span>{Math.round(score * g)}</span></div>
                <div style={{ marginTop: 6, height: 11, borderRadius: 6, background: "rgba(255,255,255,0.1)" }}><div style={{ width: `${score * g}%`, height: 11, borderRadius: 6, background: score < 78 ? "#f0b45a" : VIOLET2 }} /></div>
              </div>
            );
          })}
        </Card>
      </Beat>
      <Beat at={T.best} until={T.reveal}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 500, textAlign: "center", fontFamily: SANS, fontSize: 100, fontWeight: 800, color: VIOLET, letterSpacing: -2, opacity: ease(t, T.bestHit, 0.3) }}>6 PM</div>
        <Card top={800} height={540}>
          <StratHeader title="your best time" example />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 26, height: 320, padding: "20px 40px 0" }}>
            {BEST.map(([h, v], i) => {
              const g = ease(t, T.best + 0.1 + i * 0.07, 0.4);
              const hot = v === 1;
              return (
                <div key={h} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 280 * v * g, borderRadius: "12px 12px 0 0", background: hot ? `linear-gradient(180deg, ${VIOLET2}, ${VIOLET})` : "#f3b8cf", boxShadow: hot && t >= T.bestHit ? `0 0 30px ${VIOLET2}` : "none" }} />
                  <div style={{ marginTop: 10, fontSize: 21, fontWeight: 700, color: hot ? VIOLET : INK2 }}>{h}</div>
                </div>
              );
            })}
          </div>
          <div style={{ margin: "26px 30px 0", display: "flex", alignItems: "center", gap: 12, fontSize: 24, fontWeight: 700, color: GREEN, opacity: ease(t, T.bestHit + 0.2, 0.3) }}><Check /> posting at 6 PM</div>
        </Card>
      </Beat>
    </>
  );
};

const RevealScene: React.FC = () => {
  const t = useT();
  // the question mark turns over and comes back as SOCIA on "SOCIA"
  const flip = interpolate(t, [T.name - 0.25, T.name + 0.15], [0, 180], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const shown = flip >= 90;
  const name = ease(t, T.name + 0.05, 0.4);
  const soon = popE(t, T.soon, 0.4);
  const burst = ease(t, T.name, 0.8);
  return (
    <Beat at={T.reveal} until={T.closer}>
      <div style={{ position: "absolute", left: 540 - 300 * burst, top: 820 - 300 * burst, width: 600 * burst, height: 600 * burst, borderRadius: "50%", border: `3px solid rgba(185,166,255,${0.6 * (1 - burst)})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center", perspective: 1200 }}>
        <div style={{ transform: `rotateY(${shown ? flip - 180 : flip}deg)`, filter: `drop-shadow(0 0 50px rgba(143,115,255,${shown ? 0.9 : 0.6}))` }}>
          {shown ? <SociaMark size={300} /> : <MysteryMark size={300} />}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, textAlign: "center", fontFamily: SANS, fontSize: 150, fontWeight: 800, color: "#fff", letterSpacing: -4, opacity: name, transform: `translateY(${(1 - name) * 30}px)`, filter: `blur(${(1 - name) * 10}px)` }}>SOCIA</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1200, display: "flex", justifyContent: "center", fontFamily: SANS }}>
        <div style={{ transform: `scale(${soon})`, background: "#fff", color: VIOLET, borderRadius: 40, padding: "14px 34px", fontSize: 36, fontWeight: 800 }}>coming soon</div>
      </div>
    </Beat>
  );
};

/* ───────────── 8 · closer (night), 9 · like + follow ───────────── */

const CloserScene: React.FC = () => {
  const t = useT();
  const strike = ease(t, T.strike, 0.3);
  const alone = ease(t, T.alone, 0.35);
  return (
    <Beat at={T.closer} until={T.cta}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 440, textAlign: "center", fontFamily: SANS }}>
        <div style={{ position: "relative", display: "inline-block", fontSize: 92, fontWeight: 800, color: `rgba(255,255,255,${1 - 0.55 * strike})`, letterSpacing: -2 }}>
          bad content
          <div style={{ position: "absolute", left: -10, right: -10, top: "52%", height: 9, borderRadius: 5, background: RED, transform: `scaleX(${strike})`, transformOrigin: "left" }} />
        </div>
        <div style={{ fontSize: 112, fontWeight: 800, color: "#fff", letterSpacing: -3, opacity: alone, transform: `translateY(${(1 - alone) * 20}px)`, filter: `blur(${(1 - alone) * 8}px)` }}>alone</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 880, display: "flex", justifyContent: "center", alignItems: "center", gap: 0 }}>
        {[<ClaudeMark size={70} key="c" />, <ElevenMark size={70} key="e" />, <SociaMark size={70} key="s" />].map((m, i) => (
          <React.Fragment key={i}>
            {i ? <div style={{ width: 90 * ease(t, T.alone + 0.1 + i * 0.12, 0.3), height: 6, background: VIOLET2, boxShadow: `0 0 14px ${VIOLET2}`, borderRadius: 3 }} /> : null}
            <div style={{ opacity: 0.35 + 0.65 * alone, transform: `scale(${0.85 + 0.15 * popE(t, T.alone + i * 0.12)})` }}><Tile size={150}>{m}</Tile></div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1110, textAlign: "center", fontFamily: SANS, fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.8)", opacity: ease(t, T.alone + 0.4, 0.3) }}>a team that works with you</div>
    </Beat>
  );
};

const CtaScene: React.FC = () => {
  const t = useT();
  const like = popE(t, T.like, 0.45);
  const liked = t >= T.like + 0.15;
  const follow = popE(t, T.follow - 0.1, 0.4);
  const following = t >= T.follow + 0.2;
  return (
    <Beat at={T.cta} until={999}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 500, display: "flex", justifyContent: "center", fontFamily: SANS }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#111", color: "#fff", borderRadius: 40, padding: "16px 30px", fontSize: 34, fontWeight: 800, transform: `scale(${popE(t, T.cta + 0.05)})` }}><SociaMark size={48} /> SOCIA · coming soon</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 720, display: "flex", justifyContent: "center", alignItems: "center", gap: 34, fontFamily: SANS, transform: `scale(${0.6 + 0.4 * like})`, opacity: Math.min(1, like * 1.5) }}>
        <div style={{ width: 210, height: 210, borderRadius: 105, background: liked ? `radial-gradient(circle at 35% 30%, ${VIOLET2}, ${VIOLET})` : "#ddd6fb", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: liked ? `0 20px 60px rgba(108,75,255,0.5)` : "none" }}>
          <svg width={110} height={100} viewBox="0 0 24 22"><path d="M12 21s-8-5.3-10.3-10C.2 7.8 2 4 5.6 3.4 8 3 10 4.3 12 6.6 14 4.3 16 3 18.4 3.4 22 4 23.8 7.8 22.3 11 20 15.7 12 21 12 21z" fill="#fff" /></svg>
        </div>
        <div style={{ fontSize: 110, fontWeight: 800, color: INK, letterSpacing: -3 }}>Like</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1030, display: "flex", justifyContent: "center", fontFamily: SANS, transform: `scale(${follow})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, background: "#fff", border: `4px solid ${VIOLET}`, borderRadius: 70, padding: "26px 60px", fontSize: 72, fontWeight: 800, color: INK, boxShadow: "0 20px 50px rgba(80,60,180,0.2)" }}>
          {following ? <span style={{ color: VIOLET }}>✓</span> : <span style={{ color: VIOLET }}>+</span>}{following ? "Following" : "Follow"}
        </div>
      </div>
      <svg style={{ position: "absolute", left: 0, top: 1240 }} width={1080} height={80}>
        <line x1={0} y1={40} x2={1080 * ease(t, T.follow, 0.6)} y2={40} stroke={VIOLET2} strokeWidth={6} style={{ filter: `drop-shadow(0 0 8px ${VIOLET2})` }} />
        {[90, 230, 370, 540, 710, 850, 990].map((x, i) => <circle key={i} cx={x} cy={40} r={14} fill="#fff" stroke={["#22a565", "#6c4bff", "#e5484d", "#25b8d9", "#6c4bff", "#f0b45a", "#e5484d"][i]} strokeWidth={6} opacity={ease(t, T.follow + i * 0.06, 0.2)} />)}
      </svg>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  ...T.notif.map((at) => ({ src: sfxPop, at, volume: 0.55 })),
  ...[T.last, T.problem, T.claude, T.build, T.eleven, T.noMic, T.three, T.different, T.strategist, T.analyze, T.tell, T.rate, T.best, T.reveal, T.closer, T.cta].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.25 })),
  { src: sfxPop, at: T.likes, volume: 0.5 },
  { src: sfxPop, at: T.mom, volume: 0.5 },
  ...T.writes.map((at) => ({ src: sfxClick, at, volume: 0.45 })),
  { src: sfxClick, at: T.pick, volume: 0.55 },
  { src: sfxPop, at: T.done, volume: 0.5 },
  ...T.scans.map((at) => ({ src: sfxClick, at, volume: 0.45 })),
  { src: sfxPop, at: T.tell + 0.3, volume: 0.5 },
  { src: sfxPop, at: T.bestHit, volume: 0.5 },
  { src: sfxPop, at: T.name, volume: 0.7 },
  { src: sfxClick, at: T.strike, volume: 0.5 },
  { src: sfxPop, at: T.like + 0.15, volume: 0.6 },
  { src: sfxClick, at: T.follow + 0.2, volume: 0.6 },
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

export const ThreeTools: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Soundtrack />
    <Ground />
    <HookScene />
    <ProblemScene />
    <LastScene />
    <ClaudeScene />
    <ElevenScene />
    <MysteryScene />
    <RevealScene />
    <CloserScene />
    <CtaScene />
    <Rail />
    <Caption />
  </AbsoluteFill>
);
