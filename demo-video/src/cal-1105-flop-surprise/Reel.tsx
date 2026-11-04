import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh.mp3";
import sfxRiser from "../method/audio/sfx/riser.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { BREAKOUT, FLOP, FPS, PAIRS, PHRASES, PLAN_SOURCE, QUESTION, SOURCE, T } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["400", "600"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const SERIF = `${serif.fontFamily}, Georgia, serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA paper and ink, gold for the surprise, cobalt for data; the "evening" scenes turn the ground to dusk.
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#e2b85a";
const COBALT = "#2a62f5";
const RED = "#c2412d";
const GREEN = "#1f8a4c";
const CORAL = "#d9714e";
const DUSK_TOP = "#141a3c";
const DUSK_MID = "#3b2c5c";
const DUSK_LOW = "#c4683a";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
/** 0..1: how far into the dusk colour moment we are. */
const dusk = (t: number) => ease(t, T.dusk - 0.1, 0.8, Easing.inOut(Easing.cubic)) * (1 - ease(t, T.change - 0.3, 0.6, Easing.inOut(Easing.cubic)));

/** Slides in from the right, leaves to the left: this video's own scene motion. */
const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = at <= 0 ? 1 : ease(t, at, 0.45, Easing.out(Easing.exp));
  const pout = ease(t, until - 0.3, 0.3, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, 1 - pout), transform: `translateX(${(1 - pin) * 140 - pout * 140}px)` }}>{children}</div>;
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
  const d = dusk(t);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <div style={{ position: "absolute", right: -260, top: -200, width: 900, height: 900, borderRadius: "50%", background: "rgba(226,184,90,0.22)", filter: "blur(150px)" }} />
      <AbsoluteFill style={{ opacity: d, background: `linear-gradient(180deg, ${DUSK_TOP} 0%, ${DUSK_MID} 52%, ${DUSK_LOW} 100%)` }}>
        <div style={{ position: "absolute", left: 340, top: 1420 - 80 * d, width: 400, height: 400, borderRadius: "50%", background: "rgba(255,190,110,0.55)", filter: "blur(70px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0 || t >= T.end) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.end - 0.2, 0.18);
  const d = dusk(t);
  const ink = d > 0.5 ? "#fff" : INK;
  const em = d > 0.5 ? GOLD_BRIGHT : GOLD;
  return (
    <div style={{ position: "absolute", top: 200, left: 70, right: 110, textAlign: "left", fontFamily: SANS, fontWeight: 700, fontSize: 52, lineHeight: 1.18, letterSpacing: -1, color: ink, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : ink }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── 1 · hook ───────────── */

const Hook: React.FC = () => {
  const t = useT();
  const s = popE(t, T.surprised, 0.45);
  return (
    <Beat at={0} until={T.guess}>
      <div style={{ position: "absolute", left: 70, right: 60, top: 360, fontFamily: SANS, fontWeight: 800, fontSize: 118, lineHeight: 0.98, letterSpacing: -5, color: INK }}>
        Ask Claude why your last Reel flopped.
      </div>
      <div style={{ position: "absolute", left: 70, right: 60, top: 900, fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 96, lineHeight: 1.05, letterSpacing: -2, color: GOLD, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 30}px)` }}>
        The answer{" "}
        <span style={{ position: "relative", display: "inline-block" }}>
          surprised me.
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const r = 60 + 150 * ease(t, T.surprised + 0.4, 0.6);
            return <span key={i} style={{ position: "absolute", left: "50%", top: "50%", width: 14, height: 14, borderRadius: 7, background: GOLD_BRIGHT, transform: `translate(${Math.cos(a) * r * 1.6}px, ${Math.sin(a) * r * 0.7}px)`, opacity: ease(t, T.surprised + 0.4, 0.15) * (1 - ease(t, T.surprised + 0.7, 0.4)) }} />;
          })}
        </span>
      </div>
      <div style={{ position: "absolute", left: 70, top: 1220, display: "flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 28, fontWeight: 700, color: INK2 }}>
        <ClaudeMark size={40} /> + <Mark size={40} /> real data from @socia.appmedia
      </div>
    </Beat>
  );
};

/* ───────────── Claude phone panel ───────────── */

const Panel: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: "absolute", left: 40, right: 40, top, bottom: 520, borderRadius: 36, background: "#faf9f5", border: `1px solid ${LINE}`, boxShadow: "0 30px 80px rgba(23,25,29,0.18)", overflow: "hidden", fontFamily: SANS, color: INK }}>
    <div style={{ height: 76, display: "flex", alignItems: "center", padding: "0 28px", gap: 12, borderBottom: `1px solid ${LINE}` }}>
      <ClaudeMark size={30} />
      <span style={{ fontSize: 28, fontWeight: 700 }}>Claude</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 19, fontWeight: 700, color: INK2, background: "#f0eee6", borderRadius: 18, padding: "6px 14px 6px 8px" }}><Mark size={26} /> SOCIA connected <span style={{ width: 9, height: 9, borderRadius: 5, background: GREEN }} /></span>
    </div>
    <div style={{ position: "relative", padding: "24px 28px" }}>{children}</div>
  </div>
);

const Guess: React.FC = () => {
  const t = useT();
  const strike = ease(t, T.strike + 0.15, 0.35);
  const chat = ease(t, T.chat, 0.45, Easing.out(Easing.exp));
  return (
    <Beat at={T.guess} until={T.answer}>
      <div style={{ position: "absolute", left: 70, top: 420, fontFamily: SERIF, fontStyle: "italic", fontSize: 84, color: INK2, transform: `rotate(-2deg) translateY(${-60 * chat}px)`, opacity: 1 - 0.5 * chat }}>
        <span style={{ position: "relative" }}>
          my guess: the hook?
          <span style={{ position: "absolute", left: -10, right: -10, top: "55%", height: 8, background: RED, transformOrigin: "0 50%", transform: `scaleX(${strike})` }} />
        </span>
      </div>
      <div style={{ position: "absolute", inset: 0, opacity: chat, transform: `translateY(${(1 - chat) * 300}px)` }}>
        <Panel top={560}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><div style={{ background: "#f0eee6", borderRadius: 20, padding: "14px 22px", fontSize: 30 }}>{QUESTION}</div></div>
          <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12, fontSize: 22, color: INK2, opacity: ease(t, T.chat + 0.4, 0.3) }}>
            <Mark size={28} /> <b style={{ color: INK }}>SOCIA</b> <span style={{ fontFamily: MONO, fontSize: 19 }}>get_top_posts · get_content_plan</span>
            <span style={{ width: 24, height: 24, borderRadius: 12, background: t > T.chat + 0.9 ? GREEN : LINE, color: "#fff", fontSize: 15, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          </div>
        </Panel>
      </div>
    </Beat>
  );
};

/* ───────────── 2 · per person ───────────── */

const Gauge: React.FC<{ label: string; sub: string; rate: number; at: number; color: string; win?: boolean }> = ({ label, sub, rate, at, color, win }) => {
  const t = useT();
  const g = ease(t, at, 0.8, Easing.out(Easing.cubic));
  const h = 420 * (rate / 5) * g;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ height: 470, display: "flex", alignItems: "flex-end" }}>
        <div style={{ width: 210, height: h, borderRadius: "22px 22px 0 0", background: color, position: "relative", boxShadow: win ? "0 0 40px rgba(226,184,90,0.6)" : "none" }}>
          <div style={{ position: "absolute", left: -40, right: -40, top: -96, textAlign: "center", fontSize: 84, fontWeight: 800, letterSpacing: -3, color: win ? GOLD : INK2, opacity: Math.min(1, g * 2) }}>{(rate * g).toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 28, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 20, color: INK2, marginTop: 4 }}>{sub}</div>
    </div>
  );
};

const PerPerson: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.answer} until={T.seen}>
      <Panel top={400}>
        <div style={{ display: "flex", gap: 14, fontFamily: SERIF, fontSize: 32, lineHeight: 1.4 }}>
          <div style={{ paddingTop: 6 }}><ClaudeMark size={30} /></div>
          <div style={{ opacity: ease(t, T.answer, 0.3) }}>
            <b>Surprise: it wasn't liked less.</b> Per account reached, it got <span style={{ background: ease(t, T.more, 0.3) > 0.5 ? "rgba(226,184,90,0.4)" : "transparent" }}>more likes than your breakout</span>.
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 20, fontWeight: 700, letterSpacing: 2, color: INK2, fontFamily: MONO, opacity: ease(t, 9.4, 0.3) }}>LIKES PER ACCOUNT REACHED</div>
        <div style={{ display: "flex", marginTop: 10 }}>
          <Gauge label="my last Reel" sub={`${FLOP.likes} likes ÷ ${FLOP.reach} reached`} rate={FLOP.rate} at={T.rateFlop} color={GOLD_BRIGHT} win />
          <Gauge label="the breakout" sub={`${BREAKOUT.likes} likes ÷ ${fmt(BREAKOUT.reach)} reached`} rate={BREAKOUT.rate} at={T.rateBreak} color="#cfcac0" />
        </div>
        <div style={{ position: "absolute", left: 28, top: 830, fontFamily: MONO, fontSize: 18, color: INK2 }}>{SOURCE}</div>
      </Panel>
    </Beat>
  );
};

/* ───────────── 3 · how many saw it (dots) ───────────── */

const Dots: React.FC<{ n: number; at: number; color: string; cols: number }> = ({ n, at, color, cols }) => {
  const t = useT();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 22px)`, gap: 8 }}>
      {Array.from({ length: n }).map((_, i) => {
        const p = ease(t, at + i * (0.9 / n), 0.2);
        return <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: color, opacity: p, transform: `scale(${0.4 + 0.6 * p})` }} />;
      })}
    </div>
  );
};

