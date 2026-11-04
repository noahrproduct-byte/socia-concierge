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
import { BUILD, CARDS, DOES, FPS, HONEST, LESS, NOTHING, PLATFORMS, SCATTER, T, type Word } from "./story";

const inter = loadFont("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "600"], subsets: ["latin"] });
const SANS = `${inter.fontFamily}, Inter, sans-serif`;
const MONO = `${mono.fontFamily}, Menlo, monospace`;

// SOCIA tokens: ink night for the problem, warm paper for the answer, gold accent.
const PAPER = "#f6f4ef";
const INK = "#17191d";
const INK2 = "#5f646c";
const LINE = "#e4e1da";
const GOLD = "#8a6a2c";
const GOLD_BRIGHT = "#d9b25c";
const NIGHT = "#0d0e10";

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });

// light (paper) from "So I'm building" until "And when it doesn't know"; night again for the close.
const LIGHT: [number, number] = [T.build, T.honest];
const day = (t: number) => interpolate(t, [LIGHT[0] - 0.25, LIGHT[0], LIGHT[1] - 0.25, LIGHT[1]], [0, 1, 1, 0], clamp);

const Beat: React.FC<{ at: number; until?: number; children: React.ReactNode }> = ({ at, until = 999, children }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const pin = at <= 0 ? 1 : ease(t, at, 0.25);
  const pout = 1 - ease(t, until - 0.2, 0.2, Easing.in(Easing.cubic));
  return <div style={{ position: "absolute", inset: 0, opacity: Math.min(pin, pout), filter: `blur(${(1 - pout) * 10}px)`, transform: `translateY(${(1 - pout) * -30}px)` }}>{children}</div>;
};

/** A kinetic word: rises, fades and sharpens in over 0.3 s, with a small overshoot. */
const Rise: React.FC<{ w: Word; color: string; em: string; dur?: number }> = ({ w, color, em, dur = 0.3 }) => {
  const t = useT();
  const p = ease(t, w.t, dur);
  const s = popE(t, w.t, dur + 0.05);
  if (p <= 0) return null;
  return <span style={{ display: "inline-block", marginRight: "0.22em", opacity: p, transform: `translateY(${(1 - p) * 26}px) scale(${0.9 + 0.1 * s})`, filter: `blur(${(1 - p) * 7}px)`, color: w.em ? em : color }}>{w.w}</span>;
};

const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

/* ───────────── ground ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const d = day(t);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: NIGHT }} />
      <div style={{ position: "absolute", left: 120, top: 560, width: 840, height: 840, borderRadius: "50%", background: "rgba(217,178,92,0.13)", filter: "blur(180px)" }} />
      <AbsoluteFill style={{ background: PAPER, opacity: d }} />
      <AbsoluteFill style={{ opacity: d, backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
    </AbsoluteFill>
  );
};

/* ───────────── 1 · the question ───────────── */

const Cards: React.FC = () => {
  const ends = [...CARDS.slice(1).map((c) => c.lines[0][0].t), T.scattered];
  return (
    <>
      {CARDS.map((c, i) => (
        <Beat key={i} at={c.lines[0][0].t} until={ends[i]}>
          <div style={{ position: "absolute", left: 80, right: 70, top: c.top, fontFamily: SANS, fontWeight: 800, fontSize: c.size, letterSpacing: -c.size * 0.04, lineHeight: 1.0, color: "#fff" }}>
            {c.lines.map((l, j) => <div key={j}>{l.map((w, k) => <Rise key={k} w={w} color="#fff" em={GOLD_BRIGHT} dur={0.24} />)}</div>)}
          </div>
        </Beat>
      ))}
    </>
  );
};

/* ───────────── 2 · scattered ───────────── */

