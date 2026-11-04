import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/SourceSerif4";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import { InstagramIcon } from "../method/ui";
import { CHAT, FOOTER, FPS, HOOK, NEXT_IDEA, PILLS, RATER, REACH, SCRAPER, T, TRACK, TRENDING, type Word } from "./story";

const inter = loadInter("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["400", "500"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const SERIF = `${serif.fontFamily}, Georgia, serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// The reference's palette: Claude coral for accents, peach for caption accent words,
// warm off-white windows on a teal-to-coral blurred ground.
const CORAL = "#d9714e";
const PEACH = "#f7b48f";
const PAPER = "#f6f3ee";
const PAPER2 = "#eeeae3";
const INK = "#2b2a28";
const INK2 = "#76726b";
const LINE = "#dedad2";
const GREEN = "#2f9e5b";
const RED = "#c2412d";

/* ───────────── time helpers ───────────── */

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
/** Characters of `text` typed between `from` and `to`. */
const typed = (t: number, text: string, from: number, to: number) => text.slice(0, Math.round(interpolate(t, [from, to], [0, text.length], clamp)));

/** Fade + rise + blur in at `at`; fade out over `out` seconds before `until`. */
const Beat: React.FC<{ at: number; until?: number; rise?: number; scale?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({ at, until = 999, rise = 24, scale = 0.97, style, children }) => {
  const t = useT();
  if (t < at - 0.01 || t > until + 0.01) return null;
  const pin = ease(t, at, 0.35);
  const pout = 1 - ease(t, until - 0.25, 0.25, Easing.in(Easing.cubic));
  const p = Math.min(pin, pout);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: p, filter: `blur(${(1 - pin) * 10 + (1 - pout) * 8}px)`, transform: `translateY(${(1 - pin) * rise}px) scale(${scale + (1 - scale) * pin})`, ...style }}>
      {children}
    </div>
  );
};

/** One caption word: rises, fades and un-blurs over 0.3 s from its start. */
const RevealWord: React.FC<{ w: Word; color?: string }> = ({ w, color }) => {
  const t = useT();
  const p = ease(t, w.t, 0.3);
  if (p <= 0) return <span style={{ opacity: 0 }}>{w.w} </span>;
  return (
    <span style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? PEACH : color, marginRight: "0.25em" }}>
      {w.w}
    </span>
  );
};

/* ───────────── shared pieces ───────────── */

const ClaudeMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = CORAL }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 2 ? 40 : 46;
      return <line key={i} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * len} y2={Math.sin(a) * len} stroke={color} strokeWidth={9} strokeLinecap="round" />;
    })}
  </svg>
);

const SociaGlyph: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 800, fontSize: size * 0.5 }}>S</div>
);

const ExampleChip: React.FC = () => (
  <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, letterSpacing: 2, color: "#8a5a00", background: "#fde9b8", border: "1px solid #ecc76a", borderRadius: 8, padding: "3px 10px" }}>EXAMPLE</span>
);

/** The browser window the reel lives in: traffic lights, URL pill, warm paper body. */
const Window: React.FC<{ url: string; example?: boolean; top?: number; height?: number; header?: React.ReactNode; children?: React.ReactNode }> = ({ url, example, top = 324, height = 1060, header, children }) => (
  <div style={{ position: "absolute", left: 52, width: 976, top, height, borderRadius: 18, overflow: "hidden", background: PAPER, boxShadow: "0 30px 80px rgba(0,0,0,0.35)", fontFamily: SANS, color: INK }}>
    <div style={{ height: 58, background: PAPER2, display: "flex", alignItems: "center", padding: "0 20px", gap: 10, borderBottom: `1px solid ${LINE}` }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
      {example ? <div style={{ marginLeft: 14 }}><ExampleChip /></div> : null}
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 460, height: 34, borderRadius: 9, background: "#fff", fontSize: 18, color: INK2, display: "flex", alignItems: "center", justifyContent: "center" }}>{url}</div>
    </div>
    {header}
    <div style={{ position: "relative", height: height - 58 - (header ? 64 : 0) }}>{children}</div>
  </div>
);

const ClaudeHeader: React.FC = () => (
  <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 22, fontWeight: 600 }}>
    <ClaudeMark size={20} /> Claude
  </div>
);

const ReplyBox: React.FC<{ text?: string; active?: boolean; caret?: boolean }> = ({ text, active, caret }) => {
  const t = useT();
  const blink = Math.floor(t * 2.2) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 28, right: 28, bottom: 28, height: 112, borderRadius: 18, background: "#fff", border: `2px solid ${active ? "#e9a58c" : LINE}`, padding: "22px 24px", fontSize: 25, color: text ? INK : "#a8a39b" }}>
      {text || "Reply to Claude..."}
      {caret && blink ? <span style={{ display: "inline-block", width: 2, height: 28, background: INK, marginLeft: 2, verticalAlign: "middle" }} /> : null}
      <div style={{ position: "absolute", right: 18, bottom: 16, width: 42, height: 42, borderRadius: 10, background: text ? CORAL : "#f2c2b0", color: "#fff", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>↑</div>
    </div>
  );
};

const UserBubble: React.FC<{ text: string; at: number; bottom: number }> = ({ text, at, bottom }) => {
  const t = useT();
  const p = ease(t, at, 0.3);
  return (
    <div style={{ position: "absolute", right: 30, bottom, opacity: p, transform: `translateY(${(1 - p) * 16}px)`, background: PAPER2, borderRadius: 16, padding: "14px 22px", fontSize: 24 }}>{text}</div>
  );
};

