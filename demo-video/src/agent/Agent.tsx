import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import mark from "../brand/socia-mark.png";
import avatar from "./avatar.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { BOX_GLOW, C, FONT, GLOW, InstagramIcon, fmtN } from "../method/ui";
import { BEST, COUNTERS, DOCK, DRAFT, FPS, PHRASES, RATER, SCENES, SITE, SPELL, TOP_POSTS, WEEK, type SceneKey, type Word } from "./story";

const serif = loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
const SERIF = `${serif.fontFamily}, "Instrument Serif", Georgia, serif`;

const BLUE = "#3b7cff";
const INK_DARK = "#0b0a09";

/* ───────────── time helpers (everything is timed in seconds of the take) ───────────── */

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** Eased 0..1 from `at` over `dur` seconds. */
const ease = (t: number, at: number, dur = 0.22, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
/** Overshooting pop, 0..1. */
const popE = (t: number, at: number, dur = 0.3) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) });
const stepAt = (t: number, steps: [number, number][], before = 0) => steps.reduce((v, [at, val]) => (t >= at ? val : v), before);

const sceneIndexAt = (t: number) => SCENES.reduce((idx, s, i) => (t >= s.at ? i : idx), 0);

type Tone = { ground: string; ink: string; dim: string; accent: string; dots: string };
const DARK: Tone = { ground: C.bg, ink: C.ink, dim: "rgba(242,239,233,0.28)", accent: BLUE, dots: "rgba(255,255,255,0.07)" };
const BLUE_TONE: Tone = { ground: BLUE, ink: INK_DARK, dim: "rgba(11,10,9,0.32)", accent: "#ffffff", dots: "rgba(0,0,0,0.13)" };
const toneAt = (t: number) => (SCENES[sceneIndexAt(t)].ground === "blue" ? BLUE_TONE : DARK);

/* ───────────── shared pieces ───────────── */

const Mono: React.FC<{ size?: number; color?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ size = 24, color, style, children }) => (
  <span style={{ fontFamily: FONT.mono, fontSize: size, letterSpacing: 3, fontWeight: 600, textTransform: "uppercase", color, ...style }}>{children}</span>
);

