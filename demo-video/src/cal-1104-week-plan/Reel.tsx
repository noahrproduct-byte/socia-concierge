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
import sfxRiser from "../method/audio/sfx/riser.mp3";
import { InstagramIcon } from "../method/ui";
import { DARK, FIXES, FPS, HEADLINE_REST, HEADLINE_SCORE, PHRASES, SOURCE, T, TABS, WEEK, WEEK_LINE } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA's tokens (app/styles/tokens.css): warm paper, near-black ink, gold accent, cobalt for data.
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#d9b25c";
const COBALT = "#2a62f5";
const GREEN = "#1f8a4c";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
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
  const pin = ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
};

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

const Source: React.FC<{ dark?: boolean; style?: React.CSSProperties }> = ({ dark, style }) => (
  <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 500, letterSpacing: 0.3, color: dark ? "rgba(255,255,255,0.6)" : INK2, display: "flex", alignItems: "center", gap: 10, ...style }}>
    <InstagramIcon size={24} /> {SOURCE}
  </div>
);

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const n = night(t);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <AbsoluteFill style={{ background: "#0d0e10", opacity: n }}>
        <div style={{ position: "absolute", left: 140, top: 520, width: 800, height: 800, borderRadius: "50%", background: "rgba(217,178,92,0.18)", filter: "blur(170px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  if (t < T.plan || t >= T.end) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.end - 0.2, 0.18);
  const n = night(t);
  const ink = n > 0.5 ? "#ffffff" : INK;
  const em = n > 0.5 ? GOLD_BRIGHT : GOLD;
  return (
    <div style={{ position: "absolute", top: 150, left: 90, right: 90, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 50, lineHeight: 1.2, letterSpacing: -0.8, color: ink, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : ink }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── 1 · hook ───────────── */

const HookWord: React.FC<{ text: string; at: number; color?: string; size: number }> = ({ text, at, color = INK, size }) => {
  const t = useT();
  const p = popE(t, at, 0.3);
  return <span style={{ display: "inline-block", fontSize: size, color, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 30}px) scale(${0.85 + 0.15 * p})`, filter: `blur(${Math.max(0, 1 - p) * 6}px)`, marginRight: "0.22em" }}>{text}</span>;
};

const Hook: React.FC = () => {
  const t = useT();
  const [a, b, c, d, e, f] = T.hook;
  const [g, h, i, j, k, l] = T.hook2;
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <Beat at={0} until={T.plan}>
      <div style={{ position: "absolute", left: 80, top: 330, display: "flex", alignItems: "center", gap: 16, fontFamily: SANS, fontWeight: 700, fontSize: 30, color: INK, opacity: ease(t, 0, 0.25) }}>
        <Mark size={54} /> Content plan
      </div>
      <div style={{ position: "absolute", left: 76, right: 60, top: 460, fontFamily: SANS, fontWeight: 800, letterSpacing: -5, lineHeight: 1.0 }}>
        <div><HookWord text="Here's" at={a} size={112} /><HookWord text="my" at={c} size={112} /><HookWord text="whole" at={d} size={112} /></div>
        <div><HookWord text="content" at={e} size={112} color={GOLD} /><HookWord text="week," at={f} size={112} color={GOLD} /></div>
        <div style={{ marginTop: 36, letterSpacing: -1.5, fontWeight: 700 }}>
          <HookWord text="planned" at={g} size={64} /><HookWord text="from" at={h} size={64} /><HookWord text="my" at={i} size={64} /><HookWord text="own" at={j} size={64} />
          <HookWord text="Instagram" at={k} size={64} /><HookWord text="data." at={l} size={64} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 1100, display: "flex", gap: 16 }}>
        {days.map((dd, idx) => {
          const p = popE(t, 0.1 + idx * 0.13, 0.35);
          const planned = [1, 2, 3, 4, 6].includes(idx);
          const fill = planned ? ease(t, 1.5 + idx * 0.18, 0.3) : 0;
          return (
            <div key={idx} style={{ flex: 1, height: 150, borderRadius: 22, background: fill > 0.5 ? INK : CARD, border: `2px solid ${fill > 0.5 ? INK : LINE}`, transform: `scale(${p})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: SANS }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: fill > 0.5 ? "#fff" : INK2 }}>{dd}</div>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: planned ? GOLD_BRIGHT : LINE, transform: `scale(${planned ? fill : 1})` }} />
            </div>
          );
        })}
      </div>
    </Beat>
  );
};

