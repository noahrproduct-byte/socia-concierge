import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { InstagramIcon } from "../method/ui";
import { FPS, PHRASES, QUESTION, REELS, SERIES, SOURCE, T } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["400", "600"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const SERIF = `${serif.fontFamily}, Georgia, serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA's dark palette (app dark theme): near-black ground, warm white ink, gold accent, cobalt for data.
const BG = "#0d0e10";
const INK = "#f2efe9";
const INK2 = "rgba(242,239,233,0.62)";
const INK3 = "rgba(242,239,233,0.34)";
const GOLD = "#d9b25c";
const COBALT = "#3b7cff";
const RED = "#ff6b57";
const GREEN = "#4cc27e";
const CORAL = "#d9714e";
// Claude's dark chat theme.
const CL_BG = "#262624";
const CL_BAR = "#1f1e1d";
const CL_LINE = "#3a3936";
const CL_BUBBLE = "#141413";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = at <= 0 ? 1 : ease(t, at, 0.35);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 12 + (1 - pout) * 10}px)`, transform: `scale(${0.96 + 0.04 * pin})` }}>{children}</div>;
};

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;
const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = CORAL }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 2 ? 40 : 46;
      return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * len} y2={Math.sin(a) * len} stroke={color} strokeWidth={9} strokeLinecap="round" />;
    })}
  </svg>
);

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: BG }}>
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "72px 72px", backgroundPosition: "36px 0" }} />
      <div style={{ position: "absolute", left: 140 + Math.sin(t * 0.4) * 60, top: 380, width: 800, height: 800, borderRadius: "50%", background: "rgba(217,178,92,0.10)", filter: "blur(170px)" }} />
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : 0;
  return (
    <div style={{ position: "absolute", top: 1190, left: 80, right: 80, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 54, lineHeight: 1.18, letterSpacing: -1, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)`, textShadow: "0 4px 24px rgba(0,0,0,0.6)" }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? GOLD : INK }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── 1 · hook ───────────── */

const Hook: React.FC = () => {
  const t = useT();
  const flow = (t * 120) % 40;
  const sub = ease(t, T.hook2 - 0.1, 0.35);
  return (
    <Beat at={0} until={T.ask}>
      <div style={{ position: "absolute", left: 150, right: 150, top: 400, height: 150, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 130, height: 130, borderRadius: 34, background: "#1d1c1a", border: `1px solid ${CL_LINE}`, display: "flex", alignItems: "center", justifyContent: "center" }}><ClaudeMark size={84} /></div>
        <svg width={120} height={10} style={{ overflow: "visible" }}><line x1={0} y1={5} x2={120} y2={5} stroke={GOLD} strokeWidth={5} strokeDasharray="14 26" strokeDashoffset={-flow} strokeLinecap="round" /></svg>
        <Mark size={100} />
        <svg width={120} height={10} style={{ overflow: "visible" }}><line x1={0} y1={5} x2={120} y2={5} stroke={GOLD} strokeWidth={5} strokeDasharray="14 26" strokeDashoffset={-flow} strokeLinecap="round" /></svg>
        <div style={{ width: 130, height: 130, borderRadius: 34, background: "#1d1c1a", border: `1px solid ${CL_LINE}`, display: "flex", alignItems: "center", justifyContent: "center" }}><InstagramIcon size={92} /></div>
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, top: 660, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 100, lineHeight: 1.0, letterSpacing: -4, color: INK }}>
        I connected Claude to my Instagram.
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: 1000, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 70, lineHeight: 1.08, letterSpacing: -2.5, color: GOLD, opacity: 0.35 + 0.65 * sub, transform: `translateY(${(1 - sub) * 10}px)` }}>
        Here's the first thing it told me.
      </div>
    </Beat>
  );
};

/* ───────────── 2 · Claude (dark) ───────────── */

const Window: React.FC<{ children: React.ReactNode; top?: number; height?: number }> = ({ children, top = 250, height = 900 }) => (
  <div style={{ position: "absolute", left: 52, width: 976, top, height, borderRadius: 24, overflow: "hidden", background: CL_BG, border: `1px solid ${CL_LINE}`, boxShadow: "0 40px 100px rgba(0,0,0,0.55)", fontFamily: SANS, color: INK }}>
    <div style={{ height: 58, background: CL_BAR, display: "flex", alignItems: "center", padding: "0 20px", gap: 10, borderBottom: `1px solid ${CL_LINE}` }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, fontSize: 21, fontWeight: 600, color: INK2 }}><ClaudeMark size={20} /> Claude</div>
    </div>
    <div style={{ position: "relative", height: height - 58 }}>{children}</div>
  </div>
);

const Composer: React.FC<{ text?: string; caret?: boolean }> = ({ text, caret }) => {
  const t = useT();
  const blink = Math.floor(t * 2.2) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, height: 132, borderRadius: 20, background: "#30302e", border: `1.5px solid ${text ? "#7a5b4e" : CL_LINE}`, padding: "18px 22px", boxSizing: "border-box", fontSize: 28, color: text ? INK : INK3 }}>
      {text || "Reply to Claude..."}
      {caret && blink ? <span style={{ display: "inline-block", width: 2, height: 30, background: INK, marginLeft: 2, verticalAlign: "middle" }} /> : null}
      <div style={{ position: "absolute", left: 18, bottom: 14, display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 600, color: INK2, background: "#3a3936", borderRadius: 14, padding: "5px 12px 5px 6px" }}>
        <Mark size={24} /> SOCIA <span style={{ width: 8, height: 8, borderRadius: 4, background: GREEN }} />
      </div>
      <div style={{ position: "absolute", right: 16, bottom: 14, width: 44, height: 44, borderRadius: 11, background: text ? CORAL : "#5a4038", color: "#fff", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>↑</div>
    </div>
  );
};

const Tile: React.FC<{ r: (typeof REELS)[number]; i: number; lit: number }> = ({ r, i, lit }) => {
  const t = useT();
  const p = popE(t, T.read + 0.35 + i * 0.16, 0.35);
  return (
    <div style={{ width: 296, height: 128, borderRadius: 16, background: "#30302e", border: r.opener && lit > 0.5 ? `3px solid ${GOLD}` : `1px solid ${CL_LINE}`, boxShadow: r.opener ? `0 0 ${30 * lit}px rgba(217,178,92,0.5)` : "none", padding: "12px 16px", boxSizing: "border-box", position: "relative", opacity: Math.min(1, p * 1.5) * (r.opener ? 1 : 1 - 0.65 * lit), transform: `scale(${(0.7 + 0.3 * p) * (r.opener ? 1 + 0.04 * lit : 1)})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: INK3, fontWeight: 600 }}><InstagramIcon size={20} /> {r.date}</div>
      <div style={{ marginTop: 6, fontSize: 18, lineHeight: 1.25, color: INK, fontWeight: 600, height: 46, overflow: "hidden" }}>{r.title}</div>
      <div style={{ position: "absolute", right: 14, top: 10, fontSize: 22, fontWeight: 800, color: GOLD }}>{r.v}</div>
    </div>
  );
};

