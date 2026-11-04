import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadSans } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSerif } from "@remotion/google-fonts/Newsreader";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import t01 from "./thumbs/t01.png";
import t02 from "./thumbs/t02.png";
import t03 from "./thumbs/t03.png";
import t04 from "./thumbs/t04.png";
import t05 from "./thumbs/t05.png";
import t06 from "./thumbs/t06.png";
import t07 from "./thumbs/t07.png";
import t08 from "./thumbs/t08.png";
import t09 from "./thumbs/t09.png";
import t10 from "./thumbs/t10.png";
import t11 from "./thumbs/t11.png";
import t12 from "./thumbs/t12.png";
import { CAPS, FPS, ITEMS, T, TOP_VIEWS } from "./story";

const sans = loadSans("normal", { weights: ["600", "700", "800"], subsets: ["latin"] });
const serif = loadSerif("normal", { weights: ["300", "400"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const SANS = `${sans.fontFamily}, sans-serif`;
const SERIF = `${serif.fontFamily}, serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

const BG = "#0f0c09";
const PANEL = "#1a1612";
const PANEL2 = "#231d17";
const EDGE = "#3a3028";
const ORANGE = "#f5a524";
const CORAL = "#ef5a3c";
const CREAM = "#f3ece2";
const DIM = "#9c8f80";
const GREEN = "#3fbf74";
const CLAUDE = "#e07a55";
const THUMBS = [t01, t02, t03, t04, t05, t06, t07, t08, t09, t10, t11, t12];

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
const popE = (t: number, at: number, dur = 0.4) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) });
const typed = (t: number, s: string, a: number, b: number) => s.slice(0, Math.round(interpolate(t, [a, b], [0, s.length], clamp)));

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24, display: "block" }} />;
const ClaudeMark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    {Array.from({ length: 10 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: size / 2 - size * 0.055, top: 0, width: size * 0.11, height: size / 2, borderRadius: size, background: CLAUDE, transformOrigin: "50% 100%", transform: `rotate(${i * 36}deg) scaleY(${i % 2 ? 0.78 : 1})` }} />
    ))}
  </div>
);
const Thumb: React.FC<{ i: number; w: number; style?: React.CSSProperties }> = ({ i, w, style }) => (
  <Img src={THUMBS[i]} style={{ width: w, height: w * (16 / 9), objectFit: "cover", borderRadius: w * 0.08, border: `2px solid ${EDGE}`, boxShadow: "0 18px 40px rgba(0,0,0,0.5)", display: "block", ...style }} />
);
const Pill: React.FC<{ children: React.ReactNode; bg?: string; color?: string; size?: number; style?: React.CSSProperties }> = ({ children, bg = ORANGE, color = "#1a1208", size = 26, style }) => (
  <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: size, color, background: bg, borderRadius: 999, padding: "8px 20px", whiteSpace: "nowrap", ...style }}>{children}</span>
);

/* ───────────── ground ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const off = (t * 40) % 60;
  const holes = (x: number) => (
    <div style={{ position: "absolute", left: x, top: -60 + off, width: 34, height: 2100, display: "flex", flexDirection: "column", gap: 26 }}>
      {Array.from({ length: 36 }).map((_, i) => <div key={i} style={{ width: 34, height: 34, borderRadius: 8, background: "#060504", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)" }} />)}
    </div>
  );
  return (
    <AbsoluteFill style={{ background: BG }}>
      <div style={{ position: "absolute", left: 90, top: 380, width: 900, height: 900, borderRadius: "50%", background: "rgba(245,140,40,0.13)", filter: "blur(160px)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 54, background: "#141008" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 54, background: "#141008" }} />
      {holes(10)}
      {holes(1036)}
    </AbsoluteFill>
  );
};

const Footer: React.FC = () => (
  <>
    <div style={{ position: "absolute", left: 96, top: 1600, display: "flex", alignItems: "center", gap: 12, fontFamily: MONO, fontSize: 24, color: DIM }}><Mark size={34} />@socia.appmedia</div>
    <div style={{ position: "absolute", right: 96, top: 1606, fontFamily: MONO, fontSize: 24, color: DIM }}>made with Claude + SOCIA</div>
  </>
);

/* ───────────── titles ───────────── */

type Seg = [string, "w" | "o"];
const Line: React.FC<{ segs: Seg[]; at: number; size?: number }> = ({ segs, at, size = 84 }) => {
  const t = useT();
  const p = ease(t, at, 0.35);
  if (p <= 0) return <div style={{ height: size * 1.08 }} />;
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, lineHeight: 1.08, height: size * 1.08, whiteSpace: "nowrap" }}>
      {segs.map(([s, k], i) => (
        <span key={i} style={k === "w" ? { fontFamily: SANS, fontWeight: 800, fontSize: size, letterSpacing: -size * 0.045, color: CREAM } : { fontFamily: SERIF, fontWeight: 300, fontSize: size * 1.08, letterSpacing: -size * 0.02, color: ORANGE }}>{s}</span>
      ))}
    </div>
  );
};

const Title: React.FC = () => {
  const t = useT();
  const box = (children: React.ReactNode, top = 250) => <div style={{ position: "absolute", left: 60, right: 60, top, textAlign: "center" }}>{children}</div>;
  if (t < T.how) {
    return box(
      <>
        <div style={{ fontFamily: MONO, fontSize: 26, letterSpacing: 10, color: ORANGE, marginBottom: 16, opacity: ease(t, 0.05) }}>DID YOU KNOW</div>
        <Line segs={[["one connector in Claude", "w"]]} at={0.61} size={76} />
        <Line segs={[["can make ", "w"], ["your whole week", "o"]]} at={1.76} size={76} />
        <Line segs={[["of animated reels", "o"]]} at={3.07} size={76} />
      </>,
      200,
    );
  }
  if (t < T.style) return box(<Line segs={[["how it ", "w"], ["works", "o"]]} at={T.how} />);
  if (t < T.items[0]) return box(<Line segs={[["any ", "w"], ["style", "o"]]} at={T.style} />);
  if (t < T.same) {
    const k = T.items.reduce((v, at, i) => (t >= at ? i : v), 0);
    const words = ITEMS[k].split(" ");
    const segs: Seg[] = words.length > 1 ? [[words[0] + " ", "w"], [words.slice(1).join(" "), "o"]] : [[ITEMS[k], "o"]];
    return box(<Line key={k} segs={segs} at={T.items[k]} />);
  }
  return null;
};

/* ───────────── bottom caption ───────────── */

const Caption: React.FC = () => {
  const t = useT();
  const ci = CAPS.reduce((v, c, i) => (t >= c[0][1] - 0.03 ? i : v), 0);
  const c = CAPS[ci];
  const next = CAPS[ci + 1];
  const out = next ? ease(t, next[0][1] - 0.08, 0.07) : 0;
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 1300, textAlign: "center", opacity: 1 - out }}>
      {c.map(([w, at, box], i) => {
        const p = ease(t, at, 0.22);
        if (p <= 0) return null;
        return (
          <span key={i} style={{ display: "inline-block", margin: "0 8px 10px", opacity: p, transform: `translateY(${(1 - p) * 12}px) scale(${0.92 + 0.08 * p})`, fontFamily: SANS, fontWeight: 800, fontSize: 62, letterSpacing: -1.5, color: box ? "#1a1208" : CREAM, background: box ? ORANGE : "transparent", borderRadius: 12, padding: box ? "0 14px 4px" : "0" }}>{w}</span>
        );
      })}
    </div>
  );
};

/* ───────────── scenes ───────────── */

const Hook: React.FC = () => {
  const t = useT();
  const tile = popE(t, 0.2, 0.5);
  const glow = 0.5 + 0.5 * Math.sin(t * 3);
  return (
    <>
      <div style={{ position: "absolute", left: 430, top: 640, width: 220, height: 220, borderRadius: 50, background: PANEL2, border: `2px solid ${EDGE}`, boxShadow: `0 0 ${60 + 40 * glow}px rgba(245,140,40,0.45)`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${tile})` }}>
        <ClaudeMark size={130} />
      </div>
      {t >= T.connector ? (
        <div style={{ position: "absolute", left: 670, top: 680, transform: `scale(${popE(t, T.connector)})`, transformOrigin: "left center", display: "flex", alignItems: "center", gap: 10, background: ORANGE, borderRadius: 999, padding: "8px 18px 8px 10px" }}>
          <Mark size={40} /><span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 24, color: "#1a1208" }}>SOCIA connected</span>
        </div>
      ) : null}
      {[1, 2, 0, 6].map((ti, i) => {
        const p = popE(t, T.reels + i * 0.1, 0.45);
        if (p <= 0) return null;
        return <div key={ti} style={{ position: "absolute", left: 120 + i * 215, top: 930 + Math.abs(i - 1.5) * 14, transform: `rotate(${(i - 1.5) * 6}deg) scale(${p})`, opacity: Math.min(1, p * 2) }}><Thumb i={ti} w={200} /></div>;
      })}
    </>
  );
};

