"use client";

// Rate → Improve: a guided walkthrough of the video. The player runs beside
// it; at each moment SOCIA observed, that moment's row comes forward with
// the observation, the fix shown ON the footage (the proposed line drawn on
// the sampled frame in a preset, the pauses closing up on a bar, the
// measured level, an approximate colour match) and one button that opens
// the Video editor on the right tab with the fix queued. Only fixes SOCIA
// can make are listed (lib/studioFixes.ts).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Type, Music, SunMedium, Volume2, Scissors, Captions, ArrowRight, MessageSquareText } from "lucide-react";
import { useRenderedText } from "./TextOverlay";
import { fmtT } from "@/lib/studio";
import { fmtSpan } from "@/lib/studioVerdict";
import { CAPABILITY, type Capability, type Moment } from "@/lib/studioFixes";
import { TEXT_PRESETS, type TextPresetId } from "@/lib/textPresets";

const ICON: Record<Capability, ReactNode> = {
  text: <Type size={14} />, noise: <Volume2 size={14} />, pauses: <Scissors size={14} />, look: <SunMedium size={14} />, music: <Music size={14} />, captions: <Captions size={14} />, caption: <MessageSquareText size={14} />,
};

export type FixOptions = { presetId?: TextPresetId; cuts?: { start: number; end: number }[]; look?: "match" | "enhance" };

export type ImproveWalkthroughProps = {
  moments: Moment[];
  summary: string;
  /** Sampled frames with their times, for the storyboard and the before/after. */
  thumbs: { src: string; t: number }[];
  durationSec: number;
  /** The player's time and a way to move it. */
  playT: number;
  seek: (t: number) => void;
  /** The video's own pixel size (for the text renderer); null until known. */
  frame: { width: number; height: number } | null;
  /** The file is at hand, so a fix can open the editor. */
  canHandoff: boolean;
  onFix: (m: Moment, o: FixOptions) => void;
  onCaption: () => void;
  /** The text lines as proposed (with the chosen presets), for the player overlay. */
  onProposed?: (lines: { id: string; presetId: TextPresetId; text: string; at: number; end: number }[]) => void;
};

const TEXT_CHOICES: TextPresetId[] = ["hook_title", "caption_bar", "subtitle", "callout_box"];

/** Two stills in one frame; the second wipes across when the moment opens. */
function BeforeAfter({ src, open, afterStyle, children, label }: { src: string | null; open: boolean; afterStyle?: CSSProperties; children?: ReactNode; label: [string, string] }) {
  return (
    <div className={`imw-ba${open ? " on" : ""}`}>
      <div className="imw-ba-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" /> : <span className="imw-ba-empty" />}
        <span className="imw-ba-tag">{label[0]}</span>
      </div>
      <div className="imw-ba-frame after">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" style={afterStyle} /> : <span className="imw-ba-empty" />}
        {children}
        <span className="imw-ba-tag">{label[1]}</span>
      </div>
    </div>
  );
}

