"use client";
// The caption motion picker in the editor's Words tool: the ten presets
// (lib/studioClips/captionMotion.ts), each previewed with the same phrase,
// "Find your focus", in a small looping Player so they compare side by side;
// a preset goes on every caption, or on the one caption picked on the
// timeline. A picked caption also offers its emphasised word, its emphasis
// beat and, for a callout, where the leader line starts. The matching clip
// join is offered as a separate choice: picking a caption style never
// changes a cut.
import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { Check, Play, RotateCcw } from "lucide-react";
import { MotionCaption, captionMotionOf } from "./remotion/CaptionMotion";
import { CAPTION_MOTIONS, DEMO_FRAMES, DEMO_PHRASE, emphasisWord, type CaptionMotion, type CaptionOverride } from "@/lib/studioClips/captionMotion";
import { captionStyle, withCaptionStyle, type CaptionStyleId, type EdlStyle, type FontId } from "@/lib/studioClips/style";
import { familyOf, loadEditorFont } from "@/lib/editorFonts";
import { TRANSITIONS, type TransitionKind } from "@/lib/studioClips/types";
import type { CaptionItem } from "@/lib/studioClips/tracks";
import { useMotionOk } from "@/components/dashboard/motion";

/** The frame a resting preview shows: the emphasis has landed, the words are readable. */
const REST_FRAME = 30;

