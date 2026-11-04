"use client";

// Text on the video, as presets: a person adds a line, picks one of six looks
// from thumbnails, types the words (with a live count against the preset's
// limit and a plain message when it still can't fit), sets when it shows and
// may move it between the top, middle and bottom of the safe zone. No
// dragging, resizing or rotating: the preset and the renderer decide the
// rest, so what is previewed is what is exported. Used by the Video editor
// (Text & captions) and by Rate → Improve.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus, Trash2, ArrowUp, ArrowDown, Type, X } from "lucide-react";
import { PresetThumb } from "./TextOverlay";
import { fmtClock, type EdlText } from "@/lib/studioClips/types";
import { MAX_TEXT_LAYERS, TEXT_PRESETS, TEXT_PRESET_IDS, TEXT_SLOTS, charCount, clampChars, defaultTiming, presetOf, type TextPresetId, type TextSlot } from "@/lib/textPresets";
import { canvasMeasure, fitMessage, layoutTextLayer, presetFonts } from "@/lib/textRender";
import { ensureTextFonts } from "@/lib/textFonts";

const STEP = 0.5;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** What the line is for, from when it shows: SOCIA's guide and learning read this, the look does not. */
export function roleForTiming(at: number, end: number, durationSec: number): EdlText["role"] {
  if (at < 1) return "opening";
  if (durationSec > 0 && end >= durationSec - 0.5) return "cta";
  return "mid";
}

/** A new, empty line in a preset, timed for this video (at the playhead when given). */
export function newTextLayer(presetId: TextPresetId, durationSec: number, atSec?: number | null, text = ""): EdlText {
  const preset = TEXT_PRESETS[presetId];
  const { at, end } = defaultTiming(preset, durationSec, atSec);
  return { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at, end, text: clampChars(text, preset.maxChars), role: roleForTiming(at, end, durationSec), presetId };
}

export type TextLayersPanelProps = {
  layers: EdlText[];
  onChange: (layers: EdlText[]) => void;
  durationSec: number;
  /** The output frame the lines are laid out for. */
  frame: { width: number; height: number };
  canEdit?: boolean;
  busy?: boolean;
  /** The current playhead, for "at the playhead"; null when unknown. */
  playhead?: () => number | null;
  /** A line was opened for editing: the preview may jump to it. */
  onOpen?: (layer: EdlText) => void;
  /** The line to show open (the one selected on the timeline); the panel's own clicks still open and close rows. */
  openId?: string | null;
  title?: string;
};

function PresetPicker({ onPick, onClose, current }: { onPick: (id: TextPresetId) => void; onClose: () => void; current?: TextPresetId | null }) {
  return (
    <div className="txp-picker ov-card" role="group" aria-label="Text style">
      <div className="txp-picker-head"><b>Pick a style</b><button type="button" className="ov-x" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
      <div className="txp-grid">
        {TEXT_PRESET_IDS.map((id) => {
          const p = TEXT_PRESETS[id];
          return (
            <button key={id} type="button" className={`txp-choice${current === id ? " on" : ""}`} aria-pressed={current === id} onClick={() => onPick(id)}>
              <PresetThumb presetId={id} />
              <span className="txp-choice-text"><b>{p.label}</b><small>{p.hint}</small></span>
            </button>
          );
        })}
      </div>
      <p className="ov-source">Every style sits inside the part of the frame Instagram Reels and TikTok leave clear.</p>
    </div>
  );
}