/** The sampled frame with the proposed line drawn on it by the real renderer. */
function TextOnFrame({ src, open, presetId, text, frame }: { src: string | null; open: boolean; presetId: TextPresetId; text: string; frame: { width: number; height: number } }) {
  const r = useRenderedText({ presetId, text, width: frame.width, height: frame.height });
  return (
    <BeforeAfter src={src} open={open} label={["Now", "With the line"]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {r?.layout.fits && <img className="imw-overlay" src={r.url} alt="" />}
    </BeforeAfter>
  );
}

const SHAPE = [0.42, 0.55, 0.38, 0.6, 0.35, 0.58, 0.4, 0.62, 0.36, 0.57, 0.41, 0.59, 0.37, 0.61, 0.39, 0.56];

/** The measured level as bars; evened out when the moment opens. A picture of the measurement, not a second measurement. */
function LevelMeter({ open, sound }: { open: boolean; sound: Moment["sound"] }) {
  const quiet = sound?.level !== "loud";
  const bars = SHAPE.map((h) => (open ? 0.72 + (h - 0.48) * 0.35 : quiet ? h * 0.75 : Math.min(1, h * 1.6)));
  return (
    <div className="imw-viz" aria-hidden>
      <div className="imw-meter">
        {bars.map((h, i) => <i key={i} style={{ height: `${Math.round(h * 100)}%` }} />)}
        <span className="imw-meter-line" style={{ bottom: open ? "72%" : quiet ? "36%" : "90%" }} />
      </div>
      <div className="imw-viz-cap"><span>{open ? "Evened out, with steady background noise turned down" : `Measured ${sound?.levelDb != null ? `${sound.levelDb} dBFS` : "level"} over the audible parts`}</span></div>
    </div>
  );
}

/** The video as a bar with the cuts in it; the chosen ones close up when the moment opens. */
function PauseCut({ open, durationSec, cuts, chosen, toggle }: { open: boolean; durationSec: number; cuts: NonNullable<Moment["cuts"]>; chosen: Set<number>; toggle: (i: number) => void }) {
  const pieces: { kind: "keep" | "cut"; len: number; i?: number }[] = [];
  let cursor = 0;
  cuts.forEach((c, i) => { pieces.push({ kind: "keep", len: Math.max(0, c.start - cursor) }); pieces.push({ kind: "cut", len: c.end - c.start, i }); cursor = c.end; });
  pieces.push({ kind: "keep", len: Math.max(0, durationSec - cursor) });
  const saved = cuts.filter((_, i) => chosen.has(i)).reduce((a, c) => a + (c.end - c.start), 0);
  return (
    <div className="imw-viz">
      <div className="imw-cutbar" aria-hidden>
        {pieces.map((p, k) => <i key={k} className={p.kind === "keep" ? "speech" : "pause"} style={{ flexGrow: open && p.kind === "cut" && chosen.has(p.i!) ? 0 : p.len / durationSec, flexBasis: 0 }} />)}
      </div>
      <div className="imw-pauses">
        {cuts.map((c, i) => <label key={i} className="st-check"><input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} /> {fmtSpan(c.start, c.end)}{c.reason ? ` · ${c.reason}` : ""}</label>)}
        <span className="ov-source">{saved > 0 ? `Saves ${saved.toFixed(1)} s; the video runs ${Math.max(0, durationSec - saved).toFixed(1)} s.` : "Nothing chosen."}</span>
      </div>
    </div>
  );
}

/**
 * One moment's change shown on the footage, as it would be applied with
 * SOCIA's own choices (its preset, every cut): the before and after for a
 * card that offers the fix without the walkthrough around it. Nothing in it
 * is a control; the choices are made in Improve.
 */
export function MomentPreview({ m, thumbs, frame, durationSec }: { m: Moment; thumbs: { src: string; t: number }[]; frame: { width: number; height: number } | null; durationSec: number }) {
  const src = thumbs.length ? thumbs.reduce((best, th) => (Math.abs(th.t - m.t) < Math.abs(best.t - m.t) ? th : best), thumbs[0]).src : null;
  const size = frame ?? { width: 1080, height: 1920 };
  if (m.capability === "text" && m.text) return <TextOnFrame src={src} open presetId={m.text.presetId} text={m.text.value} frame={size} />;
  if (m.capability === "noise") return <LevelMeter open sound={m.sound} />;
  if (m.capability === "look") return <BeforeAfter src={src} open afterStyle={{ filter: "sepia(0.06) saturate(0.94) brightness(1.02)" }} label={["Now", "Matched (approximate)"]} />;
  if (m.capability === "pauses" && m.cuts?.length) {
    const saved = m.cuts.reduce((a, c) => a + (c.end - c.start), 0);
    let cursor = 0;
    const pieces: { kind: "keep" | "cut"; len: number }[] = [];
    m.cuts.forEach((c) => { pieces.push({ kind: "keep", len: Math.max(0, c.start - cursor) }); pieces.push({ kind: "cut", len: c.end - c.start }); cursor = c.end; });
    pieces.push({ kind: "keep", len: Math.max(0, durationSec - cursor) });
    return (
      <div className="imw-viz">
        <div className="imw-cutbar" aria-hidden>{pieces.map((p, k) => <i key={k} className={p.kind === "keep" ? "speech" : "pause"} style={{ flexGrow: p.len / durationSec, flexBasis: 0 }} />)}</div>
        <ul className="imw-pauses">
          {m.cuts.map((c, i) => <li key={i}>{fmtSpan(c.start, c.end)}{c.reason ? ` · ${c.reason}` : ""}</li>)}
          <li className="ov-source">Removes {saved.toFixed(1)} s; the video would run {Math.max(0, durationSec - saved).toFixed(1)} s.</li>
        </ul>
      </div>
    );
  }
  return null;
}

