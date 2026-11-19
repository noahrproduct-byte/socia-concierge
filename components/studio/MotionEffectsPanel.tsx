"use client";

// The Motion effects tool: every effect as a tile to press. Pressing one puts
// it on the video at the playhead, on the word being said there, with its
// words taken from what is said (lib/studioClips/scenes.ts effectAt); the
// ones on the video are listed under the tiles to retype, see or remove.
// The same tiles are the "pick before you drop" choice on the one-drop screen
// (components/studio/QuickEdit.tsx), where they are only switched on or off.
import { Trash2 } from "lucide-react";
import { FX_LINE_MAX, FX_TEXT_MAX, SCENE_FX, SCENE_FX_IDS, type SceneFxId } from "@/lib/studioClips/sceneFx";
import { SCENE_LABEL_MAX, type EdlScene, type SceneSpan } from "@/lib/studioClips/scenes";
import "./effects-panel.css";

const P = "#e9eaee", A = "#3d7bff", D = "#2a2d35";
/** A small drawing of what each effect does: the person is the pale shape, the effect is in blue. */
const person = <path d="M70 100 V78 a16 16 0 0 1 12 -15 a11 11 0 1 1 16 0 a16 16 0 0 1 12 15 V100 Z" fill={P} />;
const THUMB: Record<SceneFxId, React.ReactNode> = {
  ribbon: <><rect width="160" height="100" fill="#0d0a09" /><path d="M-6 30 C40 4 120 6 168 40" fill="none" stroke={A} strokeWidth="9" strokeLinecap="round" opacity="0.85" /><path d="M-6 30 C40 4 120 6 168 40" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" /><path d="M-6 74 C50 96 120 92 168 60" fill="none" stroke={A} strokeWidth="7" strokeLinecap="round" opacity="0.5" /><rect x="14" y="16" width="62" height="40" rx="7" fill="#f4ece5" /><rect x="22" y="24" width="34" height="5" fill="#21170f" /><rect x="22" y="36" width="44" height="6" rx="3" fill="rgba(33,23,15,0.25)" />{person}</>,
  chat: <><rect x="70" y="14" width="76" height="22" rx="11" fill={A} /><rect x="14" y="42" width="84" height="22" rx="11" fill="#fffdf9" /><rect x="96" y="70" width="50" height="18" rx="9" fill={A} opacity="0.7" />{person}</>,
  notify: <><rect x="16" y="10" width="128" height="24" rx="9" fill="#f8f3ee" /><rect x="22" y="15" width="14" height="14" rx="4" fill={A} /><rect x="42" y="19" width="60" height="5" fill="#21170f" /><rect x="22" y="40" width="116" height="22" rx="9" fill="#f8f3ee" opacity="0.7" />{person}</>,
  search: <><rect x="22" y="22" width="116" height="24" rx="12" fill="#fbf8f4" /><circle cx="36" cy="34" r="5" fill="none" stroke="#21170f" strokeWidth="2" /><rect x="48" y="31" width="52" height="5" fill="#21170f" /><rect x="103" y="28" width="2" height="12" fill="#21170f" />{person}</>,
  button: <><circle cx="80" cy="36" r="44" fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" /><circle cx="80" cy="36" r="30" fill="none" stroke="#fff" strokeWidth="1" opacity="0.4" /><rect x="40" y="24" width="80" height="24" rx="12" fill="#fbf6ef" /><rect x="56" y="33" width="40" height="5" fill="#21170f" /><path d="M108 40 l12 7 -5 1.500 -2.500 5.500z" fill="#111" stroke="#fff" strokeWidth="1" />{person}</>,
  compare: <><rect x="18" y="12" width="56" height="44" rx="8" fill="#f4ece5" opacity="0.6" transform="rotate(-3 46 34)" /><rect x="86" y="18" width="56" height="44" rx="8" fill="#fbf6ef" stroke={A} strokeWidth="3" transform="rotate(3 114 40)" />{person}</>,
  cover: <><text x="80" y="34" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="30" fill="#fff">COVER</text><rect x="22" y="40" width="116" height="3" fill={A} />{person}</>,
  glass: <><text x="80" y="50" textAnchor="middle" fontWeight="900" fontSize="44" fill="rgba(255,255,255,0.15)" stroke="#fff" strokeWidth="1.5">BIG</text>{person}</>,
  graph: <><path d="M8 80 L40 70 L70 60 L104 36 L150 12" fill="none" stroke={A} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="150" cy="12" r="5" fill="#fff" />{person}</>,
  news: <><rect x="10" y="12" width="78" height="30" rx="2" fill="#f6f1e7" transform="rotate(-4 49 27)" /><rect x="74" y="34" width="78" height="30" rx="2" fill="#f6f1e7" transform="rotate(3 113 49)" /><rect x="18" y="18" width="40" height="5" fill="#111" /><rect x="84" y="42" width="44" height="5" fill="#111" />{person}</>,
  paper: <><rect width="160" height="100" fill="#efe9dc" /><path d="M10 40 L22 14 L34 40 L46 14 L58 40 L70 14 L82 40 L94 14 L106 40 L118 14 L130 40 L142 14 L150 40" fill="none" stroke="#8fa3e8" strokeWidth="5" strokeLinejoin="round" /><path d="M70 100 V78 a16 16 0 0 1 12 -15 a11 11 0 1 1 16 0 a16 16 0 0 1 12 15 V100 Z" fill="#7a3b3b" stroke="#fff" strokeWidth="4" /></>,
  sketch: <><path d="M70 100 V78 a16 16 0 0 1 12 -15 a11 11 0 1 1 16 0 a16 16 0 0 1 12 15 V100" fill={D} stroke="#fff" strokeWidth="3" strokeLinejoin="round" /><path d="M132 14 l4 9 l10 1 l-7 7 l2 10 l-9 -5 l-9 5 l2 -10 l-7 -7 l10 -1 Z" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" /><path d="M16 30 q10 -12 22 -2 t22 -2" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" /></>,
  dolly: <><path d="M56 100 V70 a22 22 0 0 1 16 -21 a15 15 0 1 1 22 0 a22 22 0 0 1 16 21 V100 Z" fill={P} /><path d="M20 20 l12 12 M140 20 l-12 12 M20 84 l12 -12 M140 84 l-12 -12" stroke={A} strokeWidth="4" strokeLinecap="round" /></>,
  frame: <><rect x="50" y="8" width="60" height="84" rx="8" fill={D} stroke={A} strokeWidth="4" /><path d="M68 92 V78 a10 10 0 0 1 8 -9 a7 7 0 1 1 8 0 a10 10 0 0 1 8 9 V92 Z" fill={P} /></>,
  reveal: <><rect x="46" y="12" width="68" height="14" rx="4" fill="#f1efe9" /><circle cx="54" cy="19" r="2.5" fill="#ee6a5f" /><circle cx="62" cy="19" r="2.5" fill="#f5bd4f" /><circle cx="70" cy="19" r="2.5" fill="#61c454" /><rect x="46" y="24" width="68" height="68" fill={D} /><path d="M68 92 V78 a10 10 0 0 1 8 -9 a7 7 0 1 1 8 0 a10 10 0 0 1 8 9 V92 Z" fill={P} /></>,
  phone: <><rect x="14" y="10" width="46" height="84" rx="9" fill="#0b0c10" stroke="#3a3d46" strokeWidth="3" /><rect x="21" y="26" width="26" height="4" rx="2" fill={A} /><rect x="21" y="38" width="32" height="8" rx="3" fill="rgba(255,255,255,0.14)" /><rect x="21" y="52" width="32" height="8" rx="3" fill="rgba(255,255,255,0.14)" />{person}</>,
};