const Chat: React.FC = () => {
  const t = useT();
  const sent = t >= T.typeTo + 0.12;
  const text = sent ? "" : typed(t, QUESTION, T.typeFrom, T.typeTo);
  const done = t >= T.readDone;
  const gridOut = ease(t, T.answer - 0.1, 0.35);
  const lit = ease(t, T.six, 0.3);
  const six = popE(t, T.answer, 0.4);
  const hl = ease(t, T.opener, 0.6);
  return (
    <Beat at={T.ask} until={T.chart}>
      <Window>
        {!sent ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 260, textAlign: "center", fontFamily: SERIF, fontSize: 46, color: INK, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
            <ClaudeMark size={44} /> What's on your mind?
          </div>
        ) : null}
        {sent ? (
          <div style={{ position: "absolute", right: 28, top: 24, background: CL_BUBBLE, borderRadius: 18, padding: "14px 22px", fontSize: 25, opacity: ease(t, T.typeTo + 0.12, 0.25) }}>{QUESTION}</div>
        ) : null}
        {t >= T.read ? (
          <div style={{ position: "absolute", left: 28, top: 112, display: "flex", alignItems: "center", gap: 12, fontSize: 21, opacity: ease(t, T.read, 0.25), border: `1px solid ${CL_LINE}`, borderRadius: 14, padding: "10px 16px", background: "#2d2c2a" }}>
            <Mark size={28} /><b>SOCIA</b>
            <span style={{ fontFamily: MONO, fontSize: 18, color: INK3 }}>get_top_posts</span>
            <span style={{ color: INK2 }}>{done ? "· read 9 Reels, last 30 days" : "· reading your Reels..."}</span>
            {done ? <span style={{ width: 26, height: 26, borderRadius: 13, background: GREEN, color: "#fff", fontSize: 16, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span> : null}
          </div>
        ) : null}
        {t >= T.read && gridOut < 1 ? (
          <div style={{ position: "absolute", left: 28, right: 28, top: 190, display: "flex", flexWrap: "wrap", gap: 12, opacity: 1 - gridOut, transform: `scale(${1 - 0.2 * gridOut})`, transformOrigin: "50% 0%" }}>
            {REELS.map((r, i) => <Tile key={i} r={r} i={i} lit={lit} />)}
          </div>
        ) : null}
        {t >= T.answer - 0.05 ? (
          <div style={{ position: "absolute", left: 30, right: 30, top: 200, fontFamily: SERIF, fontSize: 30, lineHeight: 1.45, color: INK }}>
            <div style={{ marginBottom: 14 }}><ClaudeMark size={28} /></div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 20, opacity: Math.min(1, six * 1.4), transform: `scale(${0.8 + 0.2 * six})`, transformOrigin: "0 50%" }}>
              <span style={{ fontFamily: SANS, fontSize: 150, fontWeight: 800, letterSpacing: -6, color: GOLD, lineHeight: 1 }}>5<span style={{ fontSize: 70, color: INK2, letterSpacing: -1, marginLeft: 18 }}>of 9</span></span>
              <span style={{ fontFamily: SANS, fontSize: 30, fontWeight: 700, color: INK2, lineHeight: 1.2 }}>Reels open with<br />the same line</span>
            </div>
            <div style={{ marginTop: 26, opacity: ease(t, T.answer + 0.3, 0.3) }}>
              <b>The opener.</b> 5 of your 9 Reels open with the same line:{" "}
              <span style={{ fontWeight: 600, backgroundImage: "linear-gradient(transparent 8%, rgba(217,178,92,0.4) 8%)", backgroundSize: `${hl * 100}% 100%`, backgroundRepeat: "no-repeat" }}>"Stop guessing what to post."</span>
            </div>
          </div>
        ) : null}
        <Composer text={text} caret={!sent && t >= T.ask + 0.2} />
      </Window>
    </Beat>
  );
};