/** A track's level under the speech, rising into the ending: how SOCIA mixes the one it makes. */
function MusicLine({ open }: { open: boolean }) {
  return (
    <div className="imw-viz" aria-hidden>
      <svg className={`imw-music${open ? " on" : ""}`} viewBox="0 0 300 60" preserveAspectRatio="none">
        <polyline points="0,46 40,44 80,45 120,42 160,43 200,36 240,24 270,14 300,12" />
        <line x1="258" y1="4" x2="258" y2="56" className="end" />
      </svg>
      <div className="imw-viz-cap"><span>Made from your taste when the editor opens, kept under the speech, fading in and out with the picture.</span></div>
    </div>
  );
}

export default function ImproveWalkthrough({ moments, summary, thumbs, durationSec, playT, seek, frame, canHandoff, onFix, onCaption, onProposed }: ImproveWalkthroughProps) {
  const [follow, setFollow] = useState(true);
  const [pinned, setPinned] = useState<string | null>(null);
  const [presets, setPresets] = useState<Record<string, TextPresetId>>({});
  const [look, setLook] = useState<"match" | "enhance">("match");
  const [chosenCuts, setChosenCuts] = useState<Record<string, Set<number>>>({});
  const timed = useMemo(() => moments.filter((m) => m.capability !== "caption"), [moments]);
  const fromPlayhead = timed.findIndex((m) => playT >= m.t && playT < m.end);
  const activeId = pinned ?? (fromPlayhead >= 0 ? timed[fromPlayhead].id : timed[0]?.id ?? null);
  const rows = useRef<Record<string, HTMLLIElement | null>>({});
  useEffect(() => { if (follow && activeId) rows.current[activeId]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [activeId, follow]);
  // A click pins a moment until the playhead moves into another.
  useEffect(() => { if (pinned && fromPlayhead >= 0 && timed[fromPlayhead].id !== pinned) setPinned(null); }, [fromPlayhead, pinned, timed]);

  const thumbAt = (t: number): string | null => {
    if (!thumbs.length) return null;
    return thumbs.reduce((best, th) => (Math.abs(th.t - t) < Math.abs(best.t - t) ? th : best), thumbs[0]).src;
  };
  const presetFor = (m: Moment): TextPresetId => presets[m.id] ?? m.text?.presetId ?? "hook_title";
  const cutsFor = (m: Moment): Set<number> => chosenCuts[m.id] ?? new Set((m.cuts ?? []).map((_, i) => i));

  const proposed = useMemo(() => moments.filter((m) => m.text).map((m) => ({ id: m.id, presetId: presets[m.id] ?? m.text!.presetId, text: m.text!.value, at: m.t, end: m.end })), [moments, presets]);
  // Told once per change of the lines, whatever the parent passes as the callback.
  const proposedCb = useRef(onProposed); proposedCb.current = onProposed;
  useEffect(() => { proposedCb.current?.(proposed); }, [proposed]);

  const size = frame ?? { width: 1080, height: 1920 };
  const visual = (m: Moment, open: boolean): ReactNode => {
    if (m.capability === "text" && m.text) return <TextOnFrame src={thumbAt(m.t)} open={open} presetId={presetFor(m)} text={m.text.value} frame={size} />;
    if (m.capability === "noise") return <LevelMeter open={open} sound={m.sound} />;
    if (m.capability === "pauses" && m.cuts?.length) return <PauseCut open={open} durationSec={durationSec} cuts={m.cuts} chosen={cutsFor(m)} toggle={(i) => setChosenCuts((s) => { const n = new Set(cutsFor(m)); if (n.has(i)) n.delete(i); else n.add(i); return { ...s, [m.id]: n }; })} />;
    if (m.capability === "look") return <BeforeAfter src={thumbAt(m.t)} open={open} afterStyle={{ filter: look === "match" ? "sepia(0.06) saturate(0.94) brightness(1.02)" : "contrast(1.06) saturate(1.08) brightness(1.04)" }} label={["Now", look === "match" ? "Matched (approximate)" : "Lifted (approximate)"]} />;
    if (m.capability === "music") return <MusicLine open={open} />;
    return null;
  };
  const choices = (m: Moment): ReactNode => {
    if (m.capability === "text" && m.text) return (
      <div className="imw-choices" role="radiogroup" aria-label="Style">
        {TEXT_CHOICES.map((id) => <button key={id} type="button" role="radio" aria-checked={presetFor(m) === id} className={`dv-chip${presetFor(m) === id ? " on" : ""}`} onClick={() => setPresets((p) => ({ ...p, [m.id]: id }))}>{TEXT_PRESETS[id].label}</button>)}
      </div>
    );
    if (m.capability === "look") return (
      <div className="imw-choices" role="radiogroup" aria-label="Correction">
        <button type="button" role="radio" aria-checked={look === "match"} className={`dv-chip${look === "match" ? " on" : ""}`} onClick={() => setLook("match")}>Match the opening clip</button>
        <button type="button" role="radio" aria-checked={look === "enhance"} className={`dv-chip${look === "enhance" ? " on" : ""}`} onClick={() => setLook("enhance")}>Lift every clip a little</button>
      </div>
    );
    return null;
  };
  const act = (m: Moment) => {
    if (m.capability === "caption") { onCaption(); return; }
    const cuts = m.cuts?.filter((_, i) => cutsFor(m).has(i)).map(({ start, end }) => ({ start, end }));
    onFix(m, { presetId: m.text ? presetFor(m) : undefined, cuts, look: m.capability === "look" ? look : undefined });
  };

  return (
    <div className="st-panel imw-tab">
      <section className="st-block">
        <div className="st-block-head"><h3>What to change</h3><label className="st-check imw-follow"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow the video</label></div>
        <p className="imw-summary">{summary}</p>
        {timed.length > 0 && (
          <ol className="imw-board" aria-label="Moments">
            {timed.map((m) => {
              const i = timed.findIndex((x) => x.id === activeId);
              const k = timed.findIndex((x) => x.id === m.id);
              const src = thumbAt(m.t);
              return (
                <li key={m.id} className={m.id === activeId ? "on" : k < i ? "past" : ""}>
                  <button type="button" onClick={() => { setPinned(m.id); seek(m.t + 0.05); }} aria-label={`${fmtT(m.t)} ${m.title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt="" /> : <span className="imw-board-empty">{ICON[m.capability]}</span>}
                    <small>{fmtT(m.t)}</small>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {moments.length === 0 ? (
        <div className="ov-empty small">Nothing here needs a fix SOCIA can make. Check the caption, then prepare the post.</div>
      ) : (
        <ol className="imw-list">
          {moments.map((m) => {
            const cap = CAPABILITY[m.capability];
            const open = m.id === activeId || (m.capability === "caption" && pinned === m.id);
            const idx = timed.findIndex((x) => x.id === m.id), cur = timed.findIndex((x) => x.id === activeId);
            const state = open ? "on" : idx >= 0 && idx < cur ? "past" : "";
            return (
              <li key={m.id} ref={(el) => { rows.current[m.id] = el; }} className={`ov-card imw-fix ${state}`}>
                <button type="button" className="imw-fix-head" aria-expanded={open} onClick={() => { if (m.capability === "caption") { setPinned(open ? null : m.id); return; } setPinned(m.id); seek(m.t + 0.05); }}>
                  <span className="imw-fix-t">{m.capability === "caption" ? "Caption" : fmtT(m.t)}</span>
                  <span className="imw-fix-title">{m.title}</span>
                  <em className={`ov-chip ${m.priority === 1 ? "danger" : m.priority === 2 ? "warning" : "muted"}`}>{m.priority === 1 ? "First" : m.priority === 2 ? "Then" : "If time"}</em>
                </button>
                <div className="imw-fix-body"><div className="imw-fix-inner">
                  {m.observed && <p className="imw-obs">{m.observed}</p>}
                  <div className="imw-fix-visual">{visual(m, open)}</div>
                  <p className="imw-do"><b>{ICON[m.capability]} {cap.label}.</b> {m.fix}</p>
                  {choices(m)}
                  <div className="st-row-actions">
                    <button type="button" className="ov-btn primary small" disabled={m.capability !== "caption" && !canHandoff} onClick={() => act(m)}>{cap.label} <ArrowRight size={12} /></button>
                    <span className="ov-source">{m.capability === "caption" ? "In the Caption tab" : canHandoff ? `Opens the ${cap.where}${m.capability === "pauses" || m.capability === "text" ? " with this applied" : ""}` : "Upload the original file to open it in the editor"}</span>
                  </div>
                </div></div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="ov-source">Only fixes SOCIA can make are listed. What it can&apos;t do (reshoot, rewrite the speech) is left out rather than suggested.</p>
    </div>
  );
}
