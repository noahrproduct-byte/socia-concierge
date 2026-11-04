import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence } from "remotion";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { CARD, FPS, GOLD, GOLD_BRIGHT, INK, INK2, LINE, MONO, Mark, PAPER, SANS, Source, WordCaption, ease, popE, useT, type Word } from "../cal-1102-drop-handle/kit";
import { ASK, CAPTION, HOOKS, PLAN, T, TITLE, type Hook } from "./story";

const GOLD_TINT = "#efe3c8";
const BASE_W = 760;
const BASE_H = 1080;
const ROW_S = 0.39;
const ROW_Y = 820; // card centre in the row
const STAGE_Y = 840; // card centre on stage

const Ground: React.FC = () => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: PAPER }} />
    <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(23,25,29,0.08) 1.6px, transparent 1.6px)", backgroundSize: "36px 36px" }} />
  </AbsoluteFill>
);

const Words: React.FC<{ words: Word[]; em: string; color: string }> = ({ words, em, color }) => {
  const t = useT();
  return (
    <>
      {words.map((w, i) => {
        const p = ease(t, w.t, 0.3);
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, color: w.em ? em : color }}>
            {w.w}
          </span>
        );
      })}
    </>
  );
};

const Intro: React.FC = () => {
  const t = useT();
  if (t > T.stage1 + 0.3) return null;
  const out = ease(t, T.stage1 - 0.1, 0.3);
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top: 170, fontFamily: SANS, color: INK, opacity: 1 - out, transform: `translateY(${-30 * out}px)` }}>
      <div style={{ fontSize: 124, fontWeight: 800, letterSpacing: -5, lineHeight: 1.0 }}>
        <Words words={TITLE.slice(0, 2)} em={GOLD} color={INK} />
        <br />
        <Words words={TITLE.slice(2)} em={GOLD} color={INK} />
      </div>
      <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: -1, marginTop: 26, color: INK2 }}>
        <Words words={ASK} em={GOLD} color={INK2} />
      </div>
    </div>
  );
};

/** One hook draft. Drawn at stage size; the row shrinks it with a transform. */
const HookCard: React.FC<{ h: Hook; i: number }> = ({ h, i }) => {
  const t = useT();
  // 0 = row, 1 = stage
  const m = ease(t, T.stage1, 0.5, Easing.inOut(Easing.cubic)) * (1 - ease(t, T.row, 0.55, Easing.inOut(Easing.cubic)));
  const active = ease(t, T.stage2, 0.45, Easing.inOut(Easing.cubic)) + ease(t, T.stage3, 0.45, Easing.inOut(Easing.cubic));
  const rowX = 540 + (i - 1) * 322;
  const stageX = 540 + (i - active) * 850;
  const cx = rowX + (stageX - rowX) * m;
  const cy = ROW_Y + (STAGE_Y - ROW_Y) * m;
  const s = ROW_S + (1 - ROW_S) * m;
  const enter = popE(t, 0.84 + i * 0.12, 0.45);
  const dim = m * Math.min(1, Math.abs(i - active));
  const bg = h.style === "ink" ? INK : h.style === "gold" ? GOLD_TINT : CARD;
  const fg = h.style === "ink" ? "#fff" : INK;
  const em = h.style === "ink" ? GOLD_BRIGHT : GOLD;
  const badgeP = popE(t, h.badge, 0.35);
  const ring = i === 0 ? ease(t, T.plan, 0.4) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - BASE_W / 2,
        top: cy - BASE_H / 2,
        width: BASE_W,
        height: BASE_H,
        transform: `scale(${s * (0.7 + 0.3 * enter)})`,
        opacity: Math.min(1, enter * 1.5) * (1 - 0.55 * dim),
        borderRadius: 54,
        background: bg,
        border: h.style === "paper" ? `3px solid ${LINE}` : "3px solid transparent",
        boxShadow: `0 40px 90px rgba(23,25,29,${0.18 + 0.1 * m})${ring ? `, 0 0 0 ${14 * ring}px ${GOLD_BRIGHT}` : ""}`,
        padding: "60px 60px",
        fontFamily: SANS,
        color: fg,
        zIndex: Math.round(10 - Math.abs(i - active) * 3),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: 120, height: 120, borderRadius: 60, background: h.style === "ink" ? GOLD_BRIGHT : INK, color: h.style === "ink" ? INK : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 76, fontWeight: 800, transform: `scale(${0.4 + 0.6 * Math.max(badgeP, t < h.badge ? 0.6 : 0)})` }}>
          {i + 1}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, letterSpacing: 4, opacity: 0.6 }}>HOOK {i + 1}</div>
      </div>
      <div style={{ marginTop: 70, fontSize: 98, fontWeight: 800, letterSpacing: -3, lineHeight: 1.06 }}>
        {h.lines.map((line, li) => (
          <div key={li} style={{ marginBottom: 18 }}>
            <Words words={line} em={em} color={fg} />
          </div>
        ))}
      </div>
    </div>
  );
};

/** Under each card once they sit in a row: what kind of opener it is. No results. */
const Kinds: React.FC = () => {
  const t = useT();
  if (t < T.row) return null;
  const out = ease(t, T.vote - 0.25, 0.25);
  return (
    <>
      {HOOKS.map((h, i) => {
        const p = ease(t, T.row + 0.45 + i * 0.12, 0.35);
        return (
          <div key={i} style={{ position: "absolute", left: 540 + (i - 1) * 322 - 150, width: 300, top: ROW_Y + 222, textAlign: "center", fontFamily: SANS, fontSize: 27, fontWeight: 700, color: INK2, lineHeight: 1.2, opacity: p * (1 - out), transform: `translateY(${(1 - p) * 12}px)` }}>
            {h.kind}
          </div>
        );
      })}
    </>
  );
};

