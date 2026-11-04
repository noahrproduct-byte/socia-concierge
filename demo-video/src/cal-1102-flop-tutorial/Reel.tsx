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
import { BREAKOUT, CTA, FLOP, FPS, PHRASES, QUESTION, SOURCE, T, type Word } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["400", "600"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const SERIF = `${serif.fontFamily}, Georgia, serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA tokens (warm paper, near-black ink, gold) plus Claude's own chat colours inside the window.
const PAPER = "#f6f4ef";
const CARD = "#ffffff";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const RED = "#c2412d";
const GREEN = "#1f8a4c";
const CORAL = "#d9714e";
const CHAT_BG = "#faf9f5";
const CHAT_BAR = "#f0eee6";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = at <= 0 ? 1 : ease(t, at, 0.32);
  const pout = 1 - ease(t, until - 0.22, 0.22, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * 24}px)` }}>{children}</div>;
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

const Source: React.FC<{ color?: string; size?: number }> = ({ color = INK2, size = 19 }) => (
  <div style={{ fontFamily: MONO, fontSize: size, fontWeight: 500, color, letterSpacing: 0.5 }}>{SOURCE}</div>
);

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: PAPER }} />
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
  </AbsoluteFill>
);

const Caption: React.FC = () => {
  const t = useT();
  const endAt = T.cta;
  if (t < PHRASES[0][0].t - 0.03 || t >= endAt) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, endAt - 0.2, 0.18);
  return (
    <div style={{ position: "absolute", top: 186, left: 80, right: 80, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 50, lineHeight: 1.2, letterSpacing: -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        if (p <= 0) return null;
        return <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 16}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? GOLD : INK }}>{w.w}</span>;
      })}
    </div>
  );
};

/* ───────────── 1 · hook (on screen from frame 0) ───────────── */

const ReelTile: React.FC<{ r: typeof BREAKOUT; label: string; flop?: boolean; at: number }> = ({ r, label, flop, at }) => {
  const t = useT();
  const p = ease(t, at, 0.4);
  return (
    <div style={{ width: 430, height: 330, borderRadius: 28, background: flop ? "linear-gradient(160deg,#3a2a26,#17191d)" : "linear-gradient(160deg,#2b2f38,#17191d)", padding: "24px 26px", boxSizing: "border-box", position: "relative", fontFamily: SANS, color: "#fff", opacity: p, transform: `translateY(${(1 - p) * 30}px)`, boxShadow: "0 24px 60px rgba(23,25,29,0.22)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}><InstagramIcon size={30} /> {label}</div>
      <div style={{ marginTop: 18, fontSize: 27, fontWeight: 700, lineHeight: 1.22 }}>"{r.title}"</div>
      <div style={{ position: "absolute", left: 26, bottom: 64, fontSize: 19, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>{r.when}</div>
      <div style={{ position: "absolute", left: 26, right: 26, bottom: 22, display: "flex", gap: 20, fontSize: 26, fontWeight: 800 }}>
        <span>{fmt(r.views)} views</span>
        <span style={{ color: flop ? "#ff8a73" : "#8fe0ad" }}>{r.likes} likes</span>
      </div>
    </div>
  );
};

const Hook: React.FC = () => {
  const t = useT();
  const settle = interpolate(t, [0, 0.5], [1.04, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const line = ease(t, 0.9, 0.5);
  const sub = ease(t, T.hook2 - 0.1, 0.3);
  return (
    <Beat at={0} until={T.step1}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}>
        <ClaudeMark size={58} />
        <span style={{ fontFamily: SANS, fontSize: 40, fontWeight: 800, color: INK2 }}>+</span>
        <Mark size={58} />
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, top: 360, fontFamily: SANS, fontWeight: 800, fontSize: 100, lineHeight: 1.0, letterSpacing: -4, color: INK, textAlign: "center", transform: `scale(${settle})` }}>
        Ask Claude why your last Reel{" "}
        <span style={{ position: "relative", color: RED }}>
          flopped.
          <span style={{ position: "absolute", left: 0, bottom: -6, height: 9, borderRadius: 5, background: RED, width: `${line * 100}%` }} />
        </span>
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: 700, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 50, lineHeight: 1.2, letterSpacing: -1, color: sub > 0.5 ? INK : INK2, opacity: 0.55 + 0.45 * sub }}>
        Here's the answer it gave me in 45 seconds.
      </div>
      <div style={{ position: "absolute", left: 60, right: 60, top: 900, display: "flex", justifyContent: "space-between" }}>
        <ReelTile r={BREAKOUT} label="the one before" at={0.15} />
        <ReelTile r={FLOP} label="my last Reel" flop at={0.4} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1262, display: "flex", justifyContent: "center", opacity: ease(t, 0.6, 0.4) }}><Source /></div>
    </Beat>
  );
};