const Seen: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.seen} until={T.dusk}>
      <div style={{ position: "absolute", left: 70, right: 70, top: 400, fontFamily: SANS }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: INK2, fontFamily: MONO }}>ACCOUNTS REACHED · 1 DOT = 10</div>
        <div style={{ marginTop: 30, display: "flex", alignItems: "flex-start", gap: 30 }}>
          <div style={{ width: 300, flexShrink: 0, opacity: ease(t, T.n207 - 0.1, 0.3) }}>
            <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -4, color: RED, lineHeight: 1 }}>{FLOP.reach}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>my last Reel</div>
          </div>
          <Dots n={21} at={T.n207} color={RED} cols={11} />
        </div>
        <div style={{ marginTop: 40, display: "flex", alignItems: "flex-start", gap: 30 }}>
          <div style={{ width: 300, flexShrink: 0, opacity: ease(t, T.n1550 - 0.1, 0.3) }}>
            <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -4, color: INK, lineHeight: 1 }}>{fmt(BREAKOUT.reach)}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>the breakout</div>
          </div>
          <Dots n={155} at={T.n1550} color={COBALT} cols={22} />
        </div>
        <div style={{ marginTop: 40, fontFamily: MONO, fontSize: 19, color: INK2, opacity: ease(t, T.n207, 0.3) }}>{SOURCE}</div>
      </div>
    </Beat>
  );
};

