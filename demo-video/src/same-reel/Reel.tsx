import React from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import mark from "../brand/socia-mark.png";
import vo from "./audio/vo.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import { FINDINGS, FIX, FPS, GUESSES, LINES, QUESTION, REELS, T, Tone, WAITLIST, Word } from "./story";

const jak = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${jak.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

const INK = "#11141a";
const GREY = "#8b909a";
const RED = "#e5484d";
const BLUE = "#2f6bf0";
const SKEL = "#e3e6ec";
const SKEL2 = "#eceef2";

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const k = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
const toneColor = (tone: Tone) => (tone === "red" ? RED : tone === "blue" ? BLUE : undefined);

// ---------- background ----------
const Background: React.FC<{ t: number }> = ({ t }) => {
  const dots = React.useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({ x: (i * 397) % 1080, y: (i * 613) % 1920, r: 4 + ((i * 7) % 6), s: 0.4 + ((i * 13) % 10) / 10 })),
    []
  );
  return (
    <AbsoluteFill style={{ background: "#eef1f6", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -260, top: 60 + Math.sin(t * 0.4) * 30, width: 900, height: 1100, borderRadius: "50%", background: "#a9c0f5", filter: "blur(150px)", opacity: 0.85 }} />
      <div style={{ position: "absolute", right: -300, top: 820 + Math.cos(t * 0.35) * 40, width: 760, height: 900, borderRadius: "50%", background: "#b9e8da", filter: "blur(150px)", opacity: 0.85 }} />
      <div style={{ position: "absolute", left: 160, bottom: -260, width: 760, height: 700, borderRadius: "50%", background: "#d9d3f5", filter: "blur(150px)", opacity: 0.8 }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(120,130,150,0.07) 2px, transparent 2px), linear-gradient(90deg, rgba(120,130,150,0.07) 2px, transparent 2px)", backgroundSize: "110px 110px", backgroundPosition: "75px 85px" }} />
      {dots.map((d, i) => (
        <div key={i} style={{ position: "absolute", left: d.x, top: (d.y - t * 8 * d.s + 1920) % 1920, width: d.r * 2, height: d.r * 2, borderRadius: "50%", background: "#7f95d8", opacity: 0.35 }} />
      ))}
      <div style={{ position: "absolute", top: 146, left: 90, fontFamily: SANS, fontWeight: 700, fontSize: 38, color: BLUE, letterSpacing: -0.5 }}>SOCIA</div>
      <div style={{ position: "absolute", top: 150, right: 90, fontFamily: SANS, fontWeight: 500, fontSize: 30, color: GREY }}>coming soon</div>
    </AbsoluteFill>
  );
};

// ---------- heading ----------
const Words: React.FC<{ words: Word[]; t: number; size: number; weight: number; base: string; ls: number }> = ({ words, t, size, weight, base, ls }) => (
  <div style={{ fontFamily: SANS, fontSize: size, fontWeight: weight, letterSpacing: ls, lineHeight: 1.25, textAlign: "center" }}>
    {words.map(([w, at, tone], i) => {
      const a = k(t, at, at + 0.3);
      const settle = k(t, at + 0.1, at + 0.45);
      const final = toneColor(tone) ?? base;
      return (
        <span key={i} style={{ display: "inline-block", opacity: a, transform: `translateY(${(1 - a) * 14}px)`, filter: `blur(${(1 - a) * 6}px)`, color: settle < 1 ? mix(GREY, final, settle) : final, marginRight: i < words.length - 1 ? size * 0.24 : 0 }}>
          {w}
        </span>
      );
    })}
  </div>
);