/* ───────────── Claude window pieces ───────────── */

const Window: React.FC<{ url: string; children: React.ReactNode; header?: boolean }> = ({ url, children, header = true }) => (
  <div style={{ position: "absolute", left: 52, width: 976, top: 370, height: 1000, borderRadius: 22, overflow: "hidden", background: CHAT_BG, boxShadow: "0 30px 80px rgba(23,25,29,0.18)", border: `1px solid ${LINE}`, fontFamily: SANS, color: INK }}>
    <div style={{ height: 58, background: CHAT_BAR, display: "flex", alignItems: "center", padding: "0 20px", gap: 10, borderBottom: `1px solid ${LINE}` }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 440, height: 34, borderRadius: 9, background: "#fff", fontSize: 18, color: INK2, display: "flex", alignItems: "center", justifyContent: "center" }}>{url}</div>
    </div>
    {header ? <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 22, fontWeight: 600, borderBottom: `1px solid ${LINE}` }}><ClaudeMark size={22} /> Claude</div> : null}
    <div style={{ position: "relative", height: 1000 - 58 - (header ? 64 : 0) }}>{children}</div>
  </div>
);

const Composer: React.FC<{ text?: string; caret?: boolean; active?: boolean }> = ({ text, caret, active }) => {
  const t = useT();
  const blink = Math.floor(t * 2.2) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 26, right: 26, bottom: 26, height: 150, borderRadius: 20, background: "#fff", border: `2px solid ${active ? "#e9a58c" : LINE}`, padding: "20px 24px", boxSizing: "border-box", fontSize: 28, color: text ? INK : "#a8a39b", fontFamily: SANS }}>
      {text || "Reply to Claude..."}
      {caret && blink ? <span style={{ display: "inline-block", width: 2, height: 28, background: INK, marginLeft: 2, verticalAlign: "middle" }} /> : null}
      <div style={{ position: "absolute", left: 20, bottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 600, color: INK2, background: "#f4f2ec", border: `1px solid ${LINE}`, borderRadius: 14, padding: "5px 12px 5px 6px" }}>
        <Mark size={24} /> SOCIA <span style={{ width: 8, height: 8, borderRadius: 4, background: GREEN }} />
      </div>
      <div style={{ position: "absolute", right: 18, bottom: 16, width: 44, height: 44, borderRadius: 11, background: text ? CORAL : "#f2c2b0", color: "#fff", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>↑</div>
    </div>
  );
};

/* ───────────── 2 · step one: connect ───────────── */

const Connect: React.FC = () => {
  const t = useT();
  const on = ease(t, T.toggle, 0.25);
  return (
    <Beat at={T.step1} until={T.step2}>
      <Window url="claude.ai/settings/connectors" header={false}>
        <div style={{ padding: "40px 46px", fontFamily: SANS }}>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.8 }}>Connectors</div>
          <div style={{ fontSize: 22, color: INK2, marginTop: 8 }}>Let Claude read data from the tools you use.</div>
          <div style={{ marginTop: 40, borderRadius: 20, border: `2px solid ${on > 0.5 ? "#9fd3b3" : LINE}`, background: CARD, padding: "28px 30px", display: "flex", alignItems: "center", gap: 22, transform: `scale(${1 + 0.03 * popE(t, T.connect, 0.3) - 0.03 * ease(t, T.connect + 0.3, 0.3)})` }}>
            <Mark size={78} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 32, fontWeight: 800 }}>SOCIA</div>
              <div style={{ fontSize: 21, color: INK2, marginTop: 4 }}>Your posts, results and content plan</div>
            </div>
            <div style={{ width: 92, height: 52, borderRadius: 26, background: on > 0.5 ? GREEN : "#d6d3cb", position: "relative" }}>
              <div style={{ position: "absolute", top: 5, left: 5 + 40 * on, width: 42, height: 42, borderRadius: 21, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }} />
            </div>
          </div>
          <div style={{ marginTop: 24, fontSize: 24, fontWeight: 700, color: GREEN, opacity: ease(t, T.toggle + 0.15, 0.3), display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: GREEN, color: "#fff", fontSize: 19, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
            Connected · reads @socia.appmedia
          </div>
        </div>
      </Window>
    </Beat>
  );
};