/* ───────────── plan window ───────────── */

const PlanWindow: React.FC<{ tab: number; children: React.ReactNode }> = ({ tab, children }) => (
  <div style={{ position: "absolute", left: 44, right: 44, top: 330, height: 1050, borderRadius: 30, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 30px 70px rgba(23,25,29,0.13)", overflow: "hidden", fontFamily: SANS, color: INK }}>
    <div style={{ padding: "24px 30px 0", display: "flex", alignItems: "center", gap: 14 }}>
      <Mark size={44} />
      <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.6 }}>Content plan</span>
      <span style={{ marginLeft: "auto", fontSize: 19, fontWeight: 600, color: INK2, border: `1px solid ${LINE}`, borderRadius: 18, padding: "5px 14px" }}>Generated Nov 2</span>
    </div>
    <div style={{ display: "flex", gap: 8, padding: "18px 30px 0", borderBottom: `1px solid ${LINE}` }}>
      {TABS.map((tb, i) => (
        <div key={tb} style={{ fontSize: 17.5, fontWeight: 700, color: i === tab ? INK : INK2, padding: "8px 10px 14px", borderBottom: `3px solid ${i === tab ? INK : "transparent"}`, whiteSpace: "nowrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 14, color: i === tab ? GOLD : "#a3a7ad", marginRight: 6 }}>{tb.slice(0, 2)}</span>
          {tb.slice(3)}
        </div>
      ))}
    </div>
    <div style={{ position: "relative", height: 1050 - 165 }}>{children}</div>
  </div>
);

const Intro: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.plan} until={T.diag}>
      <PlanWindow tab={0}>
        <div style={{ padding: "34px 34px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: INK2, fontFamily: MONO }}>THIS PLAN HAS 5 SECTIONS</div>
          {TABS.map((tb, i) => {
            const p = ease(t, T.plan + 0.3 + i * 0.22, 0.32);
            return (
              <div key={tb} style={{ display: "flex", alignItems: "center", gap: 24, padding: "26px 0", borderBottom: `1px solid ${LINE}`, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
                <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, color: GOLD }}>{tb.slice(0, 2)}</span>
                <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.8 }}>{tb.slice(3)}</span>
              </div>
            );
          })}
        </div>
        <Source style={{ position: "absolute", left: 34, bottom: 30 }} />
      </PlanWindow>
    </Beat>
  );
};

/* ───────────── 2 · diagnosis (dark) ───────────── */

const Diagnosis: React.FC = () => {
  const t = useT();
  const fill = ease(t, T.health, 1.0, Easing.out(Easing.cubic));
  const score = Math.round(HEADLINE_SCORE * fill);
  const R = 200;
  const C = 2 * Math.PI * R;
  const words = HEADLINE_REST.split(" ");
  const textFrom = T.formula;
  const per = (T.burying + 0.4 - textFrom) / words.length;
  const hot = (w: string) => /Connect|Claude|60|seconds'|formula|works,/.test(w);
  const bad = (w: string) => /Stop|guessing|post'|burying/.test(w);
  return (
    <Beat at={T.diag} until={T.fixes}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", fontFamily: MONO, fontSize: 24, fontWeight: 600, letterSpacing: 4, color: GOLD_BRIGHT, opacity: ease(t, T.diag + 0.2, 0.3) }}>ACCOUNT DIAGNOSIS</div>
      <div style={{ position: "absolute", left: 540 - 240, top: 400, width: 480, height: 480 }}>
        <svg width={480} height={480} viewBox="-240 -240 480 480">
          <circle r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={34} />
          <circle r={R} fill="none" stroke={GOLD_BRIGHT} strokeWidth={34} strokeLinecap="round" strokeDasharray={`${C * (HEADLINE_SCORE / 100) * fill} ${C}`} transform="rotate(-90)" style={{ filter: "drop-shadow(0 0 18px rgba(217,178,92,0.55))" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SANS, color: "#fff" }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: "rgba(255,255,255,0.7)", opacity: ease(t, 6.97, 0.3) }}>Health</div>
          <div style={{ fontSize: 190, fontWeight: 800, letterSpacing: -8, lineHeight: 1 }}>{t >= T.health - 0.05 ? score : ""}</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "rgba(255,255,255,0.55)", opacity: ease(t, 8.01, 0.3) }}>/100</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 930, fontFamily: SANS, fontSize: 44, fontWeight: 700, lineHeight: 1.3, letterSpacing: -0.6, color: "#fff" }}>
        {words.map((w, i) => {
          const p = ease(t, textFrom + i * per, 0.3);
          const col = hot(w) ? GOLD_BRIGHT : bad(w) ? "#ff8a7a" : "#fff";
          return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: 0.12 + 0.88 * p, color: p > 0.5 ? col : "#fff", filter: `blur(${(1 - p) * 2}px)` }}>{w}</span>;
        })}
      </div>
      <Source dark style={{ position: "absolute", left: 80, top: 1330, opacity: ease(t, T.health, 0.3) }} />
    </Beat>
  );
};