/* ───────────── 3 · the decay ───────────── */

const PX = { l: 150, r: 950, top: 470, bottom: 1010, max: 80, min: -16 };
const px = (i: number) => PX.l + (i * (PX.r - PX.l)) / (SERIES.length - 1);
const py = (v: number) => PX.bottom - ((v - PX.min) / (PX.max - PX.min)) * (PX.bottom - PX.top);

const Chart: React.FC = () => {
  const t = useT();
  const pts = SERIES.map((s, i) => ({ x: px(i), y: py(s.v), v: s.v, d: s.date }));
  // the line reaches point i at T.points[i]
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const g = ease(t, T.points[i] - 0.3, 0.3, Easing.inOut(Easing.cubic));
    if (g <= 0) break;
    const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * g;
    const y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * g;
    path += ` L ${x} ${y}`;
  }
  const ref = ease(t, T.points[0] + 0.2, 0.6);
  const gap = ease(t, T.close, 0.6);
  const area = `M ${pts[1].x} ${py(75)} ${pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${pts[pts.length - 1].x} ${py(75)} Z`;
  return (
    <Beat at={T.chart} until={T.advice}>
      <div style={{ position: "absolute", left: 70, right: 70, top: 250, fontFamily: SANS }}>
        <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.8, color: INK, lineHeight: 1.05 }}>"Stop guessing what to post."</div>
        <div style={{ marginTop: 12, fontSize: 24, fontWeight: 600, color: INK2 }}>Interactions per Reel, in date order: the first use, then every repeat</div>
      </div>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {[0, 20, 40, 60, 80].map((v) => <line key={v} x1={PX.l - 40} x2={PX.r + 40} y1={py(v)} y2={py(v)} stroke="rgba(255,255,255,0.07)" strokeWidth={2} />)}
        <line x1={PX.l - 40} x2={PX.l - 40 + (PX.r - PX.l + 80) * ref} y1={py(75)} y2={py(75)} stroke={GOLD} strokeWidth={3} strokeDasharray="12 12" opacity={0.8} />
        <path d={area} fill={RED} opacity={0.16 * gap} />
        <path d={path} fill="none" stroke={COBALT} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 14px rgba(59,124,255,0.6))" }} />
        {pts.map((p, i) => {
          const q = popE(t, T.points[i], 0.35);
          return q > 0 ? <circle key={i} cx={p.x} cy={p.y} r={16 * q} fill={i === 0 ? GOLD : COBALT} stroke={BG} strokeWidth={5} /> : null;
        })}
      </svg>
      {pts.map((p, i) => {
        const q = popE(t, T.points[i], 0.35);
        const above = i === 0 || p.v > 15;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: p.x - 90, width: 180, top: above ? p.y - 100 : p.y + 26, textAlign: "center", fontFamily: SANS, fontSize: i === 0 ? 80 : 64, fontWeight: 800, letterSpacing: -2, color: i === 0 ? GOLD : INK, opacity: Math.min(1, q * 1.4), transform: `scale(${0.6 + 0.4 * q})` }}>{p.v}</div>
            <div style={{ position: "absolute", left: p.x - 90, width: 180, top: PX.bottom + 26, textAlign: "center", fontFamily: MONO, fontSize: 20, color: INK2, opacity: ease(t, T.chart + 0.2 + i * 0.08, 0.3) }}>{p.d}</div>
          </React.Fragment>
        );
      })}
      <div style={{ position: "absolute", left: PX.r - 360, width: 400, top: py(75) - 52, textAlign: "right", fontFamily: SANS, fontSize: 22, fontWeight: 700, color: GOLD, opacity: ref }}>first use: 75</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: py(46), textAlign: "center", fontFamily: SANS, fontSize: 40, fontWeight: 800, color: RED, opacity: gap, transform: `translateX(${110}px) scale(${0.9 + 0.1 * gap})` }}>none came close</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: PX.bottom + 80, textAlign: "center", fontFamily: MONO, fontSize: 19, color: INK3, opacity: ease(t, T.chart + 0.4, 0.3) }}>{SOURCE}</div>
    </Beat>
  );
};