/* ───────────── 3 · step two: ask, read, answer ───────────── */

/** Claude's answer, shortened from the full reply (see the report); paragraphs reveal in order. */
const ANSWER: { at: number; key: string; node: React.ReactNode }[] = [
  { at: 0, key: "intro", node: <>Your last Reel got <b>9 likes</b>. The one before got <b>40</b>. Here's what your SOCIA data shows.</> },
  { at: 0.25, key: "p1", node: <><b>1. It reached far fewer people.</b> 207 accounts vs 1,550. Per account reached, it actually got more likes: 4.3% vs 2.6%.</> },
  { at: 0.5, key: "p2", node: <><b>2. The opener.</b> The breakout leads with a named tool, an outcome and a time box: "Connect Claude to your Instagram in 60 seconds." The flop opens with a story and names SOCIA early.</> },
  { at: 0.75, key: "p3", node: <><b>3. Saves and shares.</b> 41 saves vs 2, 18 shares vs 1. People kept and passed on the breakout.</> },
  { at: 0.95, key: "note", node: <span style={{ color: INK2 }}>SOCIA can't see why Instagram showed it to fewer people, so treat these as things to test.</span> },
  { at: 1.1, key: "next", node: <><b>Next Reel:</b> open it the way the breakout did.</> },
];

const Chat: React.FC = () => {
  const t = useT();
  const sent = t >= T.send;
  const text = sent ? "" : typed(t, QUESTION, T.typeFrom, T.typeTo);
  const toolDone = t >= T.toolDone;
  const callout = t >= T.c1 - 0.1 && t < T.next;
  const dim = callout ? ease(t, T.c1 - 0.1, 0.3) * (1 - ease(t, T.next - 0.3, 0.3)) : 0;
  const zoom = 1 + 0.05 * ease(t, T.next, 0.6, Easing.inOut(Easing.cubic));
  const mark = ease(t, T.next + 0.2, 0.6);
  return (
    <Beat at={T.step2} until={T.cta}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: "50% 40%" }}>
        <Window url="claude.ai/chat">
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 176, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, transform: `translateY(${-170 * ease(t, T.answer + 0.4, 1.2, Easing.inOut(Easing.cubic))}px)` }}>
          {sent ? (
            <div style={{ position: "absolute", right: 30, top: 24, maxWidth: 700, opacity: ease(t, T.send, 0.25), transform: `translateY(${(1 - ease(t, T.send, 0.25)) * 14}px)`, background: CHAT_BAR, borderRadius: 18, padding: "14px 22px", fontSize: 24, lineHeight: 1.35 }}>{QUESTION}</div>
          ) : null}
          {t >= T.pulls ? (
            <div style={{ position: "absolute", left: 30, top: 118, display: "flex", alignItems: "center", gap: 12, fontSize: 21, opacity: ease(t, T.pulls, 0.25), border: `1px solid ${LINE}`, borderRadius: 14, background: "#fff", padding: "10px 16px" }}>
              <Mark size={28} />
              <b>SOCIA</b>
              <span style={{ fontFamily: MONO, fontSize: 18, color: INK2 }}>get_top_posts</span>
              <span style={{ color: INK2 }}>{toolDone ? "· read 9 Reels, last 30 days" : "· reading your Reels..."}</span>
              {toolDone ? <span style={{ width: 26, height: 26, borderRadius: 13, background: GREEN, color: "#fff", fontSize: 16, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span> : <Spinner />}
            </div>
          ) : null}
          {t >= T.answer ? (
            <div style={{ position: "absolute", left: 30, right: 34, top: 190, fontFamily: SERIF, fontSize: 25, lineHeight: 1.42, color: INK }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, opacity: ease(t, T.answer, 0.2) }}><ClaudeMark size={26} /></div>
              {ANSWER.map((a) => {
                const p = ease(t, T.answer + a.at, 0.3);
                const hl = a.key === "next" ? mark : 0;
                return (
                  <div key={a.key} style={{ marginBottom: 14, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
                    <span style={{ backgroundImage: `linear-gradient(transparent 55%, rgba(217,178,92,0.55) 55%)`, backgroundSize: `${hl * 100}% 100%`, backgroundRepeat: "no-repeat" }}>{a.node}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          </div>
          </div>
          {!sent || t < T.send + 0.3 ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 300, textAlign: "center", fontFamily: SERIF, fontSize: 46, color: INK, opacity: 1 - ease(t, T.send, 0.25), display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
              <ClaudeMark size={44} /> How can I help you today?
            </div>
          ) : null}
          <Composer text={text} caret={!sent && t >= T.step2 + 0.3} active={!sent && t >= T.typeFrom} />
        </Window>
      </div>
      <AbsoluteFill style={{ background: PAPER, opacity: dim * 0.9 }} />
    </Beat>
  );
};

const Spinner: React.FC = () => {
  const t = useT();
  return <div style={{ width: 22, height: 22, borderRadius: "50%", border: `3px solid ${LINE}`, borderTopColor: INK2, transform: `rotate(${t * 400}deg)` }} />;
};

/* ───────────── zoomed callouts ───────────── */

const Callout: React.FC<{ at: number; until: number; n: number; title: string; fromY: number; children: React.ReactNode }> = ({ at, until, n, title, fromY, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const p = ease(t, at, 0.45, Easing.out(Easing.cubic));
  const o = 1 - ease(t, until - 0.25, 0.25, Easing.in(Easing.cubic));
  const top = 400;
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top, opacity: Math.min(p * 1.6, o), transform: `translateY(${(1 - p) * (fromY - top - 200)}px) scale(${0.55 + 0.45 * p})`, transformOrigin: "50% 0%", filter: `blur(${(1 - o) * 8}px)` }}>
      <div style={{ borderRadius: 30, background: CARD, border: `3px solid ${INK}`, boxShadow: "0 40px 90px rgba(23,25,29,0.22)", padding: "34px 40px 30px", fontFamily: SANS, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ width: 58, height: 58, borderRadius: 29, background: INK, color: "#fff", fontSize: 32, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
          <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1.2 }}>{title}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 18, color: INK2, fontWeight: 600 }}><ClaudeMark size={22} /> Claude's answer</span>
        </div>
        {children}
        <div style={{ marginTop: 26, paddingTop: 18, borderTop: `1px solid ${LINE}` }}><Source /></div>
      </div>
    </div>
  );
};

const Bar: React.FC<{ label: string; value: number; max: number; color: string; at: number }> = ({ label, value, max, color, at }) => {
  const t = useT();
  const g = ease(t, at, 0.7);
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 700, color: INK2 }}><span>{label}</span><span style={{ color, fontSize: 34, fontWeight: 800 }}>{fmt(value * g)}</span></div>
      <div style={{ marginTop: 8, height: 30, borderRadius: 15, background: "#efece5" }}>
        <div style={{ height: 30, borderRadius: 15, background: color, width: `${Math.max(3, (value / max) * 100 * g)}%` }} />
      </div>
    </div>
  );
};