export default function TextLayersPanel({ layers, onChange, durationSec, frame, canEdit = true, busy = false, playhead, onOpen, openId, title = "Text on the video" }: TextLayersPanelProps) {
  const [picking, setPicking] = useState<"new" | string | null>(null);
  const [open, setOpen] = useState<string | null>(openId ?? null);
  useEffect(() => { if (openId) setOpen(openId); }, [openId]);
  const [fontsReady, setFontsReady] = useState(0);
  const locked = !canEdit || busy;
  const dur = Math.max(0.5, durationSec);

  // Measure in the real faces: the fit check re-runs once they are in.
  useEffect(() => {
    let alive = true;
    ensureTextFonts(TEXT_PRESET_IDS.flatMap((id) => presetFonts(TEXT_PRESETS[id]))).then(() => { if (alive) setFontsReady((n) => n + 1); });
    return () => { alive = false; };
  }, []);
  const measure = useMemo(() => canvasMeasure(), []);
  const fit = (l: EdlText): string | null => {
    if (!measure || !frame.width || !frame.height) return null;
    const preset = presetOf(l);
    return fitMessage(preset, layoutTextLayer({ preset, text: l.text, slot: l.slot, width: frame.width, height: frame.height, measure }));
  };

  const update = (id: string, patch: Partial<EdlText>) => onChange(layers.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...patch };
    return { ...next, role: roleForTiming(next.at, next.end, dur) };
  }));
  const remove = (id: string) => { onChange(layers.filter((l) => l.id !== id)); if (open === id) setOpen(null); };
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= layers.length) return; const next = [...layers]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const add = (presetId: TextPresetId) => {
    if (layers.length >= MAX_TEXT_LAYERS) return;
    const l = newTextLayer(presetId, dur, playhead?.() ?? null);
    onChange([...layers, l]);
    setPicking(null); setOpen(l.id); onOpen?.(l);
  };
  const changePreset = (id: string, presetId: TextPresetId) => {
    const cur = layers.find((l) => l.id === id);
    if (!cur) return;
    const preset = TEXT_PRESETS[presetId];
    update(id, { presetId, slot: undefined, text: clampChars(cur.text, preset.maxChars) });
    setPicking(null);
  };
  const openRow = (l: EdlText) => { const next = open === l.id ? null : l.id; setOpen(next); if (next) onOpen?.(l); };
  const setStart = (l: EdlText, at: number) => { const a = r2(Math.max(0, Math.min(at, dur - 0.5))); update(l.id, { at: a, end: r2(Math.max(a + 0.5, Math.min(dur, l.end))) }); };
  const setEnd = (l: EdlText, end: number) => update(l.id, { end: r2(Math.max(l.at + 0.5, Math.min(dur, end))) });
  const full = layers.length >= MAX_TEXT_LAYERS;

  return (
    <section className="st-block txp">
      <div className="st-block-head">
        <h3><Type size={14} /> {title}</h3>
        <span className="ov-range-label">{layers.length} of {MAX_TEXT_LAYERS}</span>
      </div>
      {layers.length === 0 && picking !== "new" && <p className="ov-source">No text on this video yet. Add a line, pick a style, type the words. It always lands inside the safe zone.</p>}
      <ul className="txp-list">
        {layers.map((l, i) => {
          const preset = presetOf(l);
          const isOpen = open === l.id;
          const count = charCount(l.text);
          const problem = isOpen ? fit(l) : null;
          const slot: TextSlot = l.slot ?? preset.slot;
          return (
            <li key={l.id} className={`ov-card txp-row${isOpen ? " open" : ""}${!l.text.trim() ? " empty" : ""}`}>
              <button type="button" className="txp-row-head" aria-expanded={isOpen} onClick={() => openRow(l)}>
                <span className="txp-row-style">{preset.label}</span>
                <span className="txp-row-text">{l.text.trim() ? l.text.replace(/\n/g, " · ") : "Type the words"}</span>
                <span className="txp-row-time">{fmtClock(l.at)}–{fmtClock(l.end)}</span>
                <ChevronDown size={14} className="txp-chev" aria-hidden />
              </button>
              {isOpen && (
                <div className="txp-edit">
                  {picking === l.id ? (
                    <PresetPicker current={preset.id} onPick={(p) => changePreset(l.id, p)} onClose={() => setPicking(null)} />
                  ) : (
                    <div className="txp-edit-row">
                      <button type="button" className="txp-style-btn" disabled={locked} onClick={() => setPicking(l.id)} aria-label={`Style: ${preset.label}. Change`}>
                        <PresetThumb presetId={preset.id} text={l.text} />
                        <span><b>{preset.label}</b><small>Change style</small></span>
                      </button>
                      <div className="txp-slots" role="radiogroup" aria-label="Where in the frame">
                        {TEXT_SLOTS.map((s) => (
                          <button key={s.id} type="button" role="radio" aria-checked={slot === s.id} className={slot === s.id ? "on" : ""} disabled={locked} onClick={() => update(l.id, { slot: s.id === preset.slot ? undefined : s.id })}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <label className="txp-words">
                    <span className="txp-words-head"><span>Words</span><em className={count >= preset.maxChars ? "max" : ""}>{count} / {preset.maxChars}</em></span>
                    <textarea
                      rows={preset.lead ? 2 : 2}
                      value={l.text}
                      disabled={locked}
                      autoFocus={!l.text}
                      placeholder={preset.lead ? "200+\nthe line under the number" : preset.sample}
                      aria-invalid={Boolean(problem)}
                      onChange={(e) => update(l.id, { text: clampChars(e.target.value, preset.maxChars) })}
                    />
                  </label>
                  {preset.lead && <small className="ov-source">First line is the number, the next line sits under it.</small>}
                  {problem && <p className="txp-problem" role="alert">{problem}</p>}
                  <div className="txp-time">
                    <span className="txp-time-grp"><span>From</span>
                      <button type="button" aria-label="Earlier" disabled={locked} onClick={() => setStart(l, l.at - STEP)}><Minus size={12} /></button>
                      <em>{fmtClock(l.at)}</em>
                      <button type="button" aria-label="Later" disabled={locked} onClick={() => setStart(l, l.at + STEP)}><Plus size={12} /></button>
                    </span>
                    <span className="txp-time-grp"><span>To</span>
                      <button type="button" aria-label="Shorter" disabled={locked} onClick={() => setEnd(l, l.end - STEP)}><Minus size={12} /></button>
                      <em>{fmtClock(l.end)}</em>
                      <button type="button" aria-label="Longer" disabled={locked} onClick={() => setEnd(l, l.end + STEP)}><Plus size={12} /></button>
                    </span>
                    {playhead && <button type="button" className="ov-btn ghost small" disabled={locked} onClick={() => { const p = playhead(); if (p != null) setStart(l, p); }}>Start at the playhead</button>}
                  </div>
                  <div className="txp-actions">
                    <button type="button" className="ov-btn ghost small" disabled={locked || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={12} /> Up</button>
                    <button type="button" className="ov-btn ghost small" disabled={locked || i === layers.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={12} /> Down</button>
                    <button type="button" className="ov-btn ghost small danger" disabled={locked} onClick={() => remove(l.id)}><Trash2 size={12} /> Remove</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {picking === "new" ? (
        <PresetPicker onPick={add} onClose={() => setPicking(null)} />
      ) : (
        <div className="st-row-actions">
          <button type="button" className="ov-btn primary small" disabled={locked || full} onClick={() => setPicking("new")}><Plus size={12} /> Add text</button>
          {full && <span className="ov-source">{MAX_TEXT_LAYERS} lines is the most one video takes. Remove one to add another.</span>}
        </div>
      )}
      {fontsReady === 0 && layers.length > 0 && <small className="ov-source">Loading the fonts.</small>}
    </section>
  );
}
