"use client";

// Animated graphics in the Words tool (lib/studioClips/scenes.ts): the cards
// SOCIA placed over the picture for a figure, a counted list or a key line
// that is said. The person can retype any of them, take one out, or have
// SOCIA look through the words again.
import { useState } from "react";
import { LayoutPanelTop, RefreshCw, Trash2 } from "lucide-react";
import { SCENE_ITEMS_MAX, SCENE_KIND_LABEL, SCENE_LABEL_MAX, SCENE_TEXT_MAX, type EdlScene, type SceneSpan } from "@/lib/studioClips/scenes";

export default function ScenesPanel({ scenes, spans, disabled, hasWords, onChange, onFind, onShow }: {
  scenes: EdlScene[];
  /** where each scene sits in the cut now; a scene whose words were cut has none */
  spans: SceneSpan[];
  disabled: boolean;
  /** the cut has spoken words to look through */
  hasWords: boolean;
  onChange: (scenes: EdlScene[]) => void;
  /** look through what is said again; returns how many it found */
  onFind: () => number;
  onShow: (span: SceneSpan) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const set = (id: string, patch: Partial<EdlScene>) => onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const find = () => {
    const n = onFind();
    setNote(n ? `${n} graphic${n === 1 ? "" : "s"} placed from what is said.` : "Nothing said in this cut makes a graphic: no figure, no counted list, no short key line.");
  };
  return (
    <div className="ov-card cbb-caption-copy">
      <b><LayoutPanelTop size={14} aria-hidden /> Animated graphics</b>
      <small className="sd-fx-note">Cards over the top of the picture, timed to the words they show: a figure, a list counted out loud, a short key line. They come from what is said and move with their words when you trim.</small>
      {scenes.map((s) => {
        const span = spans.find((x) => x.scene.id === s.id);
        return (
          <div key={s.id} className="sd-scene">
            <div className="sd-scene-head">
              <span>{SCENE_KIND_LABEL[s.kind]}</span>
              {span ? <button type="button" className="sd-check-go" onClick={() => onShow(span)}>Show me</button> : <small>Its words are not in the cut now, so it is not shown.</small>}
              <button type="button" className="ov-btn ghost small" disabled={disabled} aria-label={`Remove this ${SCENE_KIND_LABEL[s.kind].toLowerCase()}`} onClick={() => onChange(scenes.filter((x) => x.id !== s.id))}><Trash2 size={12} aria-hidden /> Remove</button>
            </div>
            <div className="cbb-endcard-fields">
              {s.kind === "stat" && (
                <>
                  <label>Figure<input type="text" maxLength={12} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>
                  <label>What it counts<input type="text" maxLength={SCENE_LABEL_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>
                </>
              )}
              {s.kind === "line" && <label>Line<input type="text" maxLength={SCENE_TEXT_MAX} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>}
              {s.kind === "steps" && (s.items ?? []).slice(0, SCENE_ITEMS_MAX).map((it, i) => (
                <label key={it.key}>Row {i + 1}<input type="text" maxLength={SCENE_TEXT_MAX} value={it.text} disabled={disabled} onChange={(e) => set(s.id, { items: (s.items ?? []).map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} /></label>
              ))}
            </div>
          </div>
        );
      })}
      <div className="sd-done-actions">
        <button type="button" className="ov-btn ghost small" disabled={disabled || !hasWords} onClick={find}><RefreshCw size={12} aria-hidden /> {scenes.length ? "Find them again" : "Find them in what is said"}</button>
        {!hasWords && <small className="sd-fx-note">No speech in this cut, so there is nothing to make a graphic from.</small>}
      </div>
      {note && <small className="sd-fx-note" role="status">{note}</small>}
    </div>
  );
}
