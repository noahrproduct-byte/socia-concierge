"use client";

// The cut's voiceover (Starter and up): the lines SOCIA wrote for a cut
// nobody talks in, each placed on the cut, voiced by ElevenLabs. Here the
// person hears it in the preview, switches it off or on, sets its level,
// changes a line's words and has it voiced again, picks another voice, or
// has the whole thing written again. Voicing counts one voiceover on the
// plan; nothing is counted when it fails.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Mic, RefreshCw, X } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { MAX_VOICE_VOLUME, type VoiceChoice } from "@/lib/studioClips/voiceover";
import type { Edl, Voiceover } from "@/lib/studioClips/types";

type Result = { voiceover?: Voiceover; urls?: Record<string, string>; overrunSec?: number; voices?: VoiceChoice[]; error?: string; notConfigured?: boolean };

export default function VoiceoverCard({ buildId, edl, canEdit, adding, autoNote, onVoiceover, onUrls, onLevel, onSwitch }: {
  buildId: string;
  edl: Edl;
  canEdit: boolean;
  /** SOCIA is adding a voiceover on its own right now */
  adding: boolean;
  /** what happened when SOCIA looked at adding one on its own */
  autoNote: string | null;
  /** the server saved a voiceover on the cut (null: taken out) */
  onVoiceover: (vo: Voiceover | null) => void;
  onUrls: (urls: Record<string, string>) => void;
  /** the person moved the level (saved with the cut) */
  onLevel: (volume: number) => void;
  /** the person switched it on or off (saved with the cut) */
  onSwitch: (on: boolean) => void;
}) {
  const vo = edl.voiceover ?? null;
  const [voices, setVoices] = useState<VoiceChoice[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [busy, setBusy] = useState<null | "voicing" | "writing" | "removing">(null);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [overrun, setOverrun] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [voiceId, setVoiceId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/studio/voices").then((r) => r.json().catch(() => null)).then((j: { voices?: VoiceChoice[]; notConfigured?: boolean } | null) => {
      if (!alive) return;
      setVoices(j?.voices ?? []);
      if (j?.notConfigured) setNotReady(true);
    }).catch(() => { if (alive) setVoices([]); });
    return () => { alive = false; };
  }, []);
  // A new voiceover from the server replaces whatever was being typed.
  const voKey = `${vo?.voiceId ?? ""}|${(vo?.lines ?? []).map((l) => `${l.id}:${l.text}`).join("|")}`;
  useEffect(() => { setDraft({}); setVoiceId(null); }, [voKey]);

  const changed = useMemo(() => (vo ? vo.lines.filter((l) => draft[l.id] != null && draft[l.id].trim() && draft[l.id].trim() !== l.text) : []), [vo, draft]);
  const pickedVoice = voiceId ?? vo?.voiceId ?? null;
  const voiceChanged = Boolean(vo && voiceId && voiceId !== vo.voiceId);

  const post = async (kind: "voicing" | "writing", body: Record<string, unknown>) => {
    setBusy(kind); setError(null); setPlanError(null);
    const res = await fetch(`/api/studio/builds/${buildId}/voiceover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as Result | null) : null;
    setBusy(null);
    if (!res?.ok || !j?.voiceover) {
      if (isPlanError(j)) { setPlanError(j); return; }
      if (j?.notConfigured) { setNotReady(true); return; }
      setError(j?.error ?? "SOCIA couldn't make the voiceover. Nothing was counted. Try again.");
      return;
    }
    if (j.voices?.length) setVoices(j.voices);
    if (j.urls) onUrls(j.urls);
    setOverrun(j.overrunSec ?? 0);
    onVoiceover(j.voiceover);
  };

  const remove = async () => {
    setBusy("removing"); setError(null);
    const res = await fetch(`/api/studio/builds/${buildId}/voiceover`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setError("SOCIA couldn't take the voiceover out. Try again."); return; }
    onVoiceover(null);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  const off = !canEdit || busy != null;

  return (
    <div className="cbm">
      <div className="cbm-head">
        <h4><Mic size={14} /> Voiceover</h4>
        {vo && canEdit && (
          <button type="button" className={`cbb-toggle${vo.on ? " on" : ""}`} role="switch" aria-checked={vo.on} aria-label="Play the voiceover" disabled={off} onClick={() => onSwitch(!vo.on)}><i /></button>
        )}
      </div>
      {planError && <PlanNotice error={planError} />}
      {notReady ? <p className="cbm-muted">Voiceovers aren&apos;t switched on for SOCIA yet. They appear here once they are.</p>
        : adding ? <p className="cbm-muted"><Loader2 size={12} className="spin" /> SOCIA is writing and voicing a voiceover for this video (under a minute).</p>
        : !vo ? (
          <>
            <p className="cbm-muted">{autoNote ?? "SOCIA writes a short voiceover from what your shots show, your brand details and your prompt, times each line to its shot, and voices it. Each voicing counts as one voiceover on your plan."}</p>
            {canEdit && <button type="button" className="ov-btn small" disabled={off} onClick={() => void post("writing", {})}>{busy === "writing" ? <><Loader2 size={12} className="spin" /> Writing and voicing</> : "Write a voiceover"}</button>}
          </>
        ) : (
          <>
            <p className="cbm-muted">{vo.why ? `Added because ${vo.why}. ` : ""}Read by {vo.voiceName}. {vo.on ? "The music and the clips' own sound dip under it." : "Switched off: the video plays without it."}</p>
            {overrun > 0 && <p className="cbm-bad">The voice runs {overrun.toFixed(1)}s past the end of the video. Shorten a line and voice it again.</p>}
            <ul className="cbm-list sd-voice-lines">
              {vo.lines.map((l) => (
                <li key={l.id}>
                  <span className="cbm-track">
                    <small>From {fmt(l.at)}{l.dur ? `, ${l.dur.toFixed(1)}s` : ""}</small>
                    {canEdit
                      ? <textarea className="sd-voice-line" rows={2} maxLength={400} value={draft[l.id] ?? l.text} disabled={off} aria-label={`Line from ${fmt(l.at)}`} onChange={(e) => setDraft((d) => ({ ...d, [l.id]: e.target.value }))} />
                      : <b>{l.text}</b>}
                  </span>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="cbm-mix">
                {voices && voices.length > 0 && (
                  <label className="cbb-field">Voice
                    <select value={pickedVoice ?? ""} disabled={off} onChange={(e) => setVoiceId(e.target.value)}>
                      {!voices.some((v) => v.id === vo.voiceId) && <option value={vo.voiceId}>{vo.voiceName}</option>}
                      {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.description ? `, ${v.description.split(",")[0]}` : ""}</option>)}
                    </select>
                  </label>
                )}
                {voices?.find((v) => v.id === pickedVoice)?.preview && <audio controls preload="none" src={voices.find((v) => v.id === pickedVoice)!.preview!} aria-label="Hear this voice" />}
                <label>Voice level
                  <input type="range" min={0} max={MAX_VOICE_VOLUME} step={0.05} value={vo.volume} disabled={off} onChange={(e) => onLevel(Number(e.target.value))} />
                  <em>{Math.round(vo.volume * 100)}%</em>
                </label>
                <div className="sd-voice-actions">
                  <button type="button" className="ov-btn small" disabled={off || (!changed.length && !voiceChanged)} onClick={() => void post("voicing", { edits: changed.map((l) => ({ id: l.id, text: draft[l.id] })), ...(voiceChanged ? { voiceId } : {}) })}>
                    {busy === "voicing" ? <><Loader2 size={12} className="spin" /> Voicing</> : "Voice it again"}
                  </button>
                  <button type="button" className="ov-btn ghost small" disabled={off} onClick={() => void post("writing", { rewrite: true, ...(voiceId ? { voiceId } : {}) })}>
                    {busy === "writing" ? <><Loader2 size={12} className="spin" /> Writing</> : <><RefreshCw size={12} /> Write it again</>}
                  </button>
                  <button type="button" className="ov-btn ghost small" disabled={off} onClick={() => void remove()}><X size={12} /> Take it out</button>
                </div>
                <small className="cbm-muted">Voicing again counts one voiceover on your plan, whether one line changed or all of them.</small>
              </div>
            )}
          </>
        )}
      {error && <p className="cbm-bad">{error}</p>}
    </div>
  );
}