/* ───────────── 4 · the same evening (dusk) ───────────── */

const Evening: React.FC = () => {
  const t = useT();
  // 6 PM .. 11 PM across x 100..980
  const x = (h: number, m: number) => 100 + ((h - 18 + m / 60) / 5) * 880;
  const xb = x(19, 22);
  const xf = x(22, 45);
  const line = ease(t, T.dusk + 0.3, 0.8);
  const b = popE(t, T.same, 0.4);
  const f = popE(t, T.same + 0.35, 0.4);
  const gap = ease(t, T.hours, 1.0, Easing.inOut(Easing.cubic));
  return (
    <Beat at={T.dusk} until={T.plan}>
      <div style={{ position: "absolute", left: 70, right: 70, top: 470, fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 104, color: "#fff", letterSpacing: -2, lineHeight: 1, opacity: ease(t, T.same - 0.1, 0.4) }}>
        the same evening.
      </div>
      <div style={{ position: "absolute", left: 70, top: 600, fontFamily: MONO, fontSize: 22, color: "rgba(255,255,255,0.75)", opacity: ease(t, T.same + 0.4, 0.4) }}>Sunday, Nov 1 · CST</div>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <line x1={100} x2={100 + 880 * line} y1={980} y2={980} stroke="rgba(255,255,255,0.55)" strokeWidth={4} />
        {[18, 19, 20, 21, 22, 23].map((h, i) => (
          <line key={h} x1={x(h, 0)} x2={x(h, 0)} y1={966} y2={994} stroke="rgba(255,255,255,0.55)" strokeWidth={3} opacity={ease(t, T.dusk + 0.3 + i * 0.12, 0.2)} />
        ))}
        <path d={`M ${xb} 900 L ${xb} 870 L ${xb + (xf - xb) * gap} 870 L ${xb + (xf - xb) * gap} ${gap > 0.98 ? 900 : 870}`} fill="none" stroke={GOLD_BRIGHT} strokeWidth={5} opacity={gap > 0 ? 1 : 0} />
      </svg>
      {[18, 19, 20, 21, 22, 23].map((h, i) => (
        <div key={h} style={{ position: "absolute", left: x(h, 0) - 50, width: 100, top: 1006, textAlign: "center", fontFamily: MONO, fontSize: 20, color: "rgba(255,255,255,0.7)", opacity: ease(t, T.dusk + 0.3 + i * 0.12, 0.2) }}>{h - 12} PM</div>
      ))}
      <div style={{ position: "absolute", left: xb - 14, top: 966, width: 28, height: 28, borderRadius: 14, background: "#fff", transform: `scale(${b})` }} />
      <div style={{ position: "absolute", left: xf - 14, top: 966, width: 28, height: 28, borderRadius: 14, background: "#ff8a73", transform: `scale(${f})` }} />
      <div style={{ position: "absolute", left: xb - 110, width: 300, top: 1070, fontFamily: SANS, color: "#fff", opacity: Math.min(1, b * 1.4) }}>
        <div style={{ fontSize: 40, fontWeight: 800 }}>{BREAKOUT.time}</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>the breakout</div>
      </div>
      <div style={{ position: "absolute", left: xf - 190, width: 300, top: 1070, textAlign: "right", fontFamily: SANS, color: "#fff", opacity: Math.min(1, f * 1.4) }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#ffb3a3" }}>{FLOP.time}</div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>my last Reel</div>
      </div>
      <div style={{ position: "absolute", left: xb, width: xf - xb, top: 780, textAlign: "center", fontFamily: SANS, fontSize: 56, fontWeight: 800, color: GOLD_BRIGHT, letterSpacing: -1.5, opacity: ease(t, T.hours + 0.6, 0.4) }}>3 h 22 min</div>
      <div style={{ position: "absolute", left: 70, top: 1230, fontFamily: MONO, fontSize: 19, color: "rgba(255,255,255,0.65)", opacity: ease(t, T.same, 0.4) }}>{SOURCE}</div>
    </Beat>
  );
};

/* ───────────── 5 · the pattern (still dusk) ───────────── */

const Pattern: React.FC = () => {
  const t = useT();
  const stamp = popE(t, T.half, 0.4);
  const max = 50;
  return (
    <Beat at={T.plan} until={T.change}>
      <div style={{ position: "absolute", left: 70, right: 70, top: 440, fontFamily: SANS, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 800 }}><Mark size={44} /> Content Plan: days I posted twice</div>
        <div style={{ display: "flex", gap: 30, marginTop: 20, fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: "#fff" }} /> first post</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: "#ff8a73" }} /> second post, same day</span>
        </div>
        {PAIRS.map((p, i) => {
          const g = ease(t, T.pairs[i], 0.6);
          return (
            <div key={i} style={{ marginTop: 34 }}>
              <div style={{ fontSize: 20, fontFamily: MONO, color: "rgba(255,255,255,0.6)" }}>DAY {i + 1}</div>
              {[p.first, p.second].map((v, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
                  <div style={{ height: 40, borderRadius: 10, background: j ? "#ff8a73" : "#fff", width: Math.max(8, (v / max) * 720 * g) }} />
                  <span style={{ fontSize: 34, fontWeight: 800, opacity: g, color: j ? "#ffb3a3" : "#fff" }}>{v}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 70, top: 870, transform: `rotate(-6deg) scale(${stamp})`, border: `5px solid ${GOLD_BRIGHT}`, color: GOLD_BRIGHT, borderRadius: 16, padding: "10px 24px", fontFamily: SANS, fontWeight: 800, fontSize: 40, background: "rgba(20,26,60,0.6)" }}>less than half, every time</div>
      <div style={{ position: "absolute", left: 70, right: 70, top: 1260, fontFamily: MONO, fontSize: 18, color: "rgba(255,255,255,0.65)", opacity: ease(t, T.plan + 0.4, 0.3) }}>{PLAN_SOURCE}</div>
    </Beat>
  );
};

/* ───────────── 6 · what to change ───────────── */

const ITEMS = ["One post a day, five a week.", "Give every Reel its own day.", "Open the way the breakout did: a named tool, an outcome, a time box."];

const Change: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.change} until={T.end}>
      <Panel top={400}>
        <div style={{ display: "flex", gap: 14, fontFamily: SERIF, fontSize: 31, lineHeight: 1.42 }}>
          <div style={{ paddingTop: 6 }}><ClaudeMark size={30} /></div>
          <div>
            <div style={{ opacity: ease(t, T.change + 0.2, 0.3) }}><b>What I'd change:</b></div>
            {ITEMS.map((s, i) => {
              const p = ease(t, T.items[i], 0.35);
              const c = popE(t, T.items[i] + 0.15, 0.35);
              return (
                <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 22, opacity: p, transform: `translateX(${(1 - p) * 40}px)` }}>
                  <span style={{ flexShrink: 0, marginTop: 4, width: 40, height: 40, borderRadius: 20, background: GREEN, color: "#fff", fontFamily: SANS, fontSize: 22, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", transform: `scale(${c})` }}>✓</span>
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 36, letterSpacing: -0.6, lineHeight: 1.2 }}>{s}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 34, fontSize: 24, color: INK2, opacity: ease(t, T.items[2] + 0.6, 0.4) }}>SOCIA can't see Instagram's reasons, so treat the timing as the thing to test.</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 28, top: 830, fontFamily: MONO, fontSize: 18, color: INK2 }}>from your SOCIA data · Nov 2</div>
      </Panel>
    </Beat>
  );
};

