import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence } from "remotion";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { CARD, COBALT, ExampleChip, FPS, GOLD, GOLD_BRIGHT, GREEN, INK, INK2, INK3, LINE, MONO, Mark, SANS, WordCaption, ease, popE, typed, useT } from "../cal-1102-drop-handle/kit";
import { ACCOUNTS, BRIEF, CAPTION, HOOK, REELS, T } from "./story";

const FRAME = { x: 44, w: 992, top: 380, h: 950 };
const PAD = 32;
const CARD_W = 290;
const GAP = 29;
const THUMB_H = 400;

/** Visible between a and b with a short ease at each end. */
const vis = (t: number, a: number, b: number) => ease(t, a, 0.3) * (1 - ease(t, b - 0.25, 0.25));

const Ground: React.FC = () => (
  <AbsoluteFill>
    <AbsoluteFill style={{ background: "#eceae4" }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 50% at 50% 60%, rgba(42,98,245,0.07), transparent 70%)" }} />
  </AbsoluteFill>
);

const Hook: React.FC = () => {
  const t = useT();
  if (t > T.page + 0.3) return null;
  const out = ease(t, T.page - 0.15, 0.3);
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top: 220, fontFamily: SANS, fontWeight: 800, fontSize: 104, letterSpacing: -4, lineHeight: 1.0, color: INK, opacity: 1 - out, transform: `translateY(${-40 * out}px)` }}>
      {HOOK.map((w, i) => {
        const p = ease(t, w.t, 0.28);
        return <span key={i} style={{ display: "inline-block", marginRight: "0.22em", opacity: p, transform: `translateY(${(1 - p) * 30}px)`, filter: `blur(${(1 - p) * 8}px)`, color: w.em ? COBALT : INK }}>{w.w}</span>;
      })}
    </div>
  );
};

/** The Discover page frame. Slides up under the hook, then settles. */
const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useT();
  const enter = ease(t, 0.9, 0.7, Easing.out(Easing.cubic));
  const settle = ease(t, T.page, 0.5, Easing.inOut(Easing.cubic));
  const top = FRAME.top + (1 - settle) * 520 + (1 - enter) * 700;
  const out = ease(t, T.end - 0.25, 0.25);
  return (
    <div style={{ position: "absolute", left: FRAME.x, width: FRAME.w, top, height: FRAME.h, borderRadius: 38, background: CARD, border: `1px solid ${LINE}`, boxShadow: "0 40px 90px rgba(23,25,29,0.16)", overflow: "hidden", fontFamily: SANS, color: INK, opacity: enter * (1 - out) }}>
      <div style={{ padding: `28px ${PAD}px 0` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark size={46} />
          <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>Discover</span>
          <span style={{ marginLeft: "auto" }}><ExampleChip size={22} /></span>
        </div>
        <div style={{ fontSize: 22, color: INK2, marginTop: 8, lineHeight: 1.35 }}>The accounts you watch and what's trending in your niche: who's winning, and why.</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, height: 1, background: LINE }} />
      {children}
    </div>
  );
};

const SectionHead: React.FC<{ title: string; micro: string }> = ({ title, micro }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
    <span style={{ fontSize: 30, fontWeight: 800 }}>{title}</span>
    <span style={{ fontSize: 19, color: INK2, textAlign: "right" }}>{micro}</span>
  </div>
);

const Accounts: React.FC = () => {
  const t = useT();
  const v = vis(t, T.page, T.reels + 0.1);
  if (v <= 0) return null;
  return (
    <div style={{ position: "absolute", left: PAD, right: PAD, top: 178, opacity: v }}>
      <SectionHead title="Accounts in your niche" micro="3 of 5 on your plan" />
      {ACCOUNTS.map((a, i) => {
        const p = ease(t, T.accounts + i * 0.2, 0.35);
        return (
          <div key={a.handle} style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 22, padding: "20px 0", borderTop: `1px solid ${LINE}`, opacity: p, transform: `translateY(${(1 - p) * 18}px)` }}>
            <div style={{ width: 76, height: 76, borderRadius: 38, background: a.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800 }}>{a.letter}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 31, fontWeight: 700 }}>{a.handle}</span>
                <ExampleChip size={16} />
              </div>
              <div style={{ fontSize: 23, color: INK2, marginTop: 4 }}>Instagram | {a.followers} followers</div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, borderRadius: 14, padding: "10px 16px", border: `2px solid ${a.tracked ? LINE : INK}`, color: a.tracked ? GREEN : INK }}>{a.tracked ? "✓ Tracking" : "+ Track"}</span>
          </div>
        );
      })}
    </div>
  );
};

