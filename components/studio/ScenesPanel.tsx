"use client";

// Animated graphics in the Words tool (lib/studioClips/scenes.ts): the cards
// SOCIA placed over the picture for a figure, a counted list or a key line
// that is said. The person can retype any of them, take one out, or have
// SOCIA look through the words again.
import { useState } from "react";
import { LayoutPanelTop, RefreshCw, Trash2 } from "lucide-react";
import { SCENE_ICONS, SCENE_ICON_IDS, isSceneIcon } from "@/lib/studioClips/sceneIcons";
import { SCENE_PLACES } from "@/lib/studioClips/scenes";
import { FX_LINE_MAX, FX_TEXT_MAX, SCENE_FX, SCENE_FX_IDS, isSceneFx } from "@/lib/studioClips/sceneFx";
import { SCENE_ITEMS_MAX, SCENE_KIND_LABEL, SCENE_LABEL_MAX, SCENE_TEXT_MAX, type EdlScene, type SceneSpan } from "@/lib/studioClips/scenes";

export type ScenePlace = "over" | "behind" | "split";

export default function ScenesPanel({ scenes, spans, disabled, hasWords, place, onPlace, onChange, onFind, onShow }: {
  scenes: EdlScene[];
  /** where each scene sits in the cut now; a scene whose words were cut has none */
  spans: SceneSpan[];
  disabled: boolean;
  /** the cut has spoken words to look through */
  hasWords: boolean;
  /** where the graphics sit: a card over the picture, behind the person talking, or a split screen */
  place: ScenePlace;
  onPlace: (place: ScenePlace) => void;
  onChange: (scenes: EdlScene[]) => void;
  /** look through what is said again; returns how many it found */
  onFind: () => number;
  onShow: (span: SceneSpan) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const setIcon = (id: string, v: string) => onChange(scenes.map((s) => {
    if (s.id !== id) return s;
    const { icon: _old, ...rest } = s; void _old;
    return isSceneIcon(v) ? { ...rest, icon: v } : rest;
  }));
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
              <span>{s.kind === "effect" && s.fx ? SCENE_FX[s.fx].label : SCENE_KIND_LABEL[s.kind]}</span>
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
              {s.kind === "change" && (
                <>
                  <label>Before<input type="text" maxLength={12} value={s.was ?? ""} disabled={disabled} onChange={(e) => set(s.id, { was: e.target.value })} /></label>
                  <label>After<input type="text" maxLength={12} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>
                  <label>What it counts<input type="text" maxLength={SCENE_LABEL_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>
                </>
              )}
              {s.kind === "effect" && s.fx && (
                <>
                  <label>Effect
                    <select value={s.fx} disabled={disabled} onChange={(e) => { const v = e.target.value; if (isSceneFx(v)) set(s.id, { fx: v, lines: (s.lines ?? []).slice(0, SCENE_FX[v].lines) }); }}>
                      {SCENE_FX_IDS.map((id) => <option key={id} value={id}>{SCENE_FX[id].label}</option>)}
                    </select>
                  </label>
                  {SCENE_FX[s.fx].text && <label>{SCENE_FX[s.fx].text}<input type="text" maxLength={FX_TEXT_MAX} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>}
                  {s.fx === "cover" && <label>Cover line<input type="text" maxLength={SCENE_LABEL_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>}
                  {Array.from({ length: SCENE_FX[s.fx].lines - (s.fx === "news" ? 1 : 0) }, (_, i) => (
                    <label key={i}>{s.fx === "news" ? `Headline ${i + 2}` : `Line ${i + 1}`}<input type="text" maxLength={FX_LINE_MAX} value={s.lines?.[i] ?? ""} disabled={disabled} onChange={(e) => { const lines = [...(s.lines ?? [])]; lines[i] = e.target.value; set(s.id, { lines }); }} /></label>
                  ))}
                  <small className="sd-fx-note">{SCENE_FX[s.fx].what}</small>
                </>
              )}
              {s.kind === "picture" && (
                <>
                  <label>Headline<input type="text" maxLength={44} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>
                  <label>Line under it<input type="text" maxLength={SCENE_LABEL_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>
                </>
              )}
              {s.kind === "line" && <label>Line<input type="text" maxLength={SCENE_TEXT_MAX} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>}
              {place === "over" && s.kind !== "effect" && (
                <label>Where it sits
                  <select value={s.place ?? ""} disabled={disabled} onChange={(e) => onChange(scenes.map((x) => { if (x.id !== s.id) return x; const { place: _p, ...rest } = x; void _p; const v = SCENE_PLACES.find((q) => q === e.target.value); return v ? { ...rest, place: v } : rest; }))}>
                    <option value="">Automatic</option>
                    <option value="top">Top</option>
                    <option value="upper">A little lower</option>
                    <option value="lower">Under the middle</option>
                  </select>
                </label>
              )}
              {s.kind !== "steps" && s.kind !== "picture" && s.kind !== "effect" && (
                <label>Icon
                  <select value={s.icon ?? ""} disabled={disabled} onChange={(e) => setIcon(s.id, e.target.value)}>
                    <option value="">None</option>
                    {SCENE_ICON_IDS.map((id) => <option key={id} value={id}>{SCENE_ICONS[id].label}</option>)}
                  </select>
                </label>
              )}
              {s.kind === "steps" && (s.items ?? []).slice(0, SCENE_ITEMS_MAX).map((it, i) => (
                <label key={it.key}>Row {i + 1}<input type="text" maxLength={SCENE_TEXT_MAX} value={it.text} disabled={disabled} onChange={(e) => set(s.id, { items: (s.items ?? []).map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} /></label>
              ))}
            </div>
          </div>
        );
      })}
      {scenes.length > 0 && (
        <>
          <div className="cbb-endcard-fields">
            <label>Layout
              <select value={place} disabled={disabled} onChange={(e) => onPlace(e.target.value as ScenePlace)}>
                <option value="over">Card over the picture</option>
                <option value="behind">Behind the person talking</option>
                <option value="split">Split screen</option>
              </select>
            </label>
          </div>
          <small className="sd-fx-note">{place === "split" ? "Each graphic takes the top of the frame as a panel of its own, and the picture moves down under it while it is up." : place === "behind" ? "The person is found in the picture on this computer and drawn in front of the card wherever the two cross. Where no one is found, or the clip carries a colour correction, the card stays in front." : "Each graphic is a card over the top of the picture."}</small>
        </>
      )}
      <div className="sd-done-actions">
        <button type="button" className="ov-btn ghost small" disabled={disabled || !hasWords} onClick={find}><RefreshCw size={12} aria-hidden /> {scenes.length ? "Find them again" : "Find them in what is said"}</button>
        {!hasWords && <small className="sd-fx-note">No speech in this cut, so there is nothing to make a graphic from.</small>}
      </div>
      {note && <small className="sd-fx-note" role="status">{note}</small>}
    </div>
  );
}