const Spinner: React.FC<{ size?: number }> = ({ size = 22 }) => {
  const t = useT();
  return <div style={{ width: size, height: size, borderRadius: "50%", border: `3px solid ${LINE}`, borderTopColor: INK2, transform: `rotate(${t * 400}deg)` }} />;
};

const Check: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: GREEN, color: "#fff", fontSize: size * 0.62, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
);

/** Example reel covers: plain gradient tiles, no real creator's work. */
const COVERS = ["linear-gradient(160deg,#f3e3d3,#e8b49a)", "linear-gradient(160deg,#2b2623,#5c4a3f)", "linear-gradient(160deg,#141414,#3a3a3a)", "linear-gradient(160deg,#c9d6ea,#6f8fc9)"];
const VIEWS = ["2.4K", "1.9K", "1.6K", "980"];
const Cover: React.FC<{ i: number; w: number; h: number; hot?: boolean }> = ({ i, w, h, hot }) => (
  <div style={{ position: "relative", width: w, height: h, borderRadius: 12, background: COVERS[i], border: hot ? `3px solid ${CORAL}` : "none", boxSizing: "border-box", overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 14, right: 14, top: h * 0.3, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.45)" }} />
    <div style={{ position: "absolute", left: 14, width: w * 0.5, top: h * 0.3 + 18, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.3)" }} />
    <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 16, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 6, padding: "2px 8px" }}>▶ {VIEWS[i]}</div>
  </div>
);

/* ───────────── ground ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const drift = (a: number, s: number) => Math.sin(t * s + a) * 40;
  return (
    <AbsoluteFill style={{ background: "#13383a" }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #0d3436 0%, #1f4a4a 28%, #6b4256 55%, #a24a62 74%, #cf6a45 100%)" }} />
      <div style={{ position: "absolute", left: -200 + drift(0, 0.3), top: 120 + drift(1, 0.25), width: 900, height: 700, borderRadius: "50%", background: "rgba(20,120,110,0.55)", filter: "blur(140px)" }} />
      <div style={{ position: "absolute", right: -260 + drift(2, 0.22), top: 760 + drift(3, 0.28), width: 900, height: 800, borderRadius: "50%", background: "rgba(232,128,96,0.42)", filter: "blur(160px)" }} />
      <div style={{ position: "absolute", left: -120 + drift(4, 0.2), top: 1180 + drift(5, 0.3), width: 800, height: 700, borderRadius: "50%", background: "rgba(190,70,130,0.45)", filter: "blur(150px)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 132, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 22, color: "rgba(255,255,255,0.7)" }}>{FOOTER}</div>
    </AbsoluteFill>
  );
};

/* ───────────── top pill ───────────── */