/* ───────────── 4 · the advice ───────────── */

const Advice: React.FC = () => {
  const t = useT();
  const strike = ease(t, T.retire, 0.45);
  const card = ease(t, T.breakout, 0.4);
  const chips = ["named tool", "clear outcome", "time limit"];
  return (
    <Beat at={T.advice} until={T.end}>
      <Window top={250} height={900}>
        <div style={{ position: "absolute", left: 30, right: 30, top: 28, fontFamily: SERIF, fontSize: 32, lineHeight: 1.45, color: INK }}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}><ClaudeMark size={28} /><span style={{ fontFamily: SANS, fontSize: 19, color: INK3 }}>from your SOCIA Content Plan</span></div>
          <b>My advice:</b> retire{" "}
          <span style={{ position: "relative", color: strike > 0.5 ? INK3 : INK }}>
            "Stop guessing what to post."
            <span style={{ position: "absolute", left: 0, top: "52%", height: 4, background: RED, width: `${strike * 100}%` }} />
          </span>{" "}
          Build every Reel like your breakout.
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 300, borderRadius: 22, background: "#30302e", border: `2px solid ${card > 0.5 ? GREEN : CL_LINE}`, padding: "24px 28px", opacity: card, transform: `translateY(${(1 - card) * 20}px)`, fontFamily: SANS }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, color: INK2, fontWeight: 600 }}><InstagramIcon size={26} /> your breakout · Nov 1</div>
          <div style={{ marginTop: 12, fontSize: 44, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.12 }}>"Connect Claude to your Instagram in 60 seconds"</div>
          <div style={{ marginTop: 14, fontSize: 30, fontWeight: 800, color: GREEN }}>118 interactions</div>
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 640, display: "flex", gap: 14 }}>
          {chips.map((c, i) => {
            const q = popE(t, T.chips[i], 0.35);
            return <div key={c} style={{ flex: 1, textAlign: "center", borderRadius: 18, padding: "18px 0", fontFamily: SANS, fontSize: 28, fontWeight: 800, color: BG, background: GOLD, opacity: Math.min(1, q * 1.5), transform: `scale(${0.6 + 0.4 * q})` }}>{c}</div>;
          })}
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 26, fontFamily: MONO, fontSize: 18, color: INK3 }}>{SOURCE}</div>
      </Window>
    </Beat>
  );
};