const Quote: React.FC<{ children: React.ReactNode; at: number }> = ({ children, at }) => {
  const t = useT();
  const p = ease(t, at, 0.4);
  return <div style={{ marginTop: 24, fontFamily: SERIF, fontSize: 28, lineHeight: 1.4, color: INK, opacity: p, borderLeft: `5px solid ${CORAL}`, paddingLeft: 20 }}>{children}</div>;
};

const C1: React.FC = () => {
  const t = useT();
  const likes = popE(t, T.likes, 0.35);
  const pulse = 1 + 0.1 * Math.sin(Math.min(1, Math.max(0, (t - T.reach - 0.3) / 0.5)) * Math.PI);
  return (
    <Callout at={T.c1} until={T.c2 - 0.05} n={1} title="It was seen far less" fromY={700}>
      <div style={{ marginTop: 26, fontSize: 22, fontWeight: 600, letterSpacing: 2, color: INK2, fontFamily: MONO }}>ACCOUNTS REACHED</div>
      <Bar label="the one before" value={BREAKOUT.reach} max={BREAKOUT.reach} color={INK} at={T.c1 + 0.5} />
      <div style={{ transform: `scale(${pulse})`, transformOrigin: "100% 50%" }}><Bar label="my last Reel" value={FLOP.reach} max={BREAKOUT.reach} color={RED} at={T.c1 + 0.8} /></div>
      <div style={{ display: "flex", gap: 22, marginTop: 28, opacity: Math.min(1, likes * 1.3), transform: `scale(${0.85 + 0.15 * likes})` }}>
        <div style={{ flex: 1, borderRadius: 20, background: "#f1f8f3", padding: "16px 22px" }}><div style={{ fontSize: 21, fontWeight: 700, color: INK2 }}>the one before</div><div style={{ fontSize: 64, fontWeight: 800, color: GREEN, letterSpacing: -2 }}>40 likes</div></div>
        <div style={{ flex: 1, borderRadius: 20, background: "#fbefec", padding: "16px 22px" }}><div style={{ fontSize: 21, fontWeight: 700, color: INK2 }}>my last Reel</div><div style={{ fontSize: 64, fontWeight: 800, color: RED, letterSpacing: -2 }}>9 likes</div></div>
      </div>
      <Quote at={T.reach + 1.0}>"Per account reached, it actually got more likes: 4.3% vs 2.6%."</Quote>
    </Callout>
  );
};