/** A rotated rubber stamp that slams in. */
const Stamp: React.FC<{ at: number; text: string; rotate?: number; x: number; y: number; size?: number; dark?: boolean }> = ({ at, text, rotate = -7, x, y, size = 46, dark = false }) => {
  const t = useT();
  if (t < at) return null;
  const p = popE(t, at, 0.22);
  const s = 1.7 - 0.7 * p;
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${s})`, opacity: Math.min(1, p * 2) }}>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: size, letterSpacing: 1, padding: "10px 22px", borderRadius: 12, whiteSpace: "nowrap", background: dark ? INK_DARK : BLUE, color: dark ? BLUE : INK_DARK, border: `5px solid ${dark ? BLUE : INK_DARK}`, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}>{text}</div>
    </div>
  );
};

const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div style={{ background: "#121110", border: "2px solid rgba(255,255,255,0.08)", borderRadius: 26, boxShadow: "0 24px 60px rgba(0,0,0,0.35)", ...style }}>{children}</div>
);

const ExampleChip: React.FC = () => (
  <Mono size={16} color={BLUE} style={{ border: `2px solid ${BLUE}`, borderRadius: 8, padding: "4px 10px" }}>example</Mono>
);

const WindowBar: React.FC<{ title: string; example?: boolean }> = ({ title, example }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
    {["#3b7cff", "rgba(255,255,255,0.18)", "rgba(255,255,255,0.18)"].map((c, i) => (
      <div key={i} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
    ))}
    {/* the chip sits on the left so a stamp slamming in on the right never covers it */}
    {example && <div style={{ marginLeft: 8 }}><ExampleChip /></div>}
    <Mono size={18} color={C.ink2} style={{ letterSpacing: 1.5, textTransform: "none", marginLeft: 8 }}>{title}</Mono>
  </div>
);

/* ───────────── captions: the sentence lights up word by word ───────────── */

/** A phrase takes over this long before its first word, so the old one has gone by then. */
const PHRASE_LEAD = 0.04;
const phraseAt = (t: number) => PHRASES.reduce((idx, ph, i) => (t >= ph[0].t - PHRASE_LEAD ? i : idx), 0);

const Caption: React.FC = () => {
  const t = useT();
  const tone = toneAt(t);
  const idx = phraseAt(t);
  const phrase = PHRASES[idx];
  // the finished phrase drifts up and fades out just before the next one starts
  const next = PHRASES[idx + 1]?.[0].t;
  const out = next === undefined ? 0 : interpolate(t, [next - PHRASE_LEAD - 0.14, next - PHRASE_LEAD], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  return (
    <div style={{ position: "absolute", left: 72, right: 72, top: 178, fontFamily: FONT.display, fontWeight: 800, fontSize: 68, lineHeight: 1.12, letterSpacing: -1.6, color: tone.ink, opacity: 1 - out, transform: `translateY(${-14 * out}px)`, filter: out > 0 ? `blur(${4 * out}px)` : undefined }}>
      {phrase.map((w: Word, i) => {
        // each word eases in as it is spoken: a soft rise out of a light blur, no flash beforehand
        const r = ease(t, w.t - 0.06, 0.3, Easing.out(Easing.cubic));
        const style: React.CSSProperties = w.em
          ? { fontFamily: SERIF, fontWeight: 400, fontSize: 80, letterSpacing: -0.5, color: tone.accent, textShadow: tone === DARK ? GLOW : "none" }
          : {};
        return (
          <span key={i} style={{ position: "relative", display: "inline-block", marginRight: 16, opacity: r, transform: `translateY(${(1 - r) * 18}px) scale(${w.em ? 0.92 + 0.08 * r : 1})`, filter: r > 0 && r < 1 ? `blur(${(1 - r) * 5}px)` : undefined, ...style }}>
            {w.w}
            {w.strike !== undefined && t >= w.strike && (
              <span style={{ position: "absolute", left: -4, top: "54%", height: 7, borderRadius: 4, background: tone.accent, width: `calc(${ease(t, w.strike, 0.2) * 100}% + 8px)` }} />
            )}
          </span>
        );
      })}
    </div>
  );
};

/* ───────────── header: chapter tag left, live counter right ───────────── */

const Header: React.FC = () => {
  const t = useT();
  const tone = toneAt(t);
  const sc = SCENES[sceneIndexAt(t)];
  const c = COUNTERS[sc.key];
  let value = c.text ?? "";
  if (c.steps) {
    const big = c.steps[c.steps.length - 1][1] > 1000;
    value = big
      ? fmtN(interpolate(t, [c.steps[0][0], c.steps[c.steps.length - 1][0]], [c.steps[0][1], c.steps[c.steps.length - 1][1]], { ...clamp, easing: Easing.out(Easing.quad) }))
      : String(stepAt(t, c.steps, c.steps[0][1]));
  }
  const color = tone === DARK ? C.ink2 : "rgba(11,10,9,0.7)";
  return (
    <div style={{ position: "absolute", top: 92, left: 72, right: 72, display: "flex", justifyContent: "space-between" }}>
      <Mono size={24} color={color} style={{ textTransform: "none", letterSpacing: 2 }}>{sc.label}</Mono>
      <Mono size={24} color={color}>
        {c.label} <span style={{ color: tone === DARK ? BLUE : INK_DARK, fontWeight: 700 }}>{value}</span>
      </Mono>
    </div>
  );
};

/* ───────────── the dock: SOCIA at work, badges climbing ───────────── */

const TabIcon: React.FC<{ k: string; color: string }> = ({ k, color }) => {
  const s = { fill: "none", stroke: color, strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="34" height="34" viewBox="0 0 24 24">
      {k === "accounts" && (<><path {...s} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path {...s} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>)}
      {k === "posts" && (<><rect {...s} x="3" y="3" width="18" height="18" rx="4" /><path {...s} d="M10 8.5v7l6-3.5z" /></>)}
      {k === "plan" && (<><rect {...s} x="3" y="5" width="18" height="16" rx="3" /><path {...s} d="M3 10h18M8 3v4M16 3v4" /></>)}
      {k === "studio" && (<><circle {...s} cx="6" cy="6" r="3" /><circle {...s} cx="6" cy="18" r="3" /><path {...s} d="M8.5 7.5 20 18M8.5 16.5 20 6" /></>)}
      {k === "drafts" && (<><circle {...s} cx="12" cy="12" r="9" /><path {...s} d="m8 12 3 3 5-6" /></>)}
    </svg>
  );
};

const activeTabAt = (key: SceneKey, t: number) =>
  key === "connect" ? "accounts" : key === "read" ? (t >= 19.52 ? "plan" : "posts") : key === "studio" ? "studio" : key === "draft" ? "drafts" : null;

const Dock: React.FC = () => {
  const t = useT();
  const sc = SCENES[sceneIndexAt(t)];
  const status = DOCK.status.reduce((s, [at, v]) => (t >= at ? v : s), DOCK.status[0][1]);
  const active = activeTabAt(sc.key, t);
  const live = status === "LIVE" || status === "READY";
  return (
    <div style={{ position: "absolute", left: 110, right: 110, top: 1390 }}>
      <Card style={{ padding: "22px 26px 26px", background: "#0f0e0d" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <Mono size={20} color={C.ink3} style={{ textTransform: "none", letterSpacing: 1.5 }}>{DOCK.title}</Mono>
          <span style={{ fontFamily: SERIF, fontSize: 46, color: C.ink, marginLeft: 16, lineHeight: 1 }}>{DOCK.name}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: live ? "#3ddc84" : BLUE, boxShadow: `0 0 12px ${live ? "#3ddc84" : BLUE}` }} />
            <Mono size={20} color={live ? "#3ddc84" : BLUE}>{status}</Mono>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {DOCK.tabs.map((tab) => {
            const n = stepAt(t, tab.steps, 0);
            const lastStep = tab.steps.filter(([at]) => t >= at).pop();
            const bump = lastStep ? popE(t, lastStep[0], 0.25) : 0;
            const on = active === tab.key || (active === null && n > 0);
            const isActive = active === tab.key;
            return (
              <div key={tab.key} style={{ position: "relative", flex: 1, height: 116, borderRadius: 18, border: `2px solid ${isActive ? BLUE : n > 0 ? "rgba(59,124,255,0.45)" : "rgba(255,255,255,0.1)"}`, background: isActive ? "rgba(59,124,255,0.12)" : "transparent", boxShadow: isActive ? BOX_GLOW : "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <TabIcon k={tab.key} color={on ? C.ink : C.ink3} />
                <Mono size={16} color={on ? C.ink : C.ink3} style={{ letterSpacing: 2 }}>{tab.label}</Mono>
                {n > 0 && (
                  <div style={{ position: "absolute", top: -16, right: -10, minWidth: 40, height: 40, padding: "0 10px", borderRadius: 20, background: BLUE, color: INK_DARK, fontFamily: FONT.display, fontWeight: 800, fontSize: 22, display: "grid", placeItems: "center", transform: `scale(${1 + 0.35 * Math.sin(Math.PI * bump) * (bump < 1 ? 1 : 0)})`, boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}>{n}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

/* ───────────── scenes ───────────── */

/** Fades a scene in at its start and out just before the next scene. */
const SceneFrame: React.FC<{ k: SceneKey; children: React.ReactNode }> = ({ k, children }) => {
  const t = useT();
  const i = SCENES.findIndex((s) => s.key === k);
  const start = SCENES[i].at;
  const end = SCENES[i + 1]?.at ?? 99;
  if (t < start - 0.01 || t >= end) return null;
  const pin = ease(t, start, 0.18);
  const pout = 1 - interpolate(t, [end - 0.14, end], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity: Math.min(pin, pout), transform: `scale(${0.97 + 0.03 * pin})` }}>{children}</AbsoluteFill>;
};

const Rise: React.FC<{ at: number; y?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, y = 26, style, children }) => {
  const t = useT();
  const p = ease(t, at, 0.24);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>;
};

const PopIn: React.FC<{ at: number; from?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, from = 0.6, style, children }) => {
  const t = useT();
  const p = popE(t, at);
  return <div style={{ opacity: Math.min(1, ease(t, at, 0.12)), transform: `scale(${from + (1 - from) * p})`, ...style }}>{children}</div>;
};

/* 0 · for growing creators and influencers */
const IntroScene: React.FC = () => {
  const t = useT();
  const tab = ease(t, 3.34, 0.25);
  const pill = (txt: string, at: number) => (
    <PopIn at={at} from={0.7}>
      <span style={{ display: "inline-block", fontFamily: FONT.mono, fontWeight: 600, fontSize: 26, letterSpacing: 3, textTransform: "uppercase", color: INK_DARK, background: BLUE, borderRadius: 999, padding: "12px 26px" }}>{txt}</span>
    </PopIn>
  );
  return (
    <SceneFrame k="intro">
      <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center", gap: 70, opacity: tab, transform: `translateY(${(1 - tab) * 20}px)` }}>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 40, color: C.ink3 }}>Following</span>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 40, color: C.ink, borderBottom: `5px solid ${BLUE}`, paddingBottom: 8 }}>For You</span>
      </div>
      <Rise at={0.19} y={40} style={{ position: "absolute", left: 160, right: 160, top: 690 }}>
        <Card style={{ padding: "36px 36px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
          <Img src={avatar} style={{ width: 230, height: 230, borderRadius: 115, border: "5px solid #121110", boxShadow: `0 0 0 5px ${BLUE}`, transform: `rotate(${Math.sin(t * 5) * 5}deg) scale(${1 + 0.04 * Math.sin(t * 9)})` }} />
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 44, color: C.ink }}>@you</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {pill("growing creator", 0.5)}
            {pill("influencer", 2.7)}
          </div>
        </Card>
      </Rise>
      <Stamp at={3.94} text="THIS IS FOR YOU" x={540} y={1290} size={56} rotate={-5} />
    </SceneFrame>
  );
};

/* 1 · the agent */
const Mascot: React.FC = () => {
  const t = useT();
  const bob = Math.sin(t * 3.2) * 6;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${bob}px)` }}>
      <div style={{ width: 196, height: 172, borderRadius: 34, border: `6px solid ${BLUE}`, background: "#0f0e0d", boxShadow: BOX_GLOW, display: "grid", placeItems: "center" }}>
        <Img src={mark} style={{ width: 118, height: 118, borderRadius: 26 }} />
      </div>
      <svg width="300" height="300" viewBox="0 0 300 300" style={{ marginTop: -6 }}>
        <rect x="40" y="10" width="220" height="190" rx="36" fill="#1b1a19" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <path d="M120 10 L150 70 L180 10 Z" fill="#f2efe9" />
        <path d="M143 30 L157 30 L162 110 L150 128 L138 110 Z" fill={BLUE} />
        <path d="M120 10 L150 70 L105 120 Z" fill="#141312" />
        <path d="M180 10 L150 70 L195 120 Z" fill="#141312" />
        <rect x="98" y="200" width="42" height="80" rx="12" fill="#1b1a19" />
        <rect x="160" y="200" width="42" height="80" rx="12" fill="#1b1a19" />
      </svg>
    </div>
  );
};

