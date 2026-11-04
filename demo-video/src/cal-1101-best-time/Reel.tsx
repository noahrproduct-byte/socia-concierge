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
import { BLOCKS, DARK, DAYS, FPS, GHOSTS, HOOK, HOOK_SUB, PHRASES, POSTS, SOURCE, T, type Word } from "./story";

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

const useT = () => useCurrentFrame() / FPS;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number, at: number, dur = 0.3, e = Easing.out(Easing.cubic)) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: e });
const popE = (t: number, at: number, dur = 0.35) => interpolate(t, [at, at + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.7)) });
const night = (t: number) => {
  let v = DARK.some(([a, b]) => t >= a && t < b) ? 1 : 0;
  for (const [a, b] of DARK) {
    if (a > 0 && t > a - 0.25 && t < a) v = interpolate(t, [a - 0.25, a], [0, 1], clamp);
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

/** A word that eases in: rise, fade, light blur. */
const Rise: React.FC<{ w: Word; color: string; em: string; dur?: number }> = ({ w, color, em, dur = 0.3 }) => {
  const t = useT();
  const p = ease(t, w.t, dur);
  if (p <= 0) return null;
  return <span style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : color }}>{w.w}</span>;
};

const ExampleChip: React.FC = () => (
  <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: 2, color: "#7a5600", background: "#fbecc4", border: "1px solid #e8c771", borderRadius: 8, padding: "3px 10px" }}>EXAMPLE</span>
);
const Mark: React.FC<{ size: number }> = ({ size }) => <Img src={mark} style={{ width: size, height: size, borderRadius: size * 0.24 }} />;

/* ───────────── ground + caption ───────────── */