const ClaudeWindow: React.FC = () => {
  const t = useT();
  const connected = t >= T.connect;
  const lines: { at: number; node: React.ReactNode }[] = [
    { at: T.reads, node: <><span style={{ color: ORANGE }}>●</span> socia · get_top_posts</> },
    { at: T.reads + 0.6, node: <span style={{ color: DIM }}>  top reel · {TOP_VIEWS.toLocaleString("en-US")} views · 9.6× median</span> },
    { at: T.trending, node: <><span style={{ color: ORANGE }}>●</span> socia · trending reels in your niche</> },
    { at: T.tells, node: <span style={{ color: CREAM }}>→ 7 posts: hooks, formats, times</span> },
  ];
  const code: { at: number; node: React.ReactNode }[] = [
    { at: T.code + 0.1, node: <><span style={{ color: ORANGE }}>●</span> Write(mon-reel.tsx)</> },
    { at: T.code + 0.4, node: <span style={{ color: "#8fb6ff" }}>{"<Composition id=\"mon\" fps={60}>"}</span> },
    { at: T.code + 0.7, node: <span style={{ color: CREAM }}>{"  <Hook words={hook} at={0.1} />"}</span> },
    { at: T.code + 1.0, node: <span style={{ color: CREAM }}>{"  <Calendar fill={spring(t)} />"}</span> },
    { at: T.code + 1.3, node: <span style={{ color: CREAM }}>{"  <Caption word=\"week\" at={2.7} />"}</span> },
    { at: T.code + 1.6, node: <span style={{ color: CREAM }}>{"  <Audio src=\"vo.mp3\" />"}</span> },
    { at: T.code + 1.9, node: <span style={{ color: "#8fb6ff" }}>{"</Composition>"}</span> },
  ];
  const show = t < T.code ? lines : code;
  return (
    <>
      <div style={{ position: "absolute", left: 100, top: 460, width: 880, height: 680, borderRadius: 28, background: PANEL, border: `2px solid ${EDGE}`, boxShadow: "0 30px 70px rgba(0,0,0,0.5)", overflow: "hidden", fontFamily: MONO }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 28px", borderBottom: `2px solid ${EDGE}` }}>
          <ClaudeMark size={30} /><span style={{ fontSize: 26, color: CREAM }}>Claude</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: connected ? ORANGE : DIM }}>
            {connected ? <Mark size={30} /> : <span style={{ width: 30, height: 30, borderRadius: 30, border: `2px dashed ${DIM}` }} />}
            {connected ? "SOCIA connected" : "connect SOCIA"}
          </span>
        </div>
        <div style={{ margin: "24px 28px", border: `2px solid ${ORANGE}`, borderRadius: 16, padding: "16px 20px", fontSize: 30, color: CREAM }}>
          {typed(t, "make this week's reels", T.type[0], T.type[1])}<span style={{ opacity: Math.floor(t * 3) % 2 ? 0 : 1, color: ORANGE }}>|</span>
        </div>
        <div style={{ padding: "0 30px", display: "flex", flexDirection: "column", gap: 14 }}>
          {show.map((l, i) => {
            const p = ease(t, l.at, 0.25);
            return <div key={i} style={{ fontSize: 26, whiteSpace: "pre", opacity: p, transform: `translateX(${(1 - p) * 14}px)` }}>{l.node}</div>;
          })}
        </div>
      </div>
      {t >= T.inCode ? <div style={{ position: "absolute", left: 0, right: 0, top: 1170, display: "flex", justifyContent: "center", transform: `scale(${popE(t, T.inCode)})` }}><Pill bg={CORAL} color="#fff" size={30}>{"</> the whole reel, in code"}</Pill></div> : null}
    </>
  );
};