const Pill: React.FC = () => {
  const t = useT();
  const idx = PILLS.reduce((v, p, i) => (t >= p.at - 0.05 ? i : v), -1);
  if (idx < 0) return null;
  const cur = PILLS[idx];
  const p = ease(t, cur.at - 0.05, 0.3);
  return (
    <div style={{ position: "absolute", top: 206, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 10 }}>
      <div style={{ opacity: p, filter: `blur(${(1 - p) * 8}px)`, transform: `scale(${0.94 + 0.06 * p})`, background: "rgba(22,30,32,0.82)", borderRadius: 40, padding: "14px 30px", display: "flex", alignItems: "center", gap: 12, fontFamily: SANS, fontWeight: 700, fontSize: 36, color: "#fff", letterSpacing: -0.4, boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}>
        {cur.step ? <span style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", color: "#1a1a1a", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>{cur.step}</span> : null}
        <span>{cur.words.map((w, i) => <span key={i} style={{ color: w.em ? PEACH : "#fff" }}>{(i ? " " : "") + w.w}</span>)}</span>
      </div>
    </div>
  );
};

/* ───────────── 1 · hook ───────────── */

const HookScene: React.FC = () => {
  const t = useT();
  const grow = ease(t, 0.05, 0.55);
  const x0 = 290, x1 = 780, y = 572;
  const ring = ease(t, 1.17, 0.9);
  const card = ease(t, HOOK.card.at, 0.35);
  return (
    <Beat at={0} until={HOOK.end} rise={0} scale={1}>
      <div style={{ position: "absolute", left: 150, top: y - 120 }}>
        <InstagramIcon size={240} />
      </div>
      <svg style={{ position: "absolute", inset: 0 }} width={1080} height={1920}>
        <path d={`M ${x0 + 120} ${y} Q ${(x0 + x1) / 2 + 60} ${y + 26} ${x0 + 120 + (x1 + 10 - x0 - 120) * grow} ${y}`} stroke={CORAL} strokeWidth={10} fill="none" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 10px rgba(240,140,100,0.8))" }} />
        {grow >= 1 && [0, 1, 2].map((i) => {
          const u = ((t * 0.7 + i / 3) % 1);
          const px = x0 + 130 + (x1 - x0 - 130) * u;
          return <circle key={i} cx={px} cy={y + 18 * Math.sin(Math.PI * u)} r={9} fill="#fff" style={{ filter: "drop-shadow(0 0 8px #fff)" }} />;
        })}
        {ring > 0 && ring < 1 ? <circle cx={x0 + 10} cy={y} r={60 + ring * 140} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={3} opacity={1 - ring} /> : null}
      </svg>
      <div style={{ position: "absolute", left: x1 - 20, top: y - 105 }}>
        <ClaudeMark size={210} color="#ef8a62" />
      </div>
      <div style={{ position: "absolute", top: 820, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 100, lineHeight: 1.12, color: "#fff", letterSpacing: -2, textShadow: "0 4px 24px rgba(0,0,0,0.25)" }}>
        {HOOK.head.map((line, i) => (
          <div key={i}>{line.map((w) => <RevealWord key={w.w} w={w} />)}</div>
        ))}
        <div style={{ margin: "6px auto 0", height: 6, width: 560 * ease(t, 1.4, 0.5), background: CORAL, borderRadius: 3, transform: "translateX(90px)" }} />
      </div>
      <div style={{ position: "absolute", top: 1130, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 54, lineHeight: 1.2, color: "#fff", letterSpacing: -0.8 }}>
        {HOOK.sub.map((line, i) => (
          <div key={i}>{line.map((w) => <RevealWord key={w.w} w={w} />)}</div>
        ))}
      </div>
      {card > 0 ? (
        <div style={{ position: "absolute", left: 90, right: 90, top: 1290, opacity: card, transform: `translateY(${(1 - card) * 20}px)`, background: "#fff", borderRadius: 20, padding: "24px 28px", display: "flex", gap: 18, alignItems: "flex-start", boxShadow: "0 16px 40px rgba(0,0,0,0.25)", fontFamily: SANS }}>
          <div style={{ marginTop: 6 }}><ClaudeMark size={30} /></div>
          <div style={{ flex: 1, fontSize: 32, fontWeight: 700, color: INK, lineHeight: 1.25, minHeight: 80 }}>{typed(t, HOOK.card.text, HOOK.card.at + 0.1, HOOK.card.at + 0.85)}</div>
          <ExampleChip />
        </div>
      ) : null}
    </Beat>
  );
};

/* ───────────── 2 · no access, 3 · scraper ───────────── */

const NoSeeScene: React.FC = () => {
  const t = useT();
  const reply = ease(t, 6.3, 0.3);
  return (
    <Beat at={T.noSee} until={T.scraper}>
      <Window url="claude.ai/chat" header={<ClaudeHeader />}>
        <UserBubble text={CHAT.noSeeAsk} at={T.noSee + 0.25} bottom={230} />
        <div style={{ position: "absolute", left: 30, bottom: 165, display: "flex", alignItems: "center", gap: 12, fontSize: 24, opacity: reply }}>
          <ClaudeMark size={22} /> {CHAT.noSeeReply}
          <span style={{ fontSize: 17, fontWeight: 600, color: RED, background: "#fbe4df", borderRadius: 6, padding: "3px 10px" }}>× no connector</span>
        </div>
        <ReplyBox />
      </Window>
    </Beat>
  );
};

const ScraperScene: React.FC = () => {
  const t = useT();
  return (
    <Beat at={T.scraper} until={T.connector}>
      <Window url="terminal · scraper.py" height={1110}>
        <div style={{ position: "absolute", left: 40, top: 200, fontFamily: MONO, fontSize: 26, color: INK }}>scraper.py</div>
        {SCRAPER.map((r, i) => {
          const p = ease(t, T.scraper + 0.15 + i * 0.22, 0.25);
          return (
            <div key={i} style={{ position: "absolute", left: 40 + i * 14, right: 40 - i * 14, top: 250 + i * 92, height: 72, opacity: p, transform: `translateY(${(1 - p) * 14}px) rotate(${i === 2 ? -1.5 * ease(t, 8.6, 0.3) : 0}deg)`, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", fontFamily: MONO, fontSize: 26 }}>
              <span>{r.req}</span><span style={{ color: r.ok ? GREEN : RED, fontWeight: 600 }}>{r.code}</span>
            </div>
          );
        })}
        {["login required", "challenge"].map((s, i) => {
          const p = ease(t, 8.45 + i * 0.2, 0.25);
          return (
            <div key={s} style={{ position: "absolute", left: 60, right: 60, top: 540 + i * 90, height: 66, opacity: p, border: `1px solid ${LINE}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", fontFamily: MONO, fontSize: 24, color: INK2 }}>
              <span>{s}</span><span>×</span>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 40, top: 150, fontFamily: MONO, fontSize: 24, fontWeight: 600, color: RED, opacity: ease(t, 8.58, 0.2) }}>scraper.py crashed</div>
      </Window>
    </Beat>
  );
};

/* ───────────── 4 · one connector, 5 · settings ───────────── */

const NodeCard: React.FC<{ x: number; label: string; icon: React.ReactNode; on: number; sub?: string }> = ({ x, label, icon, on, sub }) => (
  <div style={{ position: "absolute", left: x, top: 330, width: 300, height: 190, borderRadius: 20, background: "#fff", border: `3px solid ${on ? GREEN : "#e7b6a4"}`, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontSize: 26, fontWeight: 700 }}>
    {sub && on ? <div style={{ position: "absolute", top: 12, right: 14, fontSize: 16, fontWeight: 700, color: GREEN }}>{sub}</div> : null}
    {icon}
    {label}
  </div>
);

const ConnectorScene: React.FC = () => {
  const t = useT();
  const on = t >= T.connected;
  const left = popE(t, T.connector + 0.25);
  const right = popE(t, T.connector + 0.45);
  const plug = ease(t, T.connected - 0.25, 0.3);
  return (
    <Beat at={T.connector} until={T.settings}>
      <Window url="claude.ai/connectors" height={860}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${0.6 + 0.4 * left})`, opacity: left, transformOrigin: "300px 425px" }}>
          <NodeCard x={150} label="SOCIA" on={on ? 1 : 0} icon={<div style={{ display: "flex", gap: 10 }}><SociaGlyph size={56} /><InstagramIcon size={56} /></div>} />
        </div>
        <div style={{ position: "absolute", left: 450, top: 410, width: 76 * plug, height: 30, background: on ? GREEN : CORAL, borderRadius: 6 }} />
        <div style={{ position: "absolute", inset: 0, transform: `scale(${0.6 + 0.4 * right})`, opacity: right, transformOrigin: "676px 425px" }}>
          <NodeCard x={526} label="Claude" on={on ? 1 : 0} sub="connected" icon={<ClaudeMark size={58} />} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 590, textAlign: "center", fontSize: 24, color: INK2, opacity: ease(t, T.connected, 0.3) }}>Instagram, Facebook, YouTube and TikTok, through one connector</div>
      </Window>
    </Beat>
  );
};

const SettingsScene: React.FC = () => {
  const t = useT();
  const name = typed(t, "SOCIA", T.settings + 0.2, T.settings + 0.55);
  const url = typed(t, "SOCIA connector link", T.settings + 0.6, T.settings + 1.0);
  const added = t >= T.addClick + 0.12;
  const dialog = 1 - ease(t, T.addClick + 0.1, 0.25);
  const cx = interpolate(t, [T.settings + 0.9, T.addClick], [640, 830], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const cy = interpolate(t, [T.settings + 0.9, T.addClick], [560, 742], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const press = t > T.addClick - 0.05 && t < T.addClick + 0.1 ? 0.88 : 1;
  const rows = ["Google Drive", "Gmail", "Google Calendar", "GitHub", "Slack"];
  return (
    <Beat at={T.settings} until={T.ask}>
      <Window url="claude.ai/settings/connectors" height={1060}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 230, background: PAPER2, padding: "26px 24px", fontSize: 21, color: INK2, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontFamily: SERIF, fontSize: 32, color: INK, fontWeight: 500 }}>Claude</div>
          {["New chat", "Chats", "Projects", "Artifacts"].map((s) => <div key={s}>{s}</div>)}
          <div style={{ color: INK, fontWeight: 600 }}>Customize</div>
        </div>
        <div style={{ position: "absolute", left: 262, right: 30, top: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: SERIF, fontSize: 40 }}>Customize</div>
            <div style={{ background: "#1c1b1a", color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 20, fontWeight: 600 }}>+ Add</div>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 22, fontSize: 20, color: INK2 }}>
            <span>Skills</span><span style={{ color: INK, fontWeight: 600, background: PAPER2, borderRadius: 8, padding: "2px 12px" }}>Connectors</span><span>Styles</span>
          </div>
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 12 }}>
            {added ? (
              <div style={{ height: 66, borderRadius: 12, border: `2px solid ${GREEN}`, background: "#fff", display: "flex", alignItems: "center", gap: 14, padding: "0 18px", fontSize: 22, fontWeight: 600, transform: `scale(${0.96 + 0.04 * popE(t, T.addClick + 0.12)})` }}>
                <SociaGlyph size={34} /> SOCIA <span style={{ fontSize: 15, color: INK2, letterSpacing: 1 }}>CUSTOM</span>
                <span style={{ marginLeft: "auto", fontSize: 18, color: GREEN, display: "flex", alignItems: "center", gap: 8 }}><InstagramIcon size={24} /> Connected</span>
              </div>
            ) : null}
            {rows.map((r) => (
              <div key={r} style={{ height: 62, borderRadius: 12, border: `1px solid ${LINE}`, background: "#fff", display: "flex", alignItems: "center", padding: "0 18px", fontSize: 21 }}>
                {r}<span style={{ marginLeft: "auto", fontSize: 17, border: `1px solid ${LINE}`, borderRadius: 8, padding: "4px 12px" }}>Connect</span>
              </div>
            ))}
          </div>
        </div>
        {dialog > 0 ? (
          <>
            <div style={{ position: "absolute", inset: 0, background: `rgba(40,38,35,${0.32 * dialog})` }} />
            <div style={{ position: "absolute", left: 150, right: 60, top: 220, height: 470, opacity: dialog, transform: `scale(${0.96 + 0.04 * dialog})`, background: "#fff", borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: "30px 34px" }}>
              <div style={{ fontFamily: SERIF, fontSize: 30 }}>Add custom connector <span style={{ fontFamily: SANS, fontSize: 14, color: CORAL, background: "#fbe7df", borderRadius: 5, padding: "2px 8px", verticalAlign: "middle" }}>BETA</span></div>
              <div style={{ marginTop: 26, fontSize: 18, color: INK2 }}>Name</div>
              <div style={{ marginTop: 8, height: 58, borderRadius: 10, border: `2px solid ${name ? "#e9a58c" : LINE}`, display: "flex", alignItems: "center", padding: "0 16px", fontSize: 24 }}>{name}</div>
              <div style={{ marginTop: 20, fontSize: 18, color: INK2 }}>Remote MCP server URL</div>
              <div style={{ marginTop: 8, height: 58, borderRadius: 10, border: `2px solid ${url ? "#e9a58c" : LINE}`, background: url ? "#fdf6f3" : "#fff", display: "flex", alignItems: "center", padding: "0 16px", fontSize: 22, fontFamily: MONO, color: CORAL }}>{url}</div>
              <div style={{ position: "absolute", right: 34, bottom: 30, display: "flex", gap: 14 }}>
                <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 24px", fontSize: 21 }}>Cancel</div>
                <div style={{ background: url.length > 10 ? "#1c1b1a" : "#cfcac2", color: "#fff", borderRadius: 10, padding: "12px 30px", fontSize: 21, fontWeight: 600, transform: `scale(${press})` }}>Add</div>
              </div>
            </div>
          </>
        ) : null}
        <svg style={{ position: "absolute", left: cx, top: cy, opacity: t < T.addClick + 0.5 ? 1 : 0 }} width={34} height={40} viewBox="0 0 17 20"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="#111" stroke="#fff" strokeWidth={1.2} /></svg>
      </Window>
    </Beat>
  );
};

/* ───────────── 6 · ask, 7 · read, 8 · answer ───────────── */

const AskScene: React.FC = () => {
  const t = useT();
  const text = typed(t, CHAT.ask, T.typeFrom, T.typeTo);
  return (
    <Beat at={T.ask} until={T.read}>
      <Window url="claude.ai/chat" top={300} height={1000}>
        <ReplyBox text={text} active caret />
      </Window>
    </Beat>
  );
};

const ReadScene: React.FC = () => {
  const t = useT();
  const done = t >= T.readDone;
  return (
    <Beat at={T.read} until={T.answer}>
      <Window url="claude.ai/chat" example header={<ClaudeHeader />}>
        <UserBubble text={CHAT.ask} at={T.read - 0.2} bottom={540} />
        <div style={{ position: "absolute", left: 30, bottom: 458, display: "flex", alignItems: "center", gap: 10, fontSize: 21, opacity: ease(t, T.read + 0.3, 0.25) }}>
          <SociaGlyph size={26} /><b>socia</b>
          <span style={{ color: INK2 }}>{done ? "read your last 12 reels" : "reading your reels..."}</span>
          {done ? <Check size={22} /> : <Spinner size={20} />}
        </div>
        <div style={{ position: "absolute", left: 30, bottom: 165, display: "flex", gap: 18 }}>
          {[0, 1, 2, 3].map((i) => {
            const p = popE(t, T.read + 0.5 + i * 0.18);
            return <div key={i} style={{ opacity: p, transform: `scale(${0.7 + 0.3 * p})` }}><Cover i={i} w={212} h={270} hot={i === 0} /></div>;
          })}
        </div>
        <ReplyBox />
      </Window>
    </Beat>
  );
};

const AnswerScene: React.FC = () => {
  const t = useT();
  const fix = ease(t, T.fix + 0.1, 0.3);
  const maxH = 300;
  return (
    <Beat at={T.answer} until={T.trend}>
      <Window url="claude.ai/chat" example header={<ClaudeHeader />}>
        <div style={{ position: "absolute", left: 30, top: 10, display: "flex", gap: 14, opacity: 0.9 }}>
          {[0, 1, 2, 3].map((i) => <Cover key={i} i={i} w={150} h={150} hot={i === 0} />)}
        </div>
        <div style={{ position: "absolute", left: 30, top: 186, display: "flex", alignItems: "center", gap: 10, fontSize: 23 }}><ClaudeMark size={20} /> Here's what happened.</div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 236, height: 520, background: "#fff", borderRadius: 16, border: `1px solid ${LINE}`, padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>reach <span style={{ fontWeight: 500, color: INK2, fontSize: 18 }}>last 8 reels vs your usual</span></div>
            <div style={{ fontSize: 58, fontWeight: 800, color: RED }}>{Math.round(100 - 50 * ease(t, T.answer + 0.2, 0.9))}%</div>
          </div>
          <div style={{ position: "relative", height: maxH + 20, marginTop: 20 }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 20 + maxH - maxH / 1.3, borderTop: `2px dashed ${INK2}`, opacity: 0.5 }} />
            <div style={{ position: "absolute", right: 0, top: maxH - maxH / 1.3 - 8, fontSize: 16, color: INK2 }}>your usual</div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-end", gap: 22 }}>
              {REACH.map((r, i) => {
                const last = i === REACH.length - 1;
                const g = ease(t, T.answer + 0.1 + i * 0.07, 0.4);
                return <div key={i} style={{ flex: 1, height: (maxH / 1.3) * r * g, borderRadius: "8px 8px 0 0", background: last ? RED : "#e9cfc3" }} />;
              })}
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 18, color: RED, textAlign: "right", fontWeight: 600 }}>last reel</div>
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 784, opacity: fix, transform: `translateY(${(1 - fix) * 14}px)`, background: "#fdf0eb", border: `2px solid #eab3a0`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, fontSize: 24, fontWeight: 600 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", background: CORAL, borderRadius: 6, padding: "3px 10px" }}>fix</span>
          {typed(t, "posted at 11 PM. Your best time is 6 PM.", T.fix + 0.2, T.fix + 1.1)}
        </div>
      </Window>
    </Beat>
  );
};

