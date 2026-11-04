import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadScript } from "@remotion/google-fonts/Caveat";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh.mp3";
import sfxWhooshShort from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { InstagramIcon } from "../method/ui";
import { FPS, PHRASES, SOURCE, T, WEEK, type Post } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const script = loadScript("normal", { weights: ["600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;
const SCRIPT = `${script.fontFamily}, Caveat, cursive`;

// SOCIA's tokens (app/styles/tokens.css): warm paper, near-black ink, gold accent.
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#d9b25c";
const GREEN = "#1f8a4c";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const io = Easing.inOut(Easing.cubic);

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;
const ExampleChip: React.FC = () => (
  <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1px solid #e8c771", borderRadius: 8, padding: "3px 12px" }}>EXAMPLE</span>
);

// Geometry of the calendar box (screen px).
const BOX_TOP = 330;
const BOX_H = 1020;
const HEAD = 84;
const ROW = 132;
const rowCenter = (i: number) => HEAD + 8 + i * ROW + ROW / 2;

/** The wipe between Before (left of x) and After (right of x). */
const sliderX = (t: number) => {
  if (t < T.before) return 540;
  if (t < T.after) return interpolate(t, [T.before, T.before + 0.5], [540, 1080], { ...clamp, easing: io });
  return interpolate(t, [T.after, T.after + 0.7], [1080, 0], { ...clamp, easing: io });
};

/** Which named post is pulled out, and how far in (0..1). */
const MARKS = [
  { key: "mon" as const, row: 0, from: T.mon - 0.05, to: T.wed - 0.15, top: 420 },
  { key: "wed" as const, row: 2, from: T.wed - 0.05, to: T.sun - 0.15, top: 600 },
  { key: "sun" as const, row: 6, from: T.sun - 0.05, to: T.draft - 0.1, top: 300 },
];
const callout = (t: number) => {
  const m = MARKS.find((k) => t >= k.from && t < k.to);
  if (!m) return null;
  const p = Math.min(ease(t, m.from, 0.35), 1 - ease(t, m.to - 0.2, 0.2));
  return { ...m, p };
};

/* ───────────── caption ───────────── */

const Caption: React.FC = () => {
  const t = useT();
  if (t >= T.end) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.end - 0.2, 0.18);
  const big = idx === 0;
  return (
    <div style={{ position: "absolute", top: big ? 120 : 150, left: 70, right: 70, textAlign: "center", fontFamily: SANS, fontWeight: big ? 800 : 700, fontSize: big ? 62 : 50, lineHeight: 1.15, letterSpacing: big ? -1.6 : -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? GOLD : INK }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── before (EXAMPLE) ───────────── */

const DayCell: React.FC<{ day: string; date: string; dim?: boolean; lit?: number }> = ({ day, date, dim, lit = 0 }) => (
  <div style={{ width: 120, flexShrink: 0, fontFamily: SANS }}>
    <div style={{ fontSize: 30, fontWeight: 800, color: dim ? "#a3a7ad" : INK, transform: `scale(${1 + 0.15 * lit})`, transformOrigin: "0 50%" }}>{day}</div>
    <div style={{ fontSize: 18, fontWeight: 600, color: dim ? "#b9bcc1" : INK2, marginTop: 2 }}>{date}</div>
  </div>
);

const Before: React.FC = () => {
  const t = useT();
  const note = popE(t, 4.21, 0.4);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#efede8", borderRadius: 30, border: `2px dashed #cfcbc2` }}>
      <div style={{ height: HEAD, display: "flex", alignItems: "center", gap: 16, padding: "0 30px", borderBottom: `2px dashed #d8d4cb`, fontFamily: SANS }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: INK2 }}>Before</span>
        <ExampleChip />
      </div>
      {WEEK.map((d, i) => (
        <div key={d.day} style={{ position: "absolute", left: 30, right: 30, top: HEAD + 8 + i * ROW, height: ROW, display: "flex", alignItems: "center", gap: 20, borderBottom: i < 6 ? `2px dashed #dcd8cf` : "none" }}>
          <DayCell day={d.day} date={d.date} dim />
          <div style={{ fontFamily: SCRIPT, fontSize: 34, color: "#b9b4aa" }}>{i === 0 ? "?" : i === 5 ? "maybe a reel" : ""}</div>
        </div>
      ))}
      <div style={{ position: "absolute", left: 470, top: HEAD + 8 + 3 * ROW - 40, width: 300, height: 220, background: "#fbe58a", boxShadow: "0 14px 30px rgba(0,0,0,0.18)", transform: `rotate(${-6 + 4 * (1 - note)}deg) scale(${0.6 + 0.4 * note})`, opacity: Math.min(1, note * 1.5), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SCRIPT, fontSize: 56, color: "#5a4a10", textAlign: "center", lineHeight: 1.0 }}>
        post<br />something??
      </div>
    </div>
  );
};

/* ───────────── after (real) ───────────── */

const Chip: React.FC<{ p: Post; idx: number }> = ({ p, idx }) => {
  const t = useT();
  const markAt = p.mark ? T[p.mark] : 0;
  const nextMark = p.mark === "mon" ? T.wed : p.mark === "wed" ? T.sun : T.draft;
  const live = p.mark && t >= markAt - 0.05 && t < nextMark - 0.1;
  const lit = live ? ease(t, markAt - 0.05, 0.3) : 0;
  const timeGlow = t >= T.times ? 1 - ease(t, T.times + idx * 0.03, 0.6) : 0;
  const draftPulse = t >= T.draft ? popE(t, T.draft + 0.2 + idx * 0.05, 0.35) : 0;
  const thisVideo = p.mark === "sun" ? ease(t, 18.28, 0.3) : 0;
  return (
    <div style={{ position: "relative", height: 36, display: "flex", alignItems: "center", gap: 10, borderRadius: 10, padding: "0 10px", background: live ? "#fbf6ea" : CARD, border: `1.5px solid ${live ? GOLD_BRIGHT : LINE}`, boxShadow: live ? `0 0 0 ${3 * lit}px rgba(217,178,92,0.35)` : "none", fontFamily: SANS }}>
      <span style={{ width: 92, flexShrink: 0, fontFamily: MONO, fontSize: 17, fontWeight: 600, color: GOLD, background: `rgba(217,178,92,${0.35 * timeGlow})`, borderRadius: 6 }}>{p.time}</span>
      <InstagramIcon size={18} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
      {thisVideo > 0 ? <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", background: GOLD, borderRadius: 8, padding: "2px 8px", opacity: thisVideo, transform: `scale(${0.8 + 0.2 * thisVideo})` }}>this video</span> : null}
      <span style={{ fontSize: 14, fontWeight: 700, color: draftPulse > 0 ? INK : INK2, background: draftPulse > 0 ? "#f1e3bd" : "#f1efe9", borderRadius: 8, padding: "2px 8px", transform: `scale(${1 + 0.18 * Math.sin(Math.PI * Math.min(1, draftPulse))})` }}>Draft</span>
    </div>
  );
};

const After: React.FC = () => {
  const t = useT();
  const focus = callout(t);
  const count = popE(t, T.count, 0.4);
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, borderRadius: 30, border: `1px solid ${LINE}`, boxShadow: "0 30px 70px rgba(23,25,29,0.12)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <div style={{ height: HEAD, display: "flex", alignItems: "center", gap: 14, padding: "0 30px", background: INK, color: "#fff", fontFamily: SANS }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: GOLD_BRIGHT, background: "rgba(217,178,92,0.14)", border: "1px solid rgba(217,178,92,0.5)", borderRadius: 16, padding: "4px 14px", opacity: Math.min(1, count * 1.4), transform: `scale(${0.7 + 0.3 * count})` }}>14 posts</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 800 }}>After <Mark size={40} /></span>
        </div>
        {WEEK.map((d, i) => {
          const lit = t >= T.days ? Math.sin(Math.PI * ease(t, T.days + i * 0.1, 0.35)) : 0;
          return (
            <div key={d.day} style={{ position: "absolute", left: 24, right: 24, top: HEAD + 8 + i * ROW, height: ROW, display: "flex", alignItems: "center", gap: 14, borderBottom: i < 6 ? `1px solid ${LINE}` : "none", opacity: focus && focus.row !== i ? 1 - 0.6 * focus.p : 1 }}>
              <DayCell day={d.day} date={d.date} lit={lit} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                {d.posts.map((p, j) => <Chip key={j} p={p} idx={i * 3 + j} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Callout: React.FC = () => {
  const t = useT();
  const c = callout(t);
  if (!c) return null;
  const day = WEEK[c.row];
  const post = day.posts.find((p) => p.mark === c.key)!;
  const pop = popE(t, c.from, 0.4);
  const tag = c.key === "sun" ? ease(t, 18.28, 0.3) : 0;
  return (
    <div style={{ position: "absolute", left: 54, right: 54, top: c.top, opacity: c.p, transform: `translateY(${(1 - pop) * 30}px) scale(${0.92 + 0.08 * pop})`, borderRadius: 26, background: CARD, border: `3px solid ${GOLD_BRIGHT}`, boxShadow: "0 30px 70px rgba(23,25,29,0.25)", padding: "26px 30px", fontFamily: SANS }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <InstagramIcon size={34} />
        <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: GOLD }}>{day.day} {day.date} · {post.time}</span>
        <span style={{ marginLeft: "auto", fontSize: 20, fontWeight: 700, color: INK2, background: "#f1efe9", border: `1px solid ${LINE}`, borderRadius: 12, padding: "4px 14px" }}>Draft</span>
      </div>
      <div style={{ marginTop: 16, fontSize: 40, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.6, color: INK }}>{post.title}</div>
      {tag > 0 ? <div style={{ marginTop: 16, display: "inline-block", fontSize: 24, fontWeight: 800, color: "#fff", background: GOLD, borderRadius: 12, padding: "6px 16px", opacity: tag, transform: `scale(${0.8 + 0.2 * tag})` }}>this video</div> : null}
    </div>
  );
};

const CalendarStage: React.FC = () => {
  const t = useT();
  if (t >= T.end + 0.05) return null;
  const x = sliderX(t);
  const showLine = x > 2 && x < 1078;
  const out = 1 - ease(t, T.end - 0.25, 0.25, Easing.in(Easing.cubic));
  const enter = ease(t, 0, 0.3);
  const lock = ease(t, T.approve - 0.05, 0.4);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: BOX_TOP, height: BOX_H, opacity: Math.min(out, enter), filter: `blur(${(1 - out) * 8}px)` }}>
      <div style={{ position: "absolute", left: 30, right: 30, top: 0, bottom: 0 }}>
        <Before />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, clipPath: `inset(-40px 0 -40px ${x}px)` }}>
        <div style={{ position: "absolute", left: 30, right: 30, top: 0, bottom: 0 }}>
          <After />
        </div>
      </div>
      <Callout />
      {showLine ? (
        <div style={{ position: "absolute", left: x - 3, top: -20, width: 6, bottom: -20, background: GOLD_BRIGHT, boxShadow: "0 0 18px rgba(217,178,92,0.7)" }}>
          <div style={{ position: "absolute", left: -29, top: "50%", width: 64, height: 64, marginTop: -32, borderRadius: 32, background: CARD, border: `4px solid ${GOLD_BRIGHT}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: 26, color: GOLD }}>‹›</div>
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 60, right: 60, top: BOX_H - 230, opacity: lock, transform: `translateY(${(1 - lock) * 40}px)`, borderRadius: 26, background: INK, color: "#fff", padding: "28px 30px", display: "flex", alignItems: "center", gap: 22, fontFamily: SANS, boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
        <svg width={44} height={52} viewBox="0 0 44 52"><rect x={4} y={22} width={36} height={28} rx={6} fill={GOLD_BRIGHT} /><path d="M12 22 V14 a10 10 0 0 1 20 0 V22" fill="none" stroke={GOLD_BRIGHT} strokeWidth={5} /></svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 33, fontWeight: 800, lineHeight: 1.2 }}>Nothing posts until you approve it</div>
          <div style={{ fontSize: 21, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>14 drafts waiting for you</div>
        </div>
        <div style={{ borderRadius: 14, background: GOLD, padding: "12px 22px", fontSize: 24, fontWeight: 800 }}>Approve</div>
      </div>
      <div style={{ position: "absolute", left: 40, top: BOX_H + 18, fontFamily: MONO, fontSize: 19, fontWeight: 500, color: INK2, display: "flex", alignItems: "center", gap: 10, opacity: ease(t, T.after + 0.3, 0.3) }}>
        <InstagramIcon size={24} /> {SOURCE}
      </div>
    </div>
  );
};

const EndCard: React.FC = () => {
  const t = useT();
  if (t < T.end - 0.02) return null;
  const p = ease(t, T.end, 0.35);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, fontFamily: SANS, opacity: p, filter: `blur(${(1 - p) * 10}px)` }}>
      <div style={{ transform: `scale(${popE(t, T.end + 0.05, 0.45)})` }}><Mark size={200} /></div>
      <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: INK }}>SOCIA</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 30, padding: "8px 30px", opacity: ease(t, T.soon, 0.3) }}>coming soon</div>
    </div>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.02, volume: 0.4 },
  { src: sfxWhooshShort, at: T.before, volume: 0.35 },
  { src: sfxPop, at: 4.21, volume: 0.45 },
  { src: sfxWhoosh, at: T.after - 0.05, volume: 0.4 },
  { src: sfxPop, at: T.count, volume: 0.45 },
  ...[T.mon, T.wed, T.sun].map((at) => ({ src: sfxWhooshShort, at: at - 0.1, volume: 0.25 })),
  ...[T.mon, T.wed, T.sun].map((at) => ({ src: sfxClick, at: at + 0.2, volume: 0.45 })),
  { src: sfxPop, at: 18.28, volume: 0.4 },
  { src: sfxClick, at: T.approve, volume: 0.5 },
  { src: sfxWhooshShort, at: T.end - 0.05, volume: 0.3 },
];

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Audio src={vo} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
        <Audio src={c.src} volume={c.volume} />
      </Sequence>
    ))}
    <AbsoluteFill style={{ background: PAPER }} />
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
    <CalendarStage />
    <EndCard />
    <Caption />
  </AbsoluteFill>
);