/* ───────────── 5 · end ───────────── */

const End: React.FC = () => {
  const t = useT();
  const following = t >= T.follow + 0.45;
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 430, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, fontFamily: SANS }}>
        <div style={{ transform: `scale(${popE(t, T.end + 0.05, 0.45)})` }}><Mark size={190} /></div>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: INK }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, 26.79, 0.3) }}>coming soon</div>
        <div style={{ marginTop: 30, borderRadius: 26, padding: "20px 70px", fontSize: 46, fontWeight: 800, background: following ? "transparent" : INK, color: following ? INK : BG, border: `3px solid ${INK}`, transform: `scale(${popE(t, T.follow - 0.1)})` }}>{following ? "✓ Following" : "+ Follow"}</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0, volume: 0.45 },
  { src: sfxWhoosh, at: T.ask - 0.08, volume: 0.3 },
  ...Array.from({ length: 10 }, (_, i) => ({ src: sfxClick, at: T.typeFrom + i * 0.21, volume: 0.15 })),
  { src: sfxWhoosh, at: T.typeTo + 0.08, volume: 0.3 },
  ...REELS.map((_, i) => ({ src: sfxClick, at: T.read + 0.35 + i * 0.16, volume: 0.25 })),
  { src: sfxPop, at: T.readDone, volume: 0.35 },
  { src: sfxImpact, at: T.six, volume: 0.4 },
  { src: sfxWhoosh, at: T.chart - 0.08, volume: 0.3 },
  ...T.points.map((at) => ({ src: sfxPop, at, volume: 0.45 })),
  { src: sfxImpact, at: T.close, volume: 0.35 },
  { src: sfxWhoosh, at: T.advice - 0.08, volume: 0.3 },
  ...T.chips.map((at) => ({ src: sfxPop, at, volume: 0.45 })),
  { src: sfxWhoosh, at: T.end - 0.08, volume: 0.3 },
  { src: sfxClick, at: T.follow + 0.45, volume: 0.6 },
];

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
    <Ground />
    <Hook />
    <Chat />
    <Chart />
    <Advice />
    <End />
    <Caption />
  </AbsoluteFill>
);