/** The preview composition: the phrase in one preset over a plain dark backdrop (no footage, so the type is what you compare). */
function CaptionDemo({ style, spec, font }: { style: EdlStyle; spec: CaptionMotion; font: FontId }) {
  const fontFamily = familyOf(font);
  useEffect(() => {
    const handle = delayRender(`demo font ${font}`, { timeoutInMilliseconds: 20_000 });
    loadEditorFont(font).catch(() => null).finally(() => continueRender(handle));
  }, [font]);
  return (
    <AbsoluteFill style={{ background: "#2a2a2e", fontFamily }}>
      {/* Captions are a twentieth of the frame; a tile this small shows the middle of the picture at 1.7x so the type can be read. */}
      <AbsoluteFill style={{ transform: "scale(1.7)", transformOrigin: "50% 48%" }}>
        <MotionCaption page={{ text: DEMO_PHRASE.text, startMs: DEMO_PHRASE.startMs, durationMs: 1100, tokens: DEMO_PHRASE.tokens }} durationInFrames={DEMO_FRAMES} style={style} spec={spec} fontFamily={fontFamily} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** One preset: a looping preview that plays when pointed at, focused or picked, and rests on its emphasis frame otherwise. */
function PresetCard({ m, style, on, onPick, disabled, width, height }: { m: CaptionMotion; style: EdlStyle; on: boolean; onPick: () => void; disabled: boolean; width: number; height: number }) {
  const ref = useRef<PlayerRef>(null);
  const motionOk = useMotionOk();
  const demoStyle = useMemo(() => ({ ...withCaptionStyle(style, m.id), captions: { ...withCaptionStyle(style, m.id).captions, position: "middle" as const } }), [style, m.id]);
  const play = () => { const p = ref.current; if (!p || !motionOk) return; p.seekTo(0); p.play(); };
  const rest = () => { const p = ref.current; if (!p) return; p.pause(); p.seekTo(REST_FRAME); };
  // A portrait tile for a portrait cut, a wide one for a wide cut; small, so ten of them stay light.
  const portrait = height >= width;
  return (
    <div className={`cbb-capmo-card${on ? " on" : ""}`}>
      <button type="button" role="radio" aria-checked={on} className="cbb-capmo-pick" disabled={disabled} onClick={() => { play(); onPick(); }} onPointerEnter={play} onPointerLeave={rest} onFocus={play} onBlur={rest} aria-label={`${m.label}: ${m.observed}`}>
        <span className="cbb-capmo-demo" aria-hidden style={{ aspectRatio: portrait ? "9 / 12" : "16 / 10" }}>
          <Player
            ref={ref}
            component={CaptionDemo}
            inputProps={{ style: demoStyle, spec: m, font: demoStyle.font }}
            durationInFrames={DEMO_FRAMES}
            fps={30}
            compositionWidth={portrait ? 540 : 864}
            compositionHeight={portrait ? 720 : 540}
            initialFrame={REST_FRAME}
            loop
            acknowledgeRemotionLicense
            style={{ width: "100%", height: "100%" }}
          />
        </span>
        <span className="cbb-capmo-name">{on ? <Check size={12} aria-hidden /> : null} {m.label}</span>
        <span className="cbb-capmo-ref">{m.reference}</span>
      </button>
      <button type="button" className="cbb-capmo-replay" aria-label={`Replay ${m.label}`} title="Replay" onClick={play}><RotateCcw size={12} aria-hidden /></button>
    </div>
  );
}

export default function CaptionStylesPanel({ style, width, height, canEdit, busy, selected, override, overridesWithPreset, onTrackPreset, onCaptionPreset, onOverride, onClearCaption, onReplay, everyJoin, onUseTransition, canJoin, placing, onPlacing }: {
  style: EdlStyle; width: number; height: number; canEdit: boolean; busy: boolean;
  /** the caption picked on the timeline, if any */
  selected: CaptionItem | null;
  /** the person's changes to that caption */
  override: CaptionOverride | undefined;
  /** how many captions carry a style of their own */
  overridesWithPreset: number;
  /** a preset for every caption (clears the styles single captions carried) */
  onTrackPreset: (id: CaptionStyleId) => void;
  /** a preset for the picked caption alone */
  onCaptionPreset: (id: CaptionStyleId) => void;
  onOverride: (patch: Partial<CaptionOverride>) => void;
  /** the picked caption back to the track's style, pick and beat */
  onClearCaption: () => void;
  /** play the picked caption (or the captions from the start) in the main preview */
  onReplay: () => void;
  /** the join every cut has now, when they agree */
  everyJoin: TransitionKind | null;
  onUseTransition: (kind: TransitionKind) => void;
  canJoin: boolean;
  /** the preview is waiting for a click to place a callout's point */
  placing?: boolean;
  /** absent when the caption's style has no point to place */
  onPlacing?: (on: boolean) => void;
}) {
  const disabled = !canEdit || busy;
  const current = selected ? override?.preset ?? style.captions.preset : style.captions.preset;
  const spec = captionMotionOf(current);
  const isMotion = captionStyle(current).mark === "motion";
  const [note, setNote] = useState<string | null>(null);
  const words = selected?.words ?? [];
  const autoWord = selected ? emphasisWord(words, undefined, undefined) : -1;
  const pickedWord = selected ? emphasisWord(words, override?.emphasis, undefined) : -1;
  const lenMs = selected ? Math.max(100, Math.round((selected.end - selected.start) * 1000)) : 0;
  const wordBeat = selected && pickedWord >= 0 ? Math.max(0, selected.tokens[pickedWord].fromMs - selected.startMs) : Math.round(lenMs * 0.4);
  const join = spec.transition ? TRANSITIONS.find((t) => t.id === spec.transition) : null;
  return (
    <div className="ov-card cbb-capmo">
      <b>Caption motion</b>
      <small>
        {selected
          ? `Styling the caption "${selected.label}" on its own. ${overridesWithPreset ? `${overridesWithPreset} caption${overridesWithPreset === 1 ? " has" : "s have"} a style of ${overridesWithPreset === 1 ? "its" : "their"} own.` : "Pick a preset below for this caption only, or apply it to every caption."}`
          : `Ten treatments with an entrance, an emphasis on the key word and an exit. Each one is previewed with the same phrase. A preset goes on every caption${overridesWithPreset ? ` (${overridesWithPreset} styled on ${overridesWithPreset === 1 ? "its" : "their"} own will follow it)` : ""}; pick a caption on the timeline to style it alone.`}
      </small>
      <div className="cbb-capmo-grid" role="radiogroup" aria-label={selected ? "Caption motion for this caption" : "Caption motion for every caption"}>
        {CAPTION_MOTIONS.map((m) => (
          <PresetCard key={m.id} m={m} style={style} width={width} height={height} on={current === m.id} disabled={disabled} onPick={() => { if (selected) onCaptionPreset(m.id); else onTrackPreset(m.id); setNote(`${m.label}: ${m.observed}`); }} />
        ))}
      </div>
      {isMotion && <small role="status">{note ?? `${spec.label}: ${spec.observed}`} Timings are SOCIA&apos;s own; entrances and exits shorten on a short caption so it still holds still to be read.</small>}
      {selected && (
        <div className="cbb-capmo-this">
          <div className="cbb-capmo-row">
            <button type="button" className="ov-btn small" disabled={!selected} onClick={onReplay}><Play size={12} aria-hidden /> Replay this caption</button>
            {override?.preset && <button type="button" className="ov-btn ghost small" disabled={disabled} onClick={() => { onTrackPreset(override.preset!); setNote(`${captionStyle(override.preset!).label} is now on every caption.`); }}>Apply to every caption</button>}
            {(override?.preset || override?.emphasis !== undefined || override?.beatMs != null || override?.anchor) && <button type="button" className="ov-btn ghost small" disabled={disabled} onClick={onClearCaption}>Back to the track&apos;s style</button>}
          </div>
          <div className="cbb-capmo-words" role="radiogroup" aria-label="Emphasised word">
            <span className="cbb-capmo-label">Emphasise</span>
            {words.map((w, i) => (
              <button key={i} type="button" role="radio" aria-checked={pickedWord === i} className={`cbb-capmo-word${pickedWord === i ? " on" : ""}`} disabled={disabled} onClick={() => onOverride({ emphasis: i === autoWord ? undefined : w })}>{w}</button>
            ))}
            <button type="button" role="radio" aria-checked={override?.emphasis === null} className={`cbb-capmo-word${override?.emphasis === null ? " on" : ""}`} disabled={disabled} onClick={() => onOverride({ emphasis: null })}>None</button>
          </div>
          <label className="sd-fx-row">
            <span>Emphasis beat</span>
            <input type="range" min={0} max={lenMs} step={33} value={override?.beatMs ?? wordBeat} disabled={disabled || pickedWord < 0} onChange={(e) => onOverride({ beatMs: Number(e.target.value) })} aria-label="When the emphasis lands, from the caption's start" />
            <em>{((override?.beatMs ?? wordBeat) / 1000).toFixed(2)}s</em>
          </label>
          <small className="sd-fx-note">
            {pickedWord < 0 ? "Nothing is emphasised in this caption." : override?.beatMs != null ? <>Set by hand. <button type="button" className="sd-check-go" disabled={disabled} onClick={() => onOverride({ beatMs: undefined })}>Back to the word&apos;s own time</button></> : selected.tokens.length > 1 ? "On the word's own time from the transcript; drag to move it." : "This caption has one time for the whole phrase, so the beat is set here."}
          </small>
          {spec.anchor && (
            <>
              <label className="sd-fx-row"><span>Point across</span><input type="range" min={0} max={100} step={1} value={Math.round((override?.anchor?.x ?? 0.5) * 100)} disabled={disabled} onChange={(e) => onOverride({ anchor: { x: Number(e.target.value) / 100, y: override?.anchor?.y ?? 0.42 } })} /><em>{Math.round((override?.anchor?.x ?? 0.5) * 100)}%</em></label>
              <label className="sd-fx-row"><span>Point down</span><input type="range" min={0} max={100} step={1} value={Math.round((override?.anchor?.y ?? 0.42) * 100)} disabled={disabled} onChange={(e) => onOverride({ anchor: { x: override?.anchor?.x ?? 0.5, y: Number(e.target.value) / 100 } })} /><em>{Math.round((override?.anchor?.y ?? 0.42) * 100)}%</em></label>
              <div className="cbb-capmo-row">
                {onPlacing && <button type="button" className="ov-btn ghost small" aria-pressed={Boolean(placing)} disabled={disabled} onClick={() => onPlacing(!placing)}>{placing ? "Click the preview to place the point" : "Place the point on the preview"}</button>}
              </div>
              <small className="sd-fx-note">Where the leader line starts on the picture. SOCIA does not track objects, so the point stays where you put it.</small>
            </>
          )}
        </div>
      )}
      {isMotion && join && (
        <div className="cbb-capmo-join">
          <small>Matching join: <b>{join.label}</b>. Joins are set in This cut; this style changes no cut on its own.</small>
          <button type="button" className="ov-btn ghost small" disabled={disabled || !canJoin || everyJoin === join.id} onClick={() => onUseTransition(join.id)}>{everyJoin === join.id ? "On every join" : "Use it on every join"}</button>
        </div>
      )}
    </div>
  );
}
