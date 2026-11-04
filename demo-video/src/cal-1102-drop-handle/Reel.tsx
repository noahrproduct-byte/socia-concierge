import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate } from "remotion";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { CARD, FPS, GOLD, GOLD_BRIGHT, INK, INK2, LINE, Mark, NIGHT, PAPER, RED, SANS, Source, WordCaption, clamp, ease, popE, typed, useT, type Word } from "./kit";
import { CLOSE, OPEN, PLAN, PROOF_CAPTION, T } from "./story";

/** Night (black) except the proof stretch, with 0.25 s crossfades. */
const night = (t: number) => {
  if (t < T.proof - 0.25) return 1;
  if (t < T.proof) return interpolate(t, [T.proof - 0.25, T.proof], [1, 0], clamp);
  if (t < T.close - 0.25) return 0;
  if (t < T.close) return interpolate(t, [T.close - 0.25, T.close], [0, 1], clamp);
  return 1;
};

const Ground: React.FC = () => {
  const t = useT();
  const n = night(t);
  const drift = Math.sin(t * 0.8) * 40;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(23,25,29,0.035) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <AbsoluteFill style={{ background: NIGHT, opacity: n }}>
        <div style={{ position: "absolute", left: 120 + drift, top: 380, width: 840, height: 840, borderRadius: "50%", background: "rgba(217,178,92,0.14)", filter: "blur(170px)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * One phrase as big stacked type. Each word slams in at its spoken time (small
 * overshoot, blur off); the whole card lifts away just before `until`.
 */
const TypeCard: React.FC<{ words: Word[]; lines: number[][]; at: number; until: number; top: number; size: number }> = ({ words, lines, at, until, top, size }) => {
  const t = useT();
  if (t < at - 0.05 || t > until + 0.02) return null;
  const out = ease(t, until - 0.2, 0.18, Easing.in(Easing.cubic));
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top, fontFamily: SANS, fontWeight: 800, letterSpacing: -size * 0.035, lineHeight: 1.0, opacity: 1 - out, transform: `translateY(${-30 * out}px)`, filter: `blur(${out * 8}px)` }}>
      {lines.map((line, li) => (
        <div key={li}>
          {line.map((wi) => {
            const w = words[wi];
            const p = popE(t, w.t, 0.3);
            const f = ease(t, w.t, 0.22);
            return (
              <span key={wi} style={{ display: "inline-block", fontSize: size, color: w.em ? GOLD_BRIGHT : "#fff", marginRight: "0.22em", opacity: f, transform: `translateY(${(1 - p) * 40}px) scale(${0.85 + 0.15 * p})`, filter: `blur(${(1 - f) * 8}px)` }}>
                {w.w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** A comment box that types a placeholder handle. Not a real comment, no real account. */
const CommentBar: React.FC<{ at: number; typeAt: number; until: number; top: number }> = ({ at, typeAt, until, top }) => {
  const t = useT();
  if (t < at - 0.02 || t > until + 0.02) return null;
  const p = ease(t, at, 0.4);
  const out = ease(t, until - 0.2, 0.2);
  const text = typed(t, "@yourhandle", typeAt, typeAt + 0.7);
  const caret = Math.floor(t * 2.5) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 80, right: 160, top, opacity: p * (1 - out), transform: `translateY(${(1 - p) * 30}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, borderRadius: 60, border: "2px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.06)", padding: "22px 30px", fontFamily: SANS, fontSize: 38, fontWeight: 600 }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.45)", flexShrink: 0 }} />
        <span style={{ color: text ? "#fff" : "rgba(255,255,255,0.45)", flex: 1 }}>
          {text || "Add a comment..."}
          {caret && text.length < 11 ? <span style={{ color: GOLD_BRIGHT }}>|</span> : null}
        </span>
        <span style={{ color: text.length >= 11 ? GOLD_BRIGHT : "rgba(255,255,255,0.3)", fontWeight: 800, fontSize: 32 }}>Post</span>
      </div>
    </div>
  );
};

/* ───────────── proof: the real Content Plan ───────────── */

const Gauge: React.FC<{ value: number; size: number }> = ({ value, size }) => {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LINE} strokeWidth={18} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GOLD} strokeWidth={18} strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} />
    </svg>
  );
};

const Proof: React.FC = () => {
  const t = useT();
  const count = Math.round(PLAN.score * ease(t, T.health, 0.8, Easing.out(Easing.quad)));
  const fix = ease(t, T.fix, 0.4);
  const retire = ease(t, T.retire, 0.35);
  const strike = ease(t, T.strike, 0.35, Easing.inOut(Easing.cubic));
  return (
    <>
      <div style={{ position: "absolute", left: 60, right: 60, top: 370, borderRadius: 34, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 30px 70px rgba(23,25,29,0.14)", padding: "36px 40px", fontFamily: SANS, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark size={58} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: -0.6 }}>Content Plan</div>
            <div style={{ fontSize: 24, color: INK2, marginTop: 2 }}>Our own account · @socia.appmedia</div>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, color: INK2, border: `2px solid ${LINE}`, borderRadius: 18, padding: "6px 16px" }}>This week</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 26, paddingTop: 24, borderTop: `1px solid ${LINE}` }}>
          <div style={{ position: "relative", width: 260, height: 260, flexShrink: 0 }}>
            <Gauge value={count} size={260} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 106, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: INK2 }}>/100</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 2, color: GOLD, fontFamily: SANS }}>HEALTH</div>
            <div style={{ fontSize: 29, lineHeight: 1.36, marginTop: 8, color: INK }}>{PLAN.headline}</div>
          </div>
        </div>

        <div style={{ marginTop: 26, borderRadius: 24, background: "#faf8f3", border: `1px solid ${LINE}`, padding: "24px 26px", opacity: fix, transform: `translateY(${(1 - fix) * 20}px)` }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: INK2 }}>TOP FIX 1</div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -0.8, marginTop: 8, lineHeight: 1.12 }}>{PLAN.fix}</div>
          <div style={{ fontSize: 26, color: INK2, marginTop: 16 }}>Hook:</div>
          <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            {PLAN.parts.map((p, i) => {
              const s = popE(t, T.chips[i], 0.35);
              return (
                <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 30, fontWeight: 800, color: "#fff", background: INK, borderRadius: 16, padding: "14px 20px", opacity: Math.min(1, s * 1.5), transform: `scale(${0.6 + 0.4 * s})` }}>
                  {i > 0 ? <span style={{ color: GOLD_BRIGHT }}>+</span> : null}
                  {p}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, opacity: retire, transform: `translateY(${(1 - retire) * 14}px)` }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: RED, border: `2px solid ${RED}`, borderRadius: 12, padding: "4px 14px" }}>Retire</span>
            <span style={{ position: "relative", fontSize: 32, fontWeight: 700, color: strike > 0.5 ? INK2 : INK }}>
              "{PLAN.retire}"
              <span style={{ position: "absolute", left: 0, top: "52%", height: 4, width: `${strike * 100}%`, background: RED, borderRadius: 2 }} />
            </span>
          </div>
        </div>
        <div style={{ marginTop: 26 }}><Source text={PLAN.source} size={22} /></div>
      </div>
    </>
  );
};

/* ───────────── end card ───────────── */

const EndCard: React.FC = () => {
  const t = useT();
  return (
    <Beat2 at={T.end}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, fontFamily: SANS }}>
        <div style={{ transform: `scale(${popE(t, T.end + 0.05, 0.45)})` }}><Mark size={190} /></div>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: "#fff" }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD_BRIGHT, border: `2px solid ${GOLD_BRIGHT}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, T.end + 0.5, 0.3) }}>coming soon</div>
      </div>
    </Beat2>
  );
};

const Beat2: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const t = useT();
  if (t < at) return null;
  const p = ease(t, at, 0.35);
  return <div style={{ position: "absolute", inset: 0, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>{children}</div>;
};

/* ───────────── sound, root ───────────── */

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.04, volume: 0.55 },
  ...OPEN[0].map((w) => ({ src: sfxClick, at: w.t, volume: 0.3 })),
  { src: sfxWhoosh, at: OPEN[1][0].t - 0.08, volume: 0.25 },
  { src: sfxWhoosh, at: OPEN[2][0].t - 0.08, volume: 0.25 },
  { src: sfxWhoosh, at: T.proof - 0.1, volume: 0.35 },
  { src: sfxPop, at: T.health + 0.75, volume: 0.5 },
  { src: sfxWhoosh, at: T.fix - 0.05, volume: 0.25 },
  ...T.chips.map((at) => ({ src: sfxPop, at, volume: 0.45 })),
  { src: sfxClick, at: T.strike + 0.1, volume: 0.5 },
  { src: sfxWhoosh, at: T.close - 0.1, volume: 0.35 },
  ...Array.from({ length: 5 }, (_, i) => ({ src: sfxClick, at: T.comment + 0.1 + i * 0.13, volume: 0.22 })),
  { src: sfxImpact, at: T.end, volume: 0.4 },
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

    {/* open: the hook as type, in the first second */}
    <TypeCard words={OPEN[0]} lines={[[0, 1], [2], [3]]} at={0} until={OPEN[1][0].t} top={430} size={190} />
    <TypeCard words={OPEN[1]} lines={[[0, 1, 2], [3], [4]]} at={OPEN[1][0].t} until={OPEN[2][0].t} top={430} size={170} />
    <TypeCard words={OPEN[2]} lines={[[0, 1, 2], [3, 4, 5], [6, 7], [8, 9]]} at={OPEN[2][0].t} until={T.proof} top={400} size={140} />
    <CommentBar at={0.5} typeAt={2.9} until={T.proof} top={1180} />

    {/* proof: the real plan */}
    <ProofWrap />
    <WordCaption phrases={PROOF_CAPTION} from={T.proof} to={T.close} top={190} size={50} />

    {/* close */}
    <TypeCard words={CLOSE[0]} lines={[[0, 1]]} at={CLOSE[0][0].t - 0.1} until={CLOSE[1][0].t} top={560} size={190} />
    <TypeCard words={CLOSE[1]} lines={[[0, 1], [2]]} at={CLOSE[1][0].t} until={CLOSE[2][0].t} top={520} size={190} />
    <TypeCard words={CLOSE[2]} lines={[[0, 1, 2], [3, 4], [5, 6]]} at={CLOSE[2][0].t} until={T.end} top={440} size={150} />
    <CommentBar at={T.close + 0.2} typeAt={T.comment} until={T.end} top={1180} />
    <EndCard />
  </AbsoluteFill>
);

const ProofWrap: React.FC = () => {
  const t = useT();
  if (t < T.proof - 0.05 || t > T.close + 0.02) return null;
  const pin = ease(t, T.proof, 0.4);
  const pout = ease(t, T.close - 0.25, 0.22, Easing.in(Easing.cubic));
  return (
    <div style={{ position: "absolute", inset: 0, opacity: pin * (1 - pout), transform: `translateY(${(1 - pin) * 60}px) scale(${1 - 0.04 * pout})`, filter: `blur(${(1 - pin) * 10 + pout * 8}px)` }}>
      <Proof />
    </div>
  );
};