/* ───────────── 9 · trending, 10 · Claude builds ───────────── */

const PhoneReel: React.FC<{ w: number; dark?: boolean; border?: string }> = ({ w, dark, border }) => (
  <div style={{ width: w, height: w * 1.78, borderRadius: 16, background: dark ? "linear-gradient(170deg,#1b1714,#3b2e27)" : "linear-gradient(170deg,#dfe4ea,#8d99a8)", border: border ?? "none", boxSizing: "border-box", position: "relative", overflow: "hidden", boxShadow: "0 14px 34px rgba(0,0,0,0.3)" }}>
    <div style={{ position: "absolute", left: "12%", right: "12%", top: "34%", padding: "8px 10px", borderRadius: 8, background: dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.5)", fontFamily: SANS, fontSize: w * 0.075, fontWeight: 700, color: dark ? "#fff" : "#2b2a28", lineHeight: 1.2 }}>this is why your reel flopped</div>
    {[0.2, 0.5, 0.75].map((y, i) => <div key={i} style={{ position: "absolute", left: `${18 + i * 22}%`, top: `${60 + y * 20}%`, width: 10, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.35)" }} />)}
  </div>
);

const TrendScene: React.FC = () => {
  const t = useT();
  const idea = popE(t, T.tell + 0.1, 0.4);
  return (
    <Beat at={T.trend} until={T.build}>
      <Window url="claude.ai/chat" example header={<ClaudeHeader />}>
        <div style={{ position: "absolute", left: 30, top: 24, display: "flex", alignItems: "center", gap: 10, fontSize: 21, opacity: ease(t, T.trend + 0.15, 0.25) }}>
          <SociaGlyph size={26} /><b>socia</b>
          <span style={{ color: INK2 }}>{t >= T.trend + 1.0 ? "trending in your niche" : "reading what's trending..."}</span>
          {t >= T.trend + 1.0 ? <Check size={22} /> : <Spinner size={20} />}
        </div>
        {TRENDING.map((name, i) => {
          const p = ease(t, T.trend + 0.4 + i * 0.22, 0.3);
          return (
            <div key={name} style={{ position: "absolute", left: 30, right: 30, top: 84 + i * 118, height: 100, opacity: p, transform: `translateX(${(1 - p) * 30}px)`, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, display: "flex", alignItems: "center", gap: 20, padding: "0 18px" }}>
              <Cover i={(i + 1) % 4} w={64} h={80} />
              <div style={{ flex: 1, fontSize: 24, fontWeight: 600 }}>{name}</div>
              <span style={{ fontSize: 17, fontWeight: 700, color: GREEN, background: "#e3f3e9", borderRadius: 6, padding: "4px 10px" }}>trending</span>
            </div>
          );
        })}
        {idea > 0 ? (
          <div style={{ position: "absolute", left: 30, right: 30, top: 470, opacity: Math.min(1, idea), transform: `scale(${0.85 + 0.15 * idea})`, transformOrigin: "50% 0", background: "#fdf0eb", border: "2px solid #eab3a0", borderRadius: 16, padding: "22px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 18, fontWeight: 700, color: INK2, letterSpacing: 1.5 }}>
              <SociaGlyph size={26} /> SOCIA <span style={{ fontSize: 26, color: CORAL }}>→</span> <ClaudeMark size={22} /> CLAUDE
            </div>
            <div style={{ marginTop: 14, fontSize: 27, fontWeight: 700, lineHeight: 1.3 }}>{typed(t, NEXT_IDEA, T.tell + 0.25, T.tell + 1.4)}</div>
          </div>
        ) : null}
        <ReplyBox />
      </Window>
    </Beat>
  );
};

const TRACK_ROWS = ["edit", "animations", "captions"];
const BuildScene: React.FC = () => {
  const t = useT();
  const done = t >= T.buildDone;
  const head = interpolate(t, [T.build + 0.3, T.buildDone], [0, 1], clamp);
  return (
    <Beat at={T.build} until={T.rate}>
      <Window url="claude.ai/chat" header={<ClaudeHeader />}>
        <div style={{ position: "absolute", left: 30, top: 24, display: "flex", alignItems: "center", gap: 10, fontSize: 22 }}>
          <ClaudeMark size={22} /><b>Claude</b>
          <span style={{ color: INK2 }}>{done ? "video ready" : "building your video..."}</span>
          {done ? <Check size={22} /> : <Spinner size={20} />}
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 84, height: 330, background: "#1d1c1b", borderRadius: 16, padding: "22px 22px 0 22px" }}>
          {TRACK_ROWS.map((name, i) => {
            const on = ease(t, T.tracks[i], 0.35);
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 18, height: 88, opacity: 0.35 + 0.65 * on }}>
                <div style={{ width: 150, fontFamily: MONO, fontSize: 20, color: on > 0.5 ? PEACH : "#8d8780" }}>{name}</div>
                <div style={{ flex: 1, position: "relative", height: 54 }}>
                  {i === 0 && [0, 0.3, 0.55, 0.78].map((x, k) => <div key={k} style={{ position: "absolute", left: `${x * 100}%`, width: `${(k === 3 ? 0.22 : 0.27) * 100 * on}%`, top: 0, height: 54, borderRadius: 8, background: COVERS[k] }} />)}
                  {i === 1 && [0.06, 0.2, 0.37, 0.5, 0.66, 0.84].map((x, k) => <div key={k} style={{ position: "absolute", left: `${x * 100}%`, top: 12, width: 28, height: 28, transform: `rotate(45deg) scale(${popE(t, T.tracks[1] + k * 0.06)})`, background: CORAL, borderRadius: 4 }} />)}
                  {i === 2 && ["this", "is", "why", "your", "reel", "flopped"].map((w, k) => <div key={k} style={{ position: "absolute", left: `${k * 16.4}%`, top: 8, opacity: ease(t, T.tracks[2] + k * 0.06, 0.2), background: "#fff", color: INK, borderRadius: 6, padding: "4px 10px", fontSize: 18, fontWeight: 700 }}>{w}</div>)}
                </div>
              </div>
            );
          })}
          <div style={{ position: "absolute", top: 14, bottom: 14, left: 190 + (976 - 60 - 44 - 190) * head, width: 3, background: "#fff", opacity: done ? 0 : 0.8 }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 450, display: "flex", justifyContent: "center", opacity: ease(t, T.buildDone, 0.3), transform: `scale(${0.85 + 0.15 * popE(t, T.buildDone)})` }}>
          <PhoneReel w={230} dark border={`3px solid ${CORAL}`} />
        </div>
      </Window>
    </Beat>
  );
};

