import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence } from "remotion";
import vo from "./audio/vo.mp3";
import sfxPop from "../method/audio/sfx/pop.mp3";
import sfxClick from "../method/audio/sfx/click-soft.mp3";
import sfxWhoosh from "../method/audio/sfx/whoosh-short.mp3";
import sfxImpact from "../method/audio/sfx/impact-bass-1.mp3";
import { CARD, FPS, GOLD, GREEN, INK, INK2, LINE, MONO, Mark, PAPER, RED, SANS, Source, WordCaption, ease, popE, typed, useT } from "../cal-1102-drop-handle/kit";
import { AFTER, BEFORE, CAPTION, HOOK, NOTES_AFTER, NOTES_BEFORE, T } from "./story";

const RED_BG = "rgba(179,64,47,0.13)";
const GREEN_BG = "rgba(31,138,76,0.13)";
const PANE_TOP = 410;
const PANE_H = 640;
const L = { x: 40, w: 470 };
const R = { x: 530, w: 470 };

const Ground: React.FC = () => {
  const t = useT();
  const split = ease(t, 0.2, 0.6, Easing.inOut(Easing.cubic));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: PAPER }} />
      {/* faint ruled lines, like a notebook */}
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(23,25,29,0.05) 1px, transparent 1px)", backgroundSize: "100% 48px" }} />
      <div style={{ position: "absolute", left: 519, top: PANE_TOP - 20, width: 2, height: (PANE_H + 360) * split, background: LINE, opacity: 1 - ease(t, T.end - 0.25, 0.25) }} />
    </AbsoluteFill>
  );
};

const Pane: React.FC<{ x: number; w: number; at: number; label: string; tag: React.ReactNode; pulse: number; tone: "before" | "after"; children: React.ReactNode }> = ({ x, w, at, label, tag, pulse, tone, children }) => {
  const t = useT();
  const p = ease(t, at, 0.45);
  const k = pulse > 0 && t >= pulse && t < pulse + 0.5 ? 1 + 0.035 * Math.sin(((t - pulse) / 0.5) * Math.PI) : 1;
  const out = ease(t, T.end - 0.25, 0.25);
  return (
    <div style={{ position: "absolute", left: x, top: PANE_TOP, width: w, height: PANE_H, borderRadius: 30, background: CARD, border: `2px solid ${tone === "after" && t >= T.claude ? "rgba(31,138,76,0.45)" : LINE}`, boxShadow: "0 24px 60px rgba(23,25,29,0.1)", padding: "24px 26px", fontFamily: SANS, color: INK, opacity: p * (1 - out), transform: `translateY(${(1 - p) * 40}px) scale(${k})` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 600, letterSpacing: 4, color: tone === "before" ? RED : GREEN }}>{label}</span>
        {tag}
      </div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  );
};

const Chip: React.FC<{ children: React.ReactNode; color?: string; show?: number }> = ({ children, color = INK2, show = 1 }) => (
  <span style={{ fontSize: 18, fontWeight: 700, color, border: `2px solid ${color}`, borderRadius: 12, padding: "3px 10px", whiteSpace: "nowrap", opacity: show, transform: `scale(${0.8 + 0.2 * show})` }}>{children}</span>
);

