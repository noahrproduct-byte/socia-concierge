import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { InstagramIcon } from "../method/ui";
import { A, B, CAPTION_SPANS, CTA, FPS, HOOK_A, HOOK_B, MEANINGS, PHRASES, ROWS, SOURCE, T, TABS, TRACK, type Word } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA tokens: warm paper, ink, gold accent; gold is this video's colour for "kept".
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#d9b25c";
const COBALT = "#2a62f5";
const NIGHT = "#0f1012";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const DARK: [number, number][] = [[T.meanings, T.track], [T.cta, 999]];
const night = (t: number) => {
  let v = DARK.some(([a, b]) => t >= a && t < b) ? 1 : 0;
  for (const [a, b] of DARK) {
    if (t > a - 0.25 && t < a) v = interpolate(t, [a - 0.25, a], [0, 1], clamp);
    if (t > b - 0.25 && t < b) v = interpolate(t, [b - 0.25, b], [1, 0], clamp);
  }
  return v;
};

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = at <= 0 ? 1 : ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
};

const Rise: React.FC<{ w: Word; color: string; em: string; dur?: number }> = ({ w, color, em, dur = 0.3 }) => {
  const t = useT();
  const p = ease(t, w.t, dur);
  if (p <= 0) return null;
  return <span style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : color }}>{w.w}</span>;
};

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

/** Simple line icons: heart (like), bookmark (save), paper plane (share). */
const Icon: React.FC<{ kind: string; size: number; color: string; fill?: boolean }> = ({ kind, size, color, fill }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"} stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
    {kind === "heart" ? <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /> : null}
    {kind === "save" ? <path d="M6 3.5h12v17l-6-4.5-6 4.5z" /> : null}
    {kind === "share" ? <path d="M21.5 3 2.5 10.5l7.5 3 3 7.5L21.5 3zM10 13.5 21.5 3" /> : null}
  </svg>
);

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const n = night(t);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(23,25,29,0.07) 1.5px, transparent 1.5px)", backgroundSize: "36px 36px" }} />
      <AbsoluteFill style={{ background: NIGHT, opacity: n }}>
        <div style={{ position: "absolute", left: 160, top: 600, width: 760, height: 760, borderRadius: "50%", background: "rgba(217,178,92,0.16)", filter: "blur(170px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  const span = CAPTION_SPANS.find(([a, b]) => t >= a - 0.03 && t < b);
  if (!span) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 && ph[0].t >= span[0] - 0.01 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const nextIn = next && next[0].t < span[1];
  const out = nextIn ? ease(t, next[0].t - 0.16, 0.14) : ease(t, span[1] - 0.2, 0.18);
  return (
    <div style={{ position: "absolute", top: 200, left: 90, right: 90, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 54, lineHeight: 1.2, letterSpacing: -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => <Rise key={i} w={w} color={INK} em={GOLD} />)}
    </div>
  );
};

/* ───────────── 1 · hook: two halves ───────────── */

const HookScene: React.FC = () => {
  const t = useT();
  const split = ease(t, 1.0, 0.45, Easing.inOut(Easing.cubic));
  return (
    <Beat at={0} until={T.proof}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 960, background: PAPER }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 960 + 960 * (1 - split), height: 960, background: NIGHT }} />
      <div style={{ position: "absolute", left: 90, top: 380, display: "flex", alignItems: "center", gap: 30, fontFamily: SANS, fontWeight: 800, fontSize: 120, letterSpacing: -5, color: INK }}>
        <div style={{ transform: `scale(${popE(t, 0.05, 0.4)})` }}><Icon kind="heart" size={120} color="#c7c2b8" fill /></div>
        <div>{HOOK_A.map((w, i) => <Rise key={i} w={w} color={INK} em={INK} dur={0.2} />)}</div>
      </div>
      <div style={{ position: "absolute", left: 90, right: 80, top: 1060, fontFamily: SANS, fontWeight: 800, fontSize: 104, letterSpacing: -4, lineHeight: 1.04, color: "#fff" }}>
        <div style={{ marginBottom: 24, transform: `scale(${popE(t, 1.12, 0.4)})`, transformOrigin: "left center", display: "inline-block" }}><Icon kind="save" size={110} color={GOLD_BRIGHT} fill /></div>
        <div>{HOOK_B.map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
      </div>
    </Beat>
  );
};

/* ───────────── 2 · proof: two Reels side by side ───────────── */