const NotAI: React.FC = () => {
  const t = useT();
  const isCode = t >= T.codeTag;
  const credits = t >= T.credits;
  return (
    <>
      <div style={{ position: "absolute", left: 340, top: 420, transform: `scale(${popE(t, T.notAI, 0.4)})` }}>
        <Thumb i={1} w={400} />
        <div style={{ position: "absolute", left: 20, top: 20 }}>
          {isCode ? <Pill bg={CORAL} color="#fff" style={{ transform: `scale(${popE(t, T.codeTag)})`, display: "inline-block" }}>{"</> code"}</Pill> : <Pill bg="rgba(0,0,0,0.6)" color={CREAM} style={{ textDecoration: t >= T.ai + 0.15 ? "line-through" : "none" }}>video AI</Pill>}
        </div>
      </div>
      {credits ? (
        <div style={{ position: "absolute", left: 240, top: 1170, width: 600, transform: `scale(${popE(t, T.credits)})`, display: "flex", alignItems: "center", gap: 18, background: PANEL, border: `2px solid ${EDGE}`, borderRadius: 18, padding: "16px 24px", fontFamily: MONO }}>
          <span style={{ fontSize: 24, color: CREAM }}>video credits used</span>
          <div style={{ flex: 1, height: 6, borderRadius: 6, background: EDGE }} />
          <span style={{ fontSize: 40, fontWeight: 600, color: ORANGE }}>0</span>
        </div>
      ) : null}
    </>
  );
};