function mix(a: string, b: string, p: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * p)).join(",")})`;
}

const Heading: React.FC<{ t: number }> = ({ t }) => (
  <>
    {LINES.map((l, i) => {
      if (t < l.from - 0.01 || t > l.to + 0.3) return null;
      const out = k(t, l.to - 0.05, l.to + 0.2);
      return (
        <div key={i} style={{ position: "absolute", top: 290, left: 60, right: 60, opacity: 1 - out, filter: `blur(${out * 8}px)`, transform: `translateY(${-out * 16}px)` }}>
          <Words words={l.title} t={t} size={l.title.map((w) => w[0]).join(" ").length > 22 ? 60 : 70} weight={800} base={INK} ls={-2.4} />
          {l.sub && <div style={{ marginTop: 14 }}><Words words={l.sub} t={t} size={34} weight={600} base={GREY} ls={-0.4} /></div>}
          {l.sub2 && <Words words={l.sub2} t={t} size={34} weight={600} base={GREY} ls={-0.4} />}
        </div>
      );
    })}
  </>
);

// ---------- phone and contents ----------
const Phone: React.FC<{ x: number; y: number; w: number; h: number; rot?: number; ring?: string; ringA?: number; opacity?: number; children?: React.ReactNode }> = ({ x, y, w, h, rot = 0, ring, ringA = 0, opacity = 1, children }) => (
  <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, opacity, transform: `perspective(1600px) rotateY(${rot}deg) rotateZ(${rot * 0.18}deg)` }}>
    <div style={{ position: "absolute", inset: 0, borderRadius: w * 0.13, background: "#fbfcfd", border: "6px solid #ffffff", boxShadow: `0 40px 80px rgba(40,55,90,0.18), 0 6px 18px rgba(40,55,90,0.08)${ring ? `, 0 0 0 ${5 * ringA}px ${ring}` : ""}`, overflow: "hidden" }}>
      {children}
    </div>
  </div>
);

const Chip: React.FC<{ x: number; y: number; label: string; opacity?: number }> = ({ x, y, label, opacity = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, transform: "translateX(-50%)", opacity, background: "#fff", borderRadius: 999, padding: "8px 20px", fontFamily: MONO, fontWeight: 600, fontSize: 26, color: INK, boxShadow: "0 6px 16px rgba(40,55,90,0.14)" }}>{label}</div>
);

const Pill: React.FC<{ label: string; color: string; a: number }> = ({ label, color, a }) => (
  <div style={{ position: "absolute", left: 22, bottom: 22, opacity: a, transform: `translateY(${(1 - a) * 10}px) scale(${0.9 + a * 0.1})`, background: "#fff", color, borderRadius: 999, padding: "8px 18px", fontFamily: SANS, fontWeight: 700, fontSize: 24, boxShadow: "0 6px 14px rgba(40,55,90,0.16)" }}>{label}</div>
);

const Bar: React.FC<{ w: number | string; h?: number; c?: string; mt?: number }> = ({ w, h = 14, c = SKEL, mt = 0 }) => (
  <div style={{ width: w, height: h, borderRadius: h, background: c, marginTop: mt }} />
);

type ReelKind = keyof typeof REELS;

const Example: React.FC<{ a?: number; style?: React.CSSProperties }> = ({ a = 1, style }) => (
  <span style={{ opacity: a, fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1px solid #e8c771", borderRadius: 8, padding: "3px 10px", ...style }}>EXAMPLE</span>
);

/** One creator's reel in a feed: skeleton under, colour on top (fill 0..1), "?" before. */
const ReelPost: React.FC<{ kind: ReelKind; fill: number; q: number }> = ({ kind, fill, q }) => {
  const r = REELS[kind];
  const row = (live: boolean) => (
    <div style={{ position: "absolute", inset: 0, padding: "34px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: live ? "linear-gradient(135deg,#ff8a65,#e5484d)" : SKEL }} />
        <div><Bar w={140} c={live ? INK : SKEL} /><Bar w={90} h={10} mt={8} c={live ? "#b6bbc4" : SKEL2} /></div>
      </div>
      <div style={{ marginTop: 22, height: "58%", borderRadius: 18, background: live ? r.cover : SKEL, position: "relative", overflow: "hidden" }}>
        {live && <div style={{ position: "absolute", left: 18, bottom: 18, right: 18, fontFamily: SANS, fontWeight: 800, fontSize: 32, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 10px rgba(0,0,0,0.25)" }}>{r.title}</div>}
        {live && <svg width={44} height={44} viewBox="0 0 24 24" style={{ position: "absolute", top: 16, right: 16 }}><path d="M8 5v14l11-7z" fill="#fff" opacity={0.9} /></svg>}
      </div>
      <Bar w="88%" mt={22} c={live ? "#5b616c" : SKEL} />
      <Bar w="64%" mt={10} c={live ? "#9aa0aa" : SKEL2} />
      <div style={{ display: "flex", gap: 18, marginTop: 22 }}>
        {[0, 1, 2].map((i) => <div key={i} style={{ width: 34, height: 34, borderRadius: 10, background: live ? "#e9ecf2" : SKEL2 }} />)}
      </div>
    </div>
  );
  return (
    <>
      {q > 0 && <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: q, fontFamily: SANS, fontWeight: 700, fontSize: 90, color: "#d3d7de" }}>?</AbsoluteFill>}
      <div style={{ position: "absolute", inset: 0, opacity: (1 - q) * (1 - fill) }}>{row(false)}</div>
      <div style={{ position: "absolute", inset: 0, opacity: fill }}>{row(true)}</div>
    </>
  );
};

const fmtViews = (n: number) => (n >= 1000 ? `${n >= 100_000 ? Math.round(n / 1000) : (n / 1000).toFixed(1)}K` : `${Math.round(n)}`);

/** Can't figure out why: a spinner and the guesses as the voice says them. */
const Guess: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ alignItems: "center", paddingTop: 230 }}>
    <div style={{ position: "relative", width: 96, height: 96 }}>
      <svg width={96} height={96} style={{ position: "absolute", inset: 0, transform: `rotate(${t * 300}deg)` }}>
        <circle cx={48} cy={48} r={40} stroke="#dfe3ea" strokeWidth={7} fill="none" />
        <path d="M48 8 A40 40 0 0 1 88 48" stroke={RED} strokeWidth={7} fill="none" strokeLinecap="round" />
      </svg>
    </div>
    <div style={{ marginTop: 30, fontFamily: SANS, fontWeight: 600, fontSize: 28, color: GREY }}>Why did it flop?</div>
    <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      {GUESSES.map(([g, at]) => {
        const a = k(t, at, at + 0.3);
        return (
          <div key={g} style={{ opacity: a, transform: `translateY(${(1 - a) * 14}px) scale(${0.92 + 0.08 * a})`, background: "#f3f4f7", border: "2px dashed #d5d9e0", borderRadius: 999, padding: "12px 28px", fontFamily: MONO, fontWeight: 600, fontSize: 30, color: "#9aa0aa" }}>{g}</div>
        );
      })}
    </div>
  </AbsoluteFill>
);

const GREEN = "#1f9d62";

const MiniSpin: React.FC<{ t: number; c?: string }> = ({ t, c = BLUE }) => (
  <svg width={26} height={26} style={{ transform: `rotate(${t * 360}deg)` }}>
    <circle cx={13} cy={13} r={10} stroke="#e1e4ea" strokeWidth={4} fill="none" />
    <path d="M13 3 A10 10 0 0 1 23 13" stroke={c} strokeWidth={4} fill="none" strokeLinecap="round" />
  </svg>
);

const Check: React.FC<{ a: number }> = ({ a }) => (
  <div style={{ width: 34, height: 34, borderRadius: 17, background: GREEN, opacity: a, transform: `scale(${0.6 + 0.4 * a})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width={20} height={20} viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </div>
);