const MetricRow: React.FC<{ kind: string; label: string; v: number; at: number; max: number; hot?: boolean }> = ({ kind, label, v, at, max, hot }) => {
  const t = useT();
  const p = ease(t, at, 0.6);
  const on = t >= at - 0.05;
  return (
    <div style={{ marginTop: 22, opacity: on ? 1 : 0.28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, fontWeight: 700, color: INK2 }}>
        <Icon kind={kind} size={26} color={hot ? GOLD : INK2} fill={kind !== "share"} /> {label}
        <span style={{ marginLeft: "auto", fontSize: 50, fontWeight: 800, letterSpacing: -1.5, color: hot ? GOLD : INK }}>{on ? Math.round(v * p) : ""}</span>
      </div>
      <div style={{ marginTop: 6, height: 16, borderRadius: 8, background: "#efece6" }}>
        <div style={{ width: `${(v / max) * 100 * p}%`, height: "100%", borderRadius: 8, background: hot ? GOLD_BRIGHT : "#bdb7ac" }} />
      </div>
    </div>
  );
};

const ReelColumn: React.FC<{ r: typeof A; x: number; at: number; times: { likes: number; saves: number; shares: number }; stamp: { text: string; at: number; kind: string; color: string }; hot: "saves" | "shares" }> = ({ r, x, at, times, stamp, hot }) => {
  const t = useT();
  const p = ease(t, at, 0.4);
  const s = popE(t, stamp.at, 0.4);
  const order = (["likes", "saves", "shares"] as const).slice().sort((a, b) => times[a] - times[b]);
  return (
    <div style={{ position: "absolute", left: x, top: 440, width: 440, opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
      <div style={{ borderRadius: 28, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 22px 54px rgba(23,25,29,0.12)", padding: "24px 26px 28px", fontFamily: SANS, color: INK, height: 600, boxSizing: "border-box" }}>
        <div style={{ height: 250, borderRadius: 18, background: "linear-gradient(165deg,#24201c,#3a3129)", padding: "22px 20px", boxSizing: "border-box", position: "relative" }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", lineHeight: 1.15 }}>{r.title}</div>
          <div style={{ position: "absolute", left: 20, bottom: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 700, color: "#fff" }}><InstagramIcon size={28} /> Reel · {r.date}</div>
        </div>
        {order.map((k) => (
          <MetricRow key={k} kind={k === "likes" ? "heart" : k === "saves" ? "save" : "share"} label={k === "likes" ? "Likes" : k === "saves" ? "Saves" : "Shares"} v={r[k]} at={times[k]} max={41} hot={k === hot} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 630, display: "flex", justifyContent: "center", opacity: Math.min(1, s * 1.4) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, transform: `rotate(-4deg) scale(${s})`, background: stamp.color, color: "#fff", borderRadius: 18, padding: "12px 26px", fontFamily: SANS, fontSize: 38, fontWeight: 800, boxShadow: "0 14px 30px rgba(0,0,0,0.2)" }}>
          <Icon kind={stamp.kind} size={34} color="#fff" fill={stamp.kind !== "share"} /> {stamp.text}
        </div>
      </div>
    </div>
  );
};

const ProofScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.proof} until={T.meanings}>
      <ReelColumn r={A} x={60} at={T.proof + 0.3} times={{ likes: T.aLikes, saves: T.aSaves, shares: T.aShares }} stamp={{ text: "kept", at: T.kept, kind: "save", color: GOLD }} hot="saves" />
      <ReelColumn r={B} x={580} at={T.bCard} times={{ likes: T.bLikes, saves: T.bSaves, shares: T.bShares }} stamp={{ text: "passed on", at: T.passed, kind: "share", color: COBALT }} hot="shares" />
      <div style={{ position: "absolute", left: 60, top: 1250, fontFamily: MONO, fontSize: 20, color: INK2, opacity: ease(t, T.aLikes, 0.3) }}>{SOURCE}</div>
    </Beat>
  );
};

/* ───────────── 3 · what each one means ───────────── */

const MeaningScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.meanings} until={T.track}>
      <div style={{ position: "absolute", left: 90, right: 90, top: 430, fontFamily: SANS }}>
        {MEANINGS.map((m, i) => {
          const p = ease(t, m.at, 0.35);
          const hot = m.icon !== "heart";
          return (
            <div key={m.icon} style={{ display: "flex", alignItems: "flex-start", gap: 34, marginBottom: 110, opacity: p, transform: `translateX(${(1 - p) * -50}px)` }}>
              <div style={{ width: 130, height: 130, borderRadius: 30, background: hot ? "rgba(217,178,92,0.14)" : "rgba(255,255,255,0.06)", border: `2px solid ${hot ? GOLD_BRIGHT : "rgba(255,255,255,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon kind={m.icon} size={70} color={hot ? GOLD_BRIGHT : "rgba(255,255,255,0.6)"} fill={m.icon !== "share"} />
              </div>
              <div>
                <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2, color: hot ? GOLD_BRIGHT : "rgba(255,255,255,0.65)" }}>{m.word}</div>
                <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1, color: "#fff", opacity: ease(t, m.textAt, 0.3), marginTop: 4 }}>{m.icon === "heart" ? m.text : `"${m.text}"`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Beat>
  );
};

/* ───────────── 4 · track them ───────────── */

const TrackScene: React.FC = () => {
  const t = useT();
  const strike = ease(t, 22.94 + 0.15, 0.35);
  return (
    <Beat at={T.track} until={T.app}>
      <div style={{ position: "absolute", left: 90, right: 80, top: 520, fontFamily: SANS, fontWeight: 800, fontSize: 120, letterSpacing: -5, lineHeight: 1.02, color: INK }}>
        <div>{TRACK.line1.slice(0, 2).map((w, k) => <Rise key={k} w={w} color={INK} em={GOLD} />)}</div>
        <div>{TRACK.line1.slice(2).map((w, k) => <Rise key={k} w={w} color={INK} em={GOLD} />)}</div>
        <div>{TRACK.line2.map((w, k) => <Rise key={k} w={w} color={INK} em={GOLD} />)}</div>
        <div style={{ position: "relative", marginTop: 40, fontSize: 80, color: INK2, display: "inline-block" }}>
          {TRACK.line3.map((w, k) => <Rise key={k} w={w} color={INK2} em={INK2} />)}
          <div style={{ position: "absolute", left: 0, top: "52%", height: 8, borderRadius: 4, width: `${strike * 96}%`, background: GOLD_BRIGHT }} />
        </div>
      </div>
    </Beat>
  );
};

/* ───────────── 5 · where SOCIA shows it ───────────── */

const AppScene: React.FC = () => {
  const t = useT();
  const tapped = t >= T.content;
  const colA = ease(t, T.cols, 0.3);
  const colB = ease(t, T.colShares, 0.3);
  const tableIn = ease(t, T.content + 0.25, 0.4);
  const cols = [
    { k: "Content", w: 372, align: "left" as const },
    { k: "Published", w: 96, align: "left" as const },
    { k: "Views", w: 104, align: "right" as const },
    { k: "Likes", w: 92, align: "right" as const },
    { k: "Saves", w: 100, align: "right" as const, hl: colA },
    { k: "Shares", w: 108, align: "right" as const, hl: colB },
  ];
  return (
    <Beat at={T.app} until={T.cta}>
      <div style={{ position: "absolute", left: 50, width: 930, top: 360, borderRadius: 28, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 24px 60px rgba(23,25,29,0.12)", padding: "24px 24px 20px", fontFamily: SANS, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark size={40} /><span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.6, opacity: ease(t, T.analytics - 0.1, 0.3) }}>Analytics</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600, color: INK2 }}><InstagramIcon size={26} /> @socia.appmedia</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "nowrap" }}>
          {TABS.map((tab) => {
            const on = tab === "Content Performance" ? tapped : tab === "Overview" && !tapped;
            const ring = tab === "Content Performance" && t >= T.content && t < T.content + 0.6;
            return (
              <div key={tab} style={{ position: "relative", fontSize: 19, fontWeight: 700, padding: "9px 14px", borderRadius: 12, whiteSpace: "nowrap", background: on ? INK : "#f1efe9", color: on ? "#fff" : INK2, transform: `scale(${ring && t < T.content + 0.12 ? 0.94 : 1})` }}>
                {tab}
                {ring ? <div style={{ position: "absolute", left: "50%", top: "50%", width: 40 + 160 * ease(t, T.content, 0.5), height: 40 + 160 * ease(t, T.content, 0.5), transform: "translate(-50%,-50%)", borderRadius: "50%", border: `3px solid ${GOLD_BRIGHT}`, opacity: 1 - ease(t, T.content, 0.5) }} /> : null}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 22, opacity: tableIn, transform: `translateY(${(1 - tableIn) * 20}px)` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 26, fontWeight: 800 }}>All posts</span>
            <span style={{ fontSize: 17, color: INK2 }}>values exactly as Instagram returned them</span>
          </div>
          <div style={{ position: "relative", marginTop: 12 }}>
            {/* column highlights */}
            {cols.map((c, ci) => {
              if (c.hl == null) return null;
              const left = cols.slice(0, ci).reduce((s, x) => s + x.w, 0);
              return <div key={c.k} style={{ position: "absolute", left: left + 4, top: -6, width: c.w - 4, bottom: -6, borderRadius: 12, background: `rgba(217,178,92,${0.22 * c.hl})`, border: `2px solid rgba(138,106,44,${c.hl})` }} />;
            })}
            <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: INK2, padding: "8px 0", borderBottom: `1px solid ${LINE}`, position: "relative" }}>
              {cols.map((c) => <div key={c.k} style={{ width: c.w, textAlign: c.align, paddingRight: c.align === "right" ? 14 : 0, color: c.hl ? (c.hl > 0.5 ? GOLD : INK2) : INK2 }}>{c.k}</div>)}
            </div>
            {ROWS.map((r, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "center", fontSize: 21, padding: "13px 0", borderBottom: ri < ROWS.length - 1 ? `1px solid ${LINE}` : "none", position: "relative", opacity: ease(t, T.content + 0.35 + ri * 0.05, 0.3) }}>
                <div style={{ width: cols[0].w, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 12, boxSizing: "border-box" }}>{r.title}</div>
                <div style={{ width: cols[1].w, color: INK2 }}>{r.date}</div>
                <div style={{ width: cols[2].w, textAlign: "right", paddingRight: 14 }}>{fmt(r.views)}</div>
                <div style={{ width: cols[3].w, textAlign: "right", paddingRight: 14 }}>{r.likes}</div>
                <div style={{ width: cols[4].w, textAlign: "right", paddingRight: 14, fontWeight: 800, color: colA > 0.5 ? GOLD : INK }}>{r.saves}</div>
                <div style={{ width: cols[5].w, textAlign: "right", paddingRight: 14, fontWeight: 800, color: colB > 0.5 ? GOLD : INK }}>{r.shares}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 16, color: INK2, fontFamily: MONO }}>{SOURCE} · sorted by views · 6 of its columns shown</div>
        </div>
      </div>
    </Beat>
  );
};

/* ───────────── 6 · CTA + brand ───────────── */

const EndScene: React.FC = () => {
  const t = useT();
  const brand = popE(t, T.brand, 0.45);
  return (
    <Beat at={T.cta} until={999}>
      <div style={{ position: "absolute", left: 90, right: 90, top: 440, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 96, letterSpacing: -4, lineHeight: 1.04, color: "#fff" }}>
        {CTA.map((w, k) => <Rise key={k} w={w} color="#fff" em={GOLD_BRIGHT} />)}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 790, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, fontFamily: SANS, opacity: Math.min(1, brand * 1.3) }}>
        <div style={{ transform: `scale(${brand})` }}><Mark size={170} /></div>
        <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -4, color: "#fff" }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD_BRIGHT, border: `2px solid ${GOLD_BRIGHT}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, T.soon, 0.3) }}>coming soon</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxPop, at: 0.05, volume: 0.35 },
  { src: sfxImpact, at: 1.12, volume: 0.4 },
  ...[T.proof, T.meanings, T.track, T.app, T.cta].map((at) => ({ src: sfxWhoosh, at: at - 0.08, volume: 0.28 })),
  ...[T.aLikes, T.aSaves, T.aShares, T.bLikes, T.bShares, T.bSaves].map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  { src: sfxPop, at: T.kept, volume: 0.45 },
  { src: sfxPop, at: T.passed, volume: 0.45 },
  ...MEANINGS.map((m) => ({ src: sfxClick, at: m.at, volume: 0.35 })),
  { src: sfxClick, at: T.content, volume: 0.55 },
  { src: sfxPop, at: T.cols, volume: 0.4 },
  { src: sfxPop, at: T.brand, volume: 0.5 },
];

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Audio src={vo} />
    {CUES.map((c, k) => (
      <Sequence key={k} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${k}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
    <Ground />
    <HookScene />
    <ProofScene />
    <MeaningScene />
    <TrackScene />
    <AppScene />
    <EndScene />
    <Caption />
  </AbsoluteFill>
);