const Styles: React.FC = () => {
  const t = useT();
  if (t < T.items[0]) {
    return (
      <>
        {[2, 0, 1, 3].map((ti, i) => {
          const p = popE(t, T.style + i * 0.1, 0.45);
          return <div key={ti} style={{ position: "absolute", left: 110 + i * 220, top: 520 + Math.abs(i - 1.5) * 22, transform: `rotate(${(i - 1.5) * 7}deg) scale(${p})`, zIndex: i === 1 || i === 2 ? 2 : 1 }}><Thumb i={ti} w={240} /></div>;
        })}
      </>
    );
  }
  const k = T.items.reduce((v, at, i) => (t >= at ? i : v), 0);
  const ti = [2, 3, 0, 1][k];
  const p = popE(t, T.items[k], 0.4);
  return <div key={k} style={{ position: "absolute", left: 310, top: 420, transform: `scale(${0.85 + 0.15 * p})`, opacity: Math.min(1, p * 2) }}><Thumb i={ti} w={460} /></div>;
};

const Same: React.FC = () => {
  const t = useT();
  const cx = 540, cy = 860, r = 300;
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 380, display: "flex", justifyContent: "center", zIndex: 5, transform: `scale(${popE(t, T.same)})` }}><Pill>same system · every time</Pill></div>
      <div style={{ position: "absolute", left: cx - 110, top: cy - 110, width: 220, height: 220, borderRadius: 50, background: PANEL2, border: `2px solid ${ORANGE}`, boxShadow: "0 0 80px rgba(245,140,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transform: `scale(${popE(t, T.same, 0.5)})` }}>
        <Mark size={84} /><ClaudeMark size={76} />
      </div>
      {[0, 2, 3, 4, 7, 8].map((ti, i) => {
        const a = (i / 6) * Math.PI * 2 + t * 0.5;
        const p = popE(t, T.same + 0.1 + i * 0.07, 0.4);
        return <div key={ti} style={{ position: "absolute", left: cx + Math.cos(a) * r - 65, top: cy + Math.sin(a) * r * 0.9 - 115, transform: `scale(${p})` }}><Thumb i={ti} w={130} /></div>;
      })}
    </>
  );
};