const Chip: React.FC<{ on: number; color: string; children: React.ReactNode }> = ({ on, color, children }) => (
  <span style={{ fontSize: 23, fontWeight: 800, color: on > 0.5 ? "#fff" : INK2, background: on > 0.5 ? color : "#f1efe9", border: `2px solid ${on > 0.5 ? color : LINE}`, borderRadius: 22, padding: "7px 18px", transform: `scale(${1 + 0.12 * (on > 0 && on < 1 ? 1 - on : 0)})`, display: "inline-block" }}>{on > 0.5 ? "✓ " : ""}{children}</span>
);

const C2: React.FC = () => {
  const t = useT();
  const u = (at: number) => ease(t, at, 0.35);
  const mk = (on: number): React.CSSProperties => ({ backgroundImage: `linear-gradient(transparent 60%, rgba(31,138,76,0.28) 60%)`, backgroundSize: `${on * 100}% 100%`, backgroundRepeat: "no-repeat" });
  return (
    <Callout at={T.c2} until={T.c3 - 0.05} n={2} title="The opener" fromY={850}>
      <div style={{ marginTop: 28, borderRadius: 20, border: `2px solid #9fd3b3`, background: "#f6fbf7", padding: "20px 24px" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: GREEN }}>BREAKOUT · {BREAKOUT.when}</div>
        <div style={{ marginTop: 8, fontSize: 38, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.8 }}>
          "<span style={mk(u(T.outcome))}>Connect</span> <span style={mk(u(T.tool))}>Claude</span> <span style={mk(u(T.outcome))}>to your Instagram</span> <span style={mk(u(T.timebox))}>in 60 seconds</span>"
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <Chip on={u(T.tool)} color={GREEN}>named tool</Chip>
          <Chip on={u(T.outcome)} color={GREEN}>outcome</Chip>
          <Chip on={u(T.timebox)} color={GREEN}>time box</Chip>
        </div>
      </div>
      <div style={{ marginTop: 18, borderRadius: 20, border: `2px solid #eab3a0`, background: "#fdf3f0", padding: "20px 24px", opacity: 0.4 + 0.6 * u(T.story - 0.6) }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: RED }}>MY LAST REEL · {FLOP.when}</div>
        <div style={{ marginTop: 8, fontSize: 34, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.6 }}>"One reel went viral. The other flopped, and I couldn't figure out why. So I asked SOCIA..."</div>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Chip on={u(T.story)} color={RED}>story first</Chip>
          <Chip on={u(T.story + 0.35)} color={RED}>names SOCIA early</Chip>
        </div>
      </div>
    </Callout>
  );
};

const Big: React.FC<{ label: string; a: number; b: number; at: number }> = ({ label, a, b, at }) => {
  const t = useT();
  const p = popE(t, at, 0.4);
  return (
    <div style={{ flex: 1, borderRadius: 22, background: "#f6f4ef", padding: "22px 24px", opacity: Math.min(1, p * 1.4), transform: `scale(${0.8 + 0.2 * p})` }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: INK2, fontFamily: MONO }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 10 }}>
        <span style={{ fontSize: 110, fontWeight: 800, color: GREEN, letterSpacing: -4, lineHeight: 1 }}>{a}</span>
        <span style={{ fontSize: 30, fontWeight: 700, color: INK2 }}>vs</span>
        <span style={{ fontSize: 110, fontWeight: 800, color: RED, letterSpacing: -4, lineHeight: 1 }}>{b}</span>
      </div>
    </div>
  );
};