const AgentScene: React.FC = () => {
  const t = useT();
  const only = ease(t, 6.23, 0.35);
  return (
    <SceneFrame k="agent">
      <div style={{ position: "absolute", left: -20, right: -20, top: 690, textAlign: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 330, letterSpacing: -10, color: "transparent", WebkitTextStroke: `4px rgba(59,124,255,${0.4 * only})`, transform: `rotate(-6deg) scale(${0.9 + 0.1 * only})` }}>ONLY</div>
      <Rise at={4.82} y={60}>
        <Mascot />
      </Rise>
      <PopIn at={6.76} style={{ position: "absolute", left: 0, right: 0, top: 1150, display: "flex", justifyContent: "center" }}>
        <div style={{ transform: "rotate(-5deg)", background: BLUE, borderRadius: 22, padding: "18px 26px 22px", textAlign: "center", boxShadow: "0 16px 40px rgba(0,0,0,0.45)" }}>
          <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 52, color: INK_DARK, lineHeight: 1 }}>HELLO</div>
          <Mono size={18} color={INK_DARK} style={{ letterSpacing: 3 }}>my only job is</Mono>
          <div style={{ marginTop: 10, background: "#f2efe9", borderRadius: 10, padding: "6px 22px", fontFamily: FONT.script, fontSize: 44, color: INK_DARK }}>tell you what to post</div>
        </div>
      </PopIn>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1405, display: "flex", justifyContent: "center", gap: 34 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const lit = ease(t, 7.82 + i * 0.07, 0.15);
          const c = `rgba(${Math.round(120 + (59 - 120) * lit)},${Math.round(120 + (124 - 120) * lit)},${Math.round(120 + (255 - 120) * lit)},1)`;
          return (
            <svg key={i} width="44" height="52" viewBox="0 0 44 52">
              <circle cx="22" cy="13" r="11" fill={c} />
              <path d="M2 52 C2 32 42 32 42 52 Z" fill={c} />
            </svg>
          );
        })}
      </div>
    </SceneFrame>
  );
};