const End: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 70, right: 70, top: 560, fontFamily: SANS }}>
        <div style={{ transform: `scale(${popE(t, T.end + 0.05, 0.45)})`, transformOrigin: "0 50%" }}><Mark size={170} /></div>
        <div style={{ marginTop: 30, fontSize: 140, fontWeight: 800, letterSpacing: -6, color: INK, lineHeight: 1 }}>SOCIA</div>
        <div style={{ marginTop: 18, fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 70, color: GOLD, opacity: ease(t, 37.17, 0.4) }}>coming soon.</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0, volume: 0.4 },
  { src: sfxPop, at: T.surprised + 0.4, volume: 0.5 },
  { src: sfxClick, at: T.strike + 0.15, volume: 0.5 },
  { src: sfxWhoosh, at: T.chat - 0.05, volume: 0.25 },
  { src: sfxPop, at: T.chat + 0.9, volume: 0.35 },
  { src: sfxWhoosh, at: T.answer - 0.1, volume: 0.25 },
  { src: sfxImpact, at: T.rateFlop, volume: 0.35 },
  { src: sfxWhoosh, at: T.seen - 0.1, volume: 0.25 },
  { src: sfxClick, at: T.n207, volume: 0.4 },
  { src: sfxClick, at: T.n1550, volume: 0.4 },
  { src: sfxRiser, at: T.dusk - 1.2, volume: 0.3 },
  { src: sfxImpact, at: T.same, volume: 0.5 },
  { src: sfxPop, at: T.same + 0.35, volume: 0.4 },
  { src: sfxWhoosh, at: T.plan - 0.1, volume: 0.25 },
  ...T.pairs.map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  { src: sfxImpact, at: T.half, volume: 0.45 },
  { src: sfxWhoosh, at: T.change - 0.1, volume: 0.25 },
  ...T.items.map((at) => ({ src: sfxPop, at: at + 0.15, volume: 0.45 })),
  { src: sfxWhoosh, at: T.end - 0.1, volume: 0.25 },
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
    <Guess />
    <PerPerson />
    <Seen />
    <Evening />
    <Pattern />
    <Change />
    <End />
    <Caption />
  </AbsoluteFill>
);