const BeforeText: React.FC = () => {
  const t = useT();
  const pasted = t >= T.paste;
  const flash = pasted ? 1 - ease(t, T.paste, 0.4) : 0;
  return (
    <div style={{ position: "relative", fontSize: 33, fontWeight: 600, lineHeight: 1.36, letterSpacing: -0.3, minHeight: 360 }}>
      {pasted ? (
        <>
          <div style={{ position: "absolute", inset: -8, borderRadius: 12, background: `rgba(42,98,245,${0.18 * flash})` }} />
          {BEFORE.map((seg, i) => {
            if (seg.mark) {
              const at = seg.mark === "opener" ? T.opener : T.minutes;
              const m = ease(t, at, 0.4);
              return (
                <span key={i} style={{ position: "relative", background: `linear-gradient(${RED_BG}, ${RED_BG}) no-repeat 0 0 / ${m * 100}% 100%`, borderRadius: 6, boxShadow: m > 0 ? `inset 0 -3px 0 rgba(179,64,47,${m})` : undefined }}>
                  {seg.s}
                </span>
              );
            }
            if (seg.f) {
              const m = ease(t, T.features + (seg.f - 1) * 0.12, 0.3);
              return (
                <span key={i} style={{ borderRadius: 8, boxShadow: m > 0 ? `0 0 0 ${2.5 * m}px rgba(179,64,47,${m})` : undefined, background: `rgba(179,64,47,${0.08 * m})` }}>
                  {seg.s}
                </span>
              );
            }
            return <span key={i}>{seg.s}</span>;
          })}
        </>
      ) : (
        <span style={{ color: INK2, opacity: 0.5 }}>Paste a caption</span>
      )}
      {/* "never asks you anything": an empty slot where a question would go */}
      <div style={{ marginTop: 18, opacity: ease(t, T.noAsk, 0.35), display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700, color: RED }}>
        <span style={{ width: 160, height: 34, border: `2px dashed ${RED}`, borderRadius: 10 }} /> no question
      </div>
    </div>
  );
};