const ReelCard: React.FC<{ i: number; big?: number }> = ({ i, big = 0 }) => {
  const t = useT();
  const r = REELS[i];
  const p = ease(t, T.reels + 0.15 + i * 0.15, 0.4);
  const m = popE(t, T.ranked + i * 0.15, 0.35);
  const mark = ease(t, T.marks[i], 0.35);
  const markOut = 1 - ease(t, T.copy - 0.3, 0.25);
  const chipPulse = t > T.example && t < T.yours + 1.2 ? 1 + 0.25 * ease(t, T.example, 0.3) : 1;
  const smallHi = i === 0 ? ease(t, T.small, 0.35) * (1 - ease(t, T.pattern - 0.2, 0.2)) : 0;
  const bigHi = i === 1 ? ease(t, T.big, 0.35) * (1 - ease(t, T.pattern - 0.2, 0.2)) : 0;
  return (
    <div style={{ width: CARD_W, opacity: p, transform: `translateY(${(1 - p) * 30}px) scale(${1 + big})`, transformOrigin: "top left" }}>
      <div style={{ position: "relative", width: CARD_W, height: THUMB_H, borderRadius: 22, background: r.cover, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 14, top: 14, transform: `scale(${chipPulse})`, transformOrigin: "top left" }}><ExampleChip size={16} /></div>
        <div style={{ position: "absolute", right: 14, top: 12, background: COBALT, color: "#fff", borderRadius: 16, padding: "6px 14px", fontSize: 28, fontWeight: 800, opacity: Math.min(1, m * 1.5), transform: `scale(${0.5 + 0.5 * m})` }}>{r.mult}</div>
        {/* the result, shown on screen in the first second */}
        <div style={{ position: "absolute", left: 18, right: 18, bottom: 22 }}>
          <div style={{ display: "inline-block", fontFamily: MONO, fontSize: 18, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.45)", borderRadius: 8, padding: "2px 8px", opacity: mark * markOut }}>0:01</div>
          <div style={{ marginTop: 8, fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1.05, letterSpacing: -1, textShadow: "0 3px 12px rgba(0,0,0,0.3)", borderRadius: 12, boxShadow: mark * markOut > 0 ? `0 0 0 ${4 * mark * markOut}px ${GOLD_BRIGHT}` : undefined, padding: "4px 6px", marginLeft: -6 }}>{r.thumb}</div>
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>{r.handle} <span style={{ color: INK3, fontWeight: 600 }}>| Instagram</span></div>
      <div style={{ fontSize: 18, color: INK2, marginTop: 4, lineHeight: 1.3 }}><b style={{ color: COBALT }}>{r.mult}</b> their median likes and comments</div>
      <div style={{ display: "inline-block", marginTop: 8, fontSize: 18, fontWeight: 700, borderRadius: 12, padding: "4px 10px", color: smallHi ? GOLD : INK2, border: `2px solid ${smallHi ? GOLD : bigHi ? INK3 : LINE}`, transform: `scale(${1 + 0.12 * smallHi})`, transformOrigin: "left center" }}>{r.followers} followers</div>
    </div>
  );
};

const Reels: React.FC = () => {
  const t = useT();
  const v = Math.max(vis(t, T.reels, T.copy), vis(t, T.example - 0.1, 99));
  if (v <= 0) return null;
  return (
    <div style={{ position: "absolute", left: PAD, right: PAD, top: 178, opacity: v }}>
      <SectionHead title="Recent Reels in your niche" micro="Last 60 days, ranked against each account's usual" />
      <div style={{ display: "flex", gap: GAP, marginTop: 24 }}>
        {REELS.map((_, i) => <ReelCard key={i} i={i} />)}
      </div>
    </div>
  );
};

/** Below the grid: why the small account is first, then the pattern to test. */
const Callouts: React.FC = () => {
  const t = useT();
  const a = vis(t, T.small, T.pattern);
  const b = vis(t, T.pattern, T.copy);
  const c = vis(t, T.example, 99);
  const test = popE(t, T.test, 0.4);
  const box: React.CSSProperties = { position: "absolute", left: PAD, right: PAD, top: 790, borderRadius: 24, padding: "20px 24px", fontFamily: SANS };
  return (
    <>
      {a > 0 && (
        <div style={{ ...box, background: "#faf7ef", border: `1px solid ${LINE}`, opacity: a, transform: `translateY(${(1 - a) * 16}px)` }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>A 2.1K account ranks first</div>
          <div style={{ fontSize: 22, color: INK2, marginTop: 6 }}>Ranked against each account's own median, not by size.</div>
        </div>
      )}
      {b > 0 && (
        <div style={{ ...box, background: INK, color: "#fff", opacity: b, transform: `translateY(${(1 - b) * 16}px)` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, letterSpacing: 3, color: GOLD_BRIGHT }}>PATTERN WORTH TESTING</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: INK, background: GOLD_BRIGHT, borderRadius: 12, padding: "4px 12px", opacity: Math.min(1, test * 1.5), transform: `scale(${0.6 + 0.4 * test}) rotate(-2deg)` }}>A test, not proof</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 10, letterSpacing: -0.6 }}>Show the result in the first second</div>
        </div>
      )}
      {c > 0 && (
        <div style={{ ...box, background: "#fbecc4", border: "1px solid #e8c771", opacity: c, transform: `translateY(${(1 - c) * 16}px)` }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#5a4000" }}>Every account and number here is an example</div>
          <div style={{ fontSize: 23, color: "#7a5600", marginTop: 6, opacity: ease(t, T.yours, 0.35) }}>Yours shows accounts from your own niche.</div>
        </div>
      )}
    </>
  );
};