const PlanNote: React.FC = () => {
  const t = useT();
  if (t < T.plan - 0.05 || t > T.vote + 0.05) return null;
  const p = ease(t, T.plan, 0.4);
  const out = ease(t, T.vote - 0.25, 0.25);
  const bet = ease(t, T.bet, 0.35);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 1110, opacity: p * (1 - out), transform: `translateY(${(1 - p) * 24}px)`, borderRadius: 30, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 20px 50px rgba(23,25,29,0.1)", padding: "24px 30px", fontFamily: SANS, color: INK }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Mark size={40} />
        <div style={{ fontSize: 27, fontWeight: 800 }}>Content Plan: the hook formula</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {PLAN.parts.map((x, i) => {
          const s = popE(t, T.parts[i], 0.35);
          return (
            <span key={x} style={{ fontSize: 26, fontWeight: 800, color: "#fff", background: INK, borderRadius: 14, padding: "10px 16px", opacity: Math.min(1, s * 1.5), transform: `scale(${0.6 + 0.4 * s})` }}>
              {i > 0 ? <span style={{ color: GOLD_BRIGHT }}>+ </span> : null}
              {x}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 14 }}>
        <Source text={PLAN.source} size={19} />
        <span style={{ fontSize: 22, fontWeight: 800, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 12, padding: "4px 12px", opacity: bet, transform: `scale(${0.8 + 0.2 * bet})`, whiteSpace: "nowrap" }}>A bet, not a result</span>
      </div>
    </div>
  );
};

/** The one idea all three hooks share, shown while the hooks are on stage. */
const Topic: React.FC = () => {
  const t = useT();
  const p = ease(t, T.stage1 + 0.2, 0.35) * (1 - ease(t, T.row - 0.1, 0.25));
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", justifyContent: "center", opacity: p, transform: `translateY(${(1 - p) * -14}px)` }}>
      <div style={{ fontFamily: SANS, fontSize: 34, fontWeight: 700, color: INK2, background: CARD, border: `2px solid ${LINE}`, borderRadius: 40, padding: "12px 28px" }}>
        The idea: <b style={{ color: INK }}>find out why a Reel flopped</b>
      </div>
    </div>
  );
};

const Vote: React.FC = () => {
  const t = useT();
  if (t < T.vote - 0.05 || t > T.end + 0.05) return null;
  const out = ease(t, T.end - 0.2, 0.2);
  const lab = ease(t, T.vote + 0.1, 0.35);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 1 - out }}>
      {T.votes.map((at, i) => {
        const p = popE(t, at, 0.4);
        const pulse = t > at + 0.4 ? 1 + 0.03 * Math.sin((t - at) * 6 + i) : 1;
        return (
          <div key={i} style={{ position: "absolute", left: 540 + (i - 1) * 322 - 95, top: 1090, width: 190, height: 190, borderRadius: 44, background: i === 0 ? INK : i === 2 ? GOLD_TINT : CARD, border: i === 1 ? `3px solid ${LINE}` : "3px solid transparent", color: i === 0 ? "#fff" : INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 120, fontWeight: 800, boxShadow: "0 20px 44px rgba(23,25,29,0.16)", opacity: Math.min(1, p * 1.5), transform: `scale(${(0.5 + 0.5 * p) * pulse})` }}>
            {i + 1}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 1310, textAlign: "center", fontFamily: SANS, fontSize: 40, fontWeight: 800, color: INK, opacity: lab }}>
        Vote in the comments
      </div>
    </div>
  );
};

const EndCard: React.FC = () => {
  const t = useT();
  if (t < T.end) return null;
  const p = ease(t, T.end, 0.35);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: p, background: PAPER, zIndex: 100 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 30, fontFamily: SANS }}>
        <div style={{ transform: `scale(${popE(t, T.end + 0.05, 0.45)})` }}><Mark size={190} /></div>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4, color: INK }}>SOCIA</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 30, padding: "8px 28px", opacity: ease(t, T.end + 0.5, 0.3) }}>coming soon</div>
      </div>
    </div>
  );
};

type Cue = { src: string; at: number; volume: number };
const CUES: Cue[] = [
  { src: sfxImpact, at: 0.03, volume: 0.45 },
  ...[0.84, 0.96, 1.08].map((at) => ({ src: sfxPop, at, volume: 0.3 })),
  { src: sfxWhoosh, at: T.stage1 - 0.05, volume: 0.35 },
  { src: sfxWhoosh, at: T.stage2 - 0.05, volume: 0.35 },
  { src: sfxWhoosh, at: T.stage3 - 0.05, volume: 0.35 },
  ...HOOKS.map((h) => ({ src: sfxClick, at: h.badge, volume: 0.5 })),
  { src: sfxWhoosh, at: T.row - 0.05, volume: 0.35 },
  { src: sfxPop, at: T.plan, volume: 0.45 },
  ...T.parts.map((at) => ({ src: sfxClick, at, volume: 0.4 })),
  { src: sfxPop, at: T.bet + 0.55, volume: 0.4 },
  ...T.votes.map((at) => ({ src: sfxPop, at, volume: 0.5 })),
  { src: sfxImpact, at: T.end, volume: 0.35 },
];

export const Reel: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <Audio src={vo} />
      {CUES.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
          <Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
      <Ground />
      <Intro />
      {HOOKS.map((h, i) => <HookCard key={i} h={h} i={i} />)}
      <Topic />
      <Kinds />
      <PlanNote />
      <Vote />
      <WordCaption phrases={CAPTION} from={13.0} to={T.end} top={210} size={52} />
      <EndCard />
    </AbsoluteFill>
  );
};