const BeforeMeta: React.FC = () => {
  const t = useT();
  const p = ease(t, T.real, 0.4);
  return (
    <div style={{ position: "absolute", left: 26, right: 26, bottom: 22, opacity: p, transform: `translateY(${(1 - p) * 12}px)`, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
      <div style={{ fontSize: 23, fontWeight: 700, color: INK }}>Reel · Oct 28</div>
      <div style={{ fontSize: 23, fontWeight: 600, color: INK2, marginTop: 2 }}>241 views · 27 interactions</div>
      <div style={{ marginTop: 6 }}><Source text="SOCIA Analytics · Nov 2" size={17} /></div>
    </div>
  );
};

const AfterText: React.FC = () => {
  const t = useT();
  if (t < T.claude) {
    const caret = Math.floor(t * 2.5) % 2 === 0 && t > 0.6;
    return <div style={{ fontSize: 33, fontWeight: 600, color: INK2, opacity: 0.5, minHeight: 360 }}>{caret ? "|" : " "}</div>;
  }
  return (
    <div style={{ fontSize: 31, fontWeight: 600, lineHeight: 1.36, letterSpacing: -0.3, minHeight: 360 }}>
      {AFTER.map((s, i) => {
        const seg = T.seg[i];
        const shown = typed(t, s, seg.type, seg.type + Math.min(1.1, s.length * 0.012));
        const hl = ease(t, seg.hl, 0.4);
        const typing = shown.length > 0 && shown.length < s.length;
        return (
          <span key={i}>
            <span style={{ background: `linear-gradient(${GREEN_BG}, ${GREEN_BG}) no-repeat 0 0 / ${hl * 100}% 100%`, borderRadius: 6 }}>{shown}</span>
            {typing ? <span style={{ color: GREEN }}>|</span> : null}
            {shown.length === s.length && i < AFTER.length - 1 ? " " : null}
          </span>
        );
      })}
    </div>
  );
};

const AfterMeta: React.FC = () => {
  const t = useT();
  const p = ease(t, T.claude, 0.4);
  return (
    <div style={{ position: "absolute", left: 26, right: 26, bottom: 22, opacity: p, borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 700, color: INK }}>
        <ClaudeGlyph /> Rewritten by Claude
      </div>
      <div style={{ fontSize: 21, fontWeight: 600, color: INK2, marginTop: 4 }}>with SOCIA's data</div>
      <div style={{ marginTop: 6 }}><Source text="Not posted yet. No results." size={17} /></div>
    </div>
  );
};

/** Plain asterisk mark in Claude's orange, no logo file. */
const ClaudeGlyph: React.FC = () => (
  <svg width={26} height={26} viewBox="0 0 24 24">
    {Array.from({ length: 6 }, (_, i) => (
      <rect key={i} x={11} y={2} width={2.4} height={20} rx={1.2} fill="#d97757" transform={`rotate(${i * 30} 12 12)`} />
    ))}
  </svg>
);

const Notes: React.FC = () => {
  const t = useT();
  const out = ease(t, T.end - 0.25, 0.25);
  const top = PANE_TOP + PANE_H + 22;
  return (
    <div style={{ opacity: 1 - out }}>
      {NOTES_BEFORE.map((n, i) => {
        const p = ease(t, n.at, 0.35);
        return (
          <div key={i} style={{ position: "absolute", left: L.x, width: L.w, top: top + i * 104, opacity: p, transform: `translateX(${(1 - p) * -30}px)`, display: "flex", gap: 12, fontFamily: SANS }}>
            <span style={{ width: 34, height: 34, borderRadius: 17, background: RED, color: "#fff", fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</span>
            <div>
              <div style={{ fontSize: 25, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{n.title}</div>
              <div style={{ marginTop: 3 }}><Source text={n.src} size={16} /></div>
            </div>
          </div>
        );
      })}
      {NOTES_AFTER.map((n, i) => {
        const p = ease(t, T.seg[i].hl, 0.35);
        return (
          <div key={i} style={{ position: "absolute", left: R.x, width: 420, top: top + i * 104, opacity: p, transform: `translateX(${(1 - p) * 30}px)`, display: "flex", alignItems: "center", gap: 12, fontFamily: SANS }}>
            <span style={{ width: 34, height: 34, borderRadius: 17, background: GREEN, color: "#fff", fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</span>
            <div style={{ fontSize: 25, fontWeight: 700, color: INK }}>{n}</div>
          </div>
        );
      })}
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
  { src: sfxImpact, at: 0.03, volume: 0.4 },
  { src: sfxClick, at: T.paste, volume: 0.7 },
  { src: sfxPop, at: T.real + 0.1, volume: 0.35 },
  { src: sfxWhoosh, at: T.opener - 0.05, volume: 0.3 },
  { src: sfxPop, at: T.count, volume: 0.35 },
  { src: sfxWhoosh, at: T.minutes - 0.05, volume: 0.3 },
  ...[0, 1, 2, 3, 4].map((i) => ({ src: sfxClick, at: T.features + i * 0.12, volume: 0.35 })),
  { src: sfxWhoosh, at: T.claude - 0.1, volume: 0.35 },
  ...T.seg.map((s) => ({ src: sfxPop, at: s.hl, volume: 0.4 })),
  { src: sfxClick, at: T.before, volume: 0.5 },
  { src: sfxClick, at: T.after, volume: 0.5 },
  { src: sfxImpact, at: T.end, volume: 0.35 },
];

export const Reel: React.FC = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{ fontFamily: SANS }}>
      <Audio src={vo} />
      {CUES.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} name={`sfx ${i}`}>
          <Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
      <Ground />
      <Pane x={L.x} w={L.w} at={0.1} label="BEFORE" tag={<Chip color={INK2} show={ease(t, T.real, 0.35)}>real caption</Chip>} pulse={T.before} tone="before">
        <BeforeText />
        <BeforeMeta />
      </Pane>
      <Pane x={R.x} w={R.w} at={0.25} label="AFTER" tag={<Chip color={GREEN} show={ease(t, T.claude, 0.35)}>rewrite</Chip>} pulse={T.after} tone="after">
        <AfterText />
        <AfterMeta />
      </Pane>
      <Notes />
      <WordCaption phrases={HOOK} from={0} to={2.5} top={150} size={84} weight={800} tracking={-3} lineHeight={1.04} side={70} />
      <WordCaption phrases={CAPTION} from={2.5} to={T.end} top={190} size={50} side={80} />
      <EndCard />
    </AbsoluteFill>
  );
};