/* 2 · the name */
const NameScene: React.FC = () => (
  <SceneFrame k="name">
    <PopIn at={9.2} from={0.8} style={{ position: "absolute", left: 0, right: 0, top: 760, textAlign: "center" }}>
      <div style={{ fontFamily: SERIF, fontSize: 300, lineHeight: 1, color: BLUE, textShadow: GLOW }}>SOCIA</div>
    </PopIn>
    <Rise at={9.4} style={{ position: "absolute", left: 0, right: 0, top: 1130, display: "flex", justifyContent: "center" }}>
      <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 24, letterSpacing: 2, textTransform: "uppercase", color: BLUE, border: `2px solid ${BLUE}`, borderRadius: 999, padding: "10px 22px" }}>IG · FB · YT · TIKTOK</span>
    </Rise>
  </SceneFrame>
);

/* 3 · not out yet: coming soon, so save the video */
const LinkScene: React.FC = () => {
  const t = useT();
  const save = popE(t, 10.96);
  return (
    <SceneFrame k="link">
      <Rise at={9.9} y={40} style={{ position: "absolute", left: 120, right: 120, top: 640 }}>
        <Card style={{ padding: "34px 34px 38px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Img src={mark} style={{ width: 84, height: 84, borderRadius: 20 }} />
            <div>
              <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 44, color: C.ink }}>SOCIA</div>
              <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 28, color: C.ink2 }}>Know what to post.</div>
            </div>
          </div>
          <PopIn at={10.13} from={0.6} style={{ marginTop: 30 }}>
            <div style={{ border: `3px solid ${BLUE}`, borderRadius: 18, padding: "20px 0 26px", boxShadow: BOX_GLOW, textAlign: "center", fontFamily: SERIF, fontSize: 104, lineHeight: 1, color: BLUE, textShadow: GLOW }}>{SITE}</div>
          </PopIn>
        </Card>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 18, marginTop: 34, marginRight: 30, opacity: Math.min(1, save * 2), transform: `scale(${0.4 + 0.6 * save})` }}>
          <Mono size={22} color={C.ink2}>save this video</Mono>
          <svg width="110" height="130" viewBox="0 0 24 28">
            <path d="M4 2h16v24l-8-6-8 6z" fill={BLUE} stroke={C.ink} strokeWidth="1.2" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 10px ${BLUE})` }} />
          </svg>
        </div>
      </Rise>
    </SceneFrame>
  );
};

/* 4 · connect the four platforms, once */
const PlatformGlyph: React.FC<{ k: string }> = ({ k }) => {
  if (k === "Instagram") return <InstagramIcon size={96} />;
  if (k === "Facebook")
    return (
      <svg width="96" height="96" viewBox="0 0 56 56"><circle cx="28" cy="28" r="26" fill="#1877f2" /><path d="M31 46V31h5l1-6h-6v-4c0-2 1-3 3-3h3v-5c-1 0-3-.3-5-.3-5 0-8 3-8 8v4.3h-5v6h5v15z" fill="#fff" /></svg>
    );
  if (k === "YouTube")
    return (
      <svg width="96" height="96" viewBox="0 0 56 56"><rect x="3" y="11" width="50" height="34" rx="10" fill="#ff0033" /><path d="M23 20v16l14-8z" fill="#fff" /></svg>
    );
  return (
    <svg width="96" height="96" viewBox="0 0 56 56"><rect x="2" y="2" width="52" height="52" rx="14" fill="#000" stroke="rgba(255,255,255,0.2)" /><path d="M31 13c1 4 4 7 8 7v6c-3 0-6-1-8-3v11a9 9 0 1 1-9-9h1v6a3 3 0 1 0 2 3V13z" fill="#fff" style={{ filter: "drop-shadow(2px 0 0 #fe2c55) drop-shadow(-2px 0 0 #25f4ee)" }} /></svg>
  );
};

const ConnectScene: React.FC = () => {
  const t = useT();
  const items: [string, number][] = [["Instagram", 12.58], ["Facebook", 13.23], ["YouTube", 13.84], ["TikTok", 14.96]];
  return (
    <SceneFrame k="connect">
      <div style={{ position: "absolute", left: 120, right: 120, top: 600, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
        {items.map(([name, at]) => {
          const on = ease(t, at, 0.2);
          return (
            <PopIn key={name} at={at - 0.12} from={0.8}>
              <Card style={{ height: 330, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, border: `2px solid ${on > 0.5 ? BLUE : "rgba(255,255,255,0.08)"}`, boxShadow: on > 0.5 ? BOX_GLOW : "none" }}>
                <PlatformGlyph k={name} />
                <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 34, color: C.ink }}>{name}</div>
                <Mono size={18} color={on > 0.5 ? BLUE : C.ink3}>{on > 0.5 ? "✓ connected" : "connect"}</Mono>
              </Card>
            </PopIn>
          );
        })}
      </div>
      <Stamp at={15.6} text="ONCE." x={540} y={1360} size={64} rotate={-4} />
    </SceneFrame>
  );
};

/* 5 · reads every post, finds the winners, plans the week (blue ground) */
const ReadScene: React.FC = () => {
  const t = useT();
  const flip = ease(t, 18.44, 0.2);
  return (
    <SceneFrame k="read">
      <div style={{ position: "absolute", left: 90, right: 90, top: 560 }}>
        <Card>
          <WindowBar title="my top posts · 90 days" example />
          {TOP_POSTS.map((r, i) => (
            <Rise key={r.title} at={16.38 + i * 0.16} y={16}>
              <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 26px", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ width: 50, height: 50, borderRadius: 25, background: r.hue, display: "grid", placeItems: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 22, color: "#fff" }}>{r.title[0]}</div>
                <div style={{ flex: 1, fontFamily: FONT.display, fontWeight: 800, fontSize: 28, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 26, color: C.ink2, width: 110, textAlign: "right" }}>▶ {r.views}</div>
                <div style={{ width: 120, height: 48, borderRadius: 10, display: "grid", placeItems: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 26, background: flip > 0.5 ? BLUE : "rgba(255,255,255,0.08)", color: flip > 0.5 ? INK_DARK : C.ink3, transform: `scale(${0.85 + 0.15 * flip})` }}>{flip > 0.5 ? r.x : "--"}</div>
              </div>
            </Rise>
          ))}
        </Card>
        <Stamp at={18.44} text="BEATS YOUR AVERAGE" x={560} y={60} size={40} dark />
      </div>
      <Rise at={19.43} style={{ position: "absolute", left: 90, right: 90, top: 1080 }}>
        <Card style={{ padding: "22px 26px 26px" }}>
          <Mono size={18} color={C.ink2} style={{ letterSpacing: 2 }}>your week · planned by SOCIA</Mono>
          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            {WEEK.map((d, i) => {
              const fill = ease(t, 19.52 + i * 0.14, 0.18);
              return (
                <div key={d} style={{ flex: 1, height: 120, borderRadius: 14, background: `rgba(59,124,255,${0.08 + 0.9 * fill})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, transform: `scale(${0.9 + 0.1 * fill})` }}>
                  <Mono size={18} color={fill > 0.5 ? INK_DARK : C.ink3} style={{ letterSpacing: 1 }}>{d}</Mono>
                  <div style={{ width: 26, height: 26, borderRadius: 13, border: `3px solid ${fill > 0.5 ? INK_DARK : C.ink3}`, opacity: fill }} />
                </div>
              );
            })}
          </div>
        </Card>
      </Rise>
    </SceneFrame>
  );
};