const Scatter: React.FC = () => {
  const t = useT();
  // the chips converge into one card on "one place" (handled in Does); here they drift apart
  return (
    <Beat at={T.scattered} until={T.build}>
      <div style={{ position: "absolute", left: 80, right: 70, top: 380, fontFamily: SANS, fontWeight: 800, fontSize: 92, letterSpacing: -3.5, lineHeight: 1.02, color: "#fff", opacity: 1 - ease(t, T.noTime - 0.15, 0.2) }}>
        {SCATTER.line.map((w, i) => {
          if (w.w !== "scattered.") return <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />;
          const p = ease(t, w.t, 0.3);
          if (p <= 0) return null;
          return (
            <span key={i} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {w.w.split("").map((ch, k) => {
                const drift = ease(t, w.t + 0.45, 1.6, Easing.out(Easing.quad));
                const dx = Math.sin(k * 2.3) * 9 * drift;
                const dy = Math.cos(k * 1.7) * 14 * drift;
                const r = Math.sin(k * 3.1) * 9 * drift;
                return <span key={k} style={{ display: "inline-block", color: GOLD_BRIGHT, opacity: p, filter: `blur(${(1 - p) * 6}px)`, transform: `translate(${dx}px,${dy + (1 - p) * 20}px) rotate(${r}deg)` }}>{ch}</span>;
              })}
            </span>
          );
        })}
      </div>
      {SCATTER.chips.map((c) => {
        const p = popE(t, c.at, 0.4);
        const fade = 1 - ease(t, T.noTime - 0.15, 0.2);
        return (
          <div key={c.label} style={{ position: "absolute", left: c.x, top: c.y, transform: `rotate(${c.rot}deg) scale(${p})`, opacity: Math.min(1, p * 1.3) * (0.35 + 0.65 * fade), borderRadius: 26, background: "#1c1e22", border: "2px solid rgba(255,255,255,0.14)", padding: "22px 30px", fontFamily: SANS, boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 58, fontWeight: 800, color: "#fff", letterSpacing: -1.5 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>{c.sub}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 80, right: 70, top: 470, fontFamily: SANS, fontWeight: 800, fontSize: 116, letterSpacing: -4.5, lineHeight: 1.02, color: "#fff" }}>
        <div>{SCATTER.noTime.slice(0, 3).map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
        <div>{SCATTER.noTime.slice(3).map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
      </div>
    </Beat>
  );
};

/* ───────────── 3 · so I'm building SOCIA ───────────── */

const Build: React.FC = () => {
  const t = useT();
  const m = popE(t, T.socia, 0.45);
  return (
    <Beat at={T.build} until={T.reads}>
      <div style={{ position: "absolute", left: 80, right: 70, top: 400, fontFamily: SANS, fontWeight: 800, fontSize: 104, letterSpacing: -4, lineHeight: 1.02, color: INK }}>
        <div>{BUILD.line1.map((w, i) => <Rise key={i} w={w} color={INK} em={GOLD} />)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 16, opacity: Math.min(1, m * 1.4) }}>
          <div style={{ transform: `scale(${m}) rotate(${(1 - m) * -20}deg)` }}><Mark size={150} /></div>
          <span style={{ fontSize: 160, letterSpacing: -7 }}>SOCIA</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 80, right: 90, top: 860, fontFamily: SANS, fontWeight: 700, fontSize: 66, letterSpacing: -2, lineHeight: 1.12, color: INK }}>
        {BUILD.line2.map((w, i) => <Rise key={i} w={w} color={INK} em={GOLD} />)}
      </div>
    </Beat>
  );
};

/* ───────────── 4 · what it does ───────────── */

const Does: React.FC = () => {
  const t = useT();
  const nothing = ease(t, T.nothing, 0.35);
  const pressed = t >= T.approve;
  return (
    <Beat at={T.reads} until={T.honest}>
      <div style={{ position: "absolute", left: 80, right: 90, top: 330, fontFamily: SANS, color: INK }}>
        {DOES.map((d, i) => {
          const p = ease(t, d.words[0].t, 0.3);
          const next = DOES[i + 1]?.words[0].t ?? T.nothing;
          const dim = t >= next ? 0.45 : 1;
          return (
            <div key={d.n} style={{ display: "flex", gap: 26, marginBottom: 46, opacity: p * dim }}>
              <div style={{ width: 70, height: 70, borderRadius: 35, background: INK, color: "#fff", fontSize: 36, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 6 }}>{d.n}</div>
              <div>
                <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.06 }}>{d.words.map((w, k) => <Rise key={k} w={w} color={INK} em={GOLD} />)}</div>
                {i === 0 ? (
                  <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                    {PLATFORMS.map((pl, j) => <span key={pl} style={{ fontSize: 24, fontWeight: 700, color: INK2, border: `2px solid ${LINE}`, borderRadius: 18, padding: "5px 14px", background: "#fff", opacity: ease(t, 17.94 + j * 0.08, 0.25) }}>{pl}</span>)}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 80, right: 90, top: 1090, borderRadius: 28, background: INK, color: "#fff", padding: "26px 30px", display: "flex", alignItems: "center", gap: 22, fontFamily: SANS, opacity: nothing, transform: `translateY(${(1 - nothing) * 30}px)` }}>
        <div style={{ flex: 1, fontSize: 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1.12 }}>{NOTHING.map((w, k) => <Rise key={k} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
        <div style={{ position: "relative", borderRadius: 16, background: pressed ? "#1f8a4c" : GOLD, padding: "14px 24px", fontSize: 28, fontWeight: 800, transform: `scale(${pressed && t < T.approve + 0.12 ? 0.92 : 1})` }}>
          {pressed ? "Approved" : "Approve"}
          {pressed && t < T.approve + 0.6 ? <div style={{ position: "absolute", left: "50%", top: "50%", width: 40 + 170 * ease(t, T.approve, 0.5), height: 40 + 170 * ease(t, T.approve, 0.5), transform: "translate(-50%,-50%)", borderRadius: "50%", border: `3px solid ${GOLD_BRIGHT}`, opacity: 1 - ease(t, T.approve, 0.5) }} /> : null}
        </div>
      </div>
    </Beat>
  );
};

/* ───────────── 5 · honest, 6 · less guessing, 7 · end ───────────── */

const Honest: React.FC = () => {
  const t = useT();
  const q = ease(t, T.says + 0.1, 0.35);
  return (
    <Beat at={T.honest} until={T.less}>
      <div style={{ position: "absolute", left: 80, right: 70, top: 460, fontFamily: SANS, fontWeight: 800, fontSize: 104, letterSpacing: -4, lineHeight: 1.04, color: "#fff" }}>
        <div>{HONEST.slice(0, 5).map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
        <div>{HONEST.slice(5).map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
      </div>
      <div style={{ position: "absolute", left: 80, right: 90, top: 930, borderRadius: 24, background: "#fff", padding: "24px 28px", fontFamily: SANS, color: INK, opacity: q, transform: `translateY(${(1 - q) * 24}px) rotate(-1.5deg)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22, fontWeight: 700, color: INK2 }}><Mark size={30} /> Best windows · @socia.appmedia</div>
        <div style={{ marginTop: 10, fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>No window stands out yet.</div>
        <div style={{ marginTop: 8, fontSize: 18, color: INK2, fontFamily: MONO }}>SOCIA Analytics · Posting Times · Nov 2</div>
      </div>
    </Beat>
  );
};

const Less: React.FC = () => (
  <Beat at={T.less} until={T.end}>
    <div style={{ position: "absolute", left: 80, right: 60, top: 600, fontFamily: SANS, fontWeight: 800, fontSize: 150, letterSpacing: -6.5, lineHeight: 1.0 }}>
      <div>{LESS[0].map((w, i) => <Rise key={i} w={w} color="rgba(255,255,255,0.55)" em="rgba(255,255,255,0.55)" />)}</div>
      <div>{LESS[1].map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
    </div>
  </Beat>
);

const EndCard: React.FC = () => {
  const t = useT();
  const b = popE(t, T.end, 0.45);
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 28, fontFamily: SANS }}>
        <div style={{ transform: `scale(${b})` }}><Mark size={190} /></div>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: "#fff" }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD_BRIGHT, border: `2px solid ${GOLD_BRIGHT}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, T.soon, 0.3) }}>coming soon</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.02, volume: 0.4 },
  { src: sfxImpact, at: 5.2, volume: 0.4 },
  ...[T.scattered, T.build, T.reads, T.honest, T.less].map((at) => ({ src: sfxWhoosh, at: at - 0.08, volume: 0.28 })),
  ...SCATTER.chips.map((c) => ({ src: sfxClick, at: c.at, volume: 0.4 })),
  { src: sfxPop, at: T.socia, volume: 0.5 },
  ...DOES.map((d) => ({ src: sfxClick, at: d.words[0].t, volume: 0.35 })),
  { src: sfxClick, at: T.approve, volume: 0.55 },
  { src: sfxPop, at: T.says + 0.1, volume: 0.4 },
  { src: sfxPop, at: T.end, volume: 0.5 },
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
    <Cards />
    <Scatter />
    <Build />
    <Does />
    <Honest />
    <Less />
    <EndCard />
  </AbsoluteFill>
);