/** The tiles alone: pressed to add (the editor) or switched on and off (before the drop). */
export function EffectTiles({ on, disabled, onPress }: { /** the ones switched on, where the tiles are a choice */ on?: SceneFxId[]; disabled?: boolean; onPress: (fx: SceneFxId) => void }) {
  return (
    <div className="fxp-grid">
      {SCENE_FX_IDS.map((id) => (
        <button key={id} type="button" className={`fxp-tile${on?.includes(id) ? " is-on" : ""}`} aria-pressed={on ? on.includes(id) : undefined} disabled={disabled} title={SCENE_FX[id].what} onClick={() => onPress(id)}>
          <span className="fxp-thumb" aria-hidden><svg viewBox="0 0 160 100">{THUMB[id]}</svg></span>
          <b>{SCENE_FX[id].label}</b>
          <small>{SCENE_FX[id].what}</small>
        </button>
      ))}
    </div>
  );
}

export default function MotionEffectsPanel({ scenes, spans, disabled, hasWords, note, onAdd, onChange, onShow }: {
  scenes: EdlScene[];
  spans: SceneSpan[];
  disabled: boolean;
  hasWords: boolean;
  /** what the last press did, or why it could not */
  note: string | null;
  onAdd: (fx: SceneFxId) => void;
  onChange: (scenes: EdlScene[]) => void;
  onShow: (span: SceneSpan) => void;
}) {
  const mine = scenes.filter((s) => s.kind === "effect" && s.fx);
  const set = (id: string, patch: Partial<EdlScene>) => onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <div className="fxp">
      <p className="fxp-lead">{hasWords ? "Move the playhead to the moment you want, then press an effect. It lands on the word being said there." : "Effects land on a word that is said, and this video has no speech SOCIA could read."}</p>
      <EffectTiles disabled={disabled || !hasWords} onPress={onAdd} />
      {note && <p className="fxp-note" role="status">{note}</p>}
      {mine.length > 0 && (
        <div className="fxp-on">
          <h4>On this video</h4>
          {mine.map((s) => {
            const fx = s.fx!;
            const span = spans.find((x) => x.scene.id === s.id);
            return (
              <div key={s.id} className="fxp-row">
                <div className="fxp-row-head">
                  <b>{SCENE_FX[fx].label}</b>
                  {span ? <button type="button" className="sd-check-go" onClick={() => onShow(span)}>Show me</button> : <small>Its word is not in the cut now, so it is not shown.</small>}
                  <button type="button" className="ov-btn ghost small" disabled={disabled} aria-label={`Remove this ${SCENE_FX[fx].label.toLowerCase()}`} onClick={() => onChange(scenes.filter((x) => x.id !== s.id))}><Trash2 size={12} aria-hidden /> Remove</button>
                </div>
                {(SCENE_FX[fx].text || SCENE_FX[fx].lines > 0 || fx === "cover") && (
                  <div className="cbb-endcard-fields">
                    {SCENE_FX[fx].text && <label>{SCENE_FX[fx].text}<input type="text" maxLength={FX_TEXT_MAX} value={s.text} disabled={disabled} onChange={(e) => set(s.id, { text: e.target.value })} /></label>}
                    {fx === "ribbon" && <label>Line in front<input type="text" maxLength={SCENE_LABEL_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>}
                    {fx === "compare" && <label>Second option<input type="text" maxLength={FX_TEXT_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>}
                    {fx === "cover" && <label>Cover line<input type="text" maxLength={SCENE_LABEL_MAX} value={s.label ?? ""} disabled={disabled} onChange={(e) => set(s.id, { label: e.target.value })} /></label>}
                    {Array.from({ length: SCENE_FX[fx].lines - (fx === "news" ? 1 : 0) }, (_, i) => (
                      <label key={i}>{fx === "news" ? `Headline ${i + 2}` : fx === "ribbon" ? `Card row ${i + 1}` : fx === "chat" ? `Message ${i + 2}` : fx === "notify" ? `Notification ${i + 2}` : `Line ${i + 1}`}<input type="text" maxLength={FX_LINE_MAX} value={s.lines?.[i] ?? ""} disabled={disabled} onChange={(e) => { const lines = [...(s.lines ?? [])]; lines[i] = e.target.value; set(s.id, { lines }); }} /></label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