/* 6 · builds videos from your clips, rates the hook, tells you what to fix (blue ground) */
const StudioScene: React.FC = () => {
  const t = useT();
  return (
    <SceneFrame k="studio">
      <div style={{ position: "absolute", left: 90, right: 90, top: 560 }}>
        <Card style={{ padding: "22px 24px 24px" }}>
          <Mono size={18} color={C.ink2} style={{ letterSpacing: 2 }}>your clips</Mono>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <PopIn key={i} at={21.1 + i * 0.1} from={0.4} style={{ flex: 1 }}>
                <div style={{ height: 120, borderRadius: 12, background: "linear-gradient(160deg, rgba(59,124,255,0.55), rgba(59,124,255,0.12))", border: "2px solid rgba(59,124,255,0.6)", display: "grid", placeItems: "center" }}>
                  <div style={{ width: 0, height: 0, borderLeft: "16px solid rgba(242,239,233,0.85)", borderTop: "10px solid transparent", borderBottom: "10px solid transparent" }} />
                </div>
              </PopIn>
            ))}
          </div>
          <PopIn at={22.28} from={0.85} style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, borderRadius: 14, border: `2px solid ${BLUE}`, background: "rgba(59,124,255,0.12)", padding: "14px 18px" }}>
              <Mono size={18} color={BLUE}>cut built</Mono>
              <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 30, color: C.ink }}>Snack ranking · 14 s</span>
            </div>
          </PopIn>
        </Card>
      </div>
      <Rise at={22.99} style={{ position: "absolute", left: 90, right: 90, top: 1000 }}>
        <Card style={{ padding: "20px 26px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Mono size={18} color={C.ink2} style={{ letterSpacing: 2 }}>the rater</Mono>
            <ExampleChip />
          </div>
          {RATER.map((r, i) => {
            const p = ease(t, 23.38 + i * 0.16, 0.2);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 20, padding: "10px 0", opacity: 0.25 + 0.75 * p }}>
                <div style={{ width: 150, fontFamily: FONT.display, fontWeight: 800, fontSize: 30, color: C.ink }}>{r.id}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {Array.from({ length: 5 }, (_, d) => (
                    <div key={d} style={{ width: 26, height: 26, borderRadius: 13, background: d < r.score && p > 0.5 ? BLUE : "rgba(255,255,255,0.1)" }} />
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
        <Stamp at={24.91} text="FIX: CUT TO 8 s" x={640} y={200} size={44} dark />
      </Rise>
    </SceneFrame>
  );
};

/* 7 · every plan lands as a draft; nothing posts until you say so (blue ground) */
const DraftScene: React.FC = () => {
  const t = useT();
  const cx = interpolate(t, [27.42, 28.12], [380, 690], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cy = interpolate(t, [27.42, 28.12], [520, 470], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <SceneFrame k="draft">
      <div style={{ position: "absolute", left: 90, right: 90, top: 620 }}>
        <Card>
          <WindowBar title="draft 1 of 7 · ready for you" example />
          <div style={{ padding: "26px 30px 30px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Mono size={20} color={BLUE}>{DRAFT.when}</Mono>
              <PopIn at={26.64} from={0.5}>
                <Mono size={18} color={INK_DARK} style={{ background: BLUE, borderRadius: 8, padding: "4px 12px" }}>draft</Mono>
              </PopIn>
            </div>
            <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 40, color: C.ink, marginTop: 14 }}>{DRAFT.title}</div>
            <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 28, lineHeight: 1.35, color: C.ink2, marginTop: 10 }}>{DRAFT.body}</div>
            <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
              <div style={{ flex: 1, height: 74, borderRadius: 16, border: "2px solid rgba(255,255,255,0.15)", display: "grid", placeItems: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 28, color: C.ink }}>Edit</div>
              <div style={{ flex: 1, height: 74, borderRadius: 16, background: BLUE, display: "grid", placeItems: "center", fontFamily: FONT.display, fontWeight: 800, fontSize: 28, color: INK_DARK }}>Schedule</div>
            </div>
          </div>
        </Card>
        <svg width="46" height="54" viewBox="0 0 23 27" style={{ position: "absolute", left: cx, top: cy, opacity: ease(t, 27.32, 0.15), filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}>
          <path d="M2 2 L2 22 L7.5 17 L11 25 L14.5 23.5 L11 15.8 L18.5 15.8 Z" fill="#fff" stroke={INK_DARK} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <Stamp at={28.47} text="YOU DECIDE" x={720} y={-10} size={50} dark />
      </div>
      <Rise at={27.75} style={{ position: "absolute", left: 0, right: 0, top: 1300, textAlign: "center" }}>
        <Mono size={22} color={INK_DARK} style={{ letterSpacing: 2 }}>nothing posts until you schedule it</Mono>
      </Rise>
    </SceneFrame>
  );
};

/* 8 · the best time to post, from your own numbers (an example grid) */
const BestScene: React.FC = () => {
  const t = useT();
  const win = popE(t, 30.1, 0.3);
  const lit = win > 0.5;
  return (
    <SceneFrame k="best">
      <div style={{ position: "absolute", left: 90, right: 90, top: 560 }}>
        <Card>
          <WindowBar title="best time to post · your numbers" example />
          <div style={{ padding: "22px 26px 28px" }}>
            <div style={{ display: "flex", gap: 10, marginLeft: 110 }}>
              {BEST.days.map((d, i) => (
                <Mono key={i} size={20} color={i === BEST.day && lit ? BLUE : C.ink3} style={{ flex: 1, textAlign: "center" }}>{d}</Mono>
              ))}
            </div>
            {BEST.bands.map((b, r) => (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <Mono size={18} color={r === BEST.band && lit ? BLUE : C.ink3} style={{ width: 100, letterSpacing: 1 }}>{b}</Mono>
                {BEST.days.map((_, c) => {
                  const on = ease(t, 29.61 + (r * 7 + c) * 0.012, 0.18);
                  const best = r === BEST.band && c === BEST.day;
                  const heat = 0.1 + 0.42 * (((c * 5 + r * 3) % 7) / 6);
                  return (
                    <div key={c} style={{ flex: 1, height: 74, borderRadius: 12, background: best && win > 0 ? BLUE : `rgba(59,124,255,${heat * on})`, border: `3px solid ${best && lit ? C.ink : "transparent"}`, boxShadow: best && lit ? BOX_GLOW : "none", transform: best ? `scale(${1 + 0.18 * Math.sin(Math.PI * win)})` : undefined }} />
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
        <Stamp at={31.78} text="FROM YOUR OWN NUMBERS" x={560} y={480} size={40} />
      </div>
      <PopIn at={30.33} from={0.7} style={{ position: "absolute", left: 0, right: 0, top: 1160, textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontSize: 120, lineHeight: 1, color: BLUE, textShadow: GLOW }}>{BEST.label}</div>
      </PopIn>
    </SceneFrame>
  );
};

/* 9 · comment "early access" or "SOCIA" */
const CommentRow: React.FC<{ at: number; text: React.ReactNode }> = ({ at, text }) => (
  <Rise at={at} y={14}>
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 30px" }}>
      <Img src={avatar} style={{ width: 64, height: 64, borderRadius: 32 }} />
      <div>
        <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 26, color: C.ink }}>@you</div>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 32, color: BLUE }}>{text}</div>
      </div>
    </div>
  </Rise>
);

const CommentScene: React.FC = () => {
  const t = useT();
  const typed = "early access".slice(0, Math.max(0, Math.floor(interpolate(t, [32.68, 33.66], [0, 12], clamp))));
  const spelled = SPELL.filter(([, at]) => t >= at).map(([l]) => l).join("");
  const posted1 = t >= 33.77;
  const typing = t >= 35.92 ? "" : posted1 ? spelled : typed;
  return (
    <SceneFrame k="comment">
      <div style={{ position: "absolute", left: 120, right: 120, top: 640 }}>
        <Card>
          <div style={{ padding: "22px 30px 10px" }}>
            <Mono size={20} color={C.ink2} style={{ textTransform: "none", letterSpacing: 1 }}>Comments</Mono>
          </div>
          {posted1 && <CommentRow at={33.77} text="early access" />}
          {t >= 35.92 && <CommentRow at={35.92} text="SOCIA" />}
          <div style={{ margin: "14px 30px 26px", padding: "18px 22px", borderRadius: 16, border: `2px solid ${typing ? BLUE : "rgba(255,255,255,0.1)"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 32, color: typing ? C.ink : C.ink3 }}>
              {typing || "Add a comment…"}
              {typing && Math.floor(t * 3) % 2 === 0 ? "|" : ""}
            </span>
            <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 26, color: BLUE }}>Post</span>
          </div>
        </Card>
        <Stamp at={36.41} text="GET IN EARLY" x={430} y={-30} size={54} />
      </div>
    </SceneFrame>
  );
};

/* 10 · the first 50 get one week free */
const FiftyScene: React.FC = () => (
  <SceneFrame k="fifty">
    <PopIn at={37.54} from={0.5} style={{ position: "absolute", left: 0, right: 0, top: 560, textAlign: "center" }}>
      <div style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 560, letterSpacing: -30, lineHeight: 1, color: BLUE, textShadow: GLOW }}>50</div>
    </PopIn>
    <Stamp at={38.62} text="1 WEEK FREE" x={720} y={1150} size={60} rotate={-6} />
  </SceneFrame>
);

/* 11 · follow, like, share with a friend */
const ShareButton: React.FC<{ at: number; label: string; children: React.ReactNode }> = ({ at, label, children }) => (
  <PopIn at={at} from={0.4} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
    <div style={{ width: 210, height: 210, borderRadius: 105, background: "#121110", border: `4px solid ${BLUE}`, boxShadow: BOX_GLOW, display: "grid", placeItems: "center" }}>{children}</div>
    <Mono size={26} color={C.ink}>{label}</Mono>
  </PopIn>
);

const ShareScene: React.FC = () => {
  const t = useT();
  return (
    <SceneFrame k="share">
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center", gap: 46 }}>
        <ShareButton at={39.16} label="Follow">
          <svg width="96" height="96" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke={BLUE} strokeWidth="3" strokeLinecap="round" /></svg>
        </ShareButton>
        <ShareButton at={39.68} label="Like">
          <svg width="96" height="96" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={BLUE} /></svg>
        </ShareButton>
        <ShareButton at={40.26} label="Share">
          <svg width="96" height="96" viewBox="0 0 24 24"><path d="M14 5l7 7-7 7v-4c-6 0-9 2-11 5 1-6 4-10 11-11z" fill={BLUE} /></svg>
        </ShareButton>
      </div>
      <Rise at={41.13} style={{ position: "absolute", left: 0, right: 0, top: 1000, textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontSize: 64, color: C.ink }}>send it to a friend it could help</div>
      </Rise>
      <Rise at={41.87} style={{ position: "absolute", left: 0, right: 0, top: 1150, display: "flex", justifyContent: "center", alignItems: "center", gap: 18 }}>
        <Img src={mark} style={{ width: 70, height: 70, borderRadius: 18, opacity: ease(t, 41.87, 0.3) }} />
        <span style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 40, color: C.ink, letterSpacing: 2 }}>{SITE}</span>
      </Rise>
    </SceneFrame>
  );
};

/* ───────────── ground, sound, root ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const tone = toneAt(t);
  return (
    <AbsoluteFill style={{ background: tone.ground }}>
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${tone.dots} 2px, transparent 2.5px)`, backgroundSize: "36px 36px" }} />
      {tone === DARK && <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 85%, rgba(59,124,255,0.12), transparent 60%)" }} />}
    </AbsoluteFill>
  );
};

type Cue = { src: string; at: number; volume: number };
const STAMPS = [3.94, 15.6, 18.44, 24.91, 28.47, 31.78, 36.41, 38.62];
const CUES: Cue[] = [
  ...STAMPS.map((at) => ({ src: sfxPop, at, volume: 0.7 })),
  ...DOCK.tabs.flatMap((tab) => tab.steps.map(([at]) => ({ src: sfxClick, at, volume: 0.45 }))),
  { src: sfxWhoosh, at: 16.22, volume: 0.5 },
  { src: sfxWhoosh, at: 29.29, volume: 0.5 },
  { src: sfxPop, at: 10.96, volume: 0.5 },
  ...[39.16, 39.68, 40.26].map((at) => ({ src: sfxPop, at, volume: 0.45 })),
  ...[33.77, 35.92].map((at) => ({ src: sfxClick, at, volume: 0.5 })),
  { src: sfxImpact, at: 37.54, volume: 0.75 },
];

const Soundtrack: React.FC = () => (
  <>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.round(c.at * FPS) + 1} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
  </>
);

export const Agent: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT.display }}>
    <Soundtrack />
    <Ground />
    {/* scenes sit 90 px higher than drawn so the dock clears TikTok's caption overlay, as in the reference */}
    <AbsoluteFill style={{ transform: "translateY(-90px)" }}>
    <IntroScene />
    <AgentScene />
    <NameScene />
    <LinkScene />
    <ConnectScene />
    <ReadScene />
    <StudioScene />
    <DraftScene />
    <BestScene />
    <CommentScene />
    <FiftyScene />
    <ShareScene />
    </AbsoluteFill>
    <Header />
    <Caption />
    <Dock />
  </AbsoluteFill>
);