/** Ask SOCIA on the flopped reel: the question, the reel, then hook / caption / sound checked. */
const AskCard: React.FC<{ t: number }> = ({ t }) => {
  const typed = Math.round(QUESTION.length * k(t, T.askType[0], T.askType[1]));
  const thumb = k(t, T.thumb, T.thumb + 0.4);
  return (
    <div style={{ position: "absolute", inset: 0, padding: "30px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Img src={mark} style={{ width: 36, height: 36, objectFit: "contain" }} />
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, color: INK }}>Ask SOCIA</span>
        </div>
        <Example a={thumb} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <div style={{ background: INK, color: "#fff", borderRadius: "24px 24px 6px 24px", padding: "14px 22px", fontFamily: SANS, fontWeight: 600, fontSize: 25, minHeight: 34, minWidth: 40 }}>
          {QUESTION.slice(0, typed)}{typed < QUESTION.length && Math.floor(t * 3) % 2 === 0 ? "|" : ""}
        </div>
      </div>
      <div style={{ marginTop: 22, height: 120, borderRadius: 18, background: REELS.flop.cover, position: "relative", overflow: "hidden", opacity: thumb, transform: `translateY(${(1 - thumb) * 14}px)`, boxShadow: `0 0 0 4px ${RED}` }}>
        <div style={{ position: "absolute", left: 18, bottom: 14, fontFamily: SANS, fontWeight: 800, fontSize: 28, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{REELS.flop.title}</div>
        <div style={{ position: "absolute", right: 14, top: 14, background: "#fff", borderRadius: 999, padding: "4px 12px", fontFamily: MONO, fontWeight: 600, fontSize: 18, color: RED }}>{fmtViews(REELS.flop.views)} views</div>
      </div>
      {FINDINGS.map((f, i) => {
        const appear = k(t, T.thumb + 0.3 + i * 0.15, T.thumb + 0.6 + i * 0.15);
        const checking = t >= T.check[i] && t < T.result[i];
        const r = k(t, T.result[i], T.result[i] + 0.3);
        const col = f.bad ? RED : GREEN;
        const voice = f.label === "Sound" ? r : 0;
        return (
          <div key={f.label} style={{ marginTop: 18, opacity: appear, borderRadius: 18, padding: "16px 18px", background: r > 0 ? (f.bad ? `rgba(229,72,77,${0.07 * r})` : `rgba(31,157,98,${0.06 * r})`) : "#f5f6f8", minHeight: f.bad ? 112 : 56 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 20, letterSpacing: 1.5, textTransform: "uppercase", color: INK }}>{f.label}</span>
              {r > 0 ? (
                <span style={{ opacity: r, fontFamily: SANS, fontWeight: 700, fontSize: 24, color: col }}>{f.result}</span>
              ) : checking ? (
                <MiniSpin t={t} />
              ) : (
                <Bar w={120} h={14} />
              )}
            </div>
            {f.bad && (
              <div style={{ marginTop: 10, position: "relative", height: 50 }}>
                <div style={{ position: "absolute", inset: 0, opacity: 1 - r }}><Bar w="86%" h={12} mt={6} c={SKEL} /><Bar w="60%" h={12} mt={10} c={SKEL2} /></div>
                <div style={{ position: "absolute", inset: 0, opacity: r }}>
                  {f.label === "Sound" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[["voice", 0.28, RED], ["music", 0.86, GREY]].map(([n, v, c]) => (
                        <div key={n as string} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ width: 70, fontFamily: MONO, fontWeight: 600, fontSize: 17, color: GREY }}>{n}</span>
                          <div style={{ flex: 1, height: 14, borderRadius: 7, background: "#e9ecf1" }}>
                            <div style={{ width: `${(v as number) * 100 * voice}%`, height: "100%", borderRadius: 7, background: c as string }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, lineHeight: 1.3, color: INK }}>{f.note}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** The fix: a new hook, a new track from the AI music generator, the editor levelling sound and cutting pauses. */
const FixCard: React.FC<{ t: number }> = ({ t }) => {
  const done = k(t, T.allDone, T.allDone + 0.3);
  const block = (at: number) => k(t, at, at + 0.35);
  const hookA = block(T.newHook);
  const typed = Math.round(FIX.newHook.length * k(t, T.newHook + 0.3, T.newHook + 1.3));
  const musicA = block(T.music);
  const trackA = k(t, T.track, T.track + 0.4);
  const edA = block(T.editor);
  const lv = k(t, T.levels, T.levels + 0.6);
  const cut = k(t, T.pauses, T.pauses + 0.6);
  const card = (a: number, title: string, children: React.ReactNode, h: number) => (
    <div style={{ marginTop: 18, opacity: 0.25 + 0.75 * a, transform: `translateY(${(1 - a) * 10}px)`, borderRadius: 20, padding: "16px 18px", background: a > 0.5 ? "#f2f6ff" : "#f5f6f8", boxShadow: a > 0.5 ? `inset 0 0 0 2px rgba(47,107,240,${0.35 * a})` : undefined, height: h, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 18, letterSpacing: 1.5, textTransform: "uppercase", color: BLUE }}>{title}</span>
        <Check a={done} />
      </div>
      {children}
    </div>
  );
  const bars = Array.from({ length: 26 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 1.7 + t * (trackA > 0 ? 6 : 0))) * (0.5 + 0.5 * Math.sin(i * 0.6)));
  return (
    <div style={{ position: "absolute", inset: 0, padding: "30px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Img src={mark} style={{ width: 36, height: 36, objectFit: "contain" }} />
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, color: INK }}>The fix</span>
        </div>
        <Example />
      </div>
      {card(hookA, "New hook", (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, color: "#a3a9b3", textDecoration: hookA > 0.5 ? "line-through" : "none" }}>{FIX.oldHook}</div>
          <div style={{ marginTop: 8, fontFamily: SANS, fontWeight: 800, fontSize: 28, color: INK, minHeight: 36 }}>{FIX.newHook.slice(0, typed)}</div>
        </div>
      ), 158)}
      {card(musicA, "AI music generator", (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 27, background: BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width={22} height={22} viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#fff" /></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 23, color: INK, opacity: trackA }}>{FIX.track}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, height: 40, marginTop: 6 }}>
              {bars.map((b, i) => <div key={i} style={{ width: 8, height: 40 * b * (0.3 + 0.7 * trackA), borderRadius: 4, background: trackA > 0 ? "#8fb0f7" : SKEL }} />)}
            </div>
          </div>
        </div>
      ), 168)}
      {card(edA, "Video editor", (
        <div style={{ marginTop: 12 }}>
          {[["voice", 0.28 + 0.57 * lv, lv > 0.5 ? GREEN : RED], ["music", 0.86 - 0.36 * lv, GREY]].map(([n, v, c]) => (
            <div key={n as string} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <span style={{ width: 70, fontFamily: MONO, fontWeight: 600, fontSize: 17, color: GREY }}>{n}</span>
              <div style={{ flex: 1, height: 14, borderRadius: 7, background: "#e9ecf1" }}>
                <div style={{ width: `${(v as number) * 100}%`, height: "100%", borderRadius: 7, background: c as string }} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", marginTop: 16, height: 40 }}>
            {[0.22, 0.18, 0.26, 0.2].map((w, i) => (
              <React.Fragment key={i}>
                <div style={{ width: `${w * 100}%`, height: 40, borderRadius: 8, background: "linear-gradient(90deg,#c9d6ff,#e2c8f2)" }} />
                {i < 3 && <div style={{ width: `${(1 - cut) * 7}%`, height: 40, borderRadius: 8, background: (1 - cut) > 0.05 ? "repeating-linear-gradient(45deg,#f1d4d5,#f1d4d5 6px,#fbeaea 6px,#fbeaea 12px)" : "transparent", margin: "0 3px" }} />}
              </React.Fragment>
            ))}
            <span style={{ marginLeft: 12, fontFamily: MONO, fontWeight: 600, fontSize: 16, color: cut > 0.5 ? GREEN : GREY, whiteSpace: "nowrap" }}>{cut > 0.5 ? "pauses cut" : ""}</span>
          </div>
        </div>
      ), 196)}
    </div>
  );
};

// ---------- scenes ----------
const PAIR_Y = 935;
const PW = 350;
const PH = 640;

const PairScene: React.FC<{ t: number; second: boolean }> = ({ t, second }) => {
  let cs = 1, cx = 0, cy = 0;
  if (!second) {
    const zl = k(t, T.focusLeft, T.focusLeft + 0.45);
    const zr = k(t, T.focusRight, T.focusRight + 0.45);
    const back = k(t, T.equal, T.equal + 0.45);
    cs = 1 + 0.38 * (zl - back);
    cx = (345 * zl - 720 * zr) * (1 - back);
    cy = 110 * (zl - back);
  }
  const fill = second ? 1 : k(t, T.filled, T.filled + 0.45);
  const q = second ? 0 : 1 - k(t, T.filled - 0.4, T.filled);
  const grow = Math.max(0, Math.min(1, (t - T.filled) / 3.4));
  const vV = second ? REELS.viral.views : REELS.viral.views * grow * grow;
  const vF = second ? REELS.flop.views : REELS.flop.views * Math.min(1, Math.max(0, (t - T.filled) / 1.3));
  const chipA = second ? 1 : k(t, T.filled, T.filled + 0.3);
  const eq = second ? k(t, T.pair2 + 0.2, T.pair2 + 0.5) : k(t, T.equal + 0.3, T.equal + 0.6) * (1 - k(t, 7.0, 7.3));
  const viral = second ? 1 : k(t, T.focusLeft + 0.6, T.focusLeft + 0.9);
  const flop = second ? 1 : k(t, T.focusRight + 0.35, T.focusRight + 0.65);
  const know = second ? k(t, T.knowWhy, T.knowWhy + 0.3) : 0;
  const ringL = second ? 0.6 : viral * (1 - k(t, T.equal, T.equal + 0.3));
  const ringR = second ? 0.6 + 0.4 * know : flop * (1 - k(t, T.equal, T.equal + 0.3));
  const bob = Math.sin(t * 1.3) * 6;
  return (
    <AbsoluteFill style={{ transform: `translate(${cx}px, ${cy}px) scale(${cs})`, transformOrigin: `540px ${PAIR_Y}px` }}>
      <Chip x={270} y={PAIR_Y - PH / 2 - 70 + bob} label={`${fmtViews(vV)} views`} opacity={chipA} />
      <Chip x={815} y={PAIR_Y - PH / 2 - 62 - bob} label={`${fmtViews(vF)} views`} opacity={chipA} />
      <Phone x={270} y={PAIR_Y + bob} w={PW} h={PH} rot={6} ring={BLUE} ringA={ringL}>
        <ReelPost kind="viral" fill={fill} q={q} />
        <Pill label="went viral" color={BLUE} a={viral} />
      </Phone>
      <Phone x={815} y={PAIR_Y - bob} w={PW} h={PH} rot={-6} ring={know > 0.5 ? BLUE : RED} ringA={ringR}>
        <ReelPost kind="flop" fill={fill} q={q} />
        <Pill label="flopped" color={RED} a={flop * (1 - know)} />
        <Pill label="now you know why" color={BLUE} a={know} />
      </Phone>
      <div style={{ position: "absolute", left: 540, top: PAIR_Y, transform: "translate(-50%,-50%)", opacity: eq, fontFamily: SANS, fontWeight: 700, fontSize: 64, color: "#9aa0aa" }}>=</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: PAIR_Y + PH / 2 + 46, textAlign: "center", opacity: chipA }}><Example /></div>
    </AbsoluteFill>
  );
};

const SW = 540;
const SH = 860;
const SY = 960;
const STOP = SY - SH / 2;

export const Reel: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;

  const pair1Out = k(t, T.guess - 0.1, T.guess + 0.35);
  const pair2In = k(t, T.pair2 - 0.1, T.pair2 + 0.35);
  const pair2Out = k(t, T.waitlist - 0.1, T.waitlist + 0.35);

  const g1In = k(t, T.guess, T.guess + 0.45);
  const g1Out = k(t, T.ask, T.ask + 0.5);
  const aIn = k(t, T.ask, T.ask + 0.5);
  const aOut = k(t, T.fix, T.fix + 0.5);
  const fIn = k(t, T.fix, T.fix + 0.5);
  const fOut = k(t, T.pair2 - 0.1, T.pair2 + 0.35);

  const wIn = k(t, T.waitlist, T.waitlist + 0.5);
  const count = Math.round(WAITLIST.joined * k(t, T.count, T.count + 0.8));
  const bar = (count / WAITLIST.goal) * 100;
  const launch = k(t, T.launch, T.launch + 0.35);
  const cm = k(t, T.comment, T.comment + 0.35);
  const typedC = Math.round(5 * k(t, T.comment + 0.5, T.comment + 1.0));

  const bob = Math.sin(t * 1.3) * 6;
  const cues = [T.focusLeft, T.focusRight, T.guess, T.ask, T.fix, T.pair2, T.waitlist];

  return (
    <AbsoluteFill>
      <Background t={t} />

      {t < T.guess + 0.4 && (
        <AbsoluteFill style={{ opacity: 1 - pair1Out, transform: `translateX(${-260 * pair1Out}px)` }}>
          <PairScene t={t} second={false} />
        </AbsoluteFill>
      )}

      {t > T.guess - 0.05 && t < T.ask + 0.6 && (
        <Phone x={540 - 760 * g1Out} y={SY + 120 * (1 - g1In) + bob} w={SW} h={SH} rot={4 - 10 * g1Out} opacity={g1In}>
          <Guess t={t} />
        </Phone>
      )}

      {t > T.ask - 0.05 && t < T.fix + 0.6 && (
        <Phone x={540 + 760 * (1 - aIn) - 760 * aOut} y={SY + bob} w={SW} h={SH} rot={-4 * (1 - aIn) + 2 - 8 * aOut} opacity={Math.min(aIn, 1 - aOut)}>
          <AskCard t={t} />
        </Phone>
      )}

      {t > T.fix - 0.05 && t < T.pair2 + 0.4 && (
        <Phone x={540 + 760 * (1 - fIn)} y={SY + bob + 160 * fOut} w={SW} h={SH} rot={-4 * (1 - fIn) + 2} opacity={Math.min(fIn, 1 - fOut)}>
          <FixCard t={t} />
        </Phone>
      )}

      {t > T.pair2 - 0.1 && t < T.waitlist + 0.4 && (
        <AbsoluteFill style={{ opacity: Math.min(pair2In, 1 - pair2Out), transform: `scale(${0.94 + 0.06 * pair2In - 0.06 * pair2Out})`, transformOrigin: `540px ${PAIR_Y}px` }}>
          <PairScene t={t} second />
        </AbsoluteFill>
      )}

      {t > T.waitlist - 0.05 && (
        <div style={{ position: "absolute", left: 540 - 340, top: 600, width: 680, opacity: wIn, transform: `translateY(${(1 - wIn) * 40}px) scale(${0.95 + 0.05 * wIn})`, background: "#fff", borderRadius: 44, boxShadow: "0 40px 80px rgba(40,55,90,0.18)", padding: "50px 56px 52px", textAlign: "center" }}>
          <div style={{ width: 120, height: 120, borderRadius: 60, margin: "0 auto", background: "#eaf0ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Img src={mark} style={{ width: 80, height: 80, objectFit: "contain" }} />
          </div>
          <div style={{ marginTop: 22, fontFamily: SANS, fontWeight: 800, fontSize: 40, color: INK, letterSpacing: -1 }}>SOCIA waitlist</div>
          <div style={{ marginTop: 26, fontFamily: SANS, fontWeight: 800, fontSize: 120, letterSpacing: -4, color: INK, lineHeight: 1 }}>
            <span style={{ color: BLUE }}>{count}</span><span style={{ color: "#c3c8d0" }}> / {WAITLIST.goal}</span>
          </div>
          <div style={{ marginTop: 26, height: 22, borderRadius: 11, background: "#e9ecf1", overflow: "hidden" }}>
            <div style={{ width: `${bar}%`, height: "100%", borderRadius: 11, background: BLUE }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontFamily: MONO, fontWeight: 600, fontSize: 20, color: GREY }}>
            <span>joined</span>
            <span style={{ color: launch > 0.5 ? BLUE : GREY, transform: `scale(${1 + 0.08 * launch * (1 - k(t, T.launch + 0.35, T.launch + 0.8))})` }}>launches at 50</span>
          </div>
          <div style={{ marginTop: 34, height: 84, borderRadius: 42, border: "2px solid #e3e6ec", display: "flex", alignItems: "center", gap: 16, padding: "0 16px", opacity: cm, transform: `translateY(${(1 - cm) * 16}px)` }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: "linear-gradient(135deg,#ff8a65,#e5484d)", flexShrink: 0 }} />
            <div style={{ flex: 1, textAlign: "left", fontFamily: SANS, fontWeight: 700, fontSize: 32, color: typedC ? INK : "#b6bbc4" }}>
              {typedC ? "SOCIA".slice(0, typedC) : "Add a comment…"}
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, color: typedC >= 5 ? BLUE : "#b6bbc4", paddingRight: 12 }}>Post</div>
          </div>
        </div>
      )}

      <Heading t={t} />

      <Audio src={vo} />
      {cues.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round((c - 0.12) * FPS))} durationInFrames={20}>
          <Audio src={sfxWhoosh} volume={0.14} />
        </Sequence>
      ))}
      <Sequence from={Math.round((T.comment + 1.1) * FPS)} durationInFrames={15}>
        <Audio src={sfxClick} volume={0.45} />
      </Sequence>
    </AbsoluteFill>
  );
};