const ThisReel: React.FC = () => {
  const t = useT();
  const head = interpolate(t, [T.thisReel, 31], [0, 1], clamp);
  const tracks: [string, string, number][] = [["WORDS", ORANGE, T.tracks[0]], ["ANIMATION", "#8fb6ff", T.tracks[1]], ["SOUND", CORAL, T.tracks[2]]];
  return (
    <div style={{ position: "absolute", left: 90, top: 300, width: 900, height: 940, borderRadius: 26, background: PANEL, border: `2px solid ${EDGE}`, boxShadow: "0 30px 70px rgba(0,0,0,0.5)", fontFamily: MONO, overflow: "hidden", transform: `scale(${0.95 + 0.05 * ease(t, T.thisReel, 0.4)})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 24px", borderBottom: `2px solid ${EDGE}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 14, height: 14, borderRadius: 14, background: c }} />)}
        <span style={{ marginLeft: 14, fontSize: 22, color: DIM }}>connector-reel.tsx · 60fps</span>
      </div>
      <div style={{ position: "relative", margin: "26px auto 0", width: 270, height: 480, borderRadius: 26, background: BG, border: `2px solid ${EDGE}`, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 50, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 22, color: CREAM, lineHeight: 1.1 }}>one connector<br /><span style={{ fontFamily: SERIF, fontWeight: 300, color: ORANGE, fontSize: 24 }}>your whole week</span></div>
        <div style={{ position: "absolute", left: 95, top: 160, width: 80, height: 80, borderRadius: 20, background: PANEL2, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(245,140,40,0.5)" }}><ClaudeMark size={48} /></div>
        {[1, 2, 0].map((ti, i) => <div key={ti} style={{ position: "absolute", left: 30 + i * 75, top: 280 + Math.abs(i - 1) * 6, transform: `rotate(${(i - 1) * 7}deg)` }}><Thumb i={ti} w={64} /></div>)}
        {t >= T.made ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, display: "flex", justifyContent: "center", transform: `scale(${popE(t, T.made)})` }}><Pill size={18}>✳ made by Claude</Pill></div> : null}
      </div>
      <div style={{ position: "relative", margin: "34px 30px 0" }}>
        {tracks.map(([l, c, at], i) => {
          const lit = t >= at;
          return (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: i ? 22 : 0 }}>
              <span style={{ width: 160, fontSize: 20, color: lit ? CREAM : DIM }}>{l}</span>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {Array.from({ length: 22 }).map((_, k) => <div key={k} style={{ flex: 1 + ((k * 7 + i * 3) % 4) * 0.4, height: 30, borderRadius: 6, background: c, opacity: lit ? 0.95 : 0.25 }} />)}
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", left: 178 + 660 * head, top: -10, width: 3, height: 160, background: CREAM }} />
      </div>
    </div>
  );
};

const SociaAfter: React.FC = () => {
  const t = useT();
  const n = Math.round(TOP_VIEWS * interpolate(t, [T.views, T.views + 0.9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const chip = t >= T.views ? (
    <><b style={{ fontFamily: SANS, fontWeight: 800, fontSize: 64, color: "#1a1208" }}>{n.toLocaleString("en-US")}</b><span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 52, color: CORAL }}> views</span></>
  ) : t >= T.schedules ? (
    <><b style={{ fontFamily: SANS, fontWeight: 800, fontSize: 54, color: "#1a1208" }}>{t >= T.approve + 0.2 ? "✓ scheduled" : "schedules"}</b><span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 46, color: CORAL }}> when you approve</span></>
  ) : (
    <><b style={{ fontFamily: SANS, fontWeight: 800, fontSize: 54, color: "#1a1208" }}>rates</b><span style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 46, color: CORAL }}> every reel</span></>
  );
  const sub = t >= T.views ? "our top reel · SOCIA Analytics · Nov 3" : t >= T.schedules ? "nothing posts until you approve" : "hook · pacing · clarity · CTA";
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", justifyContent: "center" }}>
        <div style={{ transform: `scale(${popE(t, T.socia + 0.1)})`, background: CREAM, borderRadius: 22, padding: "16px 40px 12px", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
          <div>{chip}</div>
          <div style={{ fontFamily: MONO, fontSize: 20, color: "#6e6255", marginTop: 4 }}>{sub}</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, top: 520, width: 840, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {THUMBS.map((_, i) => {
          const p = popE(t, T.socia + 0.15 + i * 0.04, 0.35);
          return <div key={i} style={{ transform: `scale(${p})` }}><Img src={THUMBS[i]} style={{ width: "100%", height: 180, objectFit: "cover", objectPosition: "top", borderRadius: 14, border: `2px solid ${EDGE}`, display: "block" }} /></div>;
        })}
      </div>
    </>
  );
};