/** Copy idea and Add to my plan on the first Reel. */
const Actions: React.FC = () => {
  const t = useT();
  const v = vis(t, T.copy - 0.15, T.example);
  if (v <= 0) return null;
  const copied = t >= T.copy + 0.15;
  const added = t >= T.add + 0.15;
  const press = (at: number) => (t >= at && t < at + 0.18 ? 0.93 : 1);
  return (
    <div style={{ position: "absolute", left: PAD, right: PAD, top: 178, opacity: v }}>
      <SectionHead title="Recent Reels in your niche" micro="Last 60 days, ranked against each account's usual" />
      <div style={{ display: "flex", gap: 28, marginTop: 24 }}>
        <ReelCard i={0} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: 24, fontWeight: 700, borderRadius: 14, padding: "12px 18px", border: `2px solid ${copied ? GREEN : INK}`, color: copied ? GREEN : INK, transform: `scale(${press(T.copy)})` }}>{copied ? "✓ Copied" : "Copy idea"}</span>
            <span style={{ fontSize: 24, fontWeight: 700, borderRadius: 14, padding: "12px 18px", background: added ? INK : CARD, color: added ? "#fff" : INK, border: `2px solid ${INK}`, transform: `scale(${press(T.add)})` }}>+ Add to my plan</span>
          </div>
          <div style={{ borderRadius: 20, background: "#f6f4ef", border: `1px solid ${LINE}`, padding: "18px 20px", fontFamily: MONO, fontSize: 19, lineHeight: 1.45, color: INK, opacity: ease(t, T.copy + 0.15, 0.3) }}>
            {BRIEF.map((line, i) => {
              const from = T.copy + 0.25 + i * 0.35;
              return <div key={i} style={{ marginBottom: 8, color: i === BRIEF.length - 1 ? GOLD : INK }}>{typed(t, line, from, from + 0.45)}</div>;
            })}
          </div>
          <div style={{ fontSize: 21, color: INK2, opacity: ease(t, T.add + 0.2, 0.3) }}>Opens your plan with this idea filled in. Nothing is scheduled for you.</div>
        </div>
      </div>
    </div>
  );
};

const EndCard: React.FC = () => {
  const t = useT();
  if (t < T.end) return null;
  const p = ease(t, T.end, 0.35);
  return (
    <div style={{ position: "absolute", inset: 0, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
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
  { src: sfxImpact, at: 0.02, volume: 0.4 },
  { src: sfxWhoosh, at: 0.9, volume: 0.3 },
  ...ACCOUNTS.map((_, i) => ({ src: sfxClick, at: T.accounts + i * 0.2, volume: 0.35 })),
  { src: sfxWhoosh, at: T.reels - 0.05, volume: 0.3 },
  ...REELS.map((_, i) => ({ src: sfxPop, at: T.ranked + i * 0.15, volume: 0.4 })),
  { src: sfxPop, at: T.small, volume: 0.35 },
  { src: sfxWhoosh, at: T.pattern - 0.05, volume: 0.3 },
  ...T.marks.map((at) => ({ src: sfxClick, at, volume: 0.4 })),
  { src: sfxPop, at: T.test, volume: 0.45 },
  { src: sfxClick, at: T.copy, volume: 0.6 },
  { src: sfxClick, at: T.add, volume: 0.6 },
  { src: sfxPop, at: T.example, volume: 0.4 },
  { src: sfxImpact, at: T.end, volume: 0.35 },
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
    <Frame>
      <Accounts />
      <Reels />
      <Actions />
      <Callouts />
    </Frame>
    <Hook />
    <WordCaption phrases={CAPTION} from={T.page} to={T.end} top={180} size={50} side={80} />
    <EndCard />
  </AbsoluteFill>
);