/* ───────────── 3 · fixes ───────────── */

const Fixes: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.fixes} until={T.week}>
      <PlanWindow tab={0}>
        <div style={{ padding: "30px 34px" }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -0.8, opacity: ease(t, T.fixes + 0.1, 0.3) }}>Three biggest priorities</div>
          {FIXES.map((f, i) => {
            const at = T.fix[i];
            const p = ease(t, at - 0.1, 0.4);
            const live = t >= at - 0.1 && (i === 2 || t < T.fix[i + 1] - 0.1);
            return (
              <div key={i} style={{ marginTop: 28, padding: "26px 26px", borderRadius: 22, background: live ? "#fbf6ea" : CARD, border: `2px solid ${live ? GOLD_BRIGHT : LINE}`, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, display: "flex", gap: 22 }}>
                <div style={{ width: 58, height: 58, flexShrink: 0, borderRadius: 29, background: live ? GOLD : INK, color: "#fff", fontSize: 30, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 33, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.5 }}>{f.title}</div>
                  <div style={{ fontSize: 24, color: INK2, lineHeight: 1.4, marginTop: 10 }}>{f.body}</div>
                </div>
              </div>
            );
          })}
        </div>
        <Source style={{ position: "absolute", left: 34, bottom: 30 }} />
      </PlanWindow>
    </Beat>
  );
};

/* ───────────── 4 · the week ───────────── */

const Week: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.week} until={T.drafts}>
      <PlanWindow tab={4}>
        <div style={{ padding: "22px 30px 0" }}>
          <div style={{ fontSize: 23, fontWeight: 600, color: INK2, opacity: ease(t, T.week + 0.2, 0.3) }}>{WEEK_LINE}</div>
          {WEEK.map((d, i) => {
            const at = T.days[d.day];
            const appear = ease(t, T.week + 0.1 + i * 0.08, 0.3);
            if (!d.hook) {
              return (
                <div key={d.day} style={{ height: 52, display: "flex", alignItems: "center", gap: 20, borderBottom: `1px solid ${LINE}`, opacity: appear * 0.75 }}>
                  <span style={{ width: 150, fontSize: 24, fontWeight: 700, color: "#a3a7ad" }}>{d.day.slice(0, 3)}</span>
                  <span style={{ fontSize: 21, color: "#a3a7ad" }}>No post planned</span>
                </div>
              );
            }
            const on = ease(t, at - 0.05, 0.3);
            const nextAt = Object.values(T.days).filter((v) => v > at).sort((a, b) => a - b)[0] ?? T.drafts;
            const live = t >= at - 0.05 && t < nextAt - 0.05;
            const draft = d.status === "Draft";
            return (
              <div key={d.day} style={{ position: "relative", minHeight: 128, display: "flex", gap: 20, padding: "12px 14px", margin: "0 -14px", borderBottom: `1px solid ${LINE}`, borderRadius: 18, background: live ? "#fbf6ea" : "transparent", boxShadow: live ? `inset 0 0 0 2px ${GOLD_BRIGHT}` : "none", opacity: appear * (0.45 + 0.55 * on), transform: `scale(${1 + 0.015 * (live ? on : 0)})` }}>
                <div style={{ width: 150, flexShrink: 0, fontSize: 26, fontWeight: 800, color: on > 0.5 ? INK : INK2 }}>{d.day.slice(0, 3)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.22, letterSpacing: -0.3 }}>{d.hook}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10, fontSize: 18, fontWeight: 700 }}>
                    <span style={{ color: COBALT, background: "rgba(42,98,245,0.08)", border: "1px solid rgba(42,98,245,0.3)", borderRadius: 14, padding: "4px 12px" }}>{d.format}</span>
                    <span style={{ color: GOLD, background: "rgba(138,106,44,0.08)", border: "1px solid rgba(138,106,44,0.35)", borderRadius: 14, padding: "4px 12px" }}>{d.conf}</span>
                    <span style={{ color: draft ? GREEN : INK2, background: draft ? "rgba(31,138,76,0.08)" : "#f1efe9", border: `1px solid ${draft ? "rgba(31,138,76,0.35)" : LINE}`, borderRadius: 14, padding: "4px 12px" }}>{draft ? "Draft on Calendar" : d.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Source style={{ position: "absolute", left: 30, bottom: 18 }} />
      </PlanWindow>
    </Beat>
  );
};