const Ground: React.FC = () => {
  const t = useT();
  const n = night(t);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <AbsoluteFill style={{ background: "#0d0e10", opacity: n }}>
        <div style={{ position: "absolute", left: 200, top: 560, width: 700, height: 700, borderRadius: "50%", background: "rgba(42,98,245,0.22)", filter: "blur(170px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const t = useT();
  if (t < T.grid || t >= T.end) return null;
  const idx = PHRASES.reduce((v, ph, i) => (t >= ph[0].t - 0.03 ? i : v), -1);
  if (idx < 0) return null;
  const ph = PHRASES[idx];
  const next = PHRASES[idx + 1];
  const out = next ? ease(t, next[0].t - 0.16, 0.14) : ease(t, T.end - 0.2, 0.18);
  return (
    <div style={{ position: "absolute", top: 200, left: 90, right: 90, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: 54, lineHeight: 1.2, letterSpacing: -0.8, color: INK, opacity: 1 - out, transform: `translateY(${-14 * out}px)` }}>
      {ph.map((w, i) => <Rise key={i} w={w} color={INK} em={COBALT} />)}
    </div>
  );
};

/* ───────────── scenes ───────────── */

const Hook: React.FC = () => {
  const t = useT();
  // a small clock face whose hand spins while the question lands
  const spin = interpolate(t, [0, 2.2], [0, 540], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <Beat at={0} until={T.grid}>
      <div style={{ position: "absolute", left: 90, top: 470, width: 150, height: 150, borderRadius: 75, border: "6px solid rgba(255,255,255,0.85)" }}>
        <div style={{ position: "absolute", left: 69, top: 22, width: 6, height: 54, borderRadius: 3, background: GOLD_BRIGHT, transformOrigin: "3px 52px", transform: `rotate(${spin}deg)` }} />
        <div style={{ position: "absolute", left: 69, top: 40, width: 6, height: 36, borderRadius: 3, background: "#fff", transformOrigin: "3px 34px", transform: `rotate(${spin / 12 + 90}deg)` }} />
      </div>
      <div style={{ position: "absolute", left: 90, right: 70, top: 660, fontFamily: SANS, fontWeight: 800, fontSize: 168, lineHeight: 1.0, letterSpacing: -6, color: "#fff" }}>
        <div><Rise w={HOOK[0]} color="#fff" em={GOLD_BRIGHT} dur={0.22} /></div>
        <div><Rise w={HOOK[1]} color="#fff" em={GOLD_BRIGHT} dur={0.22} /><Rise w={HOOK[2]} color="#fff" em={GOLD_BRIGHT} dur={0.22} /></div>
        <div><Rise w={HOOK[3]} color="#fff" em={GOLD_BRIGHT} dur={0.22} /></div>
      </div>
      <div style={{ position: "absolute", left: 92, right: 70, top: 1200, fontFamily: SANS, fontWeight: 700, fontSize: 64, letterSpacing: -1.5, color: "rgba(255,255,255,0.75)" }}>
        {HOOK_SUB.map((w, i) => <Rise key={i} w={w} color="rgba(255,255,255,0.75)" em="#9db8ff" />)}
      </div>
    </Beat>
  );
};

const CW = 98; // cell width
const CH = 84; // cell height
const GX = 64; // row label column

/** The Posting Times heatmap card. `ghosts` adds the illustrative next posts. */
const Heatmap: React.FC<{ dim?: number; ghosts?: boolean }> = ({ dim = 0, ghosts }) => {
  const t = useT();
  const counts: Record<string, number> = {};
  const ghostCounts: Record<string, number> = {};
  if (ghosts) GHOSTS.forEach((g, i) => { if (t >= T.fill + 0.5 + i * 0.42) ghostCounts[`${g.day}-${g.block}`] = (ghostCounts[`${g.day}-${g.block}`] ?? 0) + 1; });
  POSTS.forEach((p) => { counts[`${p.day}-${p.block}`] = 1; });
  const pulse = t >= T.every && t < T.verdict ? 0.5 + 0.5 * Math.sin((t - T.every) * 7) : 0;
  return (
    <div style={{ position: "absolute", left: 50, width: 900, top: 420, borderRadius: 30, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 24px 60px rgba(23,25,29,0.12)", padding: "28px 26px 26px", fontFamily: SANS, color: INK }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Mark size={42} /><span style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6 }}>Posting Times</span></div>
        {ghosts ? <ExampleChip /> : <span style={{ fontSize: 20, fontWeight: 600, color: INK2 }}>9 posts · your time zone</span>}
      </div>
      <div style={{ marginTop: 8, fontSize: 21, color: INK2, lineHeight: 1.35 }}>When your own posts have performed best, with the sample behind every claim.</div>
      <div style={{ position: "relative", marginTop: 22, height: CH * 7 + 34 }}>
        {BLOCKS.map((b, i) => <div key={b} style={{ position: "absolute", left: GX + i * CW, width: CW, top: 0, textAlign: "center", fontSize: 18, fontWeight: 600, color: INK2 }}>{b}</div>)}
        {DAYS.map((d, r) => (
          <React.Fragment key={d}>
            <div style={{ position: "absolute", left: 0, top: 34 + r * CH + CH / 2 - 14, fontSize: 21, fontWeight: 700, color: INK2 }}>{d}</div>
            {BLOCKS.map((_, c) => {
              const k = `${r}-${c}`;
              const pi = POSTS.findIndex((p) => p.day === r && p.block === c);
              const land = pi >= 0 ? popE(t, T.drop + pi * 0.29, 0.4) : 0;
              const g = ghostCounts[k] ?? 0;
              const n = (pi >= 0 && land > 0 ? 1 : 0) + g;
              const on = n > 0;
              return (
                <div key={c} style={{ position: "absolute", left: GX + c * CW + 4, top: 34 + r * CH + 4, width: CW - 8, height: CH - 8, borderRadius: 14, background: on ? `rgba(42,98,245,${0.14 + 0.1 * Math.min(n, 4)})` : "#f3f1ec", border: on ? `2px solid rgba(42,98,245,${0.45 + 0.4 * pulse * (pi >= 0 ? 1 : 0)})` : "2px solid transparent", display: "flex", alignItems: "center", justifyContent: "center", opacity: 1 - dim * (on ? 0.2 : 0.6) }}>
                  {on ? <span style={{ fontSize: 32, fontWeight: 800, color: COBALT, transform: `scale(${pi >= 0 && g === 0 ? 0.5 + 0.5 * land : 1})` }}>{n}</span> : null}
                  {g > 0 ? <span style={{ position: "absolute", right: 6, top: 4, fontSize: 15, fontWeight: 800, color: GOLD }}>+{g}</span> : null}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 17, color: INK2, fontFamily: MONO }}>{ghosts ? "Real: the 9 posts above (SOCIA, Nov 2). Gold +1 = example next posts." : SOURCE}</div>
    </div>
  );
};

/** A falling dot that lands in each post's cell, with its publish time. */
const Drops: React.FC = () => {
  const t = useT();
  return (
    <>
      {POSTS.map((p, i) => {
        const at = T.drop + i * 0.29;
        const fall = interpolate(t, [at - 0.3, at], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
        if (t < at - 0.3 || t > at + 0.05) return null;
        const x = 50 + 26 + GX + p.block * CW + CW / 2;
        const y = 420 + 28 + 42 + 8 + 30 + 22 + 34 + p.day * CH + CH / 2;
        return <div key={i} style={{ position: "absolute", left: x - 14, top: y - 14 - (1 - fall) * 260, width: 28, height: 28, borderRadius: 14, background: COBALT, opacity: fall }} />;
      })}
    </>
  );
};

const GridScene: React.FC = () => {
  const t = useT();
  const tally = Math.max(1, POSTS.filter((_, i) => t >= T.drop + i * 0.29 + 0.1).length);
  const slots = ease(t, T.every + 0.2, 0.35);
  return (
    <Beat at={T.grid} until={T.verdict}>
      <Heatmap />
      <Drops />
      <div style={{ position: "absolute", left: 50, width: 900, top: 1250, display: "flex", gap: 20, fontFamily: SANS }}>
        <div style={{ flex: 1, borderRadius: 22, background: INK, color: "#fff", padding: "18px 24px", opacity: ease(t, T.drop, 0.3) }}>
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>{tally}</div>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>Reels, last 30 days</div>
        </div>
        <div style={{ flex: 1, borderRadius: 22, background: COBALT, color: "#fff", padding: "18px 24px", opacity: slots, transform: `translateY(${(1 - slots) * 20}px)` }}>
          <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>9</div>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.8)" }}>different time slots</div>
        </div>
      </div>
    </Beat>
  );
};

const VerdictScene: React.FC = () => {
  const t = useT();
  const p = ease(t, T.verdict + 0.05, 0.4);
  const stamp = popE(t, T.wont, 0.4);
  return (
    <Beat at={T.verdict} until={T.rule}>
      <Heatmap dim={1} />
      <div style={{ position: "absolute", left: 80, width: 840, top: 690, borderRadius: 26, background: CARD, border: `2px solid ${INK}`, boxShadow: "0 30px 80px rgba(23,25,29,0.25)", padding: "30px 34px", fontFamily: SANS, color: INK, opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.96 + 0.04 * p})` }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK2, letterSpacing: 0.5 }}>Best windows</div>
        <div style={{ marginTop: 10, fontSize: 44, fontWeight: 800, letterSpacing: -1.2 }}>No window stands out yet.</div>
        <div style={{ marginTop: 14, fontSize: 25, color: INK2, lineHeight: 1.4 }}>Across 9 posts, no weekday-and-hour block with 2+ posts beat your median by 10% or more. Keep posting at varied times and this fills in.</div>
        <div style={{ position: "absolute", right: 26, top: -30, transform: `rotate(-5deg) scale(${stamp})`, background: GOLD, color: "#fff", borderRadius: 14, padding: "10px 20px", fontSize: 26, fontWeight: 800 }}>no time slot invented</div>
      </div>
    </Beat>
  );
};

const Cell: React.FC<{ n: number; label: string; chip?: string; chipColor?: string; at: number }> = ({ n, label, chip, chipColor, at }) => {
  const t = useT();
  const p = ease(t, at, 0.35);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: p, transform: `translateX(${(1 - p) * 60}px)` }}>
      <div style={{ width: 230, height: 180, borderRadius: 26, background: `rgba(42,98,245,${0.12 + 0.1 * n})`, border: `3px solid ${COBALT}`, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 10, padding: 18, boxSizing: "border-box" }}>
        {Array.from({ length: n }).map((_, i) => <div key={i} style={{ width: 46, height: 46, borderRadius: 23, background: COBALT, transform: `scale(${popE(t, at + 0.1 + i * 0.08, 0.3)})` }} />)}
      </div>
      <div>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5 }}>{label}</div>
        {chip ? <div style={{ display: "inline-block", marginTop: 12, fontSize: 30, fontWeight: 700, color: chipColor, border: `3px solid ${chipColor}`, borderRadius: 24, padding: "6px 20px" }}>{chip}</div> : null}
      </div>
    </div>
  );
};

const RuleScene: React.FC = () => (
  <Beat at={T.rule} until={T.fill}>
    <div style={{ position: "absolute", left: 80, right: 130, top: 430, fontFamily: SANS, color: INK }}>
      <div style={{ fontSize: 30, fontWeight: 700, color: INK2, marginBottom: 34 }}>How SOCIA treats one time slot</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Cell n={1} label="1 post" chip="not ranked" chipColor={INK2} at={T.rule + 0.1} />
        <Cell n={2} label="2 posts" chip="Early signal" chipColor={GOLD} at={T.two} />
        <Cell n={4} label="4 posts" chip="High confidence" chipColor="#1f8a4c" at={T.four} />
      </div>
      <div style={{ marginTop: 44, fontSize: 28, color: INK2, lineHeight: 1.4 }}>A slot is ranked only when its posts beat your median by 10% or more.</div>
    </div>
  </Beat>
);

const FillScene: React.FC = () => {
  const t = useT();
  const sharp = ease(t, T.sharper, 0.4);
  return (
    <Beat at={T.fill} until={T.end}>
      <Heatmap ghosts />
      <div style={{ position: "absolute", left: 50, width: 900, top: 1250, borderRadius: 22, background: INK, color: "#fff", padding: "20px 26px", fontFamily: SANS, display: "flex", alignItems: "center", gap: 18, opacity: sharp, transform: `translateY(${(1 - sharp) * 20}px)` }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: GOLD_BRIGHT }}>+</span>
        <span style={{ fontSize: 26, fontWeight: 700 }}>Every new post adds to a slot. More posts, a sharper answer.</span>
      </div>
    </Beat>
  );
};

const EndCard: React.FC = () => {
  const t = useT();
  const line: Word[] = [
    { w: "Your", t: 23.24 }, { w: "best", t: 23.51, em: true }, { w: "time,", t: 23.81, em: true },
  ];
  const line2: Word[] = [{ w: "from", t: 24.04 }, { w: "your", t: 24.44 }, { w: "own", t: 24.59, em: true }, { w: "posts.", t: 24.83, em: true }];
  const brand = popE(t, T.socia, 0.45);
  return (
    <Beat at={T.end} until={999}>
      <div style={{ position: "absolute", left: 90, right: 90, top: 470, fontFamily: SANS, fontWeight: 800, fontSize: 110, letterSpacing: -4, lineHeight: 1.04, color: "#fff" }}>
        <div>{line.map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
        <div>{line2.map((w, i) => <Rise key={i} w={w} color="#fff" em={GOLD_BRIGHT} />)}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 900, display: "flex", flexDirection: "column", alignItems: "center", gap: 26, fontFamily: SANS, opacity: Math.min(1, brand * 1.3) }}>
        <div style={{ transform: `scale(${brand})` }}><Mark size={170} /></div>
        <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: -4, color: "#fff" }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD_BRIGHT, border: `2px solid ${GOLD_BRIGHT}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, T.soon, 0.3) }}>coming soon</div>
      </div>
    </Beat>
  );
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.02, volume: 0.45 },
  ...[T.grid, T.rule, T.fill, T.end].map((at) => ({ src: sfxWhoosh, at: at - 0.08, volume: 0.28 })),
  ...POSTS.map((_, i) => ({ src: sfxClick, at: T.drop + i * 0.29, volume: 0.35 })),
  { src: sfxPop, at: T.every + 0.2, volume: 0.45 },
  { src: sfxPop, at: T.verdict + 0.05, volume: 0.45 },
  { src: sfxImpact, at: T.wont, volume: 0.4 },
  { src: sfxPop, at: T.two, volume: 0.4 },
  { src: sfxPop, at: T.four, volume: 0.4 },
  ...GHOSTS.map((_, i) => ({ src: sfxClick, at: T.fill + 0.5 + i * 0.42, volume: 0.3 })),
  { src: sfxPop, at: T.socia, volume: 0.5 },
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
    <GridScene />
    <VerdictScene />
    <RuleScene />
    <FillScene />
    <EndCard />
    <Caption />
  </AbsoluteFill>
);