const Cta: React.FC = () => {
  const t = useT();
  const posted = t >= T.linkType + 0.45;
  return (
    <>
      <div style={{ position: "absolute", left: 160, top: 400, width: 760, transform: `scale(${popE(t, T.cta + 0.05)})`, background: CREAM, borderRadius: 26, padding: "28px 30px 34px", textAlign: "center", boxShadow: "0 30px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: SANS, fontWeight: 800, fontSize: 44, color: "#1a1208" }}>
          Launch code
          {t >= T.live ? <span style={{ transform: `scale(${popE(t, T.live)})`, display: "inline-flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 22, color: "#fff", background: GREEN, borderRadius: 999, padding: "4px 14px" }}>● live</span> : null}
        </div>
        <div style={{ marginTop: 18, display: "inline-block", fontFamily: SANS, fontWeight: 800, fontSize: 120, letterSpacing: -2, color: "#fff", background: CORAL, borderRadius: 22, padding: "2px 34px 8px", opacity: t >= T.code50 ? 1 : 0.15, transform: `scale(${t >= T.code50 ? 0.85 + 0.15 * popE(t, T.code50) : 1})` }}>"SOCIA50"</div>
      </div>
      {t >= T.follow ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 800, display: "flex", justifyContent: "center" }}>
          <div style={{ transform: `scale(${popE(t, T.follow)})`, display: "flex", alignItems: "center", gap: 14, background: t >= T.follow + 0.35 ? PANEL : ORANGE, color: t >= T.follow + 0.35 ? CREAM : "#1a1208", border: `2px solid ${ORANGE}`, borderRadius: 999, padding: "12px 36px", fontFamily: SANS, fontWeight: 800, fontSize: 38 }}>
            <Mark size={42} />{t >= T.follow + 0.35 ? "✓ Following" : "+ Follow"}
          </div>
        </div>
      ) : null}
      {t >= T.link ? (
        <div style={{ position: "absolute", left: 160, top: 930, width: 760, transform: `scale(${popE(t, T.link)})`, display: "flex", alignItems: "center", gap: 16, background: PANEL, border: `2px solid ${EDGE}`, borderRadius: 999, padding: "18px 26px", fontFamily: MONO }}>
          <span style={{ width: 34, height: 34, borderRadius: 34, background: ORANGE }} />
          <span style={{ flex: 1, fontSize: 32, color: CREAM }}>{typed(t, "LINK", T.linkType - 0.1, T.linkType + 0.25)}<span style={{ opacity: Math.floor(t * 3) % 2 ? 0 : 1, color: ORANGE }}>|</span></span>
          <span style={{ fontSize: 28, fontWeight: 600, color: posted ? GREEN : ORANGE }}>{posted ? "✓ Posted" : "Post"}</span>
        </div>
      ) : null}
      {t >= T.dm ? (
        <div style={{ position: "absolute", left: 160, top: 1060, width: 760, transform: `scale(${popE(t, T.dm)})`, display: "flex", alignItems: "center", gap: 14, background: ORANGE, borderRadius: 18, padding: "16px 24px", fontFamily: MONO, fontSize: 28, fontWeight: 600, color: "#1a1208" }}>
          <Mark size={36} /> DM: here's the link (SOCIA50)
        </div>
      ) : null}
    </>
  );
};

const Scene: React.FC = () => {
  const t = useT();
  if (t < T.how) return <Hook />;
  if (t < T.notAI) return <ClaudeWindow />;
  if (t < T.style) return <NotAI />;
  if (t < T.same) return <Styles />;
  if (t < T.thisReel) return <Same />;
  if (t < T.socia) return <ThisReel />;
  if (t < T.cta) return <SociaAfter />;
  return <Cta />;
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.2, volume: 0.35 },
  { src: sfxPop, at: T.connector, volume: 0.35 },
  ...[0, 1, 2, 3].map((i) => ({ src: sfxClick, at: T.reels + i * 0.1, volume: 0.3 })),
  ...[T.how, T.notAI, T.style, T.same, T.thisReel, T.socia, T.cta].map((at) => ({ src: sfxWhoosh, at: at - 0.04, volume: 0.18 })),
  { src: sfxClick, at: T.connect, volume: 0.4 },
  ...[T.reads, T.trending, T.tells].map((at) => ({ src: sfxClick, at, volume: 0.3 })),
  { src: sfxPop, at: T.inCode, volume: 0.35 },
  { src: sfxImpact, at: T.codeTag, volume: 0.35 },
  { src: sfxPop, at: T.zero, volume: 0.3 },
  ...T.items.map((at) => ({ src: sfxPop, at, volume: 0.3 })),
  { src: sfxPop, at: T.made, volume: 0.35 },
  ...T.tracks.map((at) => ({ src: sfxClick, at, volume: 0.35 })),
  { src: sfxClick, at: T.approve + 0.2, volume: 0.4 },
  { src: sfxPop, at: T.views, volume: 0.35 },
  { src: sfxImpact, at: T.code50, volume: 0.4 },
  { src: sfxPop, at: T.follow, volume: 0.35 },
  { src: sfxClick, at: T.linkType + 0.45, volume: 0.4 },
  { src: sfxPop, at: T.dm, volume: 0.35 },
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
    <Scene />
    <Title />
    <Caption />
    <Footer />
  </AbsoluteFill>
);