/* ───────────── 5 · drafts + approve ───────────── */

const Drafts: React.FC = () => {
  const t = useT();
  const posts = WEEK.filter((d) => d.status === "Draft");
  const lock = ease(t, T.approve - 0.1, 0.4);
  return (
    <Beat at={T.drafts} until={T.end}>
      <div style={{ position: "absolute", left: 80, top: 340, fontFamily: MONO, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: INK2, opacity: ease(t, T.drafts, 0.3) }}>ON THE CALENDAR</div>
      {posts.map((d, i) => {
        const p = popE(t, T.drafts + 0.2 + i * 0.25, 0.45);
        return (
          <div key={d.day} style={{ position: "absolute", left: 80, right: 80, top: 400 + i * 196, height: 170, borderRadius: 26, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 18px 44px rgba(23,25,29,0.1)", padding: "22px 28px", fontFamily: SANS, color: INK, opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * -60}px) rotate(${(1 - p) * (i % 2 ? 3 : -3)}deg)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <InstagramIcon size={36} />
              <span style={{ fontSize: 22, fontWeight: 700, color: INK2 }}>{d.format}</span>
              <span style={{ marginLeft: "auto", fontSize: 20, fontWeight: 700, color: INK2, border: `2px solid ${LINE}`, background: "#f1efe9", borderRadius: 18, padding: "4px 16px" }}>Draft</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 30, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.hook}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 80, right: 80, top: 1010, opacity: lock, transform: `translateY(${(1 - lock) * 24}px)`, borderRadius: 26, background: INK, color: "#fff", padding: "28px 30px", display: "flex", alignItems: "center", gap: 22, fontFamily: SANS }}>
        <svg width={44} height={52} viewBox="0 0 44 52"><rect x={4} y={22} width={36} height={28} rx={6} fill={GOLD_BRIGHT} /><path d="M12 22 V14 a10 10 0 0 1 20 0 V22" fill="none" stroke={GOLD_BRIGHT} strokeWidth={5} /></svg>
        <div style={{ flex: 1, fontSize: 33, fontWeight: 800, lineHeight: 1.2 }}>Nothing posts until you approve it</div>
        <div style={{ borderRadius: 14, background: GOLD, padding: "12px 22px", fontSize: 24, fontWeight: 800 }}>Approve</div>
      </div>
    </Beat>
  );
};

const EndCard: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, fontFamily: SANS }}>
        <div style={{ transform: `scale(${popE(t, T.end + 0.05, 0.45)})` }}><Mark size={200} /></div>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: INK }}>SOCIA</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 30, padding: "8px 30px", opacity: ease(t, T.soon, 0.3) }}>coming soon</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.03, volume: 0.45 },
  ...[0.1, 0.23, 0.36, 0.49, 0.62, 0.75, 0.88].map((at) => ({ src: sfxClick, at, volume: 0.22 })),
  ...[T.plan, T.fixes, T.week, T.drafts, T.end].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.3 })),
  { src: sfxRiser, at: T.diag - 0.6, volume: 0.25 },
  { src: sfxImpact, at: T.health, volume: 0.5 },
  ...T.fix.map((at) => ({ src: sfxPop, at: at - 0.1, volume: 0.4 })),
  ...Object.values(T.days).map((at) => ({ src: sfxClick, at: at - 0.05, volume: 0.4 })),
  ...[0, 1, 2].map((i) => ({ src: sfxPop, at: T.drafts + 0.2 + i * 0.25, volume: 0.35 })),
  { src: sfxClick, at: T.approve, volume: 0.5 },
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
    <Intro />
    <Diagnosis />
    <Fixes />
    <Week />
    <Drafts />
    <EndCard />
    <Caption />
  </AbsoluteFill>
);