const C3: React.FC = () => (
  <Callout at={T.c3} until={T.next} n={3} title="Saves and shares" fromY={1000}>
    <div style={{ display: "flex", gap: 20, marginTop: 30 }}>
      <Big label="SAVES" a={BREAKOUT.saves} b={FLOP.saves} at={T.saves} />
      <Big label="SHARES" a={BREAKOUT.shares} b={FLOP.shares} at={T.saves + 0.5} />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 21, fontWeight: 700, color: INK2 }}><span><span style={{ color: GREEN }}>green</span> the one before</span><span><span style={{ color: RED }}>red</span> my last Reel</span></div>
    <Quote at={T.kept}>"People kept and passed on the breakout."</Quote>
  </Callout>
);

/* ───────────── CTA ───────────── */

const CtaWord: React.FC<{ w: Word }> = ({ w }) => {
  const t = useT();
  const p = ease(t, w.t, 0.3);
  if (w.em) {
    const q = popE(t, w.t, 0.35);
    return <span style={{ display: "inline-block", opacity: Math.min(1, q * 1.5), transform: `scale(${0.6 + 0.4 * q}) rotate(-2deg)`, background: INK, color: "#fff", borderRadius: 18, padding: "0 22px", marginRight: "0.22em" }}>{w.w}</span>;
  }
  return <span style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, marginRight: "0.22em" }}>{w.w}</span>;
};

const Cta: React.FC = () => {
  const t = useT();
  const typedFlop = typed(t, "FLOP", T.cta + 0.6, T.cta + 1.0);
  return (
    <Beat at={T.cta} until={999}>
      <div style={{ position: "absolute", left: 70, right: 70, top: 420, fontFamily: SANS, fontWeight: 800, fontSize: 92, lineHeight: 1.08, letterSpacing: -3.5, color: INK }}>
        {CTA.map((w, i) => <CtaWord key={i} w={w} />)}
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: 820, height: 92, borderRadius: 46, background: CARD, border: `2px solid ${LINE}`, display: "flex", alignItems: "center", padding: "0 18px 0 30px", gap: 16, fontFamily: SANS, fontSize: 32, color: typedFlop ? INK : "#a8a39b", fontWeight: 600, opacity: ease(t, T.cta + 0.2, 0.3) }}>
        <span style={{ flex: 1 }}>{typedFlop || "Add a comment..."}</span>
        <span style={{ fontSize: 28, fontWeight: 800, color: typedFlop.length === 4 ? "#1877f2" : "#b8c7e6" }}>Post</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, fontFamily: SANS, opacity: ease(t, 35.0, 0.4) }}>
        <Mark size={70} />
        <span style={{ fontSize: 50, fontWeight: 800, letterSpacing: -1.5, color: INK }}>SOCIA</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 26, padding: "6px 22px" }}>coming soon</span>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const KEYS = Array.from({ length: 12 }, (_, i) => T.typeFrom + i * ((T.typeTo - T.typeFrom) / 12));
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.0, volume: 0.45 },
  { src: sfxWhoosh, at: T.step1 - 0.08, volume: 0.3 },
  { src: sfxClick, at: T.toggle, volume: 0.6 },
  { src: sfxWhoosh, at: T.step2 - 0.08, volume: 0.3 },
  ...KEYS.map((at) => ({ src: sfxClick, at, volume: 0.16 })),
  { src: sfxWhoosh, at: T.send - 0.05, volume: 0.35 },
  { src: sfxPop, at: T.toolDone, volume: 0.4 },
  { src: sfxPop, at: T.c1, volume: 0.5 },
  { src: sfxPop, at: T.c2, volume: 0.5 },
  { src: sfxPop, at: T.c3, volume: 0.5 },
  { src: sfxWhoosh, at: T.cta - 0.08, volume: 0.3 },
  { src: sfxPop, at: 33.51, volume: 0.5 },
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
    <Connect />
    <Chat />
    <C1 />
    <C2 />
    <C3 />
    <Cta />
    <Caption />
  </AbsoluteFill>
);