/* ───────────── 11 · SOCIA rates, 12 · publishes, 13 · tracks ───────────── */

const RateScene: React.FC = () => {
  const t = useT();
  const overall = Math.round(RATER.overall * ease(t, T.rate + 0.2, 0.9));
  return (
    <Beat at={T.rate} until={T.publish}>
      <Window url="SOCIA · Studio" example header={<div style={{ height: 64, display: "flex", alignItems: "center", gap: 12, padding: "0 30px", fontSize: 22, fontWeight: 700, borderBottom: `1px solid ${LINE}` }}><SociaGlyph size={28} /> Studio <span style={{ fontWeight: 500, color: INK2 }}>· Rate this video</span></div>}>
        <div style={{ position: "absolute", left: 30, top: 30 }}><PhoneReel w={190} dark /></div>
        <div style={{ position: "absolute", left: 260, right: 30, top: 30 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 84, fontWeight: 800, color: GREEN, lineHeight: 1 }}>{overall}</span>
            <span style={{ fontSize: 24, color: INK2 }}>/ 100 overall</span>
          </div>
          {RATER.rows.map(([name, score], i) => {
            const g = ease(t, T.rate + 0.25 + i * 0.1, 0.5);
            return (
              <div key={name} style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, fontWeight: 600 }}><span>{name}</span><span>{Math.round(score * g)}</span></div>
                <div style={{ marginTop: 6, height: 12, borderRadius: 6, background: PAPER2 }}>
                  <div style={{ width: `${score * g}%`, height: 12, borderRadius: 6, background: score < 78 ? "#e2a03f" : GREEN }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 640, opacity: ease(t, T.rate + 1.0, 0.3), background: "#fdf0eb", border: "2px solid #eab3a0", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, fontSize: 23, fontWeight: 600 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", background: CORAL, borderRadius: 6, padding: "3px 10px" }}>fix</span>
          {RATER.fix}
        </div>
      </Window>
    </Beat>
  );
};

const PublishScene: React.FC = () => {
  const t = useT();
  const pressed = t > T.approveClick - 0.05 && t < T.approveClick + 0.12 ? 0.9 : 1;
  const live = t >= T.published;
  const approved = t >= T.approveClick;
  return (
    <Beat at={T.publish} until={T.track}>
      <div style={{ position: "absolute", left: 100, right: 100, top: 470, background: "#fff", borderRadius: 26, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", padding: 30, fontFamily: SANS, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontWeight: 700 }}><SociaGlyph size={32} /> SOCIA <span style={{ fontWeight: 500, color: INK2 }}>· ready to publish</span></div>
        <div style={{ display: "flex", gap: 26, marginTop: 24 }}>
          <PhoneReel w={180} dark />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 600 }}><InstagramIcon size={34} /> Instagram · Reel</div>
            <div style={{ fontSize: 20, color: INK2, lineHeight: 1.4 }}>This is why your reel flopped. Comment CLAUDE for the setup.</div>
            <div style={{ marginTop: "auto", height: 70, borderRadius: 14, background: live ? GREEN : approved ? "#3c3a37" : "#1c1b1a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 26, fontWeight: 700, transform: `scale(${pressed})` }}>
              {live ? <>Published <span style={{ fontSize: 24 }}>✓</span></> : approved ? <>Publishing <Spinner size={22} /></> : "Approve"}
            </div>
          </div>
        </div>
      </div>
    </Beat>
  );
};

const TrackScene: React.FC = () => {
  const t = useT();
  const cx = 540, cy = 880, r = 270;
  const pos = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const nodes = T.trackNodes;
  const sweep = interpolate(t, [nodes[0], nodes[1], nodes[2], nodes[3], nodes[3] + 0.6], [0, 0.25, 0.5, 0.75, 1], clamp);
  const a1 = -Math.PI / 2 + sweep * Math.PI * 2;
  const large = sweep > 0.5 ? 1 : 0;
  const arc = sweep >= 0.999 ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}` : `M ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  const pill = popE(t, T.trackPill);
  return (
    <Beat at={T.track} until={T.cta}>
      <svg style={{ position: "absolute", inset: 0 }} width={1080} height={1920}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={3} strokeDasharray="10 12" />
        {sweep > 0 ? <path d={arc} fill="none" stroke="#ef8a62" strokeWidth={7} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 10px rgba(240,140,100,0.8))" }} /> : null}
      </svg>
      <div style={{ position: "absolute", left: cx - 90, top: cy - 90, width: 180, height: 180, borderRadius: 90, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}><SociaGlyph size={96} /></div>
      {TRACK.map((n, i) => {
        const on = ease(t, nodes[i], 0.3);
        const [dx, dy] = pos[i];
        return (
          <div key={n.k} style={{ position: "absolute", left: cx + dx * r - 120, top: cy + dy * r - 55, width: 240, height: 110, borderRadius: 18, background: `rgba(255,255,255,${0.25 + 0.75 * on})`, filter: `blur(${(1 - on) * 3}px)`, transform: `scale(${0.92 + 0.08 * on})`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SANS, color: on > 0.5 ? INK : "rgba(255,255,255,0.7)", boxShadow: on > 0.5 ? "0 10px 30px rgba(0,0,0,0.2)" : "none" }}>
            <div style={{ fontSize: 36, fontWeight: 800 }}>{n.k}</div>
            <div style={{ fontSize: 20, color: on > 0.5 ? INK2 : "rgba(255,255,255,0.6)" }}>{n.sub}</div>
          </div>
        );
      })}
      {pill > 0 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 1270, display: "flex", justifyContent: "center" }}>
          <div style={{ transform: `scale(${pill})`, background: "#fff", borderRadius: 40, padding: "16px 34px", display: "flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 38, fontWeight: 800, color: INK, boxShadow: "0 12px 34px rgba(0,0,0,0.25)" }}>
            <ClaudeMark size={36} /> makes what's next
          </div>
        </div>
      ) : null}
    </Beat>
  );
};

/* ───────────── 14 · comment CTA ───────────── */

const CtaScene: React.FC = () => {
  const t = useT();
  const word = typed(t, "CLAUDE", T.cta + 0.15, T.comment - 0.05);
  const posted = t >= T.comment;
  const notif = ease(t, T.notify, 0.35, Easing.out(Easing.back(1.4)));
  return (
    <Beat at={T.cta} until={999}>
      <div style={{ position: "absolute", left: 300, top: 330, width: 480, height: 1000, borderRadius: 64, background: "#141414", padding: 12, boxShadow: "0 30px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 54, overflow: "hidden", background: "linear-gradient(180deg,#d9d2c8,#b9aea2)", fontFamily: SANS }}>
          <div style={{ position: "absolute", left: "50%", top: 14, transform: "translateX(-50%)", width: 120, height: 34, borderRadius: 17, background: "#000", zIndex: 3 }} />
          <div style={{ position: "absolute", left: 34, top: 120 }}><InstagramIcon size={70} /></div>
          <div style={{ position: "absolute", left: 120, right: 120, top: 154, height: 3, background: CORAL }} />
          <div style={{ position: "absolute", right: 34, top: 118, width: 72, height: 72, borderRadius: 16, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}><ClaudeMark size={44} /></div>
          <div style={{ position: "absolute", left: 20, right: 20, top: 240, textAlign: "center", fontSize: 38, fontWeight: 800, color: "#1b1a19", lineHeight: 1.12, letterSpacing: -0.6 }}>Connect Claude to your <span style={{ color: CORAL }}>Instagram</span></div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 350, display: "flex", justifyContent: "center" }}><span style={{ background: CORAL, color: "#fff", fontSize: 18, fontWeight: 700, borderRadius: 6, padding: "4px 12px" }}>with SOCIA</span></div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 560, background: "#fff", borderRadius: "28px 28px 0 0" }}>
            <div style={{ textAlign: "center", fontSize: 22, fontWeight: 700, marginTop: 20 }}>Comments</div>
            {posted ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 26px", fontSize: 22, opacity: ease(t, T.comment, 0.25) }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: "#d8dde4" }} /><b>you</b> CLAUDE
              </div>
            ) : null}
            <div style={{ position: "absolute", left: 22, right: 22, bottom: 30, height: 64, borderTop: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 21 }}>
              <span style={{ color: posted || !word ? "#9a958e" : INK }}>{posted || !word ? "Add a comment..." : word}</span>
              <span style={{ color: "#2f7cf6", fontWeight: 700 }}>Post</span>
            </div>
          </div>
          {notif > 0 ? (
            <div style={{ position: "absolute", left: 14, right: 14, top: 58, transform: `translateY(${(1 - notif) * -90}px)`, opacity: Math.min(1, notif * 1.5), background: "rgba(255,255,255,0.96)", borderRadius: 18, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 4 }}>
              <SociaGlyph size={40} />
              <div style={{ fontSize: 18, lineHeight: 1.3 }}><b>SOCIA</b><br />coming soon · you're on the early access list</div>
            </div>
          ) : null}
        </div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxWhoosh, at: 0.02, volume: 0.35 },
  { src: sfxPop, at: HOOK.card.at, volume: 0.5 },
  ...[T.noSee, T.scraper, T.connector, T.settings, T.read, T.answer, T.trend, T.build, T.rate, T.publish, T.track, T.cta].map((at) => ({ src: sfxWhoosh, at: at - 0.05, volume: 0.22 })),
  { src: sfxPop, at: T.connected, volume: 0.6 },
  { src: sfxClick, at: T.addClick, volume: 0.6 },
  { src: sfxClick, at: T.typeTo + 0.05, volume: 0.5 },
  { src: sfxPop, at: T.readDone, volume: 0.45 },
  { src: sfxPop, at: T.tell + 0.1, volume: 0.5 },
  ...T.tracks.map((at) => ({ src: sfxClick, at, volume: 0.45 })),
  { src: sfxPop, at: T.buildDone, volume: 0.5 },
  { src: sfxClick, at: T.approveClick, volume: 0.65 },
  { src: sfxPop, at: T.published, volume: 0.55 },
  ...T.trackNodes.map((at) => ({ src: sfxPop, at, volume: 0.4 })),
  { src: sfxClick, at: T.comment, volume: 0.55 },
  { src: sfxPop, at: T.notify, volume: 0.55 },
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

export const ClaudeConnect: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: SANS }}>
    <Soundtrack />
    <Ground />
    <HookScene />
    <NoSeeScene />
    <ScraperScene />
    <ConnectorScene />
    <SettingsScene />
    <AskScene />
    <ReadScene />
    <AnswerScene />
    <TrendScene />
    <BuildScene />
    <RateScene />
    <PublishScene />
    <TrackScene />
    <CtaScene />
    <Pill />
  </AbsoluteFill>
);
